//! Code Studio (issue #49): the files of a project folder, read and written
//! from the interface. Nothing outside the project is ever read or written.

use crate::review::{self, MAX_BYTES, MAX_FILES};
use crate::tr;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// Folders the fallback walk never enters (a project without git).
const SKIPPED: [&str; 3] = [".git", "node_modules", "target"];
const MAX_DEPTH: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TreeEntry {
    /// From the project folder, with `/`.
    pub path: String,
    /// `file` or `dir`.
    pub kind: &'static str,
}

fn entry(path: &str, kind: &'static str) -> TreeEntry {
    TreeEntry {
        path: path.to_string(),
        kind,
    }
}

/// The files of a git repository (ignored ones left out) as entries, folders included.
fn git_tree(project: &Path) -> Option<Vec<TreeEntry>> {
    let listed = review::git(
        project,
        &["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    )
    .ok()?;
    let files: BTreeSet<&str> = listed.split('\0').filter(|p| !p.is_empty()).collect();
    let mut dirs = BTreeSet::new();
    for file in &files {
        for (at, _) in file.match_indices('/') {
            dirs.insert(&file[..at]);
        }
    }
    let mut entries: Vec<TreeEntry> = dirs
        .into_iter()
        .map(|d| entry(d, "dir"))
        .chain(files.into_iter().map(|f| entry(f, "file")))
        .collect();
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    entries.truncate(MAX_FILES);
    Some(entries)
}

/// A bounded walk, links not followed.
fn walk(dir: &Path, prefix: &str, depth: usize, out: &mut Vec<TreeEntry>) {
    if depth > MAX_DEPTH {
        return;
    }
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    for item in read.flatten() {
        if out.len() >= MAX_FILES {
            return;
        }
        let name = item.file_name().to_string_lossy().into_owned();
        let Ok(kind) = item.file_type() else { continue };
        let path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        if kind.is_dir() {
            if SKIPPED.contains(&name.as_str()) {
                continue;
            }
            out.push(entry(&path, "dir"));
            walk(&item.path(), &path, depth + 1, out);
        } else if kind.is_file() {
            out.push(entry(&path, "file"));
        }
    }
}

/// The project's tree: git's view of it (`.gitignore` respected), else a bounded walk.
pub fn tree(project: &Path) -> Result<Vec<TreeEntry>, String> {
    if !project.is_dir() {
        let shown = project.display();
        return Err(tr!("dossier introuvable : {shown}", "folder not found: {shown}"));
    }
    if let Some(entries) = git_tree(project) {
        return Ok(entries);
    }
    let mut entries = Vec::new();
    walk(project, "", 0, &mut entries);
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}

/// A text file of the project, whole; a binary or too big one is refused.
pub fn read(project: &Path, path: &str) -> Result<String, String> {
    let real = review::inside(project, path)?;
    let meta = std::fs::metadata(&real).map_err(|err| err.to_string())?;
    if !meta.is_file() {
        return Err(tr!("pas un fichier : {path}", "not a file: {path}"));
    }
    if meta.len() > MAX_BYTES as u64 {
        let size = meta.len();
        return Err(tr!(
            "fichier trop gros : {path} ({size} octets, maximum {MAX_BYTES})",
            "file too big: {path} ({size} bytes, maximum {MAX_BYTES})"
        ));
    }
    let bytes = std::fs::read(&real).map_err(|err| err.to_string())?;
    if review::is_binary(&bytes) {
        return Err(tr!(
            "fichier binaire : {path}",
            "binary file: {path}"
        ));
    }
    String::from_utf8(bytes)
        .map_err(|_| tr!("fichier non UTF-8 : {path}", "file is not UTF-8: {path}"))
}

/// Where `path` lands in the project, existing or not: the deepest existing
/// ancestor is resolved (links included) and must be inside the project.
fn target(project: &Path, path: &str) -> Result<(PathBuf, PathBuf), String> {
    let refused = || tr!("chemin refusé : {path}", "path refused: {path}");
    let rel = review::relative(path)?;
    let base = std::fs::canonicalize(project).map_err(|err| err.to_string())?;
    let wanted = base.join(rel);
    // A link, even a dangling one, is never written through blindly: resolve it.
    let mut existing = wanted.as_path();
    let mut missing = Vec::new();
    while std::fs::symlink_metadata(existing).is_err() {
        let (Some(name), Some(parent)) = (existing.file_name(), existing.parent()) else {
            return Err(refused());
        };
        missing.push(name.to_owned());
        existing = parent;
    }
    let mut real = std::fs::canonicalize(existing).map_err(|_| refused())?;
    if !real.starts_with(&base) {
        return Err(refused());
    }
    real.extend(missing.iter().rev());
    Ok((base, real))
}

/// Writes a file of the project; its missing folders are created, inside it.
pub fn write(project: &Path, path: &str, content: &str) -> Result<(), String> {
    let (base, real) = target(project, path)?;
    if real.is_dir() {
        return Err(tr!("c'est un dossier : {path}", "is a folder: {path}"));
    }
    if let Some(parent) = real.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        // Checked again once it exists: nothing moved it out meanwhile.
        let parent = std::fs::canonicalize(parent).map_err(|err| err.to_string())?;
        if !parent.starts_with(&base) {
            return Err(tr!("chemin refusé : {path}", "path refused: {path}"));
        }
    }
    std::fs::write(&real, content).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn paths(entries: &[TreeEntry]) -> Vec<(&str, &str)> {
        entries.iter().map(|e| (e.path.as_str(), e.kind)).collect()
    }

    /// A project folder inside a parent holding a `secret.txt` next to it.
    fn project() -> (tempfile::TempDir, PathBuf) {
        let outer = tempfile::tempdir().unwrap();
        let dir = outer.path().join("proj");
        std::fs::create_dir(&dir).unwrap();
        std::fs::write(outer.path().join("secret.txt"), "secret\n").unwrap();
        (outer, dir)
    }

    #[test]
    fn walks_a_folder_without_git_skipping_the_heavy_ones() {
        let (_outer, dir) = project();
        for skipped in [".git", "node_modules", "target"] {
            std::fs::create_dir(dir.join(skipped)).unwrap();
            std::fs::write(dir.join(skipped).join("x"), "x").unwrap();
        }
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::write(dir.join("src").join("a.ts"), "a").unwrap();
        std::fs::write(dir.join("b.md"), "b").unwrap();
        let got = tree(&dir).unwrap();
        assert_eq!(
            paths(&got),
            [("b.md", "file"), ("src", "dir"), ("src/a.ts", "file")]
        );
    }

    #[test]
    fn lists_a_git_repository_without_its_ignored_files() {
        if Command::new("git").arg("--version").output().is_err() {
            return;
        }
        let (_outer, dir) = project();
        let init = Command::new("git")
            .arg("-C")
            .arg(&dir)
            .args(["init", "-q"])
            .output()
            .unwrap();
        assert!(init.status.success());
        std::fs::write(dir.join(".gitignore"), "dist/\n").unwrap();
        std::fs::create_dir_all(dir.join("dist")).unwrap();
        std::fs::write(dir.join("dist").join("o.js"), "o").unwrap();
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::write(dir.join("src").join("a.ts"), "a").unwrap();
        let got = tree(&dir).unwrap();
        assert_eq!(
            paths(&got),
            [
                (".gitignore", "file"),
                ("src", "dir"),
                ("src/a.ts", "file")
            ]
        );
    }

    #[test]
    fn reads_text_and_refuses_binary_or_too_big_files() {
        let (_outer, dir) = project();
        std::fs::write(dir.join("a.txt"), "salut\n").unwrap();
        std::fs::write(dir.join("img.bin"), [0u8, 1, 2]).unwrap();
        std::fs::write(dir.join("big.txt"), "x".repeat(MAX_BYTES + 1)).unwrap();
        assert_eq!(read(&dir, "a.txt").unwrap(), "salut\n");
        assert!(read(&dir, "img.bin").unwrap_err().contains("binaire")
            || read(&dir, "img.bin").unwrap_err().contains("binary"));
        let big = read(&dir, "big.txt").unwrap_err();
        assert!(big.contains("trop gros") || big.contains("too big"), "{big}");
        assert!(read(&dir, "missing.txt").is_err());
    }

    #[test]
    fn writes_inside_the_project_creating_folders() {
        let (_outer, dir) = project();
        write(&dir, "new/deep/f.txt", "ok").unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join("new/deep/f.txt")).unwrap(),
            "ok"
        );
        write(&dir, "new/deep/f.txt", "again").unwrap();
        assert_eq!(read(&dir, "new/deep/f.txt").unwrap(), "again");
        assert!(write(&dir, "new", "x").is_err(), "a folder is not a file");
    }

    #[test]
    fn never_reads_or_writes_outside_the_project() {
        let (outer, dir) = project();
        let secret = outer.path().join("secret.txt");
        let absolute = secret.to_string_lossy().into_owned();
        for bad in ["../secret.txt", "a/../../secret.txt", absolute.as_str(), "/etc/passwd", ""] {
            assert!(read(&dir, bad).is_err(), "read {bad}");
            assert!(write(&dir, bad, "pwn").is_err(), "write {bad}");
        }
        // A file that does not exist yet, beyond `..`.
        assert!(write(&dir, "../new.txt", "pwn").is_err());
        assert!(write(&dir, "x/../../new.txt", "pwn").is_err());
        assert!(!outer.path().join("new.txt").exists());
        assert_eq!(std::fs::read_to_string(&secret).unwrap(), "secret\n");
    }

    /// Links need rights on Windows: the test is skipped where they cannot be made.
    fn link_dir(from: &Path, to: &Path) -> bool {
        #[cfg(unix)]
        return std::os::unix::fs::symlink(from, to).is_ok();
        #[cfg(windows)]
        return std::os::windows::fs::symlink_dir(from, to).is_ok();
    }

    fn link_file(from: &Path, to: &Path) -> bool {
        #[cfg(unix)]
        return std::os::unix::fs::symlink(from, to).is_ok();
        #[cfg(windows)]
        return std::os::windows::fs::symlink_file(from, to).is_ok();
    }

    #[test]
    fn never_follows_a_link_out_of_the_project() {
        let (outer, dir) = project();
        let secret = outer.path().join("secret.txt");
        if !link_file(&secret, &dir.join("leak.txt")) {
            return;
        }
        assert!(read(&dir, "leak.txt").is_err());
        assert!(write(&dir, "leak.txt", "pwn").is_err());
        assert_eq!(std::fs::read_to_string(&secret).unwrap(), "secret\n");

        // A folder link: a file that does not exist yet beneath it.
        if link_dir(outer.path(), &dir.join("up")) {
            assert!(read(&dir, "up/secret.txt").is_err());
            assert!(write(&dir, "up/created.txt", "pwn").is_err());
            assert!(write(&dir, "up/sub/created.txt", "pwn").is_err());
            assert!(!outer.path().join("created.txt").exists());
            assert!(!outer.path().join("sub").exists());
        }
        // A dangling link to a file outside.
        let missing = outer.path().join("later.txt");
        if link_file(&missing, &dir.join("dangling.txt")) {
            assert!(write(&dir, "dangling.txt", "pwn").is_err());
            assert!(!missing.exists());
        }
    }
}
