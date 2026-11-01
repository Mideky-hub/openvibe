//! Agent activity as the frontend sees it (spec habillage §10.2, §15.3): the
//! hook server, the tracker, the `agent-activity` event and the snapshot.

use crate::tr;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::agents::activity::{Activity, Change, HookSource, Tracker};
use crate::agents::hooks_server::{self, HookHit, HookServer, HookSink};
use crate::agents::mcp::{Pending, Tokens};
use crate::agents::subagents::SubagentCounts;
use crate::agents::{claude_settings, mcp_files, prompts};
use crate::error::AppResult;
use crate::pty::shell::{Agent, AgentHooks, Role};
use crate::sync::lock;

/// Quiet terminals are checked this often (the 1.5 s rule).
const TICK: Duration = Duration::from_millis(250);
/// An MCP call the interface has not answered by then fails (spec orchestrateur §4.1).
const MCP_TIMEOUT: Duration = Duration::from_secs(30);

pub struct AgentState {
    tracker: Mutex<Tracker>,
    hooks: Option<HookServer>,
    /// The curl config that carries the server's token (spec première version §4.3).
    curl_config: Option<PathBuf>,
    hooks_dir: PathBuf,
    mcp_dir: PathBuf,
    /// One token per Claude launch, naming its node (spec orchestrateur §4.1).
    mcp_tokens: Tokens,
    mcp_calls: Pending,
    subagents: Mutex<SubagentCounts>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct McpCallEvent {
    call_id: u64,
    node_id: String,
    method: String,
    params: Value,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SubagentsEvent {
    node_id: String,
    running: u32,
}

/// What a Claude session's status line was given (spec maj §6).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusEvent {
    node_id: String,
    status: Value,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
    node_id: String,
    activity: Activity,
    since: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySnapshot {
    hooks_available: bool,
    activities: Vec<ActivityEvent>,
    /// The sessions running subagents, for a page that reloads.
    subagents: Vec<SubagentsEvent>,
}

/// Wall-clock milliseconds of `at`, given `now` and the wall clock at `now`:
/// the frontend shows how long an agent has been in its state.
pub fn epoch_ms(at: Instant, now: Instant, wall_now_ms: u64) -> u64 {
    wall_now_ms.saturating_sub(now.saturating_duration_since(at).as_millis() as u64)
}

fn wall_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn event(change: &Change) -> ActivityEvent {
    ActivityEvent {
        node_id: change.node_id.clone(),
        activity: change.activity,
        since: epoch_ms(change.since, Instant::now(), wall_ms()),
        message: change.message.clone(),
    }
}

fn emit(app: &AppHandle, change: &Change) {
    let _ = app.emit("agent-activity", event(change));
}

/// Starts the hook server (the app runs without it if it cannot), clears the
/// settings files of the previous run, and checks quiet terminals.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let hooks_dir = app.path().app_data_dir()?.join("hooks");
    claude_settings::clear(&hooks_dir);
    let mcp_dir = app.path().app_data_dir()?.join("mcp");
    mcp_files::clear(&mcp_dir);
    let hooks = match hooks_server::start(AppSink(app.clone())) {
        Ok(server) => {
            log::info!("local server on port {}", server.port);
            Some(server)
        }
        Err(err) => {
            log::error!("local server not started: {err}");
            None
        }
    };
    let curl_config = hooks.as_ref().and_then(|server| {
        claude_settings::write_curl_config(&hooks_dir, &server.token)
            .inspect_err(|err| log::error!("curl config not written: {err}"))
            .ok()
    });
    app.manage(AgentState {
        tracker: Mutex::new(Tracker::default()),
        hooks,
        curl_config,
        hooks_dir,
        mcp_dir,
        mcp_tokens: Tokens::default(),
        mcp_calls: Pending::default(),
        subagents: Mutex::new(SubagentCounts::default()),
    });
    let ticker = app.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(TICK);
            let changes = lock(&ticker.state::<AgentState>().tracker).tick(Instant::now());
            for change in &changes {
                emit(&ticker, change);
            }
        }
    });
    Ok(())
}

/// The app behind the hook server.
struct AppSink(AppHandle);

impl HookSink for AppSink {
    fn hit(&self, hit: HookHit) {
        on_hook(&self.0, hit);
    }

    fn subagent(&self, node_id: &str, started: bool) {
        let Some(state) = self.0.try_state::<AgentState>() else {
            return;
        };
        let running = lock(&state.subagents).change(node_id, started);
        let _ = self.0.emit(
            "agent-subagents",
            SubagentsEvent {
                node_id: node_id.into(),
                running,
            },
        );
    }

