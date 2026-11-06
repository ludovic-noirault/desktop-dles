use std::time::Duration;

const CATALOG_URL: &str = "https://dles.gg/";
const GAME_PAGE_PREFIX: &str = "https://dles.gg/game/";
// A page far larger than any real dles.gg page is a sign of something else; stop reading it.
const MAX_BYTES: usize = 5 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(10);
const MAX_REDIRECTS: usize = 5;
const USER_AGENT: &str = concat!(
    "DesktopDles/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/ludovic-noirault/desktop-dles)"
);

/// Shared HTTP client, built once. The UI never sends a URL: the commands below build them.
pub struct DlesClient(reqwest::Client);

impl DlesClient {
    pub fn new() -> Result<Self, reqwest::Error> {
        install_crypto_provider();
        reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(TIMEOUT)
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= MAX_REDIRECTS || !is_dles_url(attempt.url()) {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            }))
            .build()
            .map(Self)
    }
}

// reqwest is built without a TLS provider so the tree keeps one crypto stack: the ring one that
// tauri-plugin-updater also installs.
fn install_crypto_provider() {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        // Fails only if a default exists already, which was just checked.
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
}

// Redirects must stay on dles.gg over https: the UI cannot choose a URL, and the site must not either.
fn is_dles_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https" && url.host_str() == Some("dles.gg")
}

pub fn is_valid_slug(slug: &str) -> bool {
    !slug.is_empty()
        && slug
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

pub fn game_page_url(slug: &str) -> Option<String> {
    is_valid_slug(slug).then(|| format!("{GAME_PAGE_PREFIX}{slug}"))
}

fn push_capped(buf: &mut Vec<u8>, chunk: &[u8], cap: usize) -> Result<(), String> {
    if buf.len() + chunk.len() > cap {
        return Err(format!("response exceeds {cap} bytes"));
    }
    buf.extend_from_slice(chunk);
    Ok(())
}

// `error_for_status` lets a 3xx through, and the redirect policy returns one when it stops a hop.
fn check_status(status: reqwest::StatusCode) -> Result<(), String> {
    if status.is_success() {
        Ok(())
    } else {
        Err(format!("unexpected status {status}"))
    }
}

async fn get_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    check_status(response.status())?;
    let mut buf = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        push_capped(&mut buf, &chunk, MAX_BYTES)?;
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

// The commands take `tauri::State`, so the logic lives in these plain functions.
async fn fetch_catalog(client: &DlesClient) -> Result<String, String> {
    get_text(&client.0, CATALOG_URL).await
}

async fn fetch_game_page(client: &DlesClient, slug: &str) -> Result<String, String> {
    let url = game_page_url(slug).ok_or_else(|| "invalid game slug".to_string())?;
    get_text(&client.0, &url).await
}

#[tauri::command]
pub async fn dles_catalog(client: tauri::State<'_, DlesClient>) -> Result<String, String> {
    fetch_catalog(&client).await
}

#[tauri::command]
pub async fn dles_game_page(
    client: tauri::State<'_, DlesClient>,
    slug: String,
) -> Result<String, String> {
    fetch_game_page(&client, &slug).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_slugs() {
        for ok in ["wordle", "nyt-connections", "2048-daily"] {
            assert!(is_valid_slug(ok), "{ok}");
        }
        for bad in ["", "Wordle", "../x", "a/b", "a b", "a?b"] {
            assert!(!is_valid_slug(bad), "{bad:?}");
        }
    }

    #[test]
    fn redirects_stay_on_dles_over_https() {
        let url = |s: &str| reqwest::Url::parse(s).unwrap();
        assert!(is_dles_url(&url("https://dles.gg/game/wordle")));
        assert!(!is_dles_url(&url("http://dles.gg/")));
        assert!(!is_dles_url(&url("https://www.dles.gg/")));
        assert!(!is_dles_url(&url("https://dles.gg.evil.com/")));
        assert!(!is_dles_url(&url("https://evil.com/")));
    }

    #[test]
    fn only_2xx_statuses_are_ok() {
        use reqwest::StatusCode;
        assert!(check_status(StatusCode::OK).is_ok());
        for bad in [StatusCode::FOUND, StatusCode::NOT_FOUND, StatusCode::BAD_GATEWAY] {
            assert!(check_status(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn game_page_url_builds_from_slug() {
        assert_eq!(
            game_page_url("wordle"),
            Some("https://dles.gg/game/wordle".to_string())
        );
        assert_eq!(game_page_url("../x"), None);
    }

    #[test]
    fn push_capped_refuses_past_the_cap() {
        let mut buf = Vec::new();
        assert!(push_capped(&mut buf, b"abc", 4).is_ok());
        assert!(push_capped(&mut buf, b"d", 4).is_ok());
        assert!(push_capped(&mut buf, b"e", 4).is_err());
    }

    // Two requests to dles.gg: run on demand only, `cargo test -- --ignored live_dles_pages`.
    #[test]
    #[ignore]
    fn live_dles_pages() {
        tauri::async_runtime::block_on(async {
            let client = DlesClient::new().unwrap();
            let catalog = fetch_catalog(&client).await.unwrap();
            assert!(
                catalog.len() > 100_000,
                "catalog is {} bytes",
                catalog.len()
            );
            let page = fetch_game_page(&client, "wordle").await.unwrap();
            assert!(page.contains("SoftwareApplication"));
            assert!(fetch_game_page(&client, "../x").await.is_err());
        });
    }
}
