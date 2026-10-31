//! The project's notes (spec notes §3): plain Markdown in `.openvibe/notes/`, so
//! that agents can simply read them. Only names arrive here, never paths, and
//! the studio's confinement does the rest.

use crate::tr;
use std::collections::BTreeSet;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;

use crate::db::projects::{self, Project};
use crate::error::{AppError, AppResult};
use crate::studio::{self, OpenedFile, WriteOutcome};

/// Beyond these, the search, the links and the graph would freeze the interface.
pub const MAX_NOTES: usize = 1000;
pub const MAX_TOTAL_BYTES: u64 = 32 * 1024 * 1024;
pub const MAX_NAME_CHARS: usize = 120;

const NOTES_FOLDER: &str = ".openvibe/notes";
const EXTENSION: &str = ".md";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub name: String,
    pub text: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteList {
    pub notes: Vec<Note>,
    /// Notes left out: unreadable, or past the limits.
    pub skipped: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentNote {
    pub name: String,
    /// Attached to the caller's group, or for an orchestrator to its agents' groups.
    pub attached: bool,
}

/// Characters that a Windows file name or a `[[link]]` cannot hold.
const FORBIDDEN: [char; 13] = [
    '/', '\\', ':', '*', '?', '"', '<', '>', '|', '[', ']', '#', '^',
];

/// A note's name must make both a file name and a `[[link]]`.
pub fn is_valid_name(name: &str) -> bool {
    name.chars().count() <= MAX_NAME_CHARS
        && studio::is_plain_name(name)
        && !name.starts_with('.')
        && !name.contains(FORBIDDEN)
        && !name.contains(char::is_control)
}

fn note_file(name: &str) -> Result<String, String> {
    if !is_valid_name(name) {
        return Err(tr!(
            "nom de note refusé : {name}",
            "note name refused: {name}"
        ));
    }
    Ok(format!("{name}{EXTENSION}"))
}

/// The notes folder, which may not exist yet, and never outside the project:
/// a `.openvibe` or `notes` link that leaves it is refused.
fn notes_root(project: &Path, create: bool) -> Result<PathBuf, String> {
    let root = studio::resolve(project, NOTES_FOLDER)?;
    if !create {
        return Ok(root);
    }
    std::fs::create_dir_all(&root).map_err(|err| err.to_string())?;
    // The folders may have appeared between the check and their creation.
    let real = std::fs::canonicalize(&root).map_err(|err| err.to_string())?;
    let base = std::fs::canonicalize(project).map_err(|err| err.to_string())?;
    if !real.starts_with(&base) {
        return Err(tr!(
            "chemin refusé : {NOTES_FOLDER}",
            "path refused: {NOTES_FOLDER}"
        ));
    }
    Ok(real)
}

/// Names of the folder's notes, in the list's order, and how many cannot be notes.
fn candidates(root: &Path) -> Result<(Vec<String>, u32), String> {
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok((Vec::new(), 0)),
        Err(err) => return Err(err.to_string()),
    };
    let mut names = Vec::new();
    let mut skipped = 0;
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str().and_then(|n| n.strip_suffix(EXTENSION)) else {
            continue;
        };
        // A folder is no note; a link is left for the studio's read to refuse.
        if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            continue;
        }
        if is_valid_name(name) {
            names.push(name.to_string());
        } else {
            skipped += 1;
        }
    }
    names.sort_by_key(|name| (name.to_lowercase(), name.clone()));
    Ok((names, skipped))
}

fn all_within(project: &Path, max_notes: usize, max_bytes: u64) -> Result<NoteList, String> {
    let root = notes_root(project, false)?;
    let (names, mut skipped) = candidates(&root)?;
    let mut notes = Vec::new();
    let mut total = 0;
    for (index, name) in names.iter().enumerate() {
        let left = (names.len() - index) as u32;
        if notes.len() == max_notes {
            skipped += left;
            break;
        }
        let Ok(OpenedFile { text, version }) = studio::read(&root, &format!("{name}{EXTENSION}"))
        else {
            skipped += 1;
            continue;
        };
        total += text.len() as u64;
        if total > max_bytes {
            skipped += left;
            break;
        }
        notes.push(Note {
            name: name.clone(),
            text,
            version,
        });
    }
    Ok(NoteList { notes, skipped })
}