    fn mcp_node(&self, token: &str) -> Option<String> {
        self.0.try_state::<AgentState>()?.mcp_tokens.node(token)
    }

    fn status(&self, node_id: &str, status: Value) {
        let _ = self.0.emit(
            "claude-status",
            StatusEvent {
                node_id: node_id.into(),
                status,
            },
        );
    }

    fn mcp_call(&self, node_id: &str, method: &str, params: Value) -> Result<Value, String> {
        let state = self
            .0
            .try_state::<AgentState>()
            .ok_or_else(|| tr!("OpenVibe ne répond pas", "OpenVibe is not responding"))?;
        let (call_id, answer) = state.mcp_calls.open();
        let event = McpCallEvent {
            call_id,
            node_id: node_id.into(),
            method: method.into(),
            params,
        };
        let _ = self.0.emit("mcp-call", event);
        let result = answer.recv_timeout(MCP_TIMEOUT);
        state.mcp_calls.close(call_id);
        result.map_err(|_| tr!("OpenVibe ne répond pas", "OpenVibe is not responding"))
    }
}

/// A session or its process ended: its subagents went with it.
fn clear_subagents(app: &AppHandle, state: &AgentState, node_id: &str) {
    if lock(&state.subagents).clear(node_id) {
        let _ = app.emit(
            "agent-subagents",
            SubagentsEvent {
                node_id: node_id.into(),
                running: 0,
            },
        );
    }
}

fn on_hook(app: &AppHandle, hit: HookHit) {
    let Some(state) = app.try_state::<AgentState>() else {
        return;
    };
    let mut tracker = lock(&state.tracker);
    let change = if hit.session_ended {
        tracker.session_end(&hit.node_id, Instant::now())
    } else {
        tracker.hook(
            &hit.node_id,
            hit.source,
            hit.activity,
            Instant::now(),
            hit.message,
        )
    };
    drop(tracker);
    if hit.session_ended {
        clear_subagents(app, &state, &hit.node_id);
    }
    if let Some(change) = change {
        emit(app, &change);
    }
}

/// True when the local server runs: hooks, status line and MCP tools need it.
pub fn server_running(app: &AppHandle) -> bool {
    app.state::<AgentState>().hooks.is_some()
}

/// The hooks a new process gets: Claude's settings file, Codex's notify URL.
/// Without a server, Claude starts without `--settings`.
/// Where a terminal reports to (spec première version §4.3): the token is in
/// the URL Claude reads from its settings file only; the status line and Codex
/// run commands, so their URLs are bare and curl reads the token from a file.
pub struct HookUrls {
    pub settings: String,
    pub status: String,
    pub codex: String,
}

pub fn hook_urls(server: &HookServer, node_id: &str) -> HookUrls {
    HookUrls {
        settings: server.url(HookSource::Claude, node_id),
        status: server.bare_status_url(node_id),
        codex: server.bare_url(HookSource::Codex, node_id),
    }
}

pub fn hooks_for(
    app: &AppHandle,
    node_id: &str,
    agent: Agent,
    role: Role,
    cwd: &std::path::Path,
    config_dir: Option<&std::path::Path>,
) -> AgentHooks {
    let state = app.state::<AgentState>();
    let Some(server) = &state.hooks else {
        return AgentHooks::default();
    };
    let urls = hook_urls(server, node_id);
    match agent {
        Agent::Claude => {
            // The user's own status line goes on showing, after OpenVibe has read the usage (spec maj §6).
            // Without the curl config, no status line: its token would go on a command line.
            let status = state
                .curl_config
                .clone()
                .map(|config| claude_settings::StatusLine {
                    script: state.hooks_dir.join("statusline.sh"),
                    url: urls.status,
                    config,
                    user: claude_settings::status_line_for(
                        cwd,
                        claude_settings::settings_file_in(config_dir).as_deref(),
                    ),
                });
            let settings = claude_settings::write(
                &state.hooks_dir,
                node_id,
                &urls.settings,
                role,
                status.as_ref(),
            );
            let Ok(settings) =
                settings.inspect_err(|err| log::error!("hooks of {node_id} not written: {err}"))
            else {
                return AgentHooks::default();
            };
            let token = state.mcp_tokens.issue(node_id);
            let files = mcp_files::write(
                &state.mcp_dir,
                node_id,
                &server.mcp_url(),
                &token,
                prompts::for_role(role, crate::i18n::current()),
            )
            .inspect_err(|err| log::error!("tools of {node_id} not written: {err}"))
            .ok();
            AgentHooks {
                claude_settings: Some(settings),
                mcp_config: files.as_ref().map(|f| f.config.clone()),
                system_prompt: files.map(|f| f.prompt),
                ..Default::default()
            }
        }
        Agent::Codex => AgentHooks {
            codex_notify: Some(urls.codex),
            curl_config: state.curl_config.clone(),
            ..Default::default()
        },
        _ => AgentHooks::default(),
    }
}

