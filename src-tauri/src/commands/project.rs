use crate::tr;
use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;
use tauri::State;

use crate::db::Db;
use crate::db::projects::{self, Project};
use crate::error::{AppError, AppResult};
use crate::pty::PtyManager;

/// A project as the home screen shows it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectView {
    #[serde(flatten)]
    pub project: Project,
    /// Its folder no longer exists (moved or deleted while the app was closed).
    pub missing: bool,
    /// Terminals of its workspaces whose process runs.
    pub live_agents: usize,
}

pub fn project_views(db: &Db, pty: &PtyManager) -> AppResult<Vec<ProjectView>> {
    let live: HashSet<String> = pty.list().into_iter().collect();
    db.with(|conn| {
        projects::list(conn)?
            .into_iter()
            .map(|project| {
                let live_agents = projects::node_ids(conn, &project.id)?
                    .iter()
                    .filter(|id| live.contains(*id))
                    .count();
                let missing = !Path::new(&project.path).is_dir();
                Ok(ProjectView {
                    project,
                    missing,
                    live_agents,
                })
            })
            .collect()
    })
}

fn existing_folder(path: &str) -> AppResult<()> {
    let path = path.trim();
    if Path::new(path).is_dir() {
        Ok(())
    } else {
        Err(AppError::NotFound(tr!(
            "dossier introuvable : {path}",
            "folder not found: {path}"
        )))
    }
}

#[tauri::command]
pub async fn list_projects(
    db: State<'_, Db>,
    pty: State<'_, PtyManager>,
) -> AppResult<Vec<ProjectView>> {
    project_views(&db, &pty)
}

#[tauri::command]
pub async fn create_project(db: State<'_, Db>, path: String) -> AppResult<ProjectView> {
    existing_folder(&path)?;
    let project = db.with(|conn| projects::create(conn, &path))?;
    Ok(ProjectView {
        project,
        missing: false,
        live_agents: 0,
    })
}

#[tauri::command]
pub async fn rename_project(db: State<'_, Db>, id: String, name: String) -> AppResult<()> {
    db.with(|conn| projects::rename(conn, &id, &name))
}

#[tauri::command]
pub async fn relocate_project(db: State<'_, Db>, id: String, path: String) -> AppResult<()> {
    existing_folder(&path)?;
    db.with(|conn| projects::relocate(conn, &id, &path))
}

#[tauri::command]
pub async fn open_project(db: State<'_, Db>, id: String) -> AppResult<()> {
    db.with(|conn| projects::touch(conn, &id))
}

#[tauri::command]
pub async fn delete_project(
    db: State<'_, Db>,
    pty: State<'_, PtyManager>,
    id: String,
) -> AppResult<Vec<String>> {
    delete_project_and_stop(&db, &pty, &id)
}

/// Deletes a project, then stops the terminals of all its workspaces, including
/// those the front never displayed. Returns the ids of the deleted workspaces.
pub fn delete_project_and_stop(db: &Db, pty: &PtyManager, id: &str) -> AppResult<Vec<String>> {
    let deleted = db.with(|conn| projects::delete(conn, id))?;
    for node_id in deleted.node_ids {
        pty.kill(&node_id);
    }
    Ok(deleted.workspace_ids)
}

#[cfg(all(test, windows))]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::commands::test_support::run_terminal;
    use crate::db::{nodes, workspaces};

    #[test]
    fn a_missing_folder_is_named_in_english() {
        let error = crate::i18n::in_english(|| existing_folder(" Z:/not here ").unwrap_err());
        assert_eq!(error.to_string(), "folder not found: Z:/not here");
    }

    #[test]
    fn deleting_a_project_stops_the_terminals_of_all_its_workspaces() {
        let db = Db::open_in_memory().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let project = db
            .with(|conn| projects::create(conn, &dir.path().to_string_lossy()))
            .unwrap();
        let second = db
            .with(|conn| workspaces::create(conn, &project.id, "B", "canvas"))
            .unwrap();
        db.with(|conn| nodes::save(conn, "t", &second.id, nodes::NodeKind::Terminal, "{}"))
            .unwrap();
        let pty = PtyManager::default();
        let exited = run_terminal(&pty, "t");
        let deleted = delete_project_and_stop(&db, &pty, &project.id).unwrap();
        assert_eq!(deleted.len(), 2);
        exited
            .recv_timeout(Duration::from_secs(20))
            .expect("the terminals of a deleted project must stop");
    }

    #[test]
    fn counts_live_agents_and_missing_folders() {
        let db = Db::open_in_memory().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let project = db
            .with(|conn| projects::create(conn, &dir.path().to_string_lossy()))
            .unwrap();
        let first = db
            .with(|conn| workspaces::list(conn, &project.id))
            .unwrap()
            .remove(0);
        db.with(|conn| nodes::save(conn, "t", &first.id, nodes::NodeKind::Terminal, "{}"))
            .unwrap();
        let pty = PtyManager::default();
        let _exited = run_terminal(&pty, "t");
        let views = project_views(&db, &pty).unwrap();
        assert_eq!((views[0].live_agents, views[0].missing), (1, false));
        pty.kill_all();
        drop(dir);
        let views = project_views(&db, &pty).unwrap();
        assert!(views[0].missing);
    }
}
