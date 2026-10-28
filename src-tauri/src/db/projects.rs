use crate::tr;
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

use super::{now_ms, workspaces};
use crate::error::{AppError, AppResult};

/// A project is a repository folder holding workspaces (spec habillage §6).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub position: i64,
    pub last_opened_at: i64,
    pub workspace_count: i64,
}

/// What deleting a project took with it: its workspaces and their nodes.
#[derive(Debug)]
pub struct Deleted {
    pub workspace_ids: Vec<String>,
    pub node_ids: Vec<String>,
}

/// Trims spaces and trailing separators, keeping a drive or filesystem root intact.
pub fn normalize_path(path: &str) -> String {
    let trimmed = path.trim();
    let bare = trimmed.trim_end_matches(['\\', '/']);
    if bare.is_empty() || bare.ends_with(':') {
        trimmed.to_string()
    } else {
        bare.to_string()
    }
}

/// Two paths name the same folder when their keys match: Windows ignores case and
/// accepts either separator.
pub fn path_key(path: &str) -> String {
    normalize_path(path).replace('/', "\\").to_lowercase()
}

/// The last folder of a path ("C:\code\api" gives "api"), or the root itself.
pub fn name_from_path(path: &str) -> String {
    let path = normalize_path(path);
    path.rsplit(['\\', '/'])
        .find(|part| !part.is_empty())
        .unwrap_or(&path)
        .to_string()
}

const SELECT: &str = "SELECT p.id, p.name, p.path, p.position, p.last_opened_at,
  (SELECT COUNT(*) FROM workspaces w WHERE w.project_id = p.id) FROM projects p";

fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        path: row.get(2)?,
        position: row.get(3)?,
        last_opened_at: row.get(4)?,
        workspace_count: row.get(5)?,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Project>> {
    let mut stmt = conn.prepare(&format!("{SELECT} ORDER BY p.position, p.created_at"))?;
    let rows = stmt.query_map([], from_row)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Project> {
    conn.query_row(&format!("{SELECT} WHERE p.id = ?1"), [id], from_row)
        .optional()?
        .ok_or_else(|| not_found(id))
}

/// Adds a project for `path`, with its first workspace.
pub fn create(conn: &Connection, path: &str) -> AppResult<Project> {
    let path = valid_path(conn, path, None)?;
    let id = uuid::Uuid::new_v4().to_string();
    let tx = conn.unchecked_transaction()?;
    let position: i64 = tx.query_row(
        "SELECT COALESCE(MAX(position) + 1, 0) FROM projects",
        [],
        |row| row.get(0),
    )?;
    let now = now_ms();
    tx.execute(
        "INSERT INTO projects (id, name, path, position, created_at, last_opened_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, name_from_path(&path), path, position, now],
    )?;
    workspaces::create(&tx, &id, "Workspace 1", "canvas")?;
    tx.commit()?;
    get(conn, &id)
}

pub fn rename(conn: &Connection, id: &str, name: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::InvalidInput(tr!(
            "le nom du projet est vide",
            "the project name is empty"
        )));
    }
    changed(
        conn.execute(
            "UPDATE projects SET name = ?2 WHERE id = ?1",
            params![id, name],
        )?,
        id,
    )
}

/// `path` moved from the folder `from` to `to` ("C:\api\web" from "C:\api" to
/// "D:\api" gives "D:\api\web"); None when `path` is not inside `from`.
pub fn rebase_path(path: &str, from: &str, to: &str) -> Option<String> {
    let key = path_key(path);
    let from_key = path_key(from);
    let to = normalize_path(to);
    if key == from_key {
        return Some(to);
    }
    if !key.starts_with(&format!("{from_key}\\")) {
        return None;
    }
    // The rest of the path keeps its own case.
    let rest: String = normalize_path(path)
        .replace('/', "\\")
        .chars()
        .skip(from_key.chars().count() + 1)
        .collect();
    Some(format!("{}\\{rest}", to.trim_end_matches(['\\', '/'])))
}

