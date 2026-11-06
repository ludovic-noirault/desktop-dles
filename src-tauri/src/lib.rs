mod blocking;
mod dles;
mod games;
mod sharing;

use tauri::webview::WebviewBuilder;
use tauri::window::WindowBuilder;
use tauri::{LogicalPosition, LogicalSize, WebviewUrl};
use tauri_plugin_sql::{Migration, MigrationKind};

const WINDOW_WIDTH: f64 = 1200.0;
const WINDOW_HEIGHT: f64 = 800.0;

pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "day_status",
            sql: include_str!("../migrations/002_day_status.sql"),
            kind: MigrationKind::Up,
        },
    ];
    tauri::Builder::default()
        .manage(blocking::Bypass::default())
        .manage(dles::DlesClient::new().expect("failed to build the dles.gg HTTP client"))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:desktop-dles.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            games::show_game,
            games::set_game_bounds,
            games::hide_games,
            games::reload_game,
            games::close_game,
            sharing::export_games,
            dles::dles_catalog,
            dles::dles_game_page
        ])
        .setup(|app| {
            blocking::init(app.handle());
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            // The window is built here, not in tauri.conf.json, so game webviews can
            // be added as children of the same window later.
            let window = WindowBuilder::new(app, "main")
                .title("Desktop Dles")
                .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
                .build()?;
            window.add_child(
                // Native drag and drop is off on `ui` only: HTML5 file drops need that on Windows,
                // and the page then reads the dropped `File` itself, with no IPC.
                WebviewBuilder::new("ui", WebviewUrl::App(Default::default()))
                    .auto_resize()
                    .disable_drag_drop_handler(),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(WINDOW_WIDTH, WINDOW_HEIGHT),
            )?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
