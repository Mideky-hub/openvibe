//! The settings file given to Claude with `--settings` (spec habillage §8.2,
//! §10.3): http hooks that report its state, none that could block a decision.

use crate::tr;
use std::io;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use super::hooks_server::valid_node_id;
use crate::pty::shell::{Permission, Role};

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

/// What needs a yes in Claude, for an agent nobody watches. Read-only tools ask nothing.
const WORK_TOOLS: [&str; 7] = [
    "Edit",
    "Write",
    "NotebookEdit",
    "Bash",
    "WebFetch",
    "WebSearch",
    "Agent",
];

/// What reaches the remote without `git push`, then `git push` itself. Text
/// rules, not a sandbox: they read the command as written, and an agent that
/// runs commands can word it otherwise (see `NO_PUSH_ENV`, also passed in review).
const MISSION_DENIES: [&str; 7] = [
    "Bash(git push *)",
    "Bash(git push)",
    "Bash(gh pr create *)",
    "Bash(gh pr merge *)",
    "Bash(gh api *)",
    "Bash(gh issue comment *)",
    "Bash(gh release create *)",
];

/// A mission's choice, in this session's settings only: the user's files stay as they are (spec mission de nuit §5.3).
pub fn apply_permission(settings: &mut Value, permission: Option<Permission>) {
    let Some(permission) = permission else {
        return;
    };
    let rules = &mut settings["permissions"];
    if permission == Permission::Work {
        let allow = rules["allow"].as_array_mut();
        allow
            .into_iter()
            .for_each(|allow| allow.extend(WORK_TOOLS.map(Value::from)));
    }
    let mut deny: Vec<Value> = rules["deny"].as_array().cloned().unwrap_or_default();
    deny.extend(MISSION_DENIES.map(Value::from));
    rules["deny"] = Value::Array(deny);
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
    /// The file that holds the user's command, read at each refresh (`user_command_file`).
    pub own: PathBuf,
}

/// Run by Claude through bash, Git Bash on Windows: `$1` is OpenVibe's URL,
/// `$2` the curl config that carries the token, `$3` the file that holds the
/// user's own status line command (read at each refresh, so a change of their
/// settings is followed), which is given the same JSON.
pub const STATUS_SCRIPT: &str = "#!/usr/bin/env bash\n\
# OpenVibe : la ligne d'état de Claude transmet l'usage de la session, puis affiche celle de l'utilisateur.\n\
input=$(cat; printf x); input=${input%x}\n\
printf '%s' \"$input\" | curl -s -m 1 -K \"$2\" -X POST -H 'Content-Type: application/json' --data-binary @- \"$1\" >/dev/null 2>&1 &\n\
own=$(cat \"$3\" 2>/dev/null)\n\
if [ -n \"$own\" ]; then printf '%s' \"$input\" | bash -c \"$own\"; fi\n";

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
    let own = status.own.to_string_lossy().replace('\\', "/");
    let command = format!(
        "bash {} {} {} {}",
        bash_quote(&script),
        bash_quote(&status.url),
        bash_quote(&config),
        bash_quote(&own)
    );
    let user = status.user.as_ref();
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

/// `<dir>/<nodeId>.status-cmd`: the user's own status line command, read by the script at each refresh.
pub fn user_command_file(dir: &Path, node_id: &str) -> PathBuf {
    dir.join(format!("{node_id}.status-cmd"))
}

/// Brings `file` in line with the status line command Claude would run now in `cwd`; true when it changed.
pub fn sync_user_command(file: &Path, cwd: &Path, user: Option<&Path>) -> io::Result<bool> {
    let line = status_line_for(cwd, user);
    let wanted = line
        .as_ref()
        .and_then(|l| l["command"].as_str())
        .unwrap_or("");
    if std::fs::read_to_string(file).ok().as_deref() == Some(wanted)
        || (wanted.is_empty() && !file.exists())
    {
        return Ok(false);
    }
    std::fs::write(file, wanted)?;
    Ok(true)
}

/// Claude's folder: `$CLAUDE_CONFIG_DIR`, else `~/.claude`.
pub fn claude_config_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("CLAUDE_CONFIG_DIR") {
        return Some(PathBuf::from(dir));
    }
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(home).join(".claude"))
}

/// The folder one terminal's Claude uses: its profile's, else OpenVibe's environment's.
pub fn config_dir_for(profile: Option<&Path>) -> Option<PathBuf> {
    profile.map(Path::to_path_buf).or_else(claude_config_dir)
}

