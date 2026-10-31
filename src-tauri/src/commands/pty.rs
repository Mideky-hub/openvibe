use crate::tr;
use serde::Serialize;
use tauri::ipc::{Channel, Response};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::agents::{self as catalog, AgentInfo, claude_settings, transcripts};
use crate::commands::agents;
use crate::db::{Db, scrollback};
use crate::error::{AppError, AppResult};
use crate::pty::session::OutputSink;
use crate::pty::shell::{
    Agent, Role, ShellKind, SpawnSpec, build_plan, orchestrator_tools, which_locate,
};
use crate::pty::{PtyManager, pty_size};

/// Forwards PTY output to the webview as raw bytes (an `ArrayBuffer` in JS).
struct ChannelSink(Channel<Response>);

impl OutputSink for ChannelSink {
    fn send(&self, bytes: &[u8]) -> bool {
        self.0.send(Response::new(bytes.to_vec())).is_ok()
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyExitEvent {
    node_id: String,
    exit_code: Option<u32>,
    /// The process that exited, as `pty_spawn` returned it: an event whose pid
    /// is not the terminal's current one comes from an older process.
    pid: Option<u32>,
}

/// Re-reads Windows' PATH so an agent installed meanwhile is found.
#[tauri::command]
pub async fn refresh_path() {
    crate::pty::env_path::refresh();
}

#[tauri::command]
pub async fn pty_spawn(
    app: AppHandle,
    pty: State<'_, PtyManager>,
    node_id: String,
    spec: SpawnSpec,
    cols: u16,
    rows: u16,
    on_data: Channel<Response>,
) -> AppResult<Option<u32>> {
    // Refused before anything else: a second start must leave the live
    // session's MCP token and launch files alone (seen in the app, H3).
    if pty.is_running(&node_id) {
        return Err(AppError::InvalidInput(tr!(
            "le terminal {node_id} tourne déjà",
            "terminal {node_id} is already running"
        )));
    }
    let mut spec = spec;
    if let Some(claude) = spec.claude.as_mut() {
        let config = claude_settings::claude_config_dir();
        let cwd = std::path::Path::new(&spec.cwd);
        let mode =
            transcripts::launch_mode(claude.mode, &claude.session_id, cwd, config.as_deref());
        if mode != claude.mode {
            log::info!("terminal {node_id}: no saved conversation, a new one under the same id");
            claude.mode = mode;
        }
    }
    let role = spec.claude.as_ref().map(|c| c.role).unwrap_or_default();
    let hooks = agents::hooks_for(
        &app,
        &node_id,
        spec.agent,
        role,
        std::path::Path::new(&spec.cwd),
    );
    if spec.agent == Agent::Claude
        && role == Role::Orchestrator
        && let Err(cause) = orchestrator_tools(&hooks, agents::server_running(&app))
    {
        agents::ended(&app, &node_id);
        log::warn!("orchestrator {node_id} not started: {cause}");
        return Err(AppError::ToolsUnavailable(format!(
            "Outils OpenVibe indisponibles : {cause}."
        )));
    }
    let plan = match build_plan(&node_id, &spec, &which_locate, &hooks) {
        Ok(plan) => plan,
        Err(err) => {
            // The settings file written for this launch has no use any more.
            agents::ended(&app, &node_id);
            return Err(err);
        }
    };
    let exited_id = node_id.clone();
    let output_app = app.clone();
    let output_id = node_id.clone();
    let exit_app = app.clone();
    agents::started(&app, &node_id);
    let spawned = pty.spawn(
        &node_id,
        plan,
        pty_size(cols, rows),
        Box::new(ChannelSink(on_data)),
        Box::new(move || agents::output(&output_app, &output_id)),
        move |info| {
            // A relaunch may already run under this id: its tracking, settings
            // and token are not this exit's to clear.
            if !exit_app.state::<PtyManager>().is_running(&exited_id) {
                agents::ended(&exit_app, &exited_id);
            }
            // Saved before the event so a restore right after the exit finds it.
            let saved = exit_app.state::<Db>().with(|conn| {
                scrollback::save_logged(conn, &exited_id, &info.scrollback.data, info.scrollback.at)
            });
            if let Err(err) = saved {
                log::error!("scrollback of {exited_id} not saved: {err}");
            }
            log::info!("terminal {exited_id} exited: {:?}", info.code);
            let _ = exit_app.emit(
                "pty-exit",
                PtyExitEvent {
                    node_id: exited_id,
                    exit_code: info.code,
                    pid: info.pid,
                },
            );
        },
    );
    match &spawned {
        Ok(_) => log::info!("terminal {node_id} started: {:?}", spec.agent),
        Err(err) => {
            log::warn!("terminal {node_id} not started: {err}");
            agents::ended(&app, &node_id);
        }
    }
    spawned
}

#[tauri::command]
pub async fn pty_attach(
    pty: State<'_, PtyManager>,
    node_id: String,
    on_data: Channel<Response>,
) -> AppResult<bool> {
    Ok(pty.attach(&node_id, Box::new(ChannelSink(on_data))))
}

#[tauri::command]
pub async fn pty_write(
    app: AppHandle,
    pty: State<'_, PtyManager>,
    node_id: String,
    data: String,
) -> AppResult<()> {
    pty.write(&node_id, data.as_bytes())?;
    agents::input(&app, &node_id, data.as_bytes());
    Ok(())
}

/// The command bar, the orchestrator and "Reprendre" type into terminals this
/// way (spec habillage §12, §15.3). The Enter counts as the user's answer for
/// the agent's activity.
#[tauri::command]
pub async fn pty_send_text(app: AppHandle, node_id: String, text: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<PtyManager>().send_text(&node_id, &text)?;
        agents::input(&app, &node_id, b"\r");
        Ok(())
    })
    .await
    .map_err(|err| AppError::Io(std::io::Error::other(err.to_string())))?
}

