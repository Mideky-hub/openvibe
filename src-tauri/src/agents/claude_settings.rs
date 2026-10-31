//! The settings file given to Claude with `--settings` (spec habillage §8.2,
//! §10.3): http hooks that report its state, none that could block a decision.

use crate::tr;
use std::io;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use super::hooks_server::valid_node_id;
use crate::pty::shell::Role;

const NOTIFICATIONS: &str =
    "permission_prompt|elicitation_dialog|elicitation_url_dialog|agent_needs_input|idle_prompt";

pub fn settings_json(url: &str, role: Role) -> Value {
    let hook = json!({ "type": "http", "url": url, "timeout": 2 });
    let every = json!([{ "hooks": [hook] }]);
    // OpenVibe's own tools never ask (spec orchestrateur §4.2).
    let mut permissions = json!({ "allow": ["mcp__openvibe"] });
    if role == Role::Orchestrator {
        // A manager does not code itself, nor run commands in the user's folder.
        permissions["deny"] = json!(["Edit", "Write", "NotebookEdit", "Bash"]);
    }
    json!({
        "hooks": {
            "UserPromptSubmit": every,
            "PostToolUse": every,
            "Stop": every,
            "StopFailure": every,
            "SessionEnd": every,
            "SubagentStart": every,
            "SubagentStop": every,
            "Notification": [{ "matcher": NOTIFICATIONS, "hooks": [hook] }],
        },
        "permissions": permissions,
    })
}

/// The status line OpenVibe gives Claude (spec maj §6): the session's usage
/// posted to OpenVibe, then the user's own status line, shown as before.
#[derive(Debug, Clone, PartialEq)]
pub struct StatusLine {
    pub script: PathBuf,
    /// OpenVibe's URL, without the token.
    pub url: String,
    /// The curl config file that carries the token (`write_curl_config`).
    pub config: PathBuf,
    /// The user's `statusLine` setting, when it runs a command.
    pub user: Option<Value>,
}

/// Run by Claude through bash, Git Bash on Windows: `$1` is OpenVibe's URL,
/// `$2` the curl config that carries the token, `$3` the user's own status
/// line command, given the same JSON.
pub const STATUS_SCRIPT: &str = "#!/usr/bin/env bash\n\
# OpenVibe : la ligne d'état de Claude transmet l'usage de la session, puis affiche celle de l'utilisateur.\n\
input=$(cat)\n\
printf '%s' \"$input\" | curl -s -m 1 -K \"$2\" -X POST -H 'Content-Type: application/json' --data-binary @- \"$1\" >/dev/null 2>&1\n\
if [ -n \"${3:-}\" ]; then printf '%s' \"$input\" | bash -c \"$3\"; fi\n";

/// The curl config that gives the local server's token to curl as a header
/// (spec première version §4.3): on a command line, any program of the
/// account could read it. Rewritten at each start, next to the settings
/// files that already hold the token.
pub fn write_curl_config(dir: &Path, token: &str) -> io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join("curl.cfg");
    std::fs::write(
        &path,
        format!(
            "header = \"{}: {token}\"\n",
            super::hooks_server::TOKEN_HEADER
        ),
    )?;
    Ok(path)
}

/// A word for bash: single quotes, a quote inside closed and reopened.
fn bash_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', r"'\''"))
}

pub fn status_line_json(status: &StatusLine) -> Value {
    // bash reads Windows paths with forward slashes.
    let script = status.script.to_string_lossy().replace('\\', "/");
    let config = status.config.to_string_lossy().replace('\\', "/");
    let mut command = format!(
        "bash {} {} {}",
        bash_quote(&script),
        bash_quote(&status.url),
        bash_quote(&config)
    );
    let user = status.user.as_ref();
    if let Some(own) = user.and_then(|u| u["command"].as_str()) {
        command.push(' ');
        command.push_str(&bash_quote(own));
    }
    let mut line = json!({ "type": "command", "command": command });
    for key in ["padding", "refreshInterval"] {
        if let Some(value) = user.and_then(|u| u.get(key)) {
            line[key] = value.clone();
        }
    }
    line
}

/// The `statusLine` of Claude's user settings when it runs a command.
pub fn user_status_line(settings: &Path) -> Option<Value> {
    let bytes = std::fs::read(settings).ok()?;
    // Notepad saves with a byte order mark (final review maj §6).
    let bytes = bytes.strip_prefix("\u{feff}".as_bytes()).unwrap_or(&bytes);
    let read: Value = serde_json::from_slice(bytes).ok()?;
    let line = read.get("statusLine")?;
    let runs = line["type"] == "command"
        && line["command"]
            .as_str()
            .is_some_and(|c| !c.trim().is_empty());
    runs.then(|| line.clone())
}

