fn main() {
    // Without an app manifest, app commands are open to any local-origin webview;
    // declaring one makes only webviews granted by a capability (`ui`) able to call them.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "show_game",
            "set_game_bounds",
            "hide_games",
            "reload_game",
            "close_game",
        ])),
    )
    .expect("failed to run tauri-build");
}