/// Every note of the project, within the limits. Reading creates nothing.
pub fn all(project: &Path) -> Result<NoteList, String> {
    all_within(project, MAX_NOTES, MAX_TOTAL_BYTES)
}

pub fn read(project: &Path, name: &str) -> Result<OpenedFile, String> {
    let file = note_file(name)?;
    let root = notes_root(project, false)?;
    if !root.is_dir() {
        return Err(tr!("note introuvable : {name}", "note not found: {name}"));
    }
    studio::read(&root, &file)
}

/// The note's version on the disk; None when it does not exist.
pub fn version(project: &Path, name: &str) -> Result<Option<String>, String> {
    let file = note_file(name)?;
    let root = notes_root(project, false)?;
    if !root.is_dir() {
        return Ok(None);
    }
    studio::version(&root, &file)
}

/// Writes the note if the disk still holds `expected` (None: no note yet).
pub fn write(
    project: &Path,
    name: &str,
    text: &str,
    expected: Option<&str>,
) -> Result<WriteOutcome, String> {
    let file = note_file(name)?;
    let root = notes_root(project, true)?;
    studio::write(&root, &file, text, expected)
}

/// The notes on the frame of a node's group; a scene is the interface's JSON, so
/// whatever is malformed means no notes rather than an error.
pub fn attached_in_scene(elements_json: &str, node_id: &str) -> Vec<String> {
    let Ok(Value::Array(elements)) = serde_json::from_str::<Value>(elements_json) else {
        return Vec::new();
    };
    let by_id = |id: &str| {
        elements
            .iter()
            .find(|e| e["id"].as_str() == Some(id) && e["isDeleted"] != Value::Bool(true))
    };
    let Some(frame) = by_id(node_id)
        .and_then(|node| node["frameId"].as_str())
        .and_then(by_id)
        .filter(|frame| frame["type"].as_str() == Some("frame"))
    else {
        return Vec::new();
    };
    frame["customData"]["openvibe"]["notes"]
        .as_array()
        .map(|notes| {
            notes
                .iter()
                .filter_map(Value::as_str)
                .filter(|name| is_valid_name(name))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// The project a node's workspace belongs to.
pub fn project_of_node(conn: &Connection, node_id: &str) -> AppResult<Project> {
    let project_id: Option<String> = conn
        .query_row(
            "SELECT w.project_id FROM nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE n.id = ?1",
            [node_id],
            |row| row.get(0),
        )
        .optional()?;
    let project_id = project_id.ok_or_else(|| {
        AppError::NotFound(tr!(
            "nœud introuvable : {node_id}",
            "node not found: {node_id}"
        ))
    })?;
    projects::get(conn, &project_id)
}

/// The notes of a node's group, from its workspace's saved scene.
pub fn attached_of_node(conn: &Connection, node_id: &str) -> AppResult<Vec<String>> {
    let elements: Option<String> = conn
        .query_row(
            "SELECT s.elements_json FROM nodes n JOIN scenes s ON s.workspace_id = n.workspace_id WHERE n.id = ?1",
            [node_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(elements
        .map(|json| attached_in_scene(&json, node_id))
        .unwrap_or_default())
}

/// The project's notes for an agent, from their names alone: nothing is read.
/// A note that cannot be read says so when asked for; what is attached but gone
/// is not listed.
pub fn for_agent(project: &Path, attached: &[String]) -> Result<Vec<AgentNote>, String> {
    let root = notes_root(project, false)?;
    let wanted: BTreeSet<String> = attached.iter().map(|name| name.to_lowercase()).collect();
    let (names, _) = candidates(&root)?;
    Ok(names
        .into_iter()
        // A link is no note: `candidates` leaves it for a read to refuse, and there is none here.
        .filter(|name| {
            root.join(format!("{name}{EXTENSION}"))
                .symlink_metadata()
                .is_ok_and(|meta| meta.is_file())
        })
        .take(MAX_NOTES)
        .map(|name| AgentNote {
            attached: wanted.contains(&name.to_lowercase()),
            name,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    use std::process::Command;

    use serde_json::json;
    use tempfile::TempDir;

    use super::*;
    use crate::db::nodes::{self, NodeKind};
    use crate::db::{Db, scenes, test_workspace};

    fn notes_of(project: &Path) -> PathBuf {
        project.join(".openvibe").join("notes")
    }

    fn project(notes: &[(&str, &[u8])]) -> TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(notes_of(dir.path())).unwrap();
        for (name, bytes) in notes {
            std::fs::write(notes_of(dir.path()).join(name), bytes).unwrap();
        }
        dir
    }

    /// A junction needs no privilege, unlike a symbolic link: these tests always run.
    #[cfg(windows)]
    fn junction(link: &Path, target: &Path) {
        let done = Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .output()
            .unwrap();
        assert!(done.status.success(), "{done:?}");
    }

    fn names(list: &NoteList) -> Vec<&str> {
        list.notes.iter().map(|n| n.name.as_str()).collect()
    }

    #[test]
    fn a_name_is_a_valid_file_name_and_a_valid_link() {
        for name in [
            "architecture",
            "Décisions 2026",
            "a.b",
            "v1-notes_x",
            "é",
            "note (1)",
            &"x".repeat(MAX_NAME_CHARS),
        ] {
            assert!(is_valid_name(name), "{name}");
        }
        for name in [
            "",
            ".hidden",
            "..",
            ".",
            "a/b",
            "a\\b",
            "../up",
            "..\\up",
            "c:evil",
            "a*b",
            "a?b",
            "a\"b",
            "a<b",
            "a>b",
            "a|b",
            "a[b",
            "a]b",
            "a#b",
            "a^b",
            "a\tb",
            "a\nb",
            "a\u{7f}b",
            "NUL",
            "con",
            "COM1",
            "trailing.",
            "trailing ",
            &"x".repeat(MAX_NAME_CHARS + 1),
        ] {
            assert!(!is_valid_name(name), "{name:?}");
        }
    }

    #[test]
    fn counts_the_length_of_a_name_in_characters() {
        assert!(is_valid_name(&"é".repeat(MAX_NAME_CHARS)));
        assert!(!is_valid_name(&"é".repeat(MAX_NAME_CHARS + 1)));
    }

    #[test]
    fn a_refused_name_touches_nothing() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["../escape", "a/b", "a#b", ""] {
            assert!(write(dir.path(), name, "x", None).is_err(), "{name}");
            assert!(read(dir.path(), name).is_err(), "{name}");
            assert!(version(dir.path(), name).is_err(), "{name}");
        }
        assert!(!dir.path().join(".openvibe").exists());
        assert!(!dir.path().join("escape.md").exists());
    }

    #[test]
    fn writes_a_note_as_a_plain_markdown_file() {
        let dir = tempfile::tempdir().unwrap();
        let WriteOutcome::Saved { version: saved } =
            write(dir.path(), "plan", "# Plan\r\n", None).unwrap()
        else {
            panic!("a conflict was not expected");
        };
        assert_eq!(
            std::fs::read(notes_of(dir.path()).join("plan.md")).unwrap(),
            b"# Plan\r\n"
        );
        assert_eq!(version(dir.path(), "plan").unwrap(), Some(saved.clone()));
        let opened = read(dir.path(), "plan").unwrap();
        assert_eq!(
            (opened.text.as_str(), opened.version),
            ("# Plan\r\n", saved)
        );
    }

    #[test]
    fn never_writes_over_what_changed_on_the_disk() {
        let dir = project(&[("plan.md", b"agent")]);
        let outcome = write(dir.path(), "plan", "mine", Some("old")).unwrap();
        let disk = version(dir.path(), "plan").unwrap();
        assert_eq!(outcome, WriteOutcome::Conflict { disk: disk.clone() });
        assert_eq!(
            write(dir.path(), "plan", "mine", None).unwrap(),
            WriteOutcome::Conflict { disk }
        );
        assert_eq!(
            std::fs::read(notes_of(dir.path()).join("plan.md")).unwrap(),
            b"agent"
        );
    }

    #[test]
    fn reading_creates_nothing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            all(dir.path()).unwrap(),
            NoteList {
                notes: Vec::new(),
                skipped: 0
            }
        );
        assert_eq!(version(dir.path(), "plan").unwrap(), None);
        let refused = crate::i18n::in_english(|| read(dir.path(), "plan").unwrap_err());
        assert_eq!(refused, "note not found: plan");
        assert!(!dir.path().join(".openvibe").exists());
    }

    #[test]
    fn a_missing_note_in_an_existing_folder_is_not_found() {
        let dir = project(&[]);
        assert!(read(dir.path(), "plan").is_err());
        assert_eq!(version(dir.path(), "plan").unwrap(), None);
    }

    #[test]
    fn lists_the_notes_in_name_order_and_only_them() {
        let dir = project(&[
            ("zeta.md", b"z"),
            ("Alpha.md", b"a"),
            ("beta.md", b"b"),
            ("image.png", b"x"),
            ("notes.txt", b"x"),
            ("UPPER.MD", b"x"),
        ]);
        std::fs::create_dir(notes_of(dir.path()).join("folder.md")).unwrap();
        let list = all(dir.path()).unwrap();
        assert_eq!(names(&list), ["Alpha", "beta", "zeta"]);
        assert_eq!(list.skipped, 0);
        assert_eq!(list.notes[0].text, "a");
        assert_eq!(
            list.notes[0].version,
            version(dir.path(), "Alpha").unwrap().unwrap()
        );
    }

    #[test]
    fn counts_what_it_cannot_show() {
        let big = vec![b'x'; studio::MAX_BYTES as usize + 1];
        let dir = project(&[
            ("good.md", b"x"),
            ("binary.md", b"a\0b"),
            ("latin.md", &[0xE9]),
            ("big.md", &big),
            ("bad#name.md", b"x"),
        ]);
        let list = all(dir.path()).unwrap();
        assert_eq!(names(&list), ["good"]);
        assert_eq!(list.skipped, 4);
    }

    #[test]
    fn stops_at_the_number_of_notes() {
        let dir = project(&[
            ("a.md", b"1"),
            ("b.md", b"2"),
            ("c.md", b"3"),
            ("d.md", b"4"),
        ]);
        let list = all_within(dir.path(), 2, MAX_TOTAL_BYTES).unwrap();
        assert_eq!(names(&list), ["a", "b"]);
        assert_eq!(list.skipped, 2);
    }

    #[test]
    fn stops_at_the_total_size() {
        let dir = project(&[
            ("a.md", b"123"),
            ("b.md", b"456"),
            ("c.md", b"7"),
            ("d.md", b"8"),
        ]);
        let list = all_within(dir.path(), MAX_NOTES, 5).unwrap();
        assert_eq!(names(&list), ["a"]);
        assert_eq!(list.skipped, 3);
    }

    #[cfg(windows)]
    #[test]
    fn refuses_a_notes_folder_that_leaves_the_project() {
        for link_at_parent in [true, false] {
            let outside = tempfile::tempdir().unwrap();
            std::fs::write(outside.path().join("secret.md"), "secret").unwrap();
            let dir = tempfile::tempdir().unwrap();
            if link_at_parent {
                std::fs::create_dir(outside.path().join("notes")).unwrap();
                std::fs::write(outside.path().join("notes").join("secret.md"), "secret").unwrap();
                junction(&dir.path().join(".openvibe"), outside.path());
            } else {
                std::fs::create_dir(dir.path().join(".openvibe")).unwrap();
                junction(&notes_of(dir.path()), outside.path());
            }
            assert!(all(dir.path()).is_err());
            assert!(read(dir.path(), "secret").is_err());
            assert!(version(dir.path(), "secret").is_err());
            assert!(write(dir.path(), "new", "x", None).is_err());
            assert!(!outside.path().join("new.md").exists());
            assert!(!outside.path().join("notes").join("new.md").exists());
        }
    }

    #[cfg(windows)]
    #[test]
    fn refuses_a_note_that_is_a_junction() {
        let outside = tempfile::tempdir().unwrap();
        let dir = project(&[("good.md", b"x")]);
        junction(&notes_of(dir.path()).join("link.md"), outside.path());
        let list = all(dir.path()).unwrap();
        assert_eq!(names(&list), ["good"]);
        assert_eq!(list.skipped, 1);
        assert!(read(dir.path(), "link").is_err());
        assert!(write(dir.path(), "link", "x", None).is_err());
    }

    fn scene(elements: Value) -> String {
        elements.to_string()
    }

    #[test]
    fn finds_the_notes_of_a_node_s_group() {
        let json = scene(json!([
            { "id": "f", "type": "frame", "customData": { "openvibe": { "kind": "group", "notes": ["plan", "archi"] } } },
            { "id": "n", "type": "embeddable", "frameId": "f" },
        ]));
        assert_eq!(attached_in_scene(&json, "n"), ["plan", "archi"]);
    }

    #[test]
    fn a_node_outside_a_group_has_no_notes() {
        let json = scene(json!([
            { "id": "f", "type": "frame", "customData": { "openvibe": { "notes": ["plan"] } } },
            { "id": "free", "type": "embeddable", "frameId": null },
        ]));
        assert!(attached_in_scene(&json, "free").is_empty());
        assert!(attached_in_scene(&json, "unknown").is_empty());
    }

    #[test]
    fn ignores_deleted_elements() {
        let frame_gone = scene(json!([
            { "id": "f", "type": "frame", "isDeleted": true, "customData": { "openvibe": { "notes": ["plan"] } } },
            { "id": "n", "frameId": "f" },
        ]));
        assert!(attached_in_scene(&frame_gone, "n").is_empty());
        let node_gone = scene(json!([
            { "id": "f", "type": "frame", "customData": { "openvibe": { "notes": ["plan"] } } },
            { "id": "n", "frameId": "f", "isDeleted": true },
        ]));
        assert!(attached_in_scene(&node_gone, "n").is_empty());
    }

    #[test]
    fn only_a_frame_carries_notes() {
        let json = scene(json!([
            { "id": "f", "type": "rectangle", "customData": { "openvibe": { "notes": ["plan"] } } },
            { "id": "n", "frameId": "f" },
        ]));
        assert!(attached_in_scene(&json, "n").is_empty());
    }

    #[test]
    fn keeps_only_valid_names_and_survives_anything_malformed() {
        let json = scene(json!([
            { "id": "f", "type": "frame", "customData": { "openvibe": { "notes": ["plan", 3, null, "../up", "a/b", ""] } } },
            { "id": "n", "frameId": "f" },
        ]));
        assert_eq!(attached_in_scene(&json, "n"), ["plan"]);
        for broken in [
            "",
            "not json",
            "{}",
            "null",
            "[1, 2]",
            r#"[{"id":"f","type":"frame","customData":{"openvibe":{"notes":"plan"}}},{"id":"n","frameId":"f"}]"#,
            r#"[{"id":"f","type":"frame","customData":3},{"id":"n","frameId":"f"}]"#,
            r#"[{"id":"n","frameId":7}]"#,
        ] {
            assert!(attached_in_scene(broken, "n").is_empty(), "{broken}");
        }
    }

    fn database() -> (Db, String) {
        let db = Db::open_in_memory().unwrap();
        let workspace = db.with(|conn| test_workspace(conn, "w")).unwrap().id;
        (db, workspace)
    }

    #[test]
    fn finds_a_node_s_project_through_its_workspace() {
        let (db, workspace) = database();
        db.with(|conn| {
            nodes::save(conn, "n", &workspace, NodeKind::Terminal, "{}")?;
            assert_eq!(project_of_node(conn, "n")?.path, "C:/openvibe-tests");
            assert!(matches!(
                project_of_node(conn, "unknown"),
                Err(AppError::NotFound(_))
            ));
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn reads_the_attached_notes_in_the_saved_scene() {
        let (db, workspace) = database();
        let elements = scene(json!([
            { "id": "f", "type": "frame", "customData": { "openvibe": { "notes": ["plan"] } } },
            { "id": "n", "frameId": "f" },
        ]));
        db.with(|conn| {
            nodes::save(conn, "n", &workspace, NodeKind::Terminal, "{}")?;
            assert!(attached_of_node(conn, "n")?.is_empty());
            scenes::save(conn, &workspace, &elements, "{}", &["n".to_string()])?;
            assert_eq!(attached_of_node(conn, "n")?, ["plan"]);
            assert!(attached_of_node(conn, "unknown")?.is_empty());
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn tells_an_agent_which_notes_are_attached() {
        let dir = project(&[("Plan.md", b"x"), ("other.md", b"y")]);
        let attached = ["plan".to_string(), "gone".to_string()];
        assert_eq!(
            for_agent(dir.path(), &attached).unwrap(),
            [
                AgentNote {
                    name: "other".into(),
                    attached: false
                },
                AgentNote {
                    name: "Plan".into(),
                    attached: true
                },
            ]
        );
    }

    /// `all` leaves such a note out because it reads it; a list of names never opens it.
    #[test]
    fn an_agent_s_list_reads_no_note() {
        let big = vec![b'x'; studio::MAX_BYTES as usize + 1];
        let dir = project(&[("big.md", &big), ("binary.md", b"\0"), ("plain.md", b"x")]);
        let names: Vec<String> = for_agent(dir.path(), &[])
            .unwrap()
            .into_iter()
            .map(|note| note.name)
            .collect();
        assert_eq!(names, ["big", "binary", "plain"]);
    }

    #[test]
    fn an_agent_s_list_stops_at_the_limit_and_creates_nothing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(for_agent(dir.path(), &[]).unwrap(), []);
        assert!(!notes_of(dir.path()).exists());
        std::fs::create_dir_all(notes_of(dir.path())).unwrap();
        for i in 0..MAX_NOTES + 2 {
            std::fs::write(notes_of(dir.path()).join(format!("n{i}.md")), "x").unwrap();
        }
        assert_eq!(for_agent(dir.path(), &[]).unwrap().len(), MAX_NOTES);
    }

    #[cfg(windows)]
    #[test]
    fn an_agent_s_list_leaves_a_junction_out() {
        let outside = tempfile::tempdir().unwrap();
        let dir = project(&[("good.md", b"x")]);
        junction(&notes_of(dir.path()).join("link.md"), outside.path());
        let names: Vec<String> = for_agent(dir.path(), &[])
            .unwrap()
            .into_iter()
            .map(|note| note.name)
            .collect();
        assert_eq!(names, ["good"]);
    }

    #[test]
    fn serializes_for_the_interface() {
        let list = NoteList {
            notes: vec![Note {
                name: "a".into(),
                text: "t".into(),
                version: "v".into(),
            }],
            skipped: 1,
        };
        assert_eq!(
            serde_json::to_value(list).unwrap(),
            json!({ "notes": [{ "name": "a", "text": "t", "version": "v" }], "skipped": 1 })
        );
    }
}