/// A process is about to start: idle until it shows otherwise.
pub fn started(app: &AppHandle, node_id: &str) {
    let change = lock(&app.state::<AgentState>().tracker).start(node_id, Instant::now());
    emit(app, &change);
}

/// Each chunk of output; emits only when the activity changes.
pub fn output(app: &AppHandle, node_id: &str) {
    let change = lock(&app.state::<AgentState>().tracker).output(node_id, Instant::now());
    if let Some(change) = change {
        emit(app, &change);
    }
}

/// What the user typed: an answer hands a hooked agent back to its output.
pub fn input(app: &AppHandle, node_id: &str, data: &[u8]) {
    let change = lock(&app.state::<AgentState>().tracker).input(node_id, data, Instant::now());
    if let Some(change) = change {
        emit(app, &change);
    }
}

/// The process ended (or failed to start): forget it and its settings file.
pub fn ended(app: &AppHandle, node_id: &str) {
    let state = app.state::<AgentState>();
    lock(&state.tracker).remove(node_id);
    claude_settings::remove(&state.hooks_dir, node_id);
    state.mcp_tokens.revoke(node_id);
    mcp_files::remove(&state.mcp_dir, node_id);
    clear_subagents(app, &state, node_id);
}

/// The interface's answer to an MCP call (spec orchestrateur §4.1).
#[tauri::command]
pub async fn mcp_reply(state: State<'_, AgentState>, call_id: u64, result: Value) -> AppResult<()> {
    state.mcp_calls.answer(call_id, result);
    Ok(())
}

#[tauri::command]
pub async fn agent_activity_snapshot(state: State<'_, AgentState>) -> AppResult<ActivitySnapshot> {
    let activities = lock(&state.tracker).snapshot().iter().map(event).collect();
    let subagents = lock(&state.subagents)
        .running()
        .into_iter()
        .map(|(node_id, running)| SubagentsEvent { node_id, running })
        .collect();
    Ok(ActivitySnapshot {
        hooks_available: state.hooks.is_some(),
        activities,
        subagents,
    })
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::*;

    #[test]
    fn dates_a_change_in_wall_clock_milliseconds() {
        let now = Instant::now();
        assert_eq!(
            epoch_ms(now - Duration::from_millis(1500), now, 1_000_000),
            998_500
        );
        assert_eq!(epoch_ms(now, now, 1_000_000), 1_000_000);
    }

    #[test]
    fn the_token_reaches_only_the_settings_file_never_a_command_line() {
        use crate::pty::shell::{ShellKind, ShellSyntax, SpawnSpec, agent_command};
        let server = HookServer {
            port: 4242,
            token: "tok-secret".into(),
        };
        let urls = hook_urls(&server, "n1");
        assert!(
            urls.settings.contains("tok-secret"),
            "Claude's hooks read it from a file"
        );
        let config = PathBuf::from(r"C:\data\hooks\curl.cfg");
        let line = claude_settings::status_line_json(&claude_settings::StatusLine {
            script: PathBuf::from(r"C:\data\hooks\statusline.sh"),
            url: urls.status.clone(),
            config: config.clone(),
            user: None,
        });
        let codex = AgentHooks {
            codex_notify: Some(urls.codex.clone()),
            curl_config: Some(config),
            ..Default::default()
        };
        let spec = SpawnSpec {
            cwd: ".".into(),
            shell: ShellKind::Cmd,
            agent: Agent::Codex,
            command: String::new(),
            claude: None,
            ollama: None,
        };
        for syntax in [
            ShellSyntax::Cmd,
            ShellSyntax::PowerShell,
            ShellSyntax::Posix,
        ] {
            let command = agent_command(&spec, syntax, &codex).unwrap().unwrap();
            assert!(!command.contains("tok-secret"), "{command}");
        }
        assert!(!line["command"].as_str().unwrap().contains("tok-secret"));
    }
}