/// "Pause" (spec §14): false for a plain shell. The key counts as the user's
/// answer, so a hooked agent's activity follows its output again.
#[tauri::command]
pub async fn pty_interrupt(
    app: AppHandle,
    pty: State<'_, PtyManager>,
    node_id: String,
) -> AppResult<bool> {
    let sent = pty.interrupt(&node_id)?;
    if let Some(key) = sent {
        agents::input(&app, &node_id, key);
    }
    Ok(sent.is_some())
}

#[tauri::command]
pub async fn pty_resize(
    pty: State<'_, PtyManager>,
    node_id: String,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    pty.resize(&node_id, pty_size(cols, rows))
}

#[tauri::command]
pub async fn pty_kill(pty: State<'_, PtyManager>, node_id: String) -> AppResult<()> {
    pty.kill(&node_id);
    Ok(())
}

#[tauri::command]
pub async fn pty_list(pty: State<'_, PtyManager>) -> AppResult<Vec<String>> {
    Ok(pty.list())
}

/// The live scrollback when the terminal runs, otherwise the last copy saved in SQLite.
#[tauri::command]
pub async fn get_scrollback(
    pty: State<'_, PtyManager>,
    db: State<'_, Db>,
    node_id: String,
) -> AppResult<Response> {
    let data = match pty.scrollback(&node_id) {
        Some(live) => live,
        None => db
            .with(|conn| scrollback::load(conn, &node_id))?
            .unwrap_or_default(),
    };
    Ok(Response::new(data))
}

#[tauri::command]
pub async fn list_agents() -> AppResult<Vec<AgentInfo>> {
    Ok(catalog::list_agents(&which_locate))
}

#[tauri::command]
pub async fn npm_available() -> AppResult<bool> {
    Ok(catalog::npm_available(&which_locate))
}

#[tauri::command]
pub async fn list_ollama_models() -> AppResult<Vec<String>> {
    tauri::async_runtime::spawn_blocking(catalog::ollama_models)
        .await
        .map_err(|err| AppError::Io(std::io::Error::other(err.to_string())))?
}

#[tauri::command]
pub async fn list_shells() -> AppResult<Vec<ShellKind>> {
    Ok(catalog::list_shells(&which_locate))
}

/// Writes scrollbacks to SQLite: only the changed ones, or all of them at exit.
pub fn flush_scrollbacks(app: &AppHandle, all: bool) {
    let pty = app.state::<PtyManager>();
    let batch = if all {
        pty.all_scrollbacks()
    } else {
        pty.dirty_scrollbacks()
    };
    let db = app.state::<Db>();
    for (node_id, capture) in batch {
        let saved =
            db.with(|conn| scrollback::save_logged(conn, &node_id, &capture.data, capture.at));
        if let Err(err) = saved {
            log::error!("scrollback of {node_id} not saved: {err}");
        }
    }
}
