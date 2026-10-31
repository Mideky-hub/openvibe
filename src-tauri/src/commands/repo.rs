use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::repo::{self, LogEntry, RepoState};
use crate::review::ChangedFile;

/// git off the async runtime; its errors are readable text.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| AppError::Io(std::io::Error::other(err.to_string())))?
        .map_err(AppError::InvalidInput)
}

/// Branch, push target and changes of the project's repository (spec fenêtre git).
#[tauri::command]
pub async fn repo_state(path: String) -> AppResult<RepoState> {
    blocking(move || repo::state(Path::new(&path))).await
}

#[tauri::command]
pub async fn repo_history(path: String) -> AppResult<Vec<LogEntry>> {
    blocking(move || repo::history(Path::new(&path))).await
}

/// Commits exactly `files`; the new commit's short hash.
#[tauri::command]
pub async fn repo_commit(
    path: String,
    files: Vec<ChangedFile>,
    message: String,
) -> AppResult<String> {
    blocking(move || repo::commit(Path::new(&path), &files, &message)).await
}

/// After the window's confirmation; refused if the file changed since (spec fenêtre git §2).
#[tauri::command]
pub async fn repo_discard(path: String, file: ChangedFile) -> AppResult<()> {
    blocking(move || repo::discard(Path::new(&path), &file)).await
}

/// The window's Push button, and nothing else (spec fenêtre git §2.3).
#[tauri::command]
pub async fn repo_push(path: String) -> AppResult<()> {
    blocking(move || repo::push(Path::new(&path))).await
}
