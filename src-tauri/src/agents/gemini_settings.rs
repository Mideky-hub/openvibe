//! The hooks given to Gemini CLI (issue #86): its "system defaults" layer,
//! pointed at a file of OpenVibe's with `GEMINI_CLI_SYSTEM_DEFAULTS_PATH`.
//! It is Gemini's lowest layer and Gemini adds the hooks of every layer
//! together, so the user's own settings and hooks stay as they are.

use crate::tr;
use std::io;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use super::hooks_server::valid_node_id;

/// The variable that tells Gemini CLI where its system defaults file is.
pub const DEFAULTS_ENV: &str = "GEMINI_CLI_SYSTEM_DEFAULTS_PATH";
/// The one that moves its system settings, and the defaults with them.
const SETTINGS_ENV: &str = "GEMINI_CLI_SYSTEM_SETTINGS_PATH";

/// The events heard (see `activity::gemini_activity`); the server reads the
/// notification's type itself.
const EVENTS: [&str; 3] = ["BeforeAgent", "AfterAgent", "Notification"];

/// What Gemini runs, the event's JSON on its stdin: PowerShell on Windows,
/// bash elsewhere. The token travels in the curl config (spec première
/// version §4.3), and a server gone exits 0, which Gemini takes as no answer.
pub fn hook_command(url: &str, config: &Path) -> String {
    let config = config.to_string_lossy();
    if cfg!(windows) {
        // `curl` alone is Invoke-WebRequest there, and a bare `@` splats.
        let word = |text: &str| format!("'{}'", text.replace('\'', "''"));
        format!(
            "curl.exe -s -m 2 -o NUL -K {} -X POST -H 'Content-Type: application/json' --data-binary '@-' {}; $global:LASTEXITCODE = 0",
            word(&config),
            word(url)
        )
    } else {
        let word = |text: &str| format!("'{}'", text.replace('\'', r"'\''"));
        format!(
            "curl -s -m 2 -o /dev/null -K {} -X POST -H 'Content-Type: application/json' --data-binary @- {} || true",
            word(&config),
            word(url)
        )
    }
}

pub fn hooks_json(url: &str, config: &Path) -> Value {
    let hook = json!({
        "name": "openvibe",
        "type": "command",
        "command": hook_command(url, config),
        "timeout": 5000,
    });
    let hooks: serde_json::Map<String, Value> = EVENTS
        .iter()
        .map(|event| (event.to_string(), json!([{ "hooks": [hook.clone()] }])))
        .collect();
    json!({ "hooks": hooks })
}

/// The system defaults file Gemini reads, as its `getSystemDefaultsPath` finds it.
pub fn defaults_path(
    defaults_env: Option<&str>,
    settings_env: Option<&str>,
    windows: bool,
) -> PathBuf {
    let set = |value: Option<&str>| value.filter(|v| !v.is_empty()).map(PathBuf::from);
    if let Some(path) = set(defaults_env) {
        return path;
    }
    match set(settings_env) {
        Some(settings) => settings
            .parent()
            .unwrap_or(Path::new(""))
            .join("system-defaults.json"),
        None => PathBuf::from(if windows {
            r"C:\ProgramData\gemini-cli\system-defaults.json"
        } else if cfg!(target_os = "macos") {
            "/Library/Application Support/GeminiCli/system-defaults.json"
        } else {
            "/etc/gemini-cli/system-defaults.json"
        }),
    }
}

/// The system defaults file Gemini would read without OpenVibe.
pub fn system_defaults() -> PathBuf {
    let var = |key| std::env::var(key).ok();
    defaults_path(
        var(DEFAULTS_ENV).as_deref(),
        var(SETTINGS_ENV).as_deref(),
        cfg!(windows),
    )
}

fn unreadable(path: &Path) -> io::Error {
    let path = path.display();
    io::Error::new(
        io::ErrorKind::InvalidData,
        tr!(
            "réglages Gemini illisibles, laissés tels quels : {path}",
            "Gemini settings unreadable, left as they are: {path}"
        ),
    )
}

