fn main() {
    // Declaring an app manifest makes Tauri enforce the ACL on app commands too;
    // without it every webview, game sites included, could call them.
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
