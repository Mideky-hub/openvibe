use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::mission::{self, Cleanup, MergeReport, Worktree};
use crate::tickets;

/// Git can take seconds on a large repository: off the async runtime.
async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|err| AppError::Io(std::io::Error::other(err.to_string())))?
        .map_err(|err| {
            // In the log a tester sends (spec première version §3.6).
            log::warn!("mission: {err}");
            AppError::InvalidInput(err)
        })
}

/// The mission's branch and worktree (spec orchestrateur §7.4).
#[tauri::command]
pub async fn mission_prepare(project: String, name: String) -> AppResult<Worktree> {
    blocking(move || mission::prepare(Path::new(&project), &name)).await
}

#[tauri::command]
pub async fn mission_add_agent(
    project: String,
    mission: String,
    agent: String,
) -> AppResult<Worktree> {
    blocking(move || mission::add_agent(Path::new(&project), &mission, &agent)).await
}

/// `mission` and `agent` are the worktrees' paths (spec orchestrateur §7.6).
#[tauri::command]
pub async fn mission_merge(
    mission: String,
    agent: String,
    branch: String,
) -> AppResult<MergeReport> {
    blocking(move || mission::merge_agent(Path::new(&mission), Path::new(&agent), &branch)).await
}

/// The project's `BACKLOG.md` (spec mission de nuit §5.1).
#[tauri::command]
pub async fn mission_backlog(project: String) -> AppResult<String> {
    blocking(move || tickets::backlog(Path::new(&project))).await
}

/// The open issues with a label, as `gh` gives them.
#[tauri::command]
pub async fn mission_issues(project: String, label: String) -> AppResult<String> {
    blocking(move || tickets::github_issues(Path::new(&project), &label)).await
}

/// A launch that failed: what it created goes (final review H2).
#[tauri::command]
pub async fn mission_discard(project: String, trees: Vec<Worktree>) -> AppResult<Cleanup> {
    blocking(move || mission::discard(Path::new(&project), &trees)).await
}

/// « Nettoyer la mission » (spec orchestrateur §7.7).
#[tauri::command]
pub async fn mission_cleanup(
    project: String,
    mission: String,
    agents: Vec<String>,
) -> AppResult<Cleanup> {
    blocking(move || mission::cleanup(Path::new(&project), &mission, &agents)).await
}