/// The status line Claude would show in `cwd`: its local settings', its
/// project's, then the user's (final review maj §6: `--settings` outranks them all).
pub fn status_line_for(cwd: &Path, user: Option<&Path>) -> Option<Value> {
    let project = cwd.join(".claude");
    [
        project.join("settings.local.json"),
        project.join("settings.json"),
    ]
    .iter()
    .find_map(|file| user_status_line(file))
    .or_else(|| user.and_then(user_status_line))
}

/// Claude's folder: `$CLAUDE_CONFIG_DIR`, else `~/.claude`.
pub fn claude_config_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("CLAUDE_CONFIG_DIR") {
        return Some(PathBuf::from(dir));
    }
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(home).join(".claude"))
}

/// Claude's user settings: `settings.json` in its folder.
pub fn user_settings_file() -> Option<PathBuf> {
    Some(claude_config_dir()?.join("settings.json"))
}

/// `<dir>/<nodeId>.json`, rewritten at each launch (port and token change
/// with each run of the app).
pub fn write(
    dir: &Path,
    node_id: &str,
    url: &str,
    role: Role,
    status: Option<&StatusLine>,
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
    std::fs::create_dir_all(dir)?;
    let path = dir.join(format!("{node_id}.json"));
    let mut settings = settings_json(url, role);
    if let Some(status) = status {
        // Without its script, Claude goes without the status line, never without its hooks.
        match std::fs::write(&status.script, STATUS_SCRIPT) {
            Ok(()) => settings["statusLine"] = status_line_json(status),
            Err(err) => log::warn!("status line of {node_id} not written: {err}"),
        }
    }
    std::fs::write(&path, serde_json::to_vec_pretty(&settings)?)?;
    Ok(path)
}

pub fn remove(dir: &Path, node_id: &str) {
    if valid_node_id(node_id) {
        let _ = std::fs::remove_file(dir.join(format!("{node_id}.json")));
    }
}

