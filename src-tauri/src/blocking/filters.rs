//! Network filtering built from the bundled EasyList, EasyPrivacy and EasyList Cookie lists.
//! Pure logic: nothing here touches a webview, and nothing is ever injected into a game page.

pub struct FilterList {
    pub name: &'static str,
    pub text: &'static str,
}

pub const LISTS: [FilterList; 3] = [
    FilterList {
        name: "easylist",
        text: include_str!("../../filters/easylist.txt"),
    },
    FilterList {
        name: "easyprivacy",
        text: include_str!("../../filters/easyprivacy.txt"),
    },
    FilterList {
        name: "easylist-cookie",
        text: include_str!("../../filters/easylist-cookie.txt"),
    },
];

/// Version stamp of the bundled lists, written by the update script.
#[cfg(any(target_os = "macos", test))]
fn version() -> &'static str {
    include_str!("../../filters/version.txt").trim()
}

/// Compiled rule lists are cached by id, so a new bundle must yield new ids.
#[cfg(any(target_os = "macos", test))]
pub fn rule_list_id(name: &str) -> String {
    format!("dles-{name}-{}", version())
}

#[cfg(any(windows, test))]
pub fn build_engine() -> adblock::Engine {
    use adblock::lists::{FilterSet, ParseOptions};
    let mut set = FilterSet::new(false);
    for list in LISTS {
        set.add_filter_list(list.text.to_string(), ParseOptions::default());
    }
    adblock::Engine::new_with_filter_set(set)
}

/// A request that cannot be parsed is allowed: a filter failure must never block a game.
#[cfg(any(windows, test))]
pub fn should_block(
    engine: &adblock::Engine,
    url: &str,
    source_url: &str,
    request_type: &str,
) -> bool {
    if request_type == "document" {
        return false;
    }
    match adblock::request::Request::new(url, source_url, request_type, "GET") {
        Ok(request) => engine.check_network_request(&request).should_block(),
        Err(_) => false,
    }
}

/// Converts one list to WebKit content-blocking JSON, with its rule count.
/// Returns `None` on a conversion failure or an empty result, so the caller can skip the list.
#[cfg(any(target_os = "macos", test))]
pub fn content_rules_json(text: &str) -> Option<(String, usize)> {
    use adblock::lists::{FilterSet, ParseOptions};
    // `into_content_blocking` only works on a set created in debug mode.
    let mut set = FilterSet::new(true);
    set.add_filter_list(text.to_string(), ParseOptions::default());
    let (rules, _) = set.into_content_blocking().ok()?;
    if rules.is_empty() {
        return None;
    }
    let json = serde_json::to_string(&rules).ok()?;
    Some((json, rules.len()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const WEBKIT_MAX_RULES: usize = 150_000;

    fn engine() -> adblock::Engine {
        build_engine()
    }

    #[test]
    fn engine_is_send_and_sync() {
        fn check<T: Send + Sync>() {}
        check::<adblock::Engine>();
    }

    #[test]
    fn krillion_ad_and_consent_scripts_are_blocked() {
        let e = engine();
        assert!(should_block(
            &e,
            "https://scripts.mediavine.com/tags/krillion.js",
            "https://krillion.io/",
            "script"
        ));
        assert!(should_block(
            &e,
            "https://cdn.consentmanager.net/delivery/cmp.min.js",
            "https://krillion.io/",
            "script"
        ));
    }

    #[test]
    fn first_party_resources_are_allowed() {
        let e = engine();
        assert!(!should_block(
            &e,
            "https://krillion.io/_next/static/chunks/main.js",
            "https://krillion.io/",
            "script"
        ));
    }

    #[test]
    fn top_level_document_is_never_blocked() {
        let e = engine();
        assert!(!should_block(
            &e,
            "https://scripts.mediavine.com/",
            "https://scripts.mediavine.com/",
            "document"
        ));
    }

    #[test]
    fn unparsable_url_is_allowed() {
        let e = engine();
        assert!(!should_block(
            &e,
            "not a url",
            "https://krillion.io/",
            "script"
        ));
    }

    #[test]
    fn every_bundled_list_converts_under_the_webkit_cap() {
        for list in LISTS {
            let (json, count) = content_rules_json(list.text).expect(list.name);
            assert!(
                count > 0 && count < WEBKIT_MAX_RULES,
                "{}: {count} rules",
                list.name
            );
            let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed.as_array().unwrap().len(), count);
        }
    }

    #[test]
    fn empty_list_yields_no_rules() {
        assert!(content_rules_json("").is_none());
        assert!(content_rules_json("! only a comment\n").is_none());
    }

    #[test]
    fn rule_list_ids_carry_the_lists_version() {
        assert_eq!(
            rule_list_id("easylist"),
            format!("dles-easylist-{}", version())
        );
        assert!(
            version()
                .chars()
                .all(|c| c.is_ascii_digit() || c == 'T' || c == 'Z')
        );
    }
}