/// `own`, the defaults file OpenVibe's takes the place of, with OpenVibe's
/// hooks added after its own. A file it cannot read whole is never hidden:
/// then no hooks.
pub fn merged(own: Option<&Path>, url: &str, config: &Path) -> io::Result<Value> {
    let ours = hooks_json(url, config);
    let bytes = match own.map(std::fs::read) {
        None => return Ok(ours),
        Some(Err(err)) if err.kind() == io::ErrorKind::NotFound => return Ok(ours),
        Some(read) => read?,
    };
    let path = own.unwrap_or(Path::new(""));
    // Notepad saves with a byte order mark.
    let bytes = bytes.strip_prefix("\u{feff}".as_bytes()).unwrap_or(&bytes);
    let mut settings: Value = serde_json::from_slice(bytes).map_err(|_| unreadable(path))?;
    if !settings.is_object() {
        return Err(unreadable(path));
    }
    if settings.get("hooks").is_none() {
        settings["hooks"] = json!({});
    }
    let hooks = settings["hooks"]
        .as_object_mut()
        .ok_or_else(|| unreadable(path))?;
    for event in EVENTS {
        let list = hooks.entry(event).or_insert_with(|| json!([]));
        let list = list.as_array_mut().ok_or_else(|| unreadable(path))?;
        list.extend(
            ours["hooks"][event]
                .as_array()
                .into_iter()
                .flatten()
                .cloned(),
        );
    }
    Ok(settings)
}

/// `<dir>/<nodeId>.gemini.json`, rewritten at each launch; the dot keeps it
/// apart from any node's Claude file, and `claude_settings::clear` removes it.
pub fn write(
    dir: &Path,
    node_id: &str,
    url: &str,
    config: &Path,
    own: Option<&Path>,
) -> io::Result<PathBuf> {
    if !valid_node_id(node_id) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            tr!(
                "identifiant de nœud invalide : {node_id}",
                "invalid node id: {node_id}"
            ),
        ));
    }
    let settings = merged(own, url, config)?;
    std::fs::create_dir_all(dir)?;
    let path = dir.join(format!("{node_id}.gemini.json"));
    std::fs::write(&path, serde_json::to_vec_pretty(&settings)?)?;
    Ok(path)
}

