use tauri_plugin_dialog::DialogExt;

// Same value as DEFAULT_FILE_NAME in src/sharing/gamesFile.ts.
const DEFAULT_FILE_NAME: &str = "desktop-dles-games.json";

/// Asks where to save the games file and writes `contents` there.
/// `Ok(false)` means the user cancelled the dialog.
#[tauri::command]
pub async fn export_games(app: tauri::AppHandle, contents: String) -> Result<bool, String> {
    // The command is async, so it runs off the main thread and the blocking dialog is safe.
    let Some(file) = app
        .dialog()
        .file()
        .set_file_name(DEFAULT_FILE_NAME)
        .add_filter("JSON", &["json"])
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, contents).map_err(|e| e.to_string())?;
    Ok(true)
}
