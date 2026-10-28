mod migrate_v2;
pub mod nodes;
pub mod projects;
pub mod scenes;
pub mod scrollback;
pub mod settings;
pub mod workspaces;

use crate::tr;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, Transaction};

use crate::error::{AppError, AppResult};
use crate::sync::lock;

/// One schema upgrade. Rust steps do what SQL alone cannot (read JSON payloads,
/// know the user's home folder).
enum Step {
    Sql(&'static str),
    Rust(fn(&Transaction, &str) -> rusqlite::Result<()>),
}

/// Each entry upgrades the schema by one version; `PRAGMA user_version` records how
/// many have run. Never edit a shipped entry: append a new one.
const MIGRATIONS: &[Step] = &[
    Step::Sql(include_str!("migrations/001_initial.sql")),
    Step::Rust(migrate_v2::run),
    Step::Sql(include_str!("migrations/003_file_nodes.sql")),
];

/// The single SQLite connection shared by every command (spec V1 §8.1).
pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(path)?;
        prepare_upgrade(&conn, path)?;
        Self::init(conn)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> AppResult<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(mut conn: Connection) -> AppResult<Self> {
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;
        migrate(&mut conn, &home_dir())?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Runs `f` with exclusive access to the connection.
    pub fn with<T>(&self, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
        let mut conn = lock(&self.conn);
        f(&mut conn)
    }
}

fn newer_base() -> String {
    tr!(
        "Cette base vient d'une version plus récente d'OpenVibe. Installe la dernière version.",
        "This database comes from a newer version of OpenVibe. Install the latest version."
    )
}

/// A base from a newer OpenVibe is left untouched; an older one is copied
/// before its first missing migration (spec première version §3.3). A copy
/// already there is the one made before a first, failed attempt: it is kept.
/// The copy is written aside and renamed once checked, so a copy cut short
/// (full disk, crash) is never taken for the backup.
fn prepare_upgrade(conn: &Connection, path: &Path) -> AppResult<()> {
    let applied: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let applied = applied as usize;
    if applied > MIGRATIONS.len() {
        return Err(AppError::InvalidInput(newer_base()));
    }
    if applied == 0 || applied == MIGRATIONS.len() {
        return Ok(());
    }
    let backup = backup_path(path, applied);
    if backup.exists() {
        return Ok(());
    }
    copy_checked(conn, &backup, applied).map_err(|err| {
        AppError::InvalidInput(tr!(
            "Copie de la base impossible avant sa mise à jour : {err}",
            "Could not copy the database before upgrading it: {err}"
        ))
    })?;
    // The file name only: the log is meant to be sent, without the user's folders.
    log::info!(
        "base v{applied} copied to {}",
        backup.file_name().unwrap_or_default().to_string_lossy()
    );
    Ok(())
}

fn copy_checked(conn: &Connection, backup: &Path, version: usize) -> AppResult<()> {
    let partial = backup.with_extension("db.tmp");
    if partial.exists() {
        std::fs::remove_file(&partial)?;
    }
    conn.execute("VACUUM INTO ?1", [partial.to_string_lossy()])?;
    let copied: i64 =
        Connection::open(&partial)?.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if copied as usize != version {
        return Err(AppError::InvalidInput(format!(
            "la copie est en version {copied} au lieu de {version}"
        )));
    }
    std::fs::rename(&partial, backup)?;
    Ok(())
}

/// `openvibe.v<N>-backup.db` next to the base: its copy before it left version `N`.
pub fn backup_path(db: &Path, version: usize) -> PathBuf {
    let stem = db.file_stem().map_or("openvibe".into(), |stem| {
        stem.to_string_lossy().into_owned()
    });
    db.with_file_name(format!("{stem}.v{version}-backup.db"))
}

/// The user's home folder: the project of workspaces that had no terminal (migration 002).
pub fn home_dir() -> String {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into())
}

fn migrate(conn: &mut Connection, home: &str) -> rusqlite::Result<()> {
    migrate_up_to(conn, MIGRATIONS.len(), home)
}

/// Applies the migrations not yet run, up to version `target`. Foreign keys are
/// off during a step: rebuilding a table drops it while others still reference it,
/// so the copied rows are checked before the step commits.
fn migrate_up_to(conn: &mut Connection, target: usize, home: &str) -> rusqlite::Result<()> {
    let applied: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    for index in (applied as usize)..target.min(MIGRATIONS.len()) {
        conn.execute_batch("PRAGMA foreign_keys = OFF")?;
        let result = apply(conn, index, home);
        conn.execute_batch("PRAGMA foreign_keys = ON")?;
        result?;
    }
    Ok(())
}

fn apply(conn: &mut Connection, index: usize, home: &str) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    match &MIGRATIONS[index] {
        Step::Sql(sql) => tx.execute_batch(sql)?,
        Step::Rust(run) => run(&tx, home)?,
    }
    let orphans: i64 =
        tx.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })?;
    if orphans > 0 {
        return Err(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CONSTRAINT),
            Some(format!(
                "migration {} : {orphans} ligne(s) orpheline(s)",
                index + 1
            )),
        ));
    }
    tx.pragma_update(None, "user_version", index as i64 + 1)?;
    tx.commit()
}

/// Unix time in milliseconds, the unit of every `*_at` column.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

