use rusqlite::{Connection, OptionalExtension, params};

use crate::error::AppResult;

pub fn get(conn: &Connection, key: &str) -> AppResult<Option<serde_json::Value>> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value_json FROM settings WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()?;
    // A value that no longer parses is treated as unset rather than blocking startup.
    Ok(raw.and_then(|json| serde_json::from_str(&json).ok()))
}

pub fn set(conn: &Connection, key: &str, value: &serde_json::Value) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value_json) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
        params![key, value.to_string()],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, key: &str) -> AppResult<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", [key])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    #[test]
    fn stores_json_values_by_key() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                assert_eq!(get(conn, "ui.activeWorkspaceId")?, None);
                set(conn, "ui.activeWorkspaceId", &serde_json::json!("w1"))?;
                set(conn, "ui.activeWorkspaceId", &serde_json::json!("w2"))?;
                assert_eq!(
                    get(conn, "ui.activeWorkspaceId")?,
                    Some(serde_json::json!("w2"))
                );
                delete(conn, "ui.activeWorkspaceId")?;
                assert_eq!(get(conn, "ui.activeWorkspaceId")?, None);
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn keeps_numbers_and_objects_as_they_were_set() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let shortcuts = serde_json::json!({ "Ctrl+P": "Ctrl+K" });
                set(conn, "ui.shortcuts", &shortcuts)?;
                set(conn, "agents.activityThresholdMs", &serde_json::json!(3000))?;
                assert_eq!(get(conn, "ui.shortcuts")?, Some(shortcuts));
                assert_eq!(
                    get(conn, "agents.activityThresholdMs")?,
                    Some(serde_json::json!(3000))
                );
                Ok(())
            })
            .unwrap();
    }
}