/// Claude's user settings for a terminal: `settings.json` in its profile's folder, else the usual one.
pub fn settings_file_in(profile: Option<&Path>) -> Option<PathBuf> {
    Some(config_dir_for(profile)?.join("settings.json"))
}

/// `<dir>/<nodeId>.json`, rewritten at each launch (port and token change
/// with each run of the app).
pub fn write(
    dir: &Path,
    node_id: &str,
    url: &str,
    role: Role,
    status: Option<&StatusLine>,
    permission: Option<Permission>,
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
    apply_permission(&mut settings, permission);
    if let Some(status) = status {
        // Without its script, Claude goes without the status line, never without its hooks.
        match std::fs::write(&status.script, STATUS_SCRIPT) {
            Ok(()) => {
                let own = status.user.as_ref().and_then(|u| u["command"].as_str());
                match std::fs::write(&status.own, own.unwrap_or("")) {
                    Ok(()) => settings["statusLine"] = status_line_json(status),
                    Err(err) => log::warn!("user status line of {node_id} not written: {err}"),
                }
            }
            Err(err) => log::warn!("status line of {node_id} not written: {err}"),
        }
    }
    std::fs::write(&path, serde_json::to_vec_pretty(&settings)?)?;
    Ok(path)
}

pub fn remove(dir: &Path, node_id: &str) {
    if valid_node_id(node_id) {
        let _ = std::fs::remove_file(dir.join(format!("{node_id}.json")));
        let _ = std::fs::remove_file(user_command_file(dir, node_id));
    }
}

