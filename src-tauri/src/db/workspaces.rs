use crate::tr;
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

use super::now_ms;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub position: i64,
    /// Pantheon of the agents outside any group (spec habillage §9.2).
    pub pantheon: Option<String>,
    /// `canvas` (free whiteboard) or `code` (the project's single code workspace).
    pub kind: String,
}

pub const CANVAS: &str = "canvas";
pub const CODE: &str = "code";

/// Unknown or missing kinds read as a canvas, the historical behaviour.
fn read_kind(kind: Option<String>) -> String {
    match kind.as_deref() {
        Some(CODE) => CODE.to_string(),
        _ => CANVAS.to_string(),
    }
}

fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Workspace> {
    Ok(Workspace {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        position: row.get(3)?,
        pantheon: row.get(4)?,
        kind: read_kind(row.get(5)?),
    })
}

pub fn list(conn: &Connection, project_id: &str) -> AppResult<Vec<Workspace>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, position, pantheon, kind FROM workspaces
         WHERE project_id = ?1 ORDER BY position, created_at",
    )?;
    let rows = stmt.query_map([project_id], from_row)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Creates a workspace of the given kind (`canvas` or `code`). A project has at
/// most one code workspace: asking for another returns the existing one.
pub fn create(conn: &Connection, project_id: &str, name: &str, kind: &str) -> AppResult<Workspace> {
    let name = valid_name(name)?;
    if kind != CANVAS && kind != CODE {
        return Err(AppError::InvalidInput(tr!(
            "type de workspace inconnu : {kind}",
            "unknown workspace kind: {kind}"
        )));
    }
    if kind == CODE {
        let existing = conn
            .query_row(
                "SELECT id, project_id, name, position, pantheon, kind FROM workspaces
                 WHERE project_id = ?1 AND kind = 'code'",
                [project_id],
                from_row,
            )
            .optional()?;
        if let Some(existing) = existing {
            return Ok(existing);
        }
    }
    let position: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position) + 1, 0) FROM workspaces WHERE project_id = ?1",
        [project_id],
        |row| row.get(0),
    )?;
    let workspace = Workspace {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: project_id.to_string(),
        name,
        position,
        pantheon: None,
        kind: kind.to_string(),
    };
    let now = now_ms();
    conn.execute(
        "INSERT INTO workspaces (id, project_id, name, position, pantheon, kind, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?6)",
        params![
            workspace.id,
            workspace.project_id,
            workspace.name,
            workspace.position,
            workspace.kind,
            now
        ],
    )?;
    Ok(workspace)
}

pub fn rename(conn: &Connection, id: &str, name: &str) -> AppResult<()> {
    let name = valid_name(name)?;
    let changed = conn.execute(
        "UPDATE workspaces SET name = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, name, now_ms()],
    )?;
    if changed == 0 {
        return Err(not_found(id));
    }
    Ok(())
}

/// Deletes a workspace and, by cascade, its scene, files, nodes and scrollback.
/// The last canvas workspace of a project cannot be deleted: a project always shows
/// one. A code workspace may always be deleted.
pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    let (project_id, kind): (String, Option<String>) = conn
        .query_row(
            "SELECT project_id, kind FROM workspaces WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or_else(|| not_found(id))?;
    let canvases: i64 = conn.query_row(
        "SELECT COUNT(*) FROM workspaces WHERE project_id = ?1 AND kind IS NOT 'code'",
        [project_id],
        |row| row.get(0),
    )?;
    if read_kind(kind) == CANVAS && canvases <= 1 {
        return Err(AppError::InvalidInput(tr!(
            "impossible de supprimer le dernier workspace du projet",
            "cannot delete the project's last workspace"
        )));
    }
    conn.execute("DELETE FROM workspaces WHERE id = ?1", [id])?;
    Ok(())
}

pub fn set_pantheon(conn: &Connection, id: &str, pantheon: &str) -> AppResult<()> {
    let pantheon = pantheon.trim();
    if pantheon.is_empty() {
        return Err(AppError::InvalidInput(tr!(
            "panthéon vide",
            "empty pantheon"
        )));
    }
    let changed = conn.execute(
        "UPDATE workspaces SET pantheon = ?2 WHERE id = ?1",
        params![id, pantheon],
    )?;
    if changed == 0 {
        return Err(not_found(id));
    }
    Ok(())
}

fn valid_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::InvalidInput(tr!(
            "le nom du workspace est vide",
            "the workspace name is empty"
        )));
    }
    Ok(name.to_string())
}

