pub mod filters;
#[cfg(target_os = "macos")]
mod macos;

use std::collections::HashSet;
use std::sync::{Condvar, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Webview};

/// How long a game opened during startup waits for the rules before opening unfiltered.
pub const ATTACH_TIMEOUT: Duration = Duration::from_secs(5);

/// Labels of the game webviews that run without blocking. Lives until the app quits and is
/// never persisted.
#[derive(Default)]
pub struct Bypass(Mutex<HashSet<String>>);

impl Bypass {
    pub fn insert(&self, label: &str) {
        self.0.lock().unwrap().insert(label.to_string());
    }

    pub fn remove(&self, label: &str) {
        self.0.lock().unwrap().remove(label);
    }

    #[cfg_attr(not(windows), allow(dead_code))] // only the Windows request handler reads it
    pub fn contains(&self, label: &str) -> bool {
        self.0.lock().unwrap().contains(label)
    }
}

/// Set once the platform rules are compiled. A Mutex and a Condvar rather than a channel so
/// any number of games can wait on it and the static can be built at compile time.
pub struct Readiness {
    ready: Mutex<bool>,
    changed: Condvar,
}

impl Readiness {
    pub const fn new() -> Self {
        Self {
            ready: Mutex::new(false),
            changed: Condvar::new(),
        }
    }

    pub fn mark_ready(&self) {
        *self.ready.lock().unwrap() = true;
        self.changed.notify_all();
    }

    /// True once ready, false when the timeout elapses first.
    pub fn wait(&self, timeout: Duration) -> bool {
        let guard = self.ready.lock().unwrap();
        let (guard, _) = self
            .changed
            .wait_timeout_while(guard, timeout, |ready| !*ready)
            .unwrap();
        *guard
    }
}

pub static READY: Readiness = Readiness::new();

/// Starts the platform compilation of the rules. The platform module calls `READY.mark_ready()`
/// once every list is resolved; a platform without one is ready at once.
pub fn init(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    macos::init(app);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        READY.mark_ready();
    }
}

/// Installs the rules on a game webview. Failures are logged, never returned: a game that
/// cannot be filtered must still open.
pub fn attach(webview: &Webview) {
    if !READY.wait(ATTACH_TIMEOUT) {
        eprintln!("content blocking rules not ready after {ATTACH_TIMEOUT:?}, opening unfiltered");
        return;
    }
    #[cfg(target_os = "macos")]
    macos::attach(webview);
    #[cfg(not(target_os = "macos"))]
    let _ = webview;
}

/// Removes the rules from a game webview, so its next navigation loads unfiltered.
pub fn detach(webview: &Webview) {
    #[cfg(target_os = "macos")]
    macos::detach(webview);
    #[cfg(not(target_os = "macos"))]
    let _ = webview;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bypass_holds_until_removed() {
        let b = Bypass::default();
        assert!(!b.contains("game-1"));
        b.insert("game-1");
        assert!(b.contains("game-1") && !b.contains("game-2"));
        b.insert("game-1");
        assert!(b.contains("game-1"));
        b.remove("game-1");
        assert!(!b.contains("game-1"));
    }

    #[test]
    fn readiness_times_out_then_releases_waiters() {
        let r = std::sync::Arc::new(Readiness::new());
        assert!(!r.wait(Duration::from_millis(20)));
        let r2 = r.clone();
        let waiter = std::thread::spawn(move || r2.wait(Duration::from_secs(5)));
        r.mark_ready();
        assert!(waiter.join().unwrap());
        assert!(r.wait(Duration::ZERO));
    }
}
