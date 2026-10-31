use std::time::{SystemTime, UNIX_EPOCH};

use crate::agents::claude_settings::claude_config_dir;
use crate::error::{AppError, AppResult};
use crate::tokens::{self, Report};

/// The tokens Claude Code logged in the last 30 days (spec Tokens): read-only, off the async runtime.
#[tauri::command]
pub async fn token_usage() -> AppResult<Report> {
    let root =
        claude_config_dir().ok_or_else(|| AppError::NotFound("Claude config folder".into()))?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    tauri::async_runtime::spawn_blocking(move || tokens::scan(&root, now))
        .await
        .map_err(|err| AppError::Io(std::io::Error::other(err.to_string())))
}
