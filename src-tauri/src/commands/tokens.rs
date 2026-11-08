use std::time::{SystemTime, UNIX_EPOCH};

use crate::agents::claude_settings::claude_config_dir;
use crate::agents::transcripts::codex_home;
use crate::error::{AppError, AppResult};
use crate::tokens::{self, Report};

/// The tokens Claude Code and Codex logged in the last 30 days (spec Tokens):
/// read-only, off the async runtime; a missing folder is an empty part.
#[tauri::command]
pub async fn token_usage() -> AppResult<Report> {
    let claude = claude_config_dir();
    let codex = codex_home();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    tauri::async_runtime::spawn_blocking(move || {
        tokens::scan_all(claude.as_deref(), codex.as_deref(), now)
    })
    .await
    .map_err(|err| AppError::Io(std::io::Error::other(err.to_string())))
}
