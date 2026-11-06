//! Windows glue: every request of a game webview raises WebView2's WebResourceRequested event, and
//! every iframe navigation its FrameNavigationStarting event; both are checked against the adblock
//! engine. The handlers only read: a blocked request gets an empty 403, a blocked iframe navigation
//! is cancelled. Nothing of the app runs in the game page.

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::OnceLock;
use std::time::Instant;

use ::windows::core::{HSTRING, Interface, PWSTR};
use tauri::webview::PlatformWebview;
use tauri::{AppHandle, Manager, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_CSP_VIOLATION_REPORT,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_PING,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_STYLESHEET,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_WEBSOCKET,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST,
    COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL, ICoreWebView2, ICoreWebView2_22,
    ICoreWebView2Environment, ICoreWebView2NavigationStartingEventArgs,
    ICoreWebView2WebResourceRequestedEventArgs,
};
use webview2_com::{NavigationStartingEventHandler, WebResourceRequestedEventHandler, take_pwstr};

use super::filters::{build_engine, should_block};
use super::{Bypass, READY};

static ENGINE: OnceLock<adblock::Engine> = OnceLock::new();

/// Kept so the event handlers, which only get COM objects, can read the `Bypass` state.
static APP: OnceLock<AppHandle> = OnceLock::new();

/// Builds the engine off the main thread: parsing the lists takes long enough to delay startup.
pub fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
    let spawned = std::thread::Builder::new()
        .name("filter-engine".into())
        .spawn(|| {
            let started = Instant::now();
            // A panic here would leave every game waiting ATTACH_TIMEOUT for rules that never come.
            match catch_unwind(build_engine) {
                Ok(engine) => {
                    let _ = ENGINE.set(engine);
                    eprintln!("content blocking ready in {:?}", started.elapsed());
                }
                Err(_) => eprintln!("content blocking disabled, the filter engine panicked"),
            }
            READY.mark_ready();
        });
    if let Err(e) = spawned {
        eprintln!("content blocking disabled, cannot build the filter engine: {e}");
        READY.mark_ready();
    }
}

pub fn attach(webview: &Webview) {
    let label = webview.label().to_string();
    let result = webview.with_webview(move |pw| {
        if let Err(e) = install(&pw, label.clone()) {
            eprintln!("content blocking: {label} not fully filtered: {e}");
        }
    });
    if let Err(e) = result {
        eprintln!("content blocking: cannot reach {}: {e}", webview.label());
    }
}

/// Registers the request filter and the request and iframe handlers. Call shapes follow wry 0.57.1
/// (`attach_custom_protocol_handler`, `src/webview2/mod.rs`).
fn install(pw: &PlatformWebview, label: String) -> ::windows::core::Result<()> {
    let environment = pw.environment();
    let filter = HSTRING::from("*");
    // SAFETY: Tauri runs with_webview closures on the main thread, the WebView2 UI thread these
    // COM objects belong to, and `controller()` returns an owned reference that lives for the call.
    let webview = unsafe { pw.controller().CoreWebView2()? };
    // The newer filter also covers iframes and workers; older runtimes only have the plain one.
    match webview.cast::<ICoreWebView2_22>() {
        // SAFETY: on the UI thread (see above), with a live interface and a valid filter string.
        Ok(webview_22) => unsafe {
            webview_22.AddWebResourceRequestedFilterWithRequestSourceKinds(
                &filter,
                COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
                COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
            )?
        },
        // SAFETY: as above.
        Err(_) => unsafe {
            webview.AddWebResourceRequestedFilter(&filter, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL)?
        },
    }
    // The page is read from the event's sender rather than captured: a handler holding its own
    // webview would keep it alive forever.
    let request_label = label.clone();
    let on_request = WebResourceRequestedEventHandler::create(Box::new(move |sender, args| {
        fail_open(&request_label, "request", || {
            check_request(&request_label, &environment, sender, args)
        });
        // Always Ok: an error returned to WebView2 must not change how the request is served.
        Ok(())
    }));
    // WebView2 reports iframe documents with the same DOCUMENT context as the game page, which is
    // never blocked. Iframes get their own event, which the main frame never raises, so they are
    // checked as subdocuments there.
    let on_frame = NavigationStartingEventHandler::create(Box::new(move |sender, args| {
        fail_open(&label, "iframe", || check_frame(&label, sender, args));
        Ok(())
    }));
    let mut token = 0i64;
    // SAFETY: on the UI thread, with live handlers and a token that outlives each call. The
    // handlers are never removed: they live as long as the webview.
    unsafe {
        webview.add_WebResourceRequested(&on_request, &mut token)?;
        webview.add_FrameNavigationStarting(&on_frame, &mut token)
    }
}

