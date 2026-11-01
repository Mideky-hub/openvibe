//! GitHub sync of the Kanban (issue #29): every call goes through the `gh` CLI.

use std::path::PathBuf;

use crate::error::{AppError, AppResult};
use crate::github::{self, CreatedIssue, Issue, ProjectItem};

/// `gh` waits on the network: off the async runtime's threads.
async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|err| AppError::Io(std::io::Error::other(err.to_string())))?
}

/// "owner/name" of the project's `origin`, None when it is not on github.com.
#[tauri::command]
pub async fn github_detect_repo(path: String) -> AppResult<Option<String>> {
    blocking(move || Ok(github::detect_repo(&PathBuf::from(path)))).await
}

#[tauri::command]
pub async fn github_list_issues(
    path: String,
    repo: String,
    closed_within_days: u32,
) -> AppResult<Vec<Issue>> {
    blocking(move || github::list_issues(&PathBuf::from(path), &repo, closed_within_days)).await
}

#[tauri::command]
pub async fn github_list_project_items(
    path: String,
    owner: String,
    project_number: u32,
) -> AppResult<Vec<ProjectItem>> {
    blocking(move || github::list_project_items(&PathBuf::from(path), &owner, project_number)).await
}

#[tauri::command]
pub async fn github_project_statuses(
    path: String,
    owner: String,
    project_number: u32,
) -> AppResult<Vec<String>> {
    blocking(move || github::project_statuses(&PathBuf::from(path), &owner, project_number)).await
}

#[tauri::command]
pub async fn github_create_issue(
    path: String,
    repo: String,
    title: String,
    body: String,
) -> AppResult<CreatedIssue> {
    blocking(move || github::create_issue(&PathBuf::from(path), &repo, &title, &body)).await
}

/// `state` is "open" or "closed".
#[tauri::command]
pub async fn github_set_issue_state(
    path: String,
    repo: String,
    number: u64,
    state: String,
) -> AppResult<()> {
    blocking(move || github::set_issue_state(&PathBuf::from(path), &repo, number, &state)).await
}

#[tauri::command]
pub async fn github_move_project_item(
    path: String,
    owner: String,
    project_number: u32,
    item_id: String,
    status: String,
) -> AppResult<()> {
    blocking(move || {
        github::move_project_item(
            &PathBuf::from(path),
            &owner,
            project_number,
            &item_id,
            &status,
        )
    })
    .await
}
