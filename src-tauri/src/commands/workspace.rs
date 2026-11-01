use tauri::State;

use crate::db::nodes::{self, NodeKind};
use crate::db::scenes::{self, SceneFile, WorkspaceData};
use crate::db::workspaces::{self, Workspace};
use crate::db::{Db, settings};
use crate::error::AppResult;
use crate::pty::PtyManager;

#[tauri::command]
pub async fn list_workspaces(db: State<'_, Db>, project_id: String) -> AppResult<Vec<Workspace>> {
    db.with(|conn| workspaces::list(conn, &project_id))
}

#[tauri::command]
pub async fn create_workspace(
    db: State<'_, Db>,
    project_id: String,
    name: String,
    kind: Option<String>,
) -> AppResult<Workspace> {
    let kind = kind.unwrap_or_else(|| "canvas".to_string());
    db.with(|conn| workspaces::create(conn, &project_id, &name, &kind))
}

#[tauri::command]
pub async fn rename_workspace(db: State<'_, Db>, id: String, name: String) -> AppResult<()> {
    db.with(|conn| workspaces::rename(conn, &id, &name))
}

#[tauri::command]
pub async fn delete_workspace(
    db: State<'_, Db>,
    pty: State<'_, PtyManager>,
    id: String,
) -> AppResult<()> {
    delete_workspace_and_stop(&db, &pty, &id)
}

/// Deletes a workspace, then stops its terminals. Rust does it rather than the
/// front, which only knows the nodes of the workspaces it has displayed: after a
/// webview reload, agents of a never-opened workspace would keep running unseen.
pub fn delete_workspace_and_stop(db: &Db, pty: &PtyManager, id: &str) -> AppResult<()> {
    let node_ids = db.with(|conn| {
        let ids = nodes::ids_of_workspace(conn, id)?;
        workspaces::delete(conn, id)?;
        Ok(ids)
    })?;
    for node_id in node_ids {
        pty.kill(&node_id);
    }
    Ok(())
}

#[tauri::command]
pub async fn load_workspace(db: State<'_, Db>, id: String) -> AppResult<WorkspaceData> {
    db.with(|conn| scenes::load(conn, &id))
}

#[tauri::command]
pub async fn save_scene(
    db: State<'_, Db>,
    workspace_id: String,
    elements_json: String,
    app_state_json: String,
    node_ids: Vec<String>,
) -> AppResult<()> {
    db.with(|conn| {
        scenes::save(
            conn,
            &workspace_id,
            &elements_json,
            &app_state_json,
            &node_ids,
        )
    })
}

#[tauri::command]
pub async fn save_files(
    db: State<'_, Db>,
    workspace_id: String,
    files: Vec<SceneFile>,
) -> AppResult<()> {
    db.with(|conn| scenes::save_files(conn, &workspace_id, &files))
}

#[tauri::command]
pub async fn save_node(
    db: State<'_, Db>,
    id: String,
    workspace_id: String,
    kind: NodeKind,
    payload_json: String,
) -> AppResult<()> {
    db.with(|conn| nodes::save(conn, &id, &workspace_id, kind, &payload_json))
}

#[tauri::command]
pub async fn get_setting(db: State<'_, Db>, key: String) -> AppResult<Option<serde_json::Value>> {
    db.with(|conn| settings::get(conn, &key))
}

#[tauri::command]
pub async fn set_workspace_pantheon(
    db: State<'_, Db>,
    id: String,
    pantheon: String,
) -> AppResult<()> {
    db.with(|conn| workspaces::set_pantheon(conn, &id, &pantheon))
}

#[cfg(all(test, windows))]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::commands::test_support::run_terminal;

    #[test]
    fn deleting_a_workspace_stops_its_terminals_even_if_the_front_never_loaded_them() {
        let db = Db::open_in_memory().unwrap();
        let a = db
            .with(|conn| crate::db::test_workspace(conn, "A"))
            .unwrap();
        db.with(|conn| crate::db::test_workspace(conn, "B"))
            .unwrap();
        db.with(|conn| nodes::save(conn, "t", &a.id, NodeKind::Terminal, "{}"))
            .unwrap();
        let pty = PtyManager::default();
        let exited = run_terminal(&pty, "t");
        delete_workspace_and_stop(&db, &pty, &a.id).unwrap();
        exited
            .recv_timeout(Duration::from_secs(20))
            .expect("the terminal of a deleted workspace must stop");
    }

    #[test]
    fn a_refused_deletion_leaves_terminals_running() {
        let db = Db::open_in_memory().unwrap();
        let only = db
            .with(|conn| crate::db::test_workspace(conn, "Seul"))
            .unwrap();
        db.with(|conn| nodes::save(conn, "t", &only.id, NodeKind::Terminal, "{}"))
            .unwrap();
        let pty = PtyManager::default();
        let _exited = run_terminal(&pty, "t");
        let err = delete_workspace_and_stop(&db, &pty, &only.id).unwrap_err();
        assert_eq!(err.kind(), "invalidInput");
        assert_eq!(pty.list(), vec!["t".to_string()]);
        pty.kill_all();
    }
}

#[tauri::command]
pub async fn set_setting(
    db: State<'_, Db>,
    key: String,
    value: serde_json::Value,
) -> AppResult<()> {
    db.with(|conn| settings::set(conn, &key, &value))
}
