//! Windows glue: every request of a game webview raises WebView2's WebResourceRequested event and is
//! checked against the adblock engine. The handler only reads the request and, for a blocked one,
//! answers with an empty 403: nothing of the app runs in the game page.

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::OnceLock;
use std::time::Instant;

use ::windows::core::{HSTRING, Interface, PWSTR};
use tauri::webview::PlatformWebview;
use tauri::{AppHandle, Manager, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_STYLESHEET, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_WEBSOCKET,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST,
    COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL, ICoreWebView2, ICoreWebView2_22,
    ICoreWebView2Environment, ICoreWebView2WebResourceRequestedEventArgs,
};
use webview2_com::{WebResourceRequestedEventHandler, take_pwstr};

use super::filters::{build_engine, should_block};
use super::{Bypass, READY};

static ENGINE: OnceLock<adblock::Engine> = OnceLock::new();

/// Kept so the request handler, which only gets COM objects, can read the `Bypass` state.
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
            eprintln!("content blocking: cannot filter {label}, opening unfiltered: {e}");
        }
    });
    if let Err(e) = result {
        eprintln!("content blocking: cannot reach {}: {e}", webview.label());
    }
}

/// Registers the request filter and its handler. Call shapes follow wry 0.57.1
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
    let handler = WebResourceRequestedEventHandler::create(Box::new(move |sender, args| {
        on_request(&label, &environment, sender, args);
        // Always Ok: an error returned to WebView2 must not change how the request is served.
        Ok(())
    }));
    let mut token = 0i64;
    // SAFETY: on the UI thread, with a live handler and a token that outlives the call. The
    // handler is never removed: it lives as long as the webview.
    unsafe { webview.add_WebResourceRequested(&handler, &mut token) }
}

/// Fails open: any error or panic lets the request through. A panic must not unwind into
/// WebView2, which would abort the app.
fn on_request(
    label: &str,
    environment: &ICoreWebView2Environment,
    sender: Option<ICoreWebView2>,
    args: Option<ICoreWebView2WebResourceRequestedEventArgs>,
) {
    match catch_unwind(AssertUnwindSafe(|| {
        check_request(label, environment, sender, args)
    })) {
        Ok(Ok(())) => {}
        Ok(Err(e)) => eprintln!("content blocking: {label} request let through: {e}"),
        Err(_) => eprintln!("content blocking: {label} request let through after a panic"),
    }
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
    let Some(engine) = ENGINE.get() else {
        return Ok(());
    };
    // No readable bypass state counts as bypassed: the game must never be stuck filtered.
    if APP
        .get()
        .and_then(|app| app.try_state::<Bypass>())
        .is_none_or(|bypass| bypass.contains(label))
    {
        return Ok(());
    }
    // SAFETY: WebView2 raises this event on its UI thread with live sender and args. Out-params
    // are written by the callee, and take_pwstr frees the CoTaskMem strings it is given (null
    // included).
    let (url, context, page) = unsafe {
        let mut uri = PWSTR::null();
        args.Request()?.Uri(&mut uri)?;
        let url = take_pwstr(uri);
        let mut context = COREWEBVIEW2_WEB_RESOURCE_CONTEXT::default();
        args.ResourceContext(&mut context)?;
        let mut source = PWSTR::null();
        sender.Source(&mut source)?;
        (url, context, take_pwstr(source))
    };
    if !should_block(engine, &url, &page, request_type(context)) {
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
        _ => "other",
    }
}