/// Points the project at another folder, and its terminals with it: a terminal
/// started in the old folder (or below) would otherwise fail with "dossier introuvable".
pub fn relocate(conn: &Connection, id: &str, path: &str) -> AppResult<()> {
    let path = valid_path(conn, path, Some(id))?;
    let old = get(conn, id)?.path;
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE projects SET path = ?2 WHERE id = ?1",
        params![id, path],
    )?;
    let terminals: Vec<(String, String)> = {
        let mut stmt = tx.prepare(
            "SELECT n.id, n.payload_json FROM nodes n JOIN workspaces w ON w.id = n.workspace_id
             WHERE w.project_id = ?1 AND n.kind = 'terminal'",
        )?;
        let rows = stmt.query_map([id], |row| Ok((row.get(0)?, row.get(1)?)))?;
        rows.collect::<rusqlite::Result<_>>()?
    };
    for (node_id, payload) in terminals {
        let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&payload) else {
            continue;
        };
        let moved = value
            .get("cwd")
            .and_then(|cwd| cwd.as_str())
            .and_then(|cwd| rebase_path(cwd, &old, &path));
        if let Some(cwd) = moved {
            value["cwd"] = serde_json::Value::String(cwd);
            tx.execute(
                "UPDATE nodes SET payload_json = ?2, updated_at = ?3 WHERE id = ?1",
                params![node_id, value.to_string(), now_ms()],
            )?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Records that the project was just opened (recent projects come first).
pub fn touch(conn: &Connection, id: &str) -> AppResult<()> {
    changed(
        conn.execute(
            "UPDATE projects SET last_opened_at = ?2 WHERE id = ?1",
            params![id, now_ms()],
        )?,
        id,
    )
}

/// Ids of the nodes of every workspace of the project.
pub fn node_ids(conn: &Connection, id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT n.id FROM nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE w.project_id = ?1",
    )?;
    let ids = stmt.query_map([id], |row| row.get(0))?;
    Ok(ids.collect::<rusqlite::Result<_>>()?)
}

/// Deletes a project and, by cascade, its workspaces and their content.
pub fn delete(conn: &Connection, id: &str) -> AppResult<Deleted> {
    let tx = conn.unchecked_transaction()?;
    let workspace_ids: Vec<String> = {
        let mut stmt = tx.prepare("SELECT id FROM workspaces WHERE project_id = ?1")?;
        let ids = stmt.query_map([id], |row| row.get(0))?;
        ids.collect::<rusqlite::Result<_>>()?
    };
    let node_ids = node_ids(&tx, id)?;
    changed(tx.execute("DELETE FROM projects WHERE id = ?1", [id])?, id)?;
    tx.commit()?;
    Ok(Deleted {
        workspace_ids,
        node_ids,
    })
}

fn valid_path(conn: &Connection, path: &str, except: Option<&str>) -> AppResult<String> {
    let path = normalize_path(path);
    if path.is_empty() {
        return Err(AppError::InvalidInput(tr!(
            "le dossier du projet est vide",
            "the project folder is empty"
        )));
    }
    let key = path_key(&path);
    let mut stmt = conn.prepare("SELECT id, path FROM projects")?;
    let others = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if others
        .iter()
        .any(|(id, other)| Some(id.as_str()) != except && path_key(other) == key)
    {
        return Err(AppError::InvalidInput(tr!(
            "ce dossier est déjà un projet : {path}",
            "this folder is already a project: {path}"
        )));
    }
    Ok(path)
}

fn changed(rows: usize, id: &str) -> AppResult<()> {
    if rows == 0 {
        Err(not_found(id))
    } else {
        Ok(())
    }
}