/// Test-only: a workspace in a shared test project, for tests that do not care which.
#[cfg(test)]
pub fn test_workspace(conn: &Connection, name: &str) -> AppResult<workspaces::Workspace> {
    use rusqlite::OptionalExtension;
    const PATH: &str = "C:/openvibe-tests";
    let existing: Option<String> = conn
        .query_row("SELECT id FROM projects WHERE path = ?1", [PATH], |row| {
            row.get(0)
        })
        .optional()?;
    let project_id = match existing {
        Some(id) => id,
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO projects (id, name, path, position, created_at, last_opened_at)
                 VALUES (?1, 'tests', ?2, 0, 0, 0)",
                rusqlite::params![id, PATH],
            )?;
            id
        }
    };
    workspaces::create(conn, &project_id, name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_run_once_and_record_the_version() {
        let db = Db::open_in_memory().unwrap();
        db.with(|conn| {
            migrate(conn, "C:/Users/me")?;
            let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
            assert_eq!(version, MIGRATIONS.len() as i64);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn migration_3_keeps_the_nodes_and_their_scrollback_and_accepts_file_nodes() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrate_up_to(&mut conn, 2, "C:/home").unwrap();
        let workspace = test_workspace(&conn, "w").unwrap();
        conn.execute(
            "INSERT INTO nodes VALUES ('t1', ?1, 'terminal', '{}', 10), ('n2', ?1, 'note', '{}', 11)",
            [&workspace.id],
        )
        .unwrap();
        conn.execute_batch("INSERT INTO terminal_scrollback VALUES ('t1', x'41', 12);")
            .unwrap();
        assert!(conn
            .execute("INSERT INTO nodes VALUES ('f0', ?1, 'file', '{}', 13)", [&workspace.id])
            .is_err());

        migrate_up_to(&mut conn, 3, "C:/home").unwrap();

        let count = |sql: &str| -> i64 { conn.query_row(sql, [], |row| row.get(0)).unwrap() };
        assert_eq!(count("SELECT COUNT(*) FROM nodes"), 2);
        assert_eq!(count("SELECT COUNT(*) FROM terminal_scrollback WHERE node_id = 't1'"), 1);
        assert_eq!(
            count("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'nodes_workspace'"),
            1
        );
        conn.execute(
            "INSERT INTO nodes VALUES ('f1', ?1, 'file', '{\"path\":\"README.md\"}', 14)",
            [&workspace.id],
        )
        .unwrap();
        // The cascades still reach the rebuilt table.
        conn.execute("DELETE FROM nodes WHERE id = 't1'", []).unwrap();
        assert_eq!(count("SELECT COUNT(*) FROM terminal_scrollback"), 0);
    }

    fn base_at_version(path: &Path, version: usize) {
        let mut conn = Connection::open(path).unwrap();
        migrate_up_to(&mut conn, version, "C:/home").unwrap();
    }

    fn backups_in(dir: &Path) -> usize {
        std::fs::read_dir(dir)
            .unwrap()
            .filter(|entry| {
                let name = entry.as_ref().unwrap().file_name();
                name.to_string_lossy().contains("backup")
            })
            .count()
    }

    #[test]
    fn copies_an_existing_base_before_upgrading_it() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("openvibe.db");
        base_at_version(&path, 1);
        Db::open(&path).unwrap();
        let backup = backup_path(&path, 1);
        assert_eq!(backup, dir.path().join("openvibe.v1-backup.db"));
        let copy = Connection::open(&backup).unwrap();
        let version: i64 = copy
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, 1);
    }

    #[test]
    fn keeps_the_copy_made_before_a_first_attempt() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("openvibe.db");
        base_at_version(&path, 1);
        std::fs::write(backup_path(&path, 1), b"first copy").unwrap();
        Db::open(&path).unwrap();
        assert_eq!(std::fs::read(backup_path(&path, 1)).unwrap(), b"first copy");
    }

    #[test]
    fn a_copy_cut_short_is_never_taken_for_the_backup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("openvibe.db");
        base_at_version(&path, 1);
        // What a VACUUM INTO stopped by a full disk or a crash leaves behind.
        let partial = backup_path(&path, 1).with_extension("db.tmp");
        std::fs::write(&partial, b"truncated").unwrap();
        Db::open(&path).unwrap();
        let copy = Connection::open(backup_path(&path, 1)).unwrap();
        let version: i64 = copy
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, 1);
        assert!(!partial.exists());
    }

    #[test]
    fn no_copy_for_a_new_or_current_base() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("openvibe.db");
        drop(Db::open(&path).unwrap());
        drop(Db::open(&path).unwrap());
        assert_eq!(backups_in(dir.path()), 0);
    }

    #[test]
    fn refuses_a_base_from_a_newer_version() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("openvibe.db");
        Connection::open(&path)
            .unwrap()
            .pragma_update(None, "user_version", MIGRATIONS.len() as i64 + 1)
            .unwrap();
        let err = Db::open(&path).err().unwrap().to_string();
        assert!(err.contains("version plus récente d'OpenVibe"), "{err}");
    }

    #[test]
    fn the_base_survives_a_panic_inside_with() {
        let db = std::sync::Arc::new(Db::open_in_memory().unwrap());
        let inner = db.clone();
        let _ = std::thread::spawn(move || {
            let _ = inner.with(|_| -> AppResult<()> { panic!("inside with") });
        })
        .join();
        let version: i64 = db
            .with(|conn| Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(version, MIGRATIONS.len() as i64);
    }

    #[test]
    fn foreign_keys_are_back_on_after_migrating() {
        Db::open_in_memory()
            .unwrap()
            .with(|conn| {
                let on: i64 = conn.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
                assert_eq!(on, 1);
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn reopening_a_database_file_keeps_its_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("openvibe.db");
        let created = Db::open(&path)
            .unwrap()
            .with(|conn| test_workspace(conn, "Persisté"))
            .unwrap();
        let names: Vec<String> = Db::open(&path)
            .unwrap()
            .with(|conn| workspaces::list(conn, &created.project_id))
            .unwrap()
            .into_iter()
            .map(|w| w.name)
            .collect();
        assert_eq!(names, vec!["Persisté".to_string()]);
    }
}
