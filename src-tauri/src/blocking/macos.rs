//! macOS glue: the filter lists become WebKit content rule lists, compiled once per lists version
//! and kept in WebKit's store, then attached to each game webview. Content rules are declarative:
//! nothing of the app runs in the game page.

use std::cell::RefCell;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

use block2::RcBlock;
use objc2::MainThreadMarker;
use objc2::rc::Retained;
use objc2_foundation::{NSError, NSString};
use objc2_web_kit::{WKContentRuleList, WKContentRuleListStore, WKUserContentController};
use tauri::{AppHandle, Webview};

use super::READY;
use super::filters::{LISTS, content_rules_json, rule_list_id};

thread_local! {
    // WebKit objects are main-thread only, so the compiled lists never leave the main thread.
    static RULE_LISTS: RefCell<Vec<Retained<WKContentRuleList>>> = const { RefCell::new(Vec::new()) };
}

/// Counts the lists still being resolved. Lists end on the main thread or on a conversion
/// thread, so the count is atomic and whoever ends the last list marks the rules ready.
struct Progress {
    pending: AtomicUsize,
    loaded: AtomicUsize,
    started: Instant,
}

impl Progress {
    fn finish(&self, loaded: bool) {
        if loaded {
            self.loaded.fetch_add(1, Ordering::AcqRel);
        }
        if self.pending.fetch_sub(1, Ordering::AcqRel) == 1 {
            eprintln!(
                "content blocking ready: {} of {} lists in {:?}",
                self.loaded.load(Ordering::Acquire),
                LISTS.len(),
                self.started.elapsed()
            );
            READY.mark_ready();
        }
    }
}

fn describe(error: *mut NSError) -> String {
    // SAFETY: WebKit passes either null or a valid NSError that lives for the handler call.
    match unsafe { error.as_ref() } {
        Some(error) => error.localizedDescription().to_string(),
        None => "unknown error".to_string(),
    }
}

/// Keeps a list handed to a WebKit completion handler. Must run on the main thread.
fn keep(list: *mut WKContentRuleList) -> bool {
    // SAFETY: WebKit passes either null or a valid WKContentRuleList; retaining it keeps it
    // alive past the handler call.
    match unsafe { Retained::retain(list) } {
        Some(list) => {
            RULE_LISTS.with_borrow_mut(|lists| lists.push(list));
            true
        }
        None => false,
    }
}

/// Looks up each compiled list in WebKit's store, and compiles the ones it does not have yet.
pub fn init(app: &AppHandle) {
    let progress = Arc::new(Progress {
        pending: AtomicUsize::new(LISTS.len()),
        loaded: AtomicUsize::new(0),
        started: Instant::now(),
    });
    let handle = app.clone();
    let on_main = progress.clone();
    if let Err(e) = app.run_on_main_thread(move || look_up_all(handle, on_main)) {
        eprintln!("content blocking disabled, main thread unreachable: {e}");
        READY.mark_ready();
    }
}

fn look_up_all(app: AppHandle, progress: Arc<Progress>) {
    let Some(mtm) = MainThreadMarker::new() else {
        eprintln!("content blocking disabled, rule lookup not on the main thread");
        READY.mark_ready();
        return;
    };
    // SAFETY: called on the main thread, as the marker proves.
    let Some(store) = (unsafe { WKContentRuleListStore::defaultStore(mtm) }) else {
        eprintln!("content blocking disabled, no WebKit content rule list store");
        READY.mark_ready();
        return;
    };
    for list in &LISTS {
        let name = list.name;
        let text = list.text;
        let id = NSString::from_str(&rule_list_id(name));
        let app = app.clone();
        let progress = progress.clone();
        let handler = RcBlock::new(move |found: *mut WKContentRuleList, _: *mut NSError| {
            // WebKit calls store completion handlers on the main thread; checked rather than
            // assumed, since the thread-local list only exists there.
            if MainThreadMarker::new().is_none() {
                eprintln!("content blocking: lookup of {name} answered off the main thread");
                progress.finish(false);
                return;
            }
            // A miss comes with an error by design: the list was never compiled.
            if keep(found) {
                progress.finish(true);
            } else {
                compile_in_background(app.clone(), progress.clone(), name, text);
            }
        });
        // SAFETY: on the main thread (WKContentRuleListStore is main-thread only), with a
        // non-null identifier and handler.
        unsafe {
            store.lookUpContentRuleListForIdentifier_completionHandler(Some(&id), Some(&handler));
        }
    }
}

