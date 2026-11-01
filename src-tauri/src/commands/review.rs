use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::review::{self, ChangedFile, Changes, FileText};

/// git and the disk off the async runtime; their errors are readable text.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| AppError::Io(std::io::Error::other(err.to_string())))?
        .map_err(AppError::InvalidInput)
}

/// The changes of an agent's folder against `base`, or HEAD (spec maj §5).
#[tauri::command]
pub async fn review_changes(path: String, base: Option<String>) -> AppResult<Changes> {
    blocking(move || review::changes(Path::new(&path), base.as_deref())).await
}

#[tauri::command]
pub async fn review_file_diff(
    path: String,
    file: ChangedFile,
    base: Option<String>,
) -> AppResult<String> {
    blocking(move || review::file_diff(Path::new(&path), &file, base.as_deref())).await
}

/// The repository's files, from its root.
#[tauri::command]
pub async fn review_files(path: String) -> AppResult<review::FileList> {
    blocking(move || review::files(Path::new(&path))).await
}

/// A file of the repository, by its path from the root.
#[tauri::command]
pub async fn review_read_file(path: String, file: String) -> AppResult<FileText> {
    blocking(move || review::read_file(&review::root(Path::new(&path))?, &file)).await
}

#[tauri::command]
pub async fn review_default_base(path: String) -> AppResult<Option<String>> {
    blocking(move || Ok(review::default_base(Path::new(&path)))).await
}