/// Fails open: any error or panic lets the request through. A panic must not unwind into
/// WebView2, which would abort the app.
fn fail_open(label: &str, what: &str, check: impl FnOnce() -> ::windows::core::Result<()>) {
    match catch_unwind(AssertUnwindSafe(check)) {
        Ok(Ok(())) => {}
        Ok(Err(e)) => eprintln!("content blocking: {label} {what} let through: {e}"),
        Err(_) => eprintln!("content blocking: {label} {what} let through after a panic"),
    }
}

/// The engine, when this game is filtered. No readable bypass state counts as bypassed: the game
/// must never be stuck filtered.
fn engine_for(label: &str) -> Option<&'static adblock::Engine> {
    let engine = ENGINE.get()?;
    let bypassed = APP
        .get()
        .and_then(|app| app.try_state::<Bypass>())
        .is_none_or(|bypass| bypass.contains(label));
    (!bypassed).then_some(engine)
}

/// URL of the game page, the first party of every request it makes.
fn page_url(sender: &ICoreWebView2) -> ::windows::core::Result<String> {
    let mut source = PWSTR::null();
    // SAFETY: called from a WebView2 event on its UI thread with a live sender; the out-param is
    // written by the callee and take_pwstr frees it (null included).
    unsafe { sender.Source(&mut source)? };
    Ok(take_pwstr(source))
}

fn check_request(
    label: &str,
    environment: &ICoreWebView2Environment,
    sender: Option<ICoreWebView2>,
    args: Option<ICoreWebView2WebResourceRequestedEventArgs>,
) -> ::windows::core::Result<()> {
    let (Some(sender), Some(args)) = (sender, args) else {
        return Ok(());
    };
    let Some(engine) = engine_for(label) else {
        return Ok(());
    };
    // SAFETY: WebView2 raises this event on its UI thread with live args. Out-params are written
    // by the callee, and take_pwstr frees the CoTaskMem string it is given (null included).
    let (url, context) = unsafe {
        let mut uri = PWSTR::null();
        args.Request()?.Uri(&mut uri)?;
        let url = take_pwstr(uri);
        let mut context = COREWEBVIEW2_WEB_RESOURCE_CONTEXT::default();
        args.ResourceContext(&mut context)?;
        (url, context)
    };
    if !should_block(engine, &url, &page_url(&sender)?, request_type(context)) {
        return Ok(());
    }
    // SAFETY: on the UI thread, with a live environment and args; a null stream is allowed and
    // means an empty body.
    unsafe {
        let response = environment.CreateWebResourceResponse(
            None,
            403,
            &HSTRING::from("Blocked"),
            &HSTRING::new(),
        )?;
        args.SetResponse(&response)
    }
}

fn check_frame(
    label: &str,
    sender: Option<ICoreWebView2>,
    args: Option<ICoreWebView2NavigationStartingEventArgs>,
) -> ::windows::core::Result<()> {
    let (Some(sender), Some(args)) = (sender, args) else {
        return Ok(());
    };
    let Some(engine) = engine_for(label) else {
        return Ok(());
    };
    let mut uri = PWSTR::null();
    // SAFETY: WebView2 raises this event on its UI thread with live args; the out-param is
    // written by the callee and take_pwstr frees it (null included).
    unsafe { args.Uri(&mut uri)? };
    let url = take_pwstr(uri);
    if should_block(engine, &url, &page_url(&sender)?, "subdocument") {
        // SAFETY: on the UI thread, with live args.
        unsafe { args.SetCancel(true)? };
    }
    Ok(())
}

/// WebView2 resource contexts, named as adblock request types. adblock has no "fetch" type (it
/// would fall to "other"), and filter lists cover fetch with `$xmlhttprequest`.
fn request_type(context: COREWEBVIEW2_WEB_RESOURCE_CONTEXT) -> &'static str {
    match context {
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT => "document",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT => "script",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE => "image",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_STYLESHEET => "stylesheet",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT => "font",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA => "media",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST => "xmlhttprequest",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH => "xmlhttprequest",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_WEBSOCKET => "websocket",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_PING => "ping",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_CSP_VIOLATION_REPORT => "csp_report",
        _ => "other",
    }
}