fn not_found(id: &str) -> AppError {
    AppError::NotFound(tr!(
        "workspace introuvable : {id}",
        "workspace not found: {id}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    fn project(conn: &Connection, path: &str) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO projects (id, name, path, position, created_at, last_opened_at) VALUES (?1, 'p', ?2, 0, 0, 0)",
            params![id, path],
        )
        .unwrap();
        id
    }

    fn names(conn: &Connection, project_id: &str) -> Vec<String> {
        list(conn, project_id)
            .unwrap()
            .into_iter()
            .map(|w| w.name)
            .collect()
    }

    #[test]
    fn creates_workspaces_in_order_within_their_project() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let p = project(conn, "C:/p");
                let q = project(conn, "C:/q");
                let first = create(conn, &p, "  Front  ", CANVAS)?;
                let other = create(conn, &q, "Ailleurs", CANVAS)?;
                let second = create(conn, &p, "API", CANVAS)?;
                assert_eq!((first.position, second.position, other.position), (0, 1, 0));
                assert_eq!(names(conn, &p), vec!["Front", "API"]);
                assert_eq!(first.project_id, p);
                assert_eq!(first.pantheon, None);
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn rejects_blank_names() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let p = project(conn, "C:/p");
                assert_eq!(
                    create(conn, &p, "   ", CANVAS).unwrap_err().kind(),
                    "invalidInput"
                );
                let w = create(conn, &p, "A", CANVAS)?;
                assert_eq!(rename(conn, &w.id, " ").unwrap_err().kind(), "invalidInput");
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn explains_its_refusals_in_english() {
        crate::i18n::in_english(|| {
            Db::open_in_memory()
                .unwrap()
                .with(|conn| {
                    let p = project(conn, "C:/p");
                    assert_eq!(
                        create(conn, &p, "  ", CANVAS).unwrap_err().to_string(),
                        "the workspace name is empty"
                    );
                    let only = create(conn, &p, "A", CANVAS)?;
                    assert_eq!(
                        delete(conn, &only.id).unwrap_err().to_string(),
                        "cannot delete the project's last workspace"
                    );
                    Ok(())
                })
                .unwrap();
        });
    }

    #[test]
    fn renames_and_reports_unknown_ids() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let p = project(conn, "C:/p");
                let w = create(conn, &p, "A", CANVAS)?;
                rename(conn, &w.id, "B")?;
                assert_eq!(names(conn, &p), vec!["B"]);
                assert_eq!(rename(conn, "nope", "C").unwrap_err().kind(), "notFound");
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn deletes_a_workspace_but_never_the_last_of_its_project() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let p = project(conn, "C:/p");
                let q = project(conn, "C:/q");
                let a = create(conn, &p, "A", CANVAS)?;
                let b = create(conn, &p, "B", CANVAS)?;
                create(conn, &q, "Q", CANVAS)?;
                delete(conn, &a.id)?;
                assert_eq!(names(conn, &p), vec!["B"]);
                assert_eq!(delete(conn, &b.id).unwrap_err().kind(), "invalidInput");
                assert_eq!(delete(conn, "nope").unwrap_err().kind(), "notFound");
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn remembers_the_pantheon_of_ungrouped_agents() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let p = project(conn, "C:/p");
                let w = create(conn, &p, "A", CANVAS)?;
                set_pantheon(conn, &w.id, "egyptian")?;
                assert_eq!(list(conn, &p)?[0].pantheon.as_deref(), Some("egyptian"));
                assert_eq!(
                    set_pantheon(conn, &w.id, " ").unwrap_err().kind(),
                    "invalidInput"
                );
                assert_eq!(
                    set_pantheon(conn, "nope", "greek").unwrap_err().kind(),
                    "notFound"
                );
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn workspaces_are_canvases_by_default_and_may_be_code() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let p = project(conn, "C:/p");
                let canvas = create(conn, &p, "A", CANVAS)?;
                let code = create(conn, &p, "Code", CODE)?;
                assert_eq!(
                    (canvas.kind.as_str(), code.kind.as_str()),
                    ("canvas", "code")
                );
                let kinds: Vec<String> = list(conn, &p)?.into_iter().map(|w| w.kind).collect();
                assert_eq!(kinds, vec!["canvas", "code"]);
                let json = serde_json::to_value(&code).unwrap();
                assert_eq!(json["kind"], "code");
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn a_second_code_workspace_returns_the_first() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let p = project(conn, "C:/p");
                let q = project(conn, "C:/q");
                let first = create(conn, &p, "Code", CODE)?;
                let again = create(conn, &p, "Other name", CODE)?;
                assert_eq!(again, first);
                assert_eq!(list(conn, &p)?.len(), 1);
                // Another project gets its own.
                assert_ne!(create(conn, &q, "Code", CODE)?.id, first.id);
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn rejects_unknown_kinds() {
        crate::i18n::in_english(|| {
            Db::open_in_memory()
                .unwrap()
                .with(|conn| {
                    let p = project(conn, "C:/p");
                    let err = create(conn, &p, "A", "board").unwrap_err();
                    assert_eq!(err.kind(), "invalidInput");
                    assert_eq!(err.to_string(), "unknown workspace kind: board");
                    assert!(list(conn, &p)?.is_empty());
                    Ok(())
                })
                .unwrap();
        });
    }

    #[test]
    fn a_code_workspace_may_go_but_never_the_last_canvas() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let p = project(conn, "C:/p");
                let canvas = create(conn, &p, "A", CANVAS)?;
                let code = create(conn, &p, "Code", CODE)?;
                // The code workspace does not count as a canvas left behind.
                assert_eq!(delete(conn, &canvas.id).unwrap_err().kind(), "invalidInput");
                delete(conn, &code.id)?;
                assert_eq!(names(conn, &p), vec!["A"]);
                // Even alone, a code workspace may be deleted.
                let q = project(conn, "C:/q");
                let lone = create(conn, &q, "Code", CODE)?;
                delete(conn, &lone.id)?;
                assert!(list(conn, &q)?.is_empty());
                Ok(())
            })
            .unwrap();
    }
}
