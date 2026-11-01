use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::studio::{self, TreeEntry};

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
pub async fn studio_tree(project: String) -> AppResult<Vec<TreeEntry>> {
    blocking(move || studio::tree(Path::new(&project))).await
}

/// A text file of the project, by its path from the project folder.
#[tauri::command]
pub async fn studio_read(project: String, path: String) -> AppResult<String> {
    blocking(move || studio::read(Path::new(&project), &path)).await
}

/// Writes a file of the project, creating its folders; never outside the project.
#[tauri::command]
pub async fn studio_write(project: String, path: String, content: String) -> AppResult<()> {
    blocking(move || studio::write(Path::new(&project), &path, &content)).await
}
