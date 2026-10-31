use std::path::PathBuf;

use tauri::State;

use crate::db::Db;
use crate::db::projects;
use crate::error::{AppError, AppResult};
use crate::studio::{self, OpenedFile, WriteOutcome};

/// The project's folder, read here: the interface never names a root (spec studio code §3).
fn project_root(db: &Db, project_id: &str) -> AppResult<PathBuf> {
    let project = db.with(|conn| projects::get(conn, project_id))?;
    Ok(PathBuf::from(project.path))
}

/// git and the disk off the async runtime; their errors are readable text.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| AppError::Io(std::io::Error::other(err.to_string())))?
        .map_err(AppError::InvalidInput)
}

/// The project's files, from its folder.
#[tauri::command]
pub async fn studio_files(db: State<'_, Db>, project_id: String) -> AppResult<Vec<String>> {
    let root = project_root(&db, &project_id)?;
    blocking(move || studio::files(&root)).await
}

#[tauri::command]
pub async fn studio_read(
    db: State<'_, Db>,
    project_id: String,
    file: String,
) -> AppResult<OpenedFile> {
    let root = project_root(&db, &project_id)?;
    blocking(move || studio::read(&root, &file)).await
}

/// The file's version on the disk; null when it no longer exists.
#[tauri::command]
pub async fn studio_version(
    db: State<'_, Db>,
    project_id: String,
    file: String,
) -> AppResult<Option<String>> {
    let root = project_root(&db, &project_id)?;
    blocking(move || studio::version(&root, &file)).await
}

/// Saves `text` if the disk still holds `expected` (null: no file).
#[tauri::command]
pub async fn studio_write(
    db: State<'_, Db>,
    project_id: String,
    file: String,
    text: String,
    expected: Option<String>,
) -> AppResult<WriteOutcome> {
    let root = project_root(&db, &project_id)?;
    blocking(move || studio::write(&root, &file, &text, expected.as_deref())).await
}