/// Converting a list takes seconds, so it runs off the main thread; only the WebKit compile call
/// goes back to it.
fn compile_in_background(
    app: AppHandle,
    progress: Arc<Progress>,
    name: &'static str,
    text: &'static str,
) {
    eprintln!("content blocking: compiling {name} for this lists version");
    let spawned = std::thread::Builder::new()
        .name(format!("rules-{name}"))
        .spawn({
            let progress = progress.clone();
            move || {
                let Some((json, count)) = content_rules_json(text) else {
                    eprintln!("content blocking: {name} has no convertible rule, skipped");
                    progress.finish(false);
                    return;
                };
                let on_main = progress.clone();
                if let Err(e) = app.run_on_main_thread(move || compile(on_main, name, json, count))
                {
                    eprintln!("content blocking: cannot compile {name}, skipped: {e}");
                    progress.finish(false);
                }
            }
        });
    if let Err(e) = spawned {
        eprintln!("content blocking: cannot convert {name}, skipped: {e}");
        progress.finish(false);
    }
}

fn compile(progress: Arc<Progress>, name: &'static str, json: String, count: usize) {
    let Some(mtm) = MainThreadMarker::new() else {
        eprintln!("content blocking: {name} compile not on the main thread, skipped");
        progress.finish(false);
        return;
    };
    // SAFETY: called on the main thread, as the marker proves.
    let Some(store) = (unsafe { WKContentRuleListStore::defaultStore(mtm) }) else {
        eprintln!("content blocking: no WebKit content rule list store, {name} skipped");
        progress.finish(false);
        return;
    };
    let id = NSString::from_str(&rule_list_id(name));
    let encoded = NSString::from_str(&json);
    let handler = RcBlock::new(
        move |compiled: *mut WKContentRuleList, error: *mut NSError| {
            if MainThreadMarker::new().is_none() {
                eprintln!("content blocking: compile of {name} answered off the main thread");
                progress.finish(false);
                return;
            }
            if keep(compiled) {
                progress.finish(true);
            } else {
                eprintln!(
                    "content blocking: WebKit rejected {name} ({count} rules), skipped: {}",
                    describe(error)
                );
                progress.finish(false);
            }
        },
    );
    // SAFETY: on the main thread (WKContentRuleListStore is main-thread only), with non-null
    // identifier, rules and handler.
    unsafe {
        store.compileContentRuleListForIdentifier_encodedContentRuleList_completionHandler(
            Some(&id),
            Some(&encoded),
            Some(&handler),
        );
    }
}

/// Runs `f` on the webview's user content controller, on the main thread.
fn with_controller(webview: &Webview, f: fn(&WKUserContentController)) {
    let label = webview.label().to_string();
    let result = webview.with_webview(move |pw| {
        if MainThreadMarker::new().is_none() {
            eprintln!("content blocking: {label} controller reached off the main thread");
            return;
        }
        // SAFETY: Tauri runs this closure on the main thread (checked above), and controller()
        // is the webview's WKUserContentController, which wry keeps retained for the whole call.
        match unsafe { pw.controller().cast::<WKUserContentController>().as_ref() } {
            Some(controller) => f(controller),
            None => eprintln!("content blocking: {label} has no user content controller"),
        }
    });
    if let Err(e) = result {
        eprintln!("content blocking: cannot reach {}: {e}", webview.label());
    }
}

pub fn attach(webview: &Webview) {
    with_controller(webview, |controller| {
        RULE_LISTS.with_borrow(|lists| {
            for list in lists {
                // SAFETY: on the main thread (with_controller checks it), with a live list.
                unsafe { controller.addContentRuleList(list) };
            }
        });
    });
}

pub fn detach(webview: &Webview) {
    // SAFETY: on the main thread (with_controller checks it).
    with_controller(webview, |controller| unsafe {
        controller.removeAllContentRuleLists()
    });
}