fn not_found(id: &str) -> AppError {
    AppError::NotFound(tr!("projet introuvable : {id}", "project not found: {id}"))
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;
    use crate::db::{Db, nodes, workspaces};

    fn names(conn: &Connection) -> Vec<String> {
        list(conn).unwrap().into_iter().map(|p| p.name).collect()
    }

    #[test]
    fn normalizes_paths_keeping_roots() {
        assert_eq!(normalize_path("  C:\\code\\api\\ "), "C:\\code\\api");
        assert_eq!(normalize_path("C:\\"), "C:\\");
        assert_eq!(normalize_path("/"), "/");
        assert_eq!(path_key("c:/code/API/"), path_key("C:\\code\\api"));
    }

    #[test]
    fn names_a_project_after_its_last_folder() {
        assert_eq!(name_from_path("C:\\code\\api\\"), "api");
        assert_eq!(name_from_path("/home/me/web"), "web");
        assert_eq!(name_from_path("C:\\"), "C:");
    }

    #[test]
    fn refuses_an_empty_folder_in_english() {
        crate::i18n::in_english(|| {
            Db::open_in_memory()
                .unwrap()
                .with(|conn| {
                    assert_eq!(
                        create(conn, "   ").unwrap_err().to_string(),
                        "the project folder is empty"
                    );
                    Ok(())
                })
                .unwrap();
        });
    }

    #[test]
    fn creates_a_project_with_its_first_workspace() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let project = create(conn, "C:\\code\\api\\")?;
                assert_eq!(
                    (project.name.as_str(), project.path.as_str()),
                    ("api", "C:\\code\\api")
                );
                assert_eq!(project.workspace_count, 1);
                let first: Vec<String> = workspaces::list(conn, &project.id)?
                    .into_iter()
                    .map(|w| w.name)
                    .collect();
                assert_eq!(first, vec!["Workspace 1"]);
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn refuses_a_folder_that_is_already_a_project() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                create(conn, "C:\\code\\api")?;
                let err = create(conn, "c:/code/API/").unwrap_err();
                assert_eq!(err.kind(), "invalidInput");
                assert_eq!(create(conn, "   ").unwrap_err().kind(), "invalidInput");
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn renames_relocates_and_touches() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let a = create(conn, "C:\\a")?;
                let b = create(conn, "C:\\b")?;
                rename(conn, &a.id, "  Front ")?;
                assert_eq!(names(conn), vec!["Front", "b"]);
                relocate(conn, &a.id, "C:\\A\\")?;
                assert_eq!(get(conn, &a.id)?.path, "C:\\A");
                assert_eq!(
                    relocate(conn, &a.id, "c:\\B").unwrap_err().kind(),
                    "invalidInput"
                );
                touch(conn, &b.id)?;
                assert!(get(conn, &b.id)?.last_opened_at > 0);
                assert_eq!(rename(conn, "nope", "x").unwrap_err().kind(), "notFound");
                assert_eq!(rename(conn, &a.id, " ").unwrap_err().kind(), "invalidInput");
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn deletes_a_project_and_reports_what_went_with_it() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let project = create(conn, "C:\\a")?;
                let first = workspaces::list(conn, &project.id)?.remove(0);
                nodes::save(conn, "t1", &first.id, nodes::NodeKind::Terminal, "{}")?;
                assert_eq!(node_ids(conn, &project.id)?, vec!["t1".to_string()]);
                let deleted = delete(conn, &project.id)?;
                assert_eq!(deleted.workspace_ids, vec![first.id]);
                assert_eq!(deleted.node_ids, vec!["t1".to_string()]);
                assert!(names(conn).is_empty());
                assert_eq!(delete(conn, "nope").unwrap_err().kind(), "notFound");
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn rebases_paths_inside_a_folder_only() {
        assert_eq!(
            rebase_path("C:\\code\\api", "c:/code/API/", "D:\\api").as_deref(),
            Some("D:\\api")
        );
        assert_eq!(
            rebase_path("C:\\code\\api\\web", "C:\\code\\api", "D:\\").as_deref(),
            Some("D:\\web")
        );
        assert_eq!(
            rebase_path("C:\\code\\apis", "C:\\code\\api", "D:\\api"),
            None
        );
    }

    #[test]
    fn relocating_moves_the_terminals_inside_the_old_folder() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let project = create(conn, "C:\\code\\api")?;
                let w = workspaces::list(conn, &project.id)?.remove(0);
                let terminal = nodes::NodeKind::Terminal;
                nodes::save(
                    conn,
                    "root",
                    &w.id,
                    terminal,
                    r#"{"cwd":"C:\\code\\api","agent":"claude"}"#,
                )?;
                nodes::save(
                    conn,
                    "sub",
                    &w.id,
                    terminal,
                    r#"{"cwd":"c:/code/API/web","agent":"codex"}"#,
                )?;
                nodes::save(
                    conn,
                    "other",
                    &w.id,
                    terminal,
                    r#"{"cwd":"C:\\code\\apis","agent":"shell"}"#,
                )?;
                relocate(conn, &project.id, "D:\\api")?;
                let payload = |id: &str| -> serde_json::Value {
                    let json: String = conn
                        .query_row(
                            "SELECT payload_json FROM nodes WHERE id = ?1",
                            [id],
                            |row| row.get(0),
                        )
                        .unwrap();
                    serde_json::from_str(&json).unwrap()
                };
                assert_eq!(payload("root")["cwd"], "D:\\api");
                assert_eq!(payload("sub")["cwd"], "D:\\api\\web");
                assert_eq!(payload("sub")["agent"], "codex");
                assert_eq!(payload("other")["cwd"], "C:\\code\\apis");
                Ok(())
            })
            .unwrap();
    }
}
