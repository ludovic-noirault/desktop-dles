use std::sync::Mutex;

use serde::Deserialize;
use tauri::webview::{NewWindowResponse, WebviewBuilder};
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Position, Rect, Size, Url, Webview,
    WebviewUrl,
};
use tauri_plugin_opener::OpenerExt;

const GAME_PREFIX: &str = "game-";

// add_child blocks until the main thread builds the webview, so concurrent commands
// would interleave their create/hide steps. The main thread never takes this lock.
static VIEWS: Mutex<()> = Mutex::new(());

#[derive(Deserialize)]
pub struct PanelBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl PanelBounds {
    fn rect(&self) -> Rect {
        Rect {
            position: Position::Logical(LogicalPosition::new(self.x, self.y)),
            size: Size::Logical(LogicalSize::new(self.width, self.height)),
        }
    }
}

fn game_label(id: i64) -> String {
    format!("{GAME_PREFIX}{id}")
}

// Checked here as well as in the UI: the IPC boundary must hold on its own.
fn parse_game_url(url: &str) -> Result<Url, String> {
    let url = Url::parse(url).map_err(|e| e.to_string())?;
    if url.scheme() != "https" {
        return Err(format!("game URL must be https, got {}", url.scheme()));
    }
    Ok(url)
}

fn game_webviews(app: &AppHandle) -> Vec<Webview> {
    app.webviews()
        .into_values()
        .filter(|w| w.label().starts_with(GAME_PREFIX))
        .collect()
}

#[tauri::command]
pub async fn show_game(
    app: AppHandle,
    id: i64,
    url: String,
    bounds: PanelBounds,
) -> Result<(), String> {
    let _guard = VIEWS.lock().map_err(|e| e.to_string())?;
    let url = parse_game_url(&url)?;
    let label = game_label(id);
    if let Some(webview) = app.get_webview(&label) {
        webview.set_bounds(bounds.rect()).map_err(|e| e.to_string())?;
        webview.show().map_err(|e| e.to_string())?;
    } else {
        let window = app.get_window("main").ok_or("main window not found")?;
        let opener = app.clone();
        let builder = WebviewBuilder::new(&label, WebviewUrl::External(url)).on_new_window(
            move |url, _features| {
                // Only web links leave the app: other schemes from an untrusted page
                // (file:, custom handlers) must not reach the OS.
                if matches!(url.scheme(), "http" | "https")
                    && let Err(e) = opener.opener().open_url(url.as_str(), None::<&str>)
                {
                    eprintln!("could not open {url} in the system browser: {e}");
                }
                NewWindowResponse::Deny
            },
        );
        window
            .add_child(
                builder,
                LogicalPosition::new(bounds.x, bounds.y),
                LogicalSize::new(bounds.width, bounds.height),
            )
            .map_err(|e| e.to_string())?;
    }
    for other in game_webviews(&app).iter().filter(|w| w.label() != label) {
        other.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn set_game_bounds(app: AppHandle, bounds: PanelBounds) -> Result<(), String> {
    let _guard = VIEWS.lock().map_err(|e| e.to_string())?;
    for webview in game_webviews(&app) {
        webview.set_bounds(bounds.rect()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn hide_games(app: AppHandle) -> Result<(), String> {
    let _guard = VIEWS.lock().map_err(|e| e.to_string())?;
    for webview in game_webviews(&app) {
        webview.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn reload_game(app: AppHandle, id: i64, url: String) -> Result<(), String> {
    let url = parse_game_url(&url)?;
    let webview = app
        .get_webview(&game_label(id))
        .ok_or("game webview not found")?;
    webview.navigate(url).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_game(app: AppHandle, id: i64) -> Result<(), String> {
    let _guard = VIEWS.lock().map_err(|e| e.to_string())?;
    match app.get_webview(&game_label(id)) {
        Some(webview) => webview.close().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn game_label_is_prefixed() {
        assert_eq!(game_label(42), "game-42");
    }

    #[test]
    fn only_https_urls_are_accepted() {
        assert!(parse_game_url("https://example.com/play").is_ok());
        assert!(parse_game_url("http://example.com").is_err());
        assert!(parse_game_url("javascript:alert(1)").is_err());
        assert!(parse_game_url("not a url").is_err());
    }
}