/// Files left by a previous run point at a server that is gone.
pub fn clear(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        // `curl.cfg` holds the previous run's token: gone with the server.
        let stale_token = path.file_name().is_some_and(|name| name == "curl.cfg");
        if stale_token
            || path
                .extension()
                .is_some_and(|ext| ext == "json" || ext == "status-cmd")
        {
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
        let path = write(&hooks, "n1", URL, Role::Agent, None, None).unwrap();
        assert_eq!(path, hooks.join("n1.json"));
        let read: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(read, settings_json(URL, Role::Agent));
        write(
            &hooks,
            "n1",
            "http://127.0.0.1:1/other",
            Role::Agent,
            None,
            None,
        )
        .unwrap();
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
        assert!(write(dir.path(), "../evil", URL, Role::Agent, None, None).is_err());
        assert!(!dir.path().join("../evil.json").exists());
        let english = crate::i18n::in_english(|| {
            write(dir.path(), "../evil", URL, Role::Agent, None, None).unwrap_err()
        });
        assert_eq!(english.to_string(), "invalid node id: ../evil");
    }

    #[test]
    fn clears_the_files_of_the_previous_run() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "a", URL, Role::Agent, None, None).unwrap();
        write(dir.path(), "b", URL, Role::Agent, None, None).unwrap();
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
            own: PathBuf::from(r"C:\data\hooks\n1.status-cmd"),
        }
    }

    #[test]
    fn its_status_line_tells_openvibe_then_shows_the_user_s_own() {
        let config = "'C:/data/Jean O'\\''Brien/hooks/curl.cfg'";
        let own = "'C:/data/hooks/n1.status-cmd'";
        assert_eq!(
            status_line_json(&status(None)),
            json!({ "type": "command", "command": format!("bash 'C:/data/hooks/statusline.sh' '{STATUS_URL}' {config} {own}") })
        );
        let user = json!({ "type": "command", "command": "~/bin/it's.sh --x", "padding": 0, "refreshInterval": 5 });
        assert_eq!(
            status_line_json(&status(Some(user))),
            json!({
                "type": "command",
                "command": format!("bash 'C:/data/hooks/statusline.sh' '{STATUS_URL}' {config} {own}"),
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
    fn a_terminal_reads_its_profile_s_folder_not_openvibe_s_environment() {
        let profile = tempfile::tempdir().unwrap();
        assert_eq!(
            config_dir_for(Some(profile.path())),
            Some(profile.path().to_path_buf())
        );
        assert_eq!(
            settings_file_in(Some(profile.path())),
            Some(profile.path().join("settings.json"))
        );
        // Without a profile, it is the usual folder (the environment's, else ~/.claude).
        assert_eq!(config_dir_for(None), claude_config_dir());
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
            own: dir.path().join("n1.status-cmd"),
        };
        let path = write(dir.path(), "n1", URL, Role::Agent, Some(&line), None).unwrap();
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
            own: dir.path().join("n1.status-cmd"),
        };
        let path = write(dir.path(), "n1", URL, Role::Agent, Some(&line), None).unwrap();
        let read: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(read["statusLine"], status_line_json(&line));
        let script = std::fs::read_to_string(dir.path().join("statusline.sh")).unwrap();
        assert!(
            script.contains("curl -s -m 1 -K \"$2\"")
                && script.contains("\"$1\"")
                && script.contains("cat \"$3\""),
            "{script}"
        );
        assert!(!script.contains('\r'), "bash needs LF line ends");
    }

    /// A bash that can run a script at a Windows path: `Command` alone finds
    /// System32's WSL launcher first, which cannot, and the test then proved nothing.
    fn real_bash() -> Option<std::path::PathBuf> {
        which::which_all("bash").ok()?.find(|path| {
            let path = path.to_string_lossy().to_lowercase();
            !path.contains("system32") && !path.contains("windowsapps")
        })
    }

    /// Found before the real curl: it keeps what it is sent and holds on until
    /// `release` exists, or the folder is gone: a failed test cleans up at once,
    /// and a curl left waiting would keep `cargo test`'s output open forever.
    const HELD_CURL: &str = "#!/bin/sh\n\
cat > sent.txt\n\
until [ -e release ] || [ ! -e statusline.sh ]; do sleep 0.05; done\n\
: > finished\n";

    /// Only a stall of the whole machine reaches this: a pass is never a matter of time.
    const STUCK: std::time::Duration = std::time::Duration::from_secs(120);

    #[test]
    fn the_status_script_keeps_the_trailing_newlines_and_does_not_wait_for_curl() {
        use std::io::Write;
        use std::process::{Command, Stdio};
        let Some(bash) = real_bash() else {
            return; // no bash on this machine
        };
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("statusline.sh"), STATUS_SCRIPT).unwrap();
        let curl = dir.path().join("curl");
        std::fs::write(&curl, HELD_CURL).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&curl, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        std::fs::write(dir.path().join("own.txt"), "cat > out.txt").unwrap();
        let input = b"{\"a\":1}\n\n";
        let mut child = Command::new(bash)
            .current_dir(dir.path())
            // This bash and its tools before any other: PATH may lead to System32's first.
            .args([
                "-c",
                "PATH=\"$PWD:${BASH%/*}:$PATH\" exec \"$BASH\" statusline.sh \"$@\"",
            ])
            .args([
                "bash",
                "http://127.0.0.1:1/status/n1",
                "none.cfg",
                "own.txt",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        child.stdin.take().unwrap().write_all(input).unwrap();

        // curl is let go after the script has ended, never before: a script
        // that waited for it would hold both forever.
        let (ended, end) = std::sync::mpsc::channel();
        std::thread::spawn(move || ended.send(child.wait()));
        let exit = end.recv_timeout(STUCK);
        let release = dir.path().join("release");
        std::fs::write(&release, b"").unwrap();
        assert!(exit.is_ok(), "the script waits for curl");

        let finished = dir.path().join("finished");
        let gave_up = std::time::Instant::now() + STUCK;
        while !finished.exists() {
            assert!(std::time::Instant::now() < gave_up, "curl never finished");
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        assert_eq!(std::fs::read(dir.path().join("sent.txt")).unwrap(), input);
        assert_eq!(
            std::fs::read(dir.path().join("out.txt")).unwrap(),
            input,
            "the user's line must get the JSON as sent"
        );
    }

    #[test]
    fn the_user_s_status_line_is_followed_when_their_settings_change_mid_session() {
        let dir = tempfile::tempdir().unwrap();
        let settings = dir.path().join("settings.json");
        let file = user_command_file(dir.path(), "n1");
        let cwd = dir.path().join("project");
        let sync = || sync_user_command(&file, &cwd, Some(&settings)).unwrap();
        let read = || std::fs::read_to_string(&file).unwrap_or_default();

        assert!(!sync(), "nothing to follow yet");
        std::fs::write(
            &settings,
            r#"{"statusLine":{"type":"command","command":"first.sh"}}"#,
        )
        .unwrap();
        assert!(sync());
        assert_eq!(read(), "first.sh");
        assert!(!sync(), "unchanged settings are not rewritten");
        std::fs::write(
            &settings,
            r#"{"statusLine":{"type":"command","command":"second.sh"}}"#,
        )
        .unwrap();
        assert!(sync());
        assert_eq!(read(), "second.sh");
        std::fs::write(&settings, "{}").unwrap();
        assert!(sync());
        assert_eq!(read(), "", "a removed status line stops showing");
    }

    #[test]
    fn the_status_script_runs_the_command_its_file_holds_at_that_moment() {
        use std::io::Write;
        use std::process::{Command, Stdio};
        let Some(bash) = real_bash() else {
            return; // no bash on this machine
        };
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("statusline.sh"), STATUS_SCRIPT).unwrap();
        let run = |own: &str| {
            std::fs::write(dir.path().join("own.txt"), own).unwrap();
            let mut child = Command::new(&bash)
                .current_dir(dir.path())
                .args([
                    "statusline.sh",
                    "http://127.0.0.1:1/status/n1",
                    "none.cfg",
                    "own.txt",
                ])
                .env(
                    "PATH",
                    format!(
                        "{}:{}",
                        bash.parent().unwrap().display(),
                        std::env::var("PATH").unwrap_or_default()
                    ),
                )
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            child.stdin.take().unwrap().write_all(b"{}").unwrap();
            String::from_utf8(child.wait_with_output().unwrap().stdout).unwrap()
        };
        assert_eq!(run("printf one"), "one");
        assert_eq!(run("printf two"), "two");
        assert_eq!(run(""), "");
    }

    #[test]
    fn clearing_removes_a_dead_token_s_curl_config_too() {
        let dir = tempfile::tempdir().unwrap();
        let config = write_curl_config(dir.path(), "old-token").unwrap();
        let script = dir.path().join("statusline.sh");
        std::fs::write(&script, "#!/bin/sh\n").unwrap();
        clear(dir.path());
        assert!(!config.exists(), "the dead token stayed on disk");
        assert!(script.exists(), "the script holds no token");
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

    #[test]
    fn a_mission_chooses_in_this_sessions_settings_only() {
        let work = |permission| {
            let mut settings = settings_json(URL, Role::Agent);
            apply_permission(&mut settings, permission);
            settings["permissions"].clone()
        };
        assert_eq!(work(None), settings_json(URL, Role::Agent)["permissions"]);
        let full = work(Some(Permission::Work));
        let allow = full["allow"].as_array().unwrap();
        assert!(allow.contains(&json!("mcp__openvibe")));
        assert!(allow.contains(&json!("Bash")));
        assert!(allow.contains(&json!("Edit")));
        // Asking and files alone open no command.
        for permission in [Permission::Ask, Permission::Edits] {
            assert!(
                !work(Some(permission))["allow"]
                    .as_array()
                    .unwrap()
                    .contains(&json!("Bash"))
            );
        }
    }

    #[test]
    fn git_push_is_denied_whatever_the_mission_chose() {
        for permission in [Permission::Ask, Permission::Edits, Permission::Work] {
            let mut settings = settings_json(URL, Role::Agent);
            apply_permission(&mut settings, Some(permission));
            let deny = settings["permissions"]["deny"].as_array().unwrap().clone();
            assert!(deny.contains(&json!("Bash(git push *)")), "{permission:?}");
            assert!(deny.contains(&json!("Bash(git push)")), "{permission:?}");
        }
    }

    #[test]
    fn a_mission_keeps_a_managers_own_refusals() {
        let mut settings = settings_json(URL, Role::Orchestrator);
        apply_permission(&mut settings, Some(Permission::Ask));
        let deny = settings["permissions"]["deny"].as_array().unwrap();
        assert!(deny.contains(&json!("Edit")));
        assert!(deny.contains(&json!("Bash(git push *)")));
    }

    #[test]
    fn the_settings_file_denies_what_reaches_the_remote_through_gh() {
        for command in [
            "gh pr create",
            "gh pr merge",
            "gh api",
            "gh issue comment",
            "gh release create",
        ] {
            for permission in [Permission::Ask, Permission::Edits, Permission::Work] {
                let dir = tempfile::tempdir().unwrap();
                let path =
                    write(dir.path(), "n1", URL, Role::Agent, None, Some(permission)).unwrap();
                let read: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
                let deny = read["permissions"]["deny"].as_array().unwrap();
                assert!(
                    deny.contains(&json!(format!("Bash({command} *)"))),
                    "{command}"
                );
            }
        }
    }

    #[test]
    fn the_settings_file_carries_the_missions_choice() {
        let dir = tempfile::tempdir().unwrap();
        let path = write(
            dir.path(),
            "n1",
            URL,
            Role::Agent,
            None,
            Some(Permission::Work),
        )
        .unwrap();
        let read: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        assert!(
            read["permissions"]["allow"]
                .as_array()
                .unwrap()
                .contains(&json!("Bash"))
        );
    }
}
