use std::path::PathBuf;

use tauri::State;

use crate::db::Db;
use crate::db::projects;
use crate::error::{AppError, AppResult};
use crate::notes::{self, AgentNote, NoteList};
use crate::studio::{OpenedFile, WriteOutcome};
use crate::tr;

/// The project's folder, read here: the interface never names a root (spec notes §3).
fn project_root(db: &Db, project_id: &str) -> AppResult<PathBuf> {
    let project = db.with(|conn| projects::get(conn, project_id))?;
    Ok(PathBuf::from(project.path))
}

/// The folder of the project a node belongs to, on screen or not.
fn node_root(db: &Db, node_id: &str) -> AppResult<PathBuf> {
    let project = db.with(|conn| notes::project_of_node(conn, node_id))?;
    Ok(PathBuf::from(project.path))
}

/// The disk off the async runtime, and off the database's lock; errors are readable text.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| AppError::Io(std::io::Error::other(err.to_string())))?
        .map_err(AppError::InvalidInput)
}

/// Every note of the project, within the limits.
#[tauri::command]
pub async fn notes_all(db: State<'_, Db>, project_id: String) -> AppResult<NoteList> {
    let root = project_root(&db, &project_id)?;
    blocking(move || notes::all(&root)).await
}

#[tauri::command]
pub async fn notes_read(
    db: State<'_, Db>,
    project_id: String,
    name: String,
) -> AppResult<OpenedFile> {
    let root = project_root(&db, &project_id)?;
    blocking(move || notes::read(&root, &name)).await
}

/// The note's version on the disk; null when it does not exist.
#[tauri::command]
pub async fn notes_version(
    db: State<'_, Db>,
    project_id: String,
    name: String,
) -> AppResult<Option<String>> {
    let root = project_root(&db, &project_id)?;
    blocking(move || notes::version(&root, &name)).await
}

/// Saves the note if the disk still holds `expected` (null: no note yet).
#[tauri::command]
pub async fn notes_write(
    db: State<'_, Db>,
    project_id: String,
    name: String,
    text: String,
    expected: Option<String>,
) -> AppResult<WriteOutcome> {
    let root = project_root(&db, &project_id)?;
    blocking(move || notes::write(&root, &name, &text, expected.as_deref())).await
}

/// The notes for an agent. The project is the first node's; the attached notes
/// are those of every node's group: an orchestrator also gives its linked agents.
#[tauri::command]
pub async fn notes_agent_list(
    db: State<'_, Db>,
    node_ids: Vec<String>,
) -> AppResult<Vec<AgentNote>> {
    let Some(caller) = node_ids.first() else {
        return Err(AppError::InvalidInput(tr!(
            "aucun nœud donné",
            "no node given"
        )));
    };
    let root = node_root(&db, caller)?;
    let attached = db.with(|conn| {
        let mut attached = Vec::new();
        for node_id in &node_ids {
            attached.extend(notes::attached_of_node(conn, node_id)?);
        }
        Ok(attached)
    })?;
    blocking(move || notes::for_agent(&root, &attached)).await
}

/// A note's text, for the agent that asks.
#[tauri::command]
pub async fn notes_agent_read(
    db: State<'_, Db>,
    node_id: String,
    name: String,
) -> AppResult<String> {
    let root = node_root(&db, &node_id)?;
    blocking(move || notes::read(&root, &name).map(|opened| opened.text)).await
}
