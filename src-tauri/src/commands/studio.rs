use std::path::PathBuf;

use tauri::State;

use crate::db::Db;
use crate::db::projects;
use crate::error::{AppError, AppResult};
use crate::studio::{self, OpenedFile, TreeEntry, WriteOutcome};

/// The project's folder, read here: the interface never names a root (spec studio code §3).
fn project_root(db: &Db, project_id: &str) -> AppResult<PathBuf> {
    let project = db.with(|conn| projects::get(conn, project_id))?;
    Ok(PathBuf::from(project.path))
}

/// The disk off the async runtime; errors are readable text.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| AppError::Io(std::io::Error::other(err.to_string())))?
        .map_err(AppError::InvalidInput)
}

/// The project folder's tree (Code Studio), `.gitignore` respected.
#[tauri::command]
pub async fn studio_tree(db: State<'_, Db>, project_id: String) -> AppResult<Vec<TreeEntry>> {
    let root = project_root(&db, &project_id)?;
    blocking(move || studio::tree(&root)).await
}

/// A text file of the project, by its path from the project folder, with its version.
#[tauri::command]
pub async fn studio_read(
    db: State<'_, Db>,
    project_id: String,
    path: String,
) -> AppResult<OpenedFile> {
    let root = project_root(&db, &project_id)?;
    blocking(move || studio::read(&root, &path)).await
}

/// The file's version on the disk; null when it no longer exists.
#[tauri::command]
pub async fn studio_version(
    db: State<'_, Db>,
    project_id: String,
    path: String,
) -> AppResult<Option<String>> {
    let root = project_root(&db, &project_id)?;
    blocking(move || studio::version(&root, &path)).await
}

/// Saves `content` if the disk still holds `expected` (null: no file), creating
/// its folders; never outside the project.
#[tauri::command]
pub async fn studio_write(
    db: State<'_, Db>,
    project_id: String,
    path: String,
    content: String,
    expected: Option<String>,
) -> AppResult<WriteOutcome> {
    let root = project_root(&db, &project_id)?;
    blocking(move || studio::write(&root, &path, &content, expected.as_deref())).await
}