/// Files left by a previous run point at a server that is gone.
pub fn clear(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "json") {
            let _ = std::fs::remove_file(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const URL: &str = "http://127.0.0.1:4242/hook/claude/n1?t=tok";

    #[test]
    fn reports_the_tracked_events_to_the_url_without_blocking_hooks() {
        let json = settings_json(URL, Role::Agent);
        let hooks = json["hooks"].as_object().unwrap();
        let mut events: Vec<_> = hooks.keys().map(String::as_str).collect();
        events.sort_unstable();
        assert_eq!(
            events,
            [
                "Notification",
                "PostToolUse",
                "SessionEnd",
                "Stop",
                "StopFailure",
                "SubagentStart",
                "SubagentStop",
                "UserPromptSubmit"
            ]
        );
        assert_eq!(
            json["hooks"]["Stop"][0]["hooks"][0],
            serde_json::json!({ "type": "http", "url": URL, "timeout": 2 })
        );
        assert_eq!(
            json["hooks"]["Notification"][0]["matcher"],
            "permission_prompt|elicitation_dialog|elicitation_url_dialog|agent_needs_input|idle_prompt"
        );
    }

    #[test]
    fn allows_openvibe_s_tools_without_asking() {
        assert_eq!(
            settings_json(URL, Role::Agent)["permissions"],
            serde_json::json!({ "allow": ["mcp__openvibe"] })
        );
    }

    #[test]
    fn writes_rewrites_and_removes_a_terminal_s_file() {
        let dir = tempfile::tempdir().unwrap();
        let hooks = dir.path().join("hooks");
        let path = write(&hooks, "n1", URL, Role::Agent, None).unwrap();
        assert_eq!(path, hooks.join("n1.json"));
        let read: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(read, settings_json(URL, Role::Agent));
        write(&hooks, "n1", "http://127.0.0.1:1/other", Role::Agent, None).unwrap();
        assert!(
            std::fs::read_to_string(&path)
                .unwrap()
                .contains("127.0.0.1:1/other")
        );
        remove(&hooks, "n1");
        assert!(!path.exists());
    }

    #[test]
    fn refuses_a_node_id_that_would_leave_the_folder() {
        let dir = tempfile::tempdir().unwrap();
        assert!(write(dir.path(), "../evil", URL, Role::Agent, None).is_err());
        assert!(!dir.path().join("../evil.json").exists());
        let english = crate::i18n::in_english(|| {
            write(dir.path(), "../evil", URL, Role::Agent, None).unwrap_err()
        });
        assert_eq!(english.to_string(), "invalid node id: ../evil");
    }

    #[test]
    fn clears_the_files_of_the_previous_run() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "a", URL, Role::Agent, None).unwrap();
        write(dir.path(), "b", URL, Role::Agent, None).unwrap();
        std::fs::write(dir.path().join("keep.txt"), "x").unwrap();
        clear(dir.path());
        let left: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(left, vec![std::ffi::OsString::from("keep.txt")]);
        clear(&dir.path().join("missing"));
    }

    const STATUS_URL: &str = "http://127.0.0.1:4242/status/n1";

    fn status(user: Option<serde_json::Value>) -> StatusLine {
        StatusLine {
            script: PathBuf::from(r"C:\data\hooks\statusline.sh"),
            url: STATUS_URL.into(),
            config: PathBuf::from(r"C:\data\Jean O'Brien\hooks\curl.cfg"),
            user,
        }
    }

    #[test]
    fn its_status_line_tells_openvibe_then_shows_the_user_s_own() {
        let config = "'C:/data/Jean O'\\''Brien/hooks/curl.cfg'";
        assert_eq!(
            status_line_json(&status(None)),
            json!({ "type": "command", "command": format!("bash 'C:/data/hooks/statusline.sh' '{STATUS_URL}' {config}") })
        );
        let user = json!({ "type": "command", "command": "~/bin/it's.sh --x", "padding": 0, "refreshInterval": 5 });
        assert_eq!(
            status_line_json(&status(Some(user))),
            json!({
                "type": "command",
                "command": format!("bash 'C:/data/hooks/statusline.sh' '{STATUS_URL}' {config} '~/bin/it'\\''s.sh --x'"),
                "padding": 0,
                "refreshInterval": 5
            })
        );
    }

    #[test]
    fn the_token_travels_in_a_curl_config_file_not_on_a_command_line() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_curl_config(&dir.path().join("hooks"), "tok-1").unwrap();
        assert_eq!(path, dir.path().join("hooks").join("curl.cfg"));
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "header = \"X-OpenVibe-Token: tok-1\"\n"
        );
        let line = status_line_json(&status(None));
        assert!(!line["command"].as_str().unwrap().contains("t="));
    }

    #[test]
    fn reads_the_user_s_status_line_from_claude_s_settings() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("settings.json");
        assert_eq!(user_status_line(&file), None);
        std::fs::write(
            &file,
            r#"{ "statusLine": { "type": "command", "command": "carbon.sh" }, "x": 1 }"#,
        )
        .unwrap();
        assert_eq!(
            user_status_line(&file),
            Some(json!({ "type": "command", "command": "carbon.sh" }))
        );
        std::fs::write(
            &file,
            r#"{ "statusLine": { "type": "static", "command": "x" } }"#,
        )
        .unwrap();
        assert_eq!(user_status_line(&file), None);
        std::fs::write(&file, "pas du json").unwrap();
        assert_eq!(user_status_line(&file), None);
    }

    #[test]
    fn takes_the_project_s_status_line_before_the_user_s_as_claude_does() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("proj");
        std::fs::create_dir_all(project.join(".claude")).unwrap();
        let user = dir.path().join("settings.json");
        let line = |command: &str| {
            format!(r#"{{ "statusLine": {{ "type": "command", "command": "{command}" }} }}"#)
        };
        std::fs::write(&user, line("user.sh")).unwrap();
        let read = || status_line_for(&project, Some(&user)).map(|v| v["command"].clone());
        assert_eq!(read(), Some(json!("user.sh")));
        std::fs::write(
            project.join(".claude").join("settings.json"),
            line("project.sh"),
        )
        .unwrap();
        assert_eq!(read(), Some(json!("project.sh")));
        std::fs::write(
            project.join(".claude").join("settings.local.json"),
            line("local.sh"),
        )
        .unwrap();
        assert_eq!(read(), Some(json!("local.sh")));
        assert_eq!(status_line_for(&dir.path().join("none"), None), None);
    }

    #[test]
    fn reads_a_settings_file_saved_with_a_byte_order_mark() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("settings.json");
        std::fs::write(
            &file,
            "\u{feff}{ \"statusLine\": { \"type\": \"command\", \"command\": \"carbon.sh\" } }",
        )
        .unwrap();
        assert_eq!(
            user_status_line(&file),
            Some(json!({ "type": "command", "command": "carbon.sh" }))
        );
    }

    #[test]
    fn keeps_the_hooks_when_its_status_line_script_cannot_be_written() {
        let dir = tempfile::tempdir().unwrap();
        let line = StatusLine {
            script: dir.path().join("missing").join("statusline.sh"),
            url: STATUS_URL.into(),
            config: dir.path().join("curl.cfg"),
            user: None,
        };
        let path = write(dir.path(), "n1", URL, Role::Agent, Some(&line)).unwrap();
        let read: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert!(read.get("statusLine").is_none());
        assert_eq!(read["hooks"], settings_json(URL, Role::Agent)["hooks"]);
    }

    #[test]
    fn writes_the_status_line_and_its_script() {
        let dir = tempfile::tempdir().unwrap();
        let line = StatusLine {
            script: dir.path().join("statusline.sh"),
            url: STATUS_URL.into(),
            config: dir.path().join("curl.cfg"),
            user: None,
        };
        let path = write(dir.path(), "n1", URL, Role::Agent, Some(&line)).unwrap();
        let read: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(read["statusLine"], status_line_json(&line));
        let script = std::fs::read_to_string(dir.path().join("statusline.sh")).unwrap();
        assert!(
            script.contains("curl -s -m 1 -K \"$2\"")
                && script.contains("\"$1\"")
                && script.contains("bash -c \"$3\""),
            "{script}"
        );
        assert!(!script.contains('\r'), "bash needs LF line ends");
    }

    /// The bash Claude runs the script with: Git Bash on Windows (the `bash` of the PATH may be WSL's), else the PATH's.
    fn script_bash() -> Option<String> {
        if !cfg!(windows) {
            return Some("bash".into());
        }
        ["ProgramFiles", "ProgramFiles(x86)"]
            .iter()
            .filter_map(|var| std::env::var_os(var))
            .map(|dir| std::path::Path::new(&dir).join("Git/bin/bash.exe"))
            .find(|path| path.exists())
            .map(|path| path.to_string_lossy().into_owned())
    }

    /// Whether `program` runs here: the script test needs bash and curl, as Claude does.
    fn runs(program: &str, arg: &str) -> bool {
        std::process::Command::new(program)
            .arg(arg)
            .output()
            .is_ok_and(|out| out.status.success())
    }

    #[test]
    fn the_status_script_really_posts_the_json_with_the_token_then_runs_the_user_s_line() {
        use std::io::{Read, Write};
        let Some(bash) = script_bash().filter(|bash| runs(bash, "--version")) else {
            eprintln!("Git Bash missing: script not run");
            return;
        };
        if !runs("curl", "--version") {
            eprintln!("bash or curl missing: script not run");
            return;
        }
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut received = Vec::new();
            let mut chunk = [0u8; 4096];
            // Headers, then as much body as Content-Length announces.
            loop {
                let n = stream.read(&mut chunk).unwrap();
                received.extend_from_slice(&chunk[..n]);
                let text = String::from_utf8_lossy(&received).to_string();
                if let Some((head, body)) = text.split_once("\r\n\r\n") {
                    let wanted = head
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if body.len() >= wanted || n == 0 {
                        break;
                    }
                }
                if n == 0 {
                    break;
                }
            }
            let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
            String::from_utf8_lossy(&received).to_string()
        });
        let dir = tempfile::tempdir().unwrap();
        let config = write_curl_config(dir.path(), "secret-token").unwrap();
        let script = dir.path().join("statusline.sh");
        std::fs::write(&script, STATUS_SCRIPT).unwrap();
        let line = StatusLine {
            script,
            url: format!("http://127.0.0.1:{port}/status/n1"),
            config,
            user: Some(json!({ "type": "command", "command": "cat" })),
        };
        let command = status_line_json(&line)["command"]
            .as_str()
            .unwrap()
            .to_string();
        let mut child = std::process::Command::new(&bash)
            .arg("-c")
            .arg(&command)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let input = r#"{"session_id":"s1"}"#;
        child
            .stdin
            .take()
            .unwrap()
            .write_all(input.as_bytes())
            .unwrap();
        let out = child.wait_with_output().unwrap();
        // The user's own line shows what it was given.
        assert_eq!(
            String::from_utf8_lossy(&out.stdout),
            input,
            "{} {}",
            out.status,
            String::from_utf8_lossy(&out.stderr)
        );
        let request = server.join().unwrap();
        assert!(request.starts_with("POST /status/n1"), "{request}");
        assert!(
            request.to_ascii_lowercase().contains(&format!(
                "{}: secret-token",
                super::super::hooks_server::TOKEN_HEADER.to_ascii_lowercase()
            )),
            "{request}"
        );
        assert!(request.ends_with(input), "{request}");
    }

    #[test]
    fn an_orchestrator_may_neither_edit_files_nor_run_commands() {
        let manager = settings_json(URL, Role::Orchestrator);
        assert_eq!(manager["permissions"]["allow"], json!(["mcp__openvibe"]));
        assert_eq!(
            manager["permissions"]["deny"],
            json!(["Edit", "Write", "NotebookEdit", "Bash"])
        );
        assert!(
            settings_json(URL, Role::Agent)["permissions"]
                .get("deny")
                .is_none()
        );
    }
}
