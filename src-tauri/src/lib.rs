use tauri::webview::WebviewBuilder;
use tauri::window::WindowBuilder;
use tauri::{LogicalPosition, LogicalSize, WebviewUrl};

const WINDOW_WIDTH: f64 = 1200.0;
const WINDOW_HEIGHT: f64 = 800.0;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // The window is built here, not in tauri.conf.json, so game webviews can
            // be added as children of the same window later.
            let window = WindowBuilder::new(app, "main")
                .title("Desktop Dles")
                .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
                .build()?;
            window.add_child(
                WebviewBuilder::new("ui", WebviewUrl::App(Default::default())).auto_resize(),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(WINDOW_WIDTH, WINDOW_HEIGHT),
            )?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
