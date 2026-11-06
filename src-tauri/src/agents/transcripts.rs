//! Claude's saved conversations, checked before resuming one (spec première version §3.1),
//! and where Codex keeps its own.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::pty::shell::ClaudeMode;

/// Codex's folder (its conversations under `sessions/`): `$CODEX_HOME`, else `~/.codex`.
pub fn codex_home() -> Option<PathBuf> {
    codex_home_from(
        std::env::var_os("CODEX_HOME"),
        std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")),
    )
}

fn codex_home_from(codex_home: Option<OsString>, home: Option<OsString>) -> Option<PathBuf> {
    match codex_home {
        Some(dir) if !dir.is_empty() => Some(PathBuf::from(dir)),
        _ => home.map(|home| PathBuf::from(home).join(".codex")),
    }
}

/// Past this length Claude Code shortens a folder name with a hash.
const MAX_FOLDER_NAME: usize = 200;

/// The folder of `<config>/projects` where Claude Code keeps the conversations
/// started in `cwd`: every UTF-16 unit that is not an ASCII letter or digit
/// becomes `-`. `None` for a path too long to name without Claude's hash.
pub fn project_folder(cwd: &Path) -> Option<String> {
    let units: Vec<u16> = cwd.to_string_lossy().encode_utf16().collect();
    if units.len() > MAX_FOLDER_NAME {
        return None;
    }
    Some(
        units
            .iter()
            .map(|&unit| match char::from_u32(u32::from(unit)) {
                Some(c) if c.is_ascii_alphanumeric() => c,
                _ => '-',
            })
            .collect(),
    )
}

/// How to start Claude: resuming a conversation that was never saved (an agent
/// that never got a message) or continuing in a folder without any makes
/// Claude fail back to the bare shell, so both start a new conversation under
/// the same id instead. When it cannot tell, the mode is kept.
pub fn launch_mode(
    mode: ClaudeMode,
    session: &str,
    cwd: &Path,
    config: Option<&Path>,
) -> ClaudeMode {
    if mode == ClaudeMode::New {
        return mode;
    }
    let Some(Ok(entries)) = config.map(|config| std::fs::read_dir(config.join("projects"))) else {
        return mode;
    };
    let folders: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    let found = match mode {
        ClaudeMode::Resume => {
            let file = format!("{session}.jsonl");
            folders.iter().any(|folder| folder.join(&file).is_file())
        }
        _ => {
            let Some(name) = project_folder(cwd) else {
                return mode;
            };
            folders
                .iter()
                .filter(|folder| {
                    folder
                        .file_name()
                        .is_some_and(|folder| folder.to_string_lossy().eq_ignore_ascii_case(&name))
                })
                .any(|folder| holds_conversation(folder))
        }
    };
    if found { mode } else { ClaudeMode::New }
}

fn holds_conversation(folder: &Path) -> bool {
    std::fs::read_dir(folder).is_ok_and(|entries| {
        entries
            .filter_map(Result::ok)
            .any(|entry| entry.path().extension().is_some_and(|ext| ext == "jsonl"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pty::shell::ClaudeMode;
    use std::fs;
    use std::path::Path;

    const ID: &str = "0b9c4b5e-6f1a-4c39-9d2e-8f6c2d1a7e10";

    fn config_with(files: &[&str]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("projects")).unwrap();
        for file in files {
            let path = dir.path().join("projects").join(file);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, b"{}").unwrap();
        }
        dir
    }

    #[test]
    fn claude_names_a_project_folder_after_its_path() {
        assert_eq!(
            project_folder(Path::new(
                r"C:\Users\Spectrum\Documents\02_Code_Projects\openvibe"
            ))
            .as_deref(),
            Some("C--Users-Spectrum-Documents-02-Code-Projects-openvibe")
        );
        assert_eq!(
            project_folder(Path::new(r"C:\Dév\x")).as_deref(),
            Some("C--D-v-x")
        );
        assert_eq!(
            project_folder(&Path::new("C:\\").join("a".repeat(250))),
            None
        );
    }

    #[test]
    fn codex_keeps_its_logs_in_codex_home_else_in_the_home_folder() {
        assert_eq!(
            codex_home_from(Some(r"D:\codex".into()), Some(r"C:\Users\me".into())),
            Some(PathBuf::from(r"D:\codex"))
        );
        assert_eq!(
            codex_home_from(None, Some(r"C:\Users\me".into())),
            Some(Path::new(r"C:\Users\me").join(".codex"))
        );
        assert_eq!(
            codex_home_from(Some("".into()), Some(r"C:\Users\me".into())),
            Some(Path::new(r"C:\Users\me").join(".codex"))
        );
        assert_eq!(codex_home_from(None, None), None);
    }

    #[test]
    fn resumes_a_conversation_that_exists() {
        let config = config_with(&[&format!("C--code-app/{ID}.jsonl")]);
        let mode = launch_mode(
            ClaudeMode::Resume,
            ID,
            Path::new(r"C:\code\app"),
            Some(config.path()),
        );
        assert_eq!(mode, ClaudeMode::Resume);
    }

    #[test]
    fn starts_a_new_conversation_under_the_same_id_when_none_was_saved() {
        let config = config_with(&["C--code-app/other.jsonl"]);
        let mode = launch_mode(
            ClaudeMode::Resume,
            ID,
            Path::new(r"C:\code\app"),
            Some(config.path()),
        );
        assert_eq!(mode, ClaudeMode::New);
    }

    #[test]
    fn finds_a_conversation_saved_under_another_folder_case() {
        let config = config_with(&[&format!("c--code-app/{ID}.jsonl")]);
        let mode = launch_mode(
            ClaudeMode::Resume,
            ID,
            Path::new(r"C:\code\app"),
            Some(config.path()),
        );
        assert_eq!(mode, ClaudeMode::Resume);
    }

    #[test]
    fn continues_only_a_folder_that_has_a_conversation() {
        let config = config_with(&["C--code-app/x.jsonl", "c--code-lower/y.jsonl"]);
        let continued = |cwd: &str| {
            launch_mode(
                ClaudeMode::Continue,
                ID,
                Path::new(cwd),
                Some(config.path()),
            )
        };
        assert_eq!(continued(r"C:\code\app"), ClaudeMode::Continue);
        assert_eq!(continued(r"C:\code\lower"), ClaudeMode::Continue);
        assert_eq!(continued(r"C:\code\empty"), ClaudeMode::New);
    }

    #[test]
    fn keeps_the_mode_when_it_cannot_tell() {
        let app = Path::new(r"C:\code\app");
        assert_eq!(
            launch_mode(ClaudeMode::Resume, ID, app, None),
            ClaudeMode::Resume
        );
        let missing = Path::new(r"C:\no\such\config");
        assert_eq!(
            launch_mode(ClaudeMode::Resume, ID, app, Some(missing)),
            ClaudeMode::Resume
        );
        let long = Path::new("C:\\").join("a".repeat(250));
        let config = config_with(&[]);
        assert_eq!(
            launch_mode(ClaudeMode::Continue, ID, &long, Some(config.path())),
            ClaudeMode::Continue
        );
        assert_eq!(
            launch_mode(ClaudeMode::New, ID, app, Some(config.path())),
            ClaudeMode::New
        );
    }
}