pub fn remove(dir: &Path, node_id: &str) {
    if valid_node_id(node_id) {
        let _ = std::fs::remove_file(dir.join(format!("{node_id}.gemini.json")));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const URL: &str = "http://127.0.0.1:4242/hook/gemini/n1";

    fn config() -> PathBuf {
        PathBuf::from(r"C:\data\hooks\curl.cfg")
    }

    #[test]
    fn reports_the_start_and_end_of_a_turn_and_its_permission_questions() {
        let json = hooks_json(URL, &config());
        let hooks = json["hooks"].as_object().unwrap();
        let mut events: Vec<_> = hooks.keys().map(String::as_str).collect();
        events.sort_unstable();
        assert_eq!(events, ["AfterAgent", "BeforeAgent", "Notification"]);
        for event in events {
            let hook = &json["hooks"][event][0]["hooks"][0];
            assert_eq!(hook["type"], "command", "{event}");
            assert_eq!(hook["name"], "openvibe", "{event}");
            assert_eq!(
                hook["command"],
                Value::from(hook_command(URL, &config())),
                "{event}"
            );
            // In milliseconds for Gemini: a hook never holds a turn for long.
            assert_eq!(hook["timeout"], 5000, "{event}");
        }
    }

    #[test]
    fn the_hook_posts_what_gemini_gives_it_with_the_token_from_a_file() {
        let command = hook_command(URL, &config());
        assert!(command.contains(URL), "{command}");
        assert!(!command.contains("t="), "the token went on a command line");
        assert!(command.contains("-K "), "{command}");
        assert!(command.contains("@-"), "stdin is not sent: {command}");
        if cfg!(windows) {
            // PowerShell: `curl` alone is Invoke-WebRequest, `@` splats.
            assert!(command.starts_with("curl.exe "), "{command}");
            assert!(command.contains("'@-'"), "{command}");
            assert!(command.contains(r"'C:\data\hooks\curl.cfg'"), "{command}");
            // A server gone must not read as a failed hook.
            assert!(command.ends_with("$global:LASTEXITCODE = 0"), "{command}");
        } else {
            assert!(command.starts_with("curl "), "{command}");
            assert!(command.ends_with("|| true"), "{command}");
        }
    }

    #[test]
    fn a_path_with_an_apostrophe_stays_one_word() {
        let command = hook_command(URL, Path::new(r"C:\Users\O'Brien\curl.cfg"));
        if cfg!(windows) {
            assert!(
                command.contains(r"'C:\Users\O''Brien\curl.cfg'"),
                "{command}"
            );
        } else {
            assert!(
                command.contains(r"'C:\Users\O'\''Brien\curl.cfg'"),
                "{command}"
            );
        }
    }

    #[test]
    fn finds_the_defaults_file_gemini_would_read() {
        assert_eq!(
            defaults_path(Some("/x/d.json"), Some("/y/s.json"), false),
            PathBuf::from("/x/d.json")
        );
        assert_eq!(
            defaults_path(None, Some("/y/s.json"), false),
            Path::new("/y").join("system-defaults.json")
        );
        assert_eq!(
            defaults_path(None, None, true),
            PathBuf::from(r"C:\ProgramData\gemini-cli\system-defaults.json")
        );
        assert_eq!(
            defaults_path(Some(""), Some(""), false),
            defaults_path(None, None, false),
            "an empty variable is no path"
        );
    }

    #[test]
    fn keeps_what_the_defaults_file_already_held() {
        let dir = tempfile::tempdir().unwrap();
        let own = dir.path().join("system-defaults.json");
        let before = "\u{feff}{ \"ui\": { \"theme\": \"Dracula\" }, \"hooks\": { \"BeforeAgent\": [ { \"hooks\": [ { \"type\": \"command\", \"command\": \"mine.sh\" } ] } ] } }";
        std::fs::write(&own, before).unwrap();
        let json = merged(Some(&own), URL, &config()).unwrap();
        assert_eq!(json["ui"]["theme"], "Dracula");
        let before_agent = json["hooks"]["BeforeAgent"].as_array().unwrap();
        assert_eq!(before_agent.len(), 2);
        assert_eq!(before_agent[0]["hooks"][0]["command"], "mine.sh");
        assert_eq!(before_agent[1]["hooks"][0]["name"], "openvibe");
        assert_eq!(json["hooks"]["AfterAgent"].as_array().unwrap().len(), 1);
        assert_eq!(
            std::fs::read_to_string(&own).unwrap(),
            before,
            "the user's file was changed"
        );
    }

    #[test]
    fn without_a_defaults_file_only_openvibe_s_hooks() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("none.json");
        assert_eq!(
            merged(Some(&missing), URL, &config()).unwrap(),
            hooks_json(URL, &config())
        );
        assert_eq!(
            merged(None, URL, &config()).unwrap(),
            hooks_json(URL, &config())
        );
    }

    #[test]
    fn a_defaults_file_it_cannot_read_is_never_hidden() {
        let dir = tempfile::tempdir().unwrap();
        let own = dir.path().join("system-defaults.json");
        // Gemini reads comments; OpenVibe cannot keep them, so it gives up its hooks.
        std::fs::write(&own, "{ // mine\n \"ui\": {} }").unwrap();
        assert!(merged(Some(&own), URL, &config()).is_err());
        std::fs::write(&own, r#"{ "hooks": { "BeforeAgent": "x" } }"#).unwrap();
        assert!(merged(Some(&own), URL, &config()).is_err());
        let hooks = dir.path().join("hooks");
        assert!(write(&hooks, "n1", URL, &config(), Some(&own)).is_err());
        assert!(!hooks.join("n1.gemini.json").exists());
    }

    #[test]
    fn writes_and_removes_a_terminal_s_file() {
        let dir = tempfile::tempdir().unwrap();
        let hooks = dir.path().join("hooks");
        let path = write(&hooks, "n1", URL, &config(), None).unwrap();
        assert_eq!(path, hooks.join("n1.gemini.json"));
        let read: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(read, hooks_json(URL, &config()));
        remove(&hooks, "n1");
        assert!(!path.exists());
        assert!(write(&hooks, "../evil", URL, &config(), None).is_err());
    }

    #[test]
    fn a_new_run_clears_the_files_of_the_previous_one() {
        let dir = tempfile::tempdir().unwrap();
        let path = write(dir.path(), "n1", URL, &config(), None).unwrap();
        super::super::claude_settings::clear(dir.path());
        assert!(!path.exists());
    }
}
