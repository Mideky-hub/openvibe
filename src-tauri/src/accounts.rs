//! Claude profiles (spec comptes): a name and a folder, nothing else. The
//! folder is Claude Code's own `CLAUDE_CONFIG_DIR`. OpenVibe reads its
//! `settings.json` for the status line and the names under `projects` to know
//! whether a conversation can be resumed; it never reads a conversation or the
//! login, and copies or logs nothing.

use std::path::{Component, Path, PathBuf};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::db::settings;
use crate::error::{AppError, AppResult};
use crate::tr;

const KEY: &str = "accounts";
const MAX_NAME: usize = 40;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub config_dir: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Accounts {
    #[serde(default)]
    pub profiles: Vec<Profile>,
    /// The profile new Claude agents start with; `None`: the default one.
    #[serde(default)]
    pub active: Option<String>,
}

/// A folder OpenVibe may hand to Claude as `CLAUDE_CONFIG_DIR`: absolute,
/// without `..` or control characters. Returned as given.
pub fn checked_dir(dir: &str) -> AppResult<PathBuf> {
    let path = Path::new(dir.trim());
    let bad = dir.trim().is_empty()
        || dir.chars().any(char::is_control)
        || !path.is_absolute()
        || path.components().any(|c| matches!(c, Component::ParentDir));
    if bad {
        return Err(AppError::InvalidInput(tr!(
            "dossier de profil invalide : {dir}",
            "invalid profile folder: {dir}"
        )));
    }
    if path.exists() && !path.is_dir() {
        return Err(AppError::InvalidInput(tr!(
            "ce n'est pas un dossier : {dir}",
            "not a folder: {dir}"
        )));
    }
    Ok(path.to_path_buf())
}

pub fn load(conn: &Connection) -> AppResult<Accounts> {
    Ok(settings::get(conn, KEY)?
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default())
}

fn store(conn: &Connection, accounts: &Accounts) -> AppResult<()> {
    settings::set(
        conn,
        KEY,
        &serde_json::to_value(accounts).expect("plain data"),
    )
}

fn same_folder(a: &str, b: &str) -> bool {
    let clean = |s: &str| {
        s.trim()
            .trim_end_matches(['\\', '/'])
            .to_lowercase()
            .replace('\\', "/")
    };
    clean(a) == clean(b)
}

/// Adds a profile and creates its folder when missing. Never touches an existing one.
pub fn add(conn: &Connection, name: &str, config_dir: &str) -> AppResult<Profile> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME || name.chars().any(char::is_control) {
        return Err(AppError::InvalidInput(tr!(
            "nom de profil invalide (1 à 40 caractères)",
            "invalid profile name (1 to 40 characters)"
        )));
    }
    let dir = checked_dir(config_dir)?;
    let mut accounts = load(conn)?;
    let taken = accounts
        .profiles
        .iter()
        .any(|p| p.name.eq_ignore_ascii_case(name) || same_folder(&p.config_dir, config_dir));
    if taken {
        return Err(AppError::InvalidInput(tr!(
            "un profil porte déjà ce nom ou ce dossier",
            "a profile already has this name or folder"
        )));
    }
    std::fs::create_dir_all(&dir)?;
    let profile = Profile {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        config_dir: dir.to_string_lossy().into_owned(),
    };
    accounts.profiles.push(profile.clone());
    store(conn, &accounts)?;
    Ok(profile)
}

/// Forgets a profile; its folder stays on the disk.
pub fn remove(conn: &Connection, id: &str) -> AppResult<()> {
    let mut accounts = load(conn)?;
    accounts.profiles.retain(|p| p.id != id);
    if accounts.active.as_deref() == Some(id) {
        accounts.active = None;
    }
    store(conn, &accounts)
}

/// The profile new agents use: `None` for the default one.
pub fn set_active(conn: &Connection, id: Option<&str>) -> AppResult<()> {
    let mut accounts = load(conn)?;
    if let Some(id) = id
        && !accounts.profiles.iter().any(|p| p.id == id)
    {
        return Err(AppError::NotFound(tr!(
            "profil introuvable : {id}",
            "profile not found: {id}"
        )));
    }
    accounts.active = id.map(str::to_string);
    store(conn, &accounts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    fn db() -> Db {
        Db::open_in_memory().unwrap()
    }

    #[test]
    fn adds_a_profile_and_creates_only_its_own_folder() {
        let db = db();
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("work");
        let profile = db
            .with(|conn| add(conn, " Travail ", &dir.to_string_lossy()))
            .unwrap();
        assert_eq!(profile.name, "Travail");
        assert!(dir.is_dir(), "the folder is created for the login to fill");
        let accounts = db.with(|conn| load(conn)).unwrap();
        assert_eq!(accounts.profiles, vec![profile]);
        assert_eq!(accounts.active, None);
    }

    #[test]
    fn an_existing_folder_is_left_exactly_as_it_was() {
        let db = db();
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("keep.txt"), "mine").unwrap();
        db.with(|conn| add(conn, "Perso", &root.path().to_string_lossy()))
            .unwrap();
        let names: Vec<_> = std::fs::read_dir(root.path())
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(names, ["keep.txt"]);
        assert_eq!(
            std::fs::read_to_string(root.path().join("keep.txt")).unwrap(),
            "mine"
        );
    }

    #[test]
    fn refuses_bad_names_folders_and_duplicates() {
        let db = db();
        let root = tempfile::tempdir().unwrap();
        let a = root.path().join("a");
        let a = a.to_string_lossy().into_owned();
        db.with(|conn| add(conn, "A", &a)).unwrap();
        let bad = |name: &str, dir: &str| db.with(|conn| add(conn, name, dir)).is_err();
        assert!(bad("", &a), "empty name");
        assert!(bad(
            &"x".repeat(41),
            &root.path().join("b").to_string_lossy()
        ));
        assert!(bad("B", "relative/dir"), "relative folder");
        assert!(
            bad("B", &format!("{}/../up", root.path().display())),
            "parent segment"
        );
        assert!(bad("B", "C:\\\u{7}bell"), "control character");
        assert!(
            bad("a", &root.path().join("c").to_string_lossy()),
            "same name, any case"
        );
        assert!(bad("C", &a.to_uppercase()), "same folder");
        let file = root.path().join("file.txt");
        std::fs::write(&file, "x").unwrap();
        assert!(bad("D", &file.to_string_lossy()), "a file is not a folder");
    }

    #[test]
    fn uses_and_removes_profiles_leaving_their_folder() {
        let db = db();
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("w");
        let profile = db
            .with(|conn| add(conn, "W", &dir.to_string_lossy()))
            .unwrap();
        db.with(|conn| set_active(conn, Some(&profile.id))).unwrap();
        assert_eq!(
            db.with(|conn| load(conn)).unwrap().active,
            Some(profile.id.clone())
        );
        assert!(db.with(|conn| set_active(conn, Some("nope"))).is_err());
        db.with(|conn| remove(conn, &profile.id)).unwrap();
        let accounts = db.with(|conn| load(conn)).unwrap();
        assert!(accounts.profiles.is_empty());
        assert_eq!(accounts.active, None, "the active profile went with it");
        assert!(dir.is_dir(), "the folder is not OpenVibe's to delete");
        db.with(|conn| set_active(conn, None)).unwrap();
    }
}
