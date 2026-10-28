//! What an agent changed, for the review panel (spec maj §5): its files
//! against a base, each file's diff, and the files of its folder, read-only.

use crate::tr;
use std::collections::{BTreeSet, HashMap};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};

use crate::process::hide_window;

/// A diff or a file bigger than this is cut: the panel shows the start.
pub const MAX_BYTES: usize = 1024 * 1024;
/// The changes and files listed at most: a folder of thousands of untracked
/// files (an `npm install` without `.gitignore`) must not freeze the panel.
pub const MAX_ENTRIES: usize = 5000;
pub const MAX_FILES: usize = 50_000;
/// git's empty tree: the base of a repository without commits.
const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    /// The path before a rename.
    pub old_path: Option<String>,
    /// added, modified, deleted, renamed, untracked.
    pub status: String,
    /// None for a binary file.
    pub added: Option<u32>,
    pub removed: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Changes {
    /// What the files are compared with: `HEAD`, or the commit where the base forked.
    pub compared: String,
    pub files: Vec<ChangedFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileText {
    /// None for a binary file.
    pub text: Option<String>,
    pub size: u64,
    /// Only its first `MAX_BYTES` are read.
    pub truncated: bool,
}

fn command(dir: &Path, args: &[&str]) -> Command {
    let mut command = Command::new("git");
    command
        .arg("--no-optional-locks")
        .args(["-c", "core.quotePath=false"])
        .arg("-C")
        .arg(dir)
        .args(args);
    hide_window(&mut command);
    command
}

fn run(dir: &Path, args: &[&str], codes: &[i32]) -> Result<String, String> {
    let output = command(dir, args)
        .output()
        .map_err(|err| tr!("git introuvable : {err}", "git not found: {err}"))?;
    if output
        .status
        .code()
        .is_some_and(|code| codes.contains(&code))
    {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

pub(crate) fn git(dir: &Path, args: &[&str]) -> Result<String, String> {
    run(dir, args, &[0])
}

/// A diff read up to `MAX_BYTES`, then cut: a huge file is never read whole.
fn diff_output(dir: &Path, args: &[&str], codes: &[i32]) -> Result<String, String> {
    let mut child = command(dir, args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| tr!("git introuvable : {err}", "git not found: {err}"))?;
    let mut bytes = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        stdout
            .take(MAX_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|err| err.to_string())?;
    }
    let cut = bytes.len() > MAX_BYTES;
    if cut {
        let _ = child.kill();
        let _ = child.wait();
        bytes.truncate(MAX_BYTES);
        let mut text = String::from_utf8_lossy(&bytes).into_owned();
        // A cut in the middle of a character leaves a replacement character: drop it.
        if text.ends_with('\u{FFFD}') {
            text.pop();
        }
        text.push_str("\n[diff tronqué]\n");
        return Ok(text);
    }
    let mut stderr = String::new();
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut stderr);
    }
    let status = child.wait().map_err(|err| err.to_string())?;
    if status.code().is_some_and(|code| codes.contains(&code)) {
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    } else {
        Err(stderr.trim().to_string())
    }
}

/// A path from the repository's root, as the interface gives it: never
/// absolute, never with `..`, so it cannot name a file outside the repository.
pub(crate) fn relative(path: &str) -> Result<&Path, String> {
    let rel = Path::new(path);
    if path.is_empty()
        || rel.is_absolute()
        || rel.components().any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(tr!("chemin refusé : {path}", "path refused: {path}"));
    }
    Ok(rel)
}

/// An existing file of `root`, its real path checked to be inside (links included).
pub(crate) fn inside(root: &Path, path: &str) -> Result<PathBuf, String> {
    let rel = relative(path)?;
    let base = std::fs::canonicalize(root).map_err(|err| err.to_string())?;
    let real = std::fs::canonicalize(base.join(rel))
        .map_err(|_| tr!("fichier introuvable : {path}", "file not found: {path}"))?;
    if !real.starts_with(&base) {
        return Err(tr!("chemin refusé : {path}", "path refused: {path}"));
    }
    Ok(real)
}

/// The first `MAX_BYTES` of a file, whatever its size.
fn read_start(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(MAX_BYTES as u64 + 1)
        .read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// A ref given by the interface: never an option for git.
fn checked_ref(name: &str) -> Result<&str, String> {
    if name.is_empty()
        || name.starts_with('-')
        || name.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err(tr!("base invalide : {name}", "invalid base: {name}"));
    }
    Ok(name)
}

/// The commit the work is compared with: where `base` and HEAD forked, else HEAD,
/// else (no commit yet) the empty tree.
fn compared(dir: &Path, base: Option<&str>) -> Result<String, String> {
    if let Some(base) = base {
        let base = checked_ref(base)?;
        return git(dir, &["merge-base", base, "HEAD"])
            .map(|sha| sha.trim().to_string())
            .map_err(|_| tr!("base introuvable : {base}", "base not found: {base}"));
    }
    if git(dir, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_ok() {
        Ok("HEAD".into())
    } else {
        Ok(EMPTY_TREE.into())
    }
}

/// `git diff --name-status -z`: a status, then one path, or two for a rename or copy.
pub fn parse_name_status(output: &str) -> Vec<(String, Option<String>, String)> {
    let mut tokens = output.split('\0').filter(|t| !t.is_empty());
    let mut entries = Vec::new();
    while let Some(code) = tokens.next() {
        let kind = code.chars().next().unwrap_or('M');
        let first = tokens.next().unwrap_or_default().to_string();
        let (path, old) = if matches!(kind, 'R' | 'C') {
            (tokens.next().unwrap_or_default().to_string(), Some(first))
        } else {
            (first, None)
        };
        let status = match kind {
            'A' => "added",
            'D' => "deleted",
            'R' => "renamed",
            'C' => "added",
            _ => "modified",
        };
        entries.push((path, old, status.to_string()));
    }
    entries
}

/// `git diff --numstat -z`: lines added and removed per new path; `-` for a binary file.
pub fn parse_numstat(output: &str) -> HashMap<String, (Option<u32>, Option<u32>)> {
    let mut counts = HashMap::new();
    let mut tokens = output.split('\0');
    while let Some(token) = tokens.next() {
        let mut fields = token.splitn(3, '\t');
        let (Some(added), Some(removed), Some(path)) =
            (fields.next(), fields.next(), fields.next())
        else {
            continue;
        };
        // A rename leaves the path empty, then gives the old and the new one.
        let path = if path.is_empty() {
            let _old = tokens.next();
            tokens.next().unwrap_or_default().to_string()
        } else {
            path.to_string()
        };
        counts.insert(path, (added.parse().ok(), removed.parse().ok()));
    }
    counts
}

pub(crate) fn is_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8000).any(|b| *b == 0)
}

/// The changes of the folder's repository against `base` (or HEAD): committed
/// and not, untracked files included.
pub fn changes(dir: &Path, base: Option<&str>) -> Result<Changes, String> {
    let from = compared(dir, base)?;
    let names = git(
        dir,
        &["diff", "--no-ext-diff", "--name-status", "-z", "-M", &from],
    )?;
    let counts = parse_numstat(&git(
        dir,
        &["diff", "--no-ext-diff", "--numstat", "-z", "-M", &from],
    )?);
    let mut files: Vec<ChangedFile> = parse_name_status(&names)
        .into_iter()
        .map(|(path, old_path, status)| {
            let (added, removed) = counts.get(&path).copied().unwrap_or((None, None));
            ChangedFile {
                path,
                old_path,
                status,
                added,
                removed,
            }
        })
        .collect();
    // From the root: run in a subfolder, ls-files lists that folder only.
    let root = root(dir)?;
    let untracked = git(&root, &["ls-files", "--others", "--exclude-standard", "-z"])?;
    for path in untracked
        .split('\0')
        .filter(|p| !p.is_empty())
        .take(MAX_ENTRIES)
    {
        let full = root.join(path);
        // Lines are counted below `MAX_BYTES` only; a bigger file shows none.
        let small =
            std::fs::metadata(&full).is_ok_and(|m| m.is_file() && m.len() <= MAX_BYTES as u64);
        let bytes = if small {
            read_start(&full).unwrap_or_default()
        } else {
            Vec::new()
        };
        let lines = (small && !is_binary(&bytes))
            .then(|| String::from_utf8_lossy(&bytes).lines().count() as u32);
        files.push(ChangedFile {
            path: path.to_string(),
            old_path: None,
            status: "untracked".into(),
            added: lines,
            removed: lines.map(|_| 0),
        });
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    files.truncate(MAX_ENTRIES);
    Ok(Changes {
        compared: from,
        files,
    })
}

/// One file's unified diff against `base` (or HEAD); an untracked file against nothing.
pub fn file_diff(dir: &Path, file: &ChangedFile, base: Option<&str>) -> Result<String, String> {
    // The interface names the file: it must be one of the repository's (final review maj §5).
    relative(&file.path)?;
    if let Some(old) = file.old_path.as_deref() {
        relative(old)?;
    }
    let root = root(dir)?;
    if file.status == "untracked" {
        inside(&root, &file.path)?;
        // `--no-index` answers 1 when the files differ.
        return diff_output(
            &root,
            &[
                "diff",
                "--no-color",
                "--no-ext-diff",
                "--no-index",
                "--",
                "/dev/null",
                &file.path,
            ],
            &[0, 1],
        );
    }
    let from = compared(dir, base)?;
    let mut args = vec![
        "diff",
        "--no-color",
        "--no-ext-diff",
        "-M",
        from.as_str(),
        "--",
    ];
    if let Some(old) = file.old_path.as_deref() {
        args.push(old);
    }
    args.push(&file.path);
    diff_output(&root, &args, &[0])
}

/// The files of the repository, tracked or not, but not ignored ones; paths from its root.
pub fn files(dir: &Path) -> Result<Vec<String>, String> {
    // From the root: run in a subfolder, ls-files lists that folder only.
    let listed = git(
        &root(dir)?,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ],
    )?;
    let unique: BTreeSet<&str> = listed.split('\0').filter(|p| !p.is_empty()).collect();
    Ok(unique
        .into_iter()
        .take(MAX_FILES)
        .map(str::to_string)
        .collect())
}

/// The repository's root folder.
pub fn root(dir: &Path) -> Result<PathBuf, String> {
    Ok(PathBuf::from(
        git(dir, &["rev-parse", "--show-toplevel"])?.trim(),
    ))
}

/// A file of `root`, never outside it; its first `MAX_BYTES` only.
pub fn read_file(root: &Path, file: &str) -> Result<FileText, String> {
    let path = inside(root, file)?;
    let size = std::fs::metadata(&path)
        .map_err(|err| err.to_string())?
        .len();
    let mut bytes = read_start(&path).map_err(|err| err.to_string())?;
    let truncated = bytes.len() > MAX_BYTES;
    bytes.truncate(MAX_BYTES);
    let text = (!is_binary(&bytes)).then(|| String::from_utf8_lossy(&bytes).into_owned());
    Ok(FileText {
        text,
        size,
        truncated,
    })
}

/// The branch the work is compared with by default: the remote's default
/// branch, else `main` or `master`.
pub fn default_base(dir: &Path) -> Option<String> {
    if let Ok(remote) = git(
        dir,
        &[
            "symbolic-ref",
            "--quiet",
            "--short",
            "refs/remotes/origin/HEAD",
        ],
    ) {
        let remote = remote.trim();
        if !remote.is_empty() {
            return Some(remote.to_string());
        }
    }
    ["main", "master"]
        .into_iter()
        .find(|branch| {
            git(
                dir,
                &[
                    "rev-parse",
                    "--verify",
                    "--quiet",
                    &format!("refs/heads/{branch}"),
                ],
            )
            .is_ok()
        })
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sh(dir: &Path, args: &[&str]) {
        let out = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    /// A repository with `a.txt` committed on `main`.
    fn repo() -> Option<tempfile::TempDir> {
        if Command::new("git").arg("--version").output().is_err() {
            return None; // git is not installed on this machine
        }
        let dir = tempfile::tempdir().unwrap();
        sh(dir.path(), &["init", "-q", "-b", "main"]);
        for (key, value) in [
            ("user.name", "t"),
            ("user.email", "t@t"),
            ("commit.gpgsign", "false"),
            ("core.autocrlf", "false"),
        ] {
            sh(dir.path(), &["config", key, value]);
        }
        std::fs::write(dir.path().join("a.txt"), "un\ndeux\n").unwrap();
        sh(dir.path(), &["add", "a.txt"]);
        sh(dir.path(), &["commit", "-q", "-m", "init"]);
        Some(dir)
    }

    #[test]
    fn parses_name_status_and_numstat_renames_included() {
        let names = parse_name_status("M\0src/a.ts\0R087\0old.ts\0new.ts\0D\0gone.ts\0A\0é t.md\0");
        assert_eq!(
            names,
            vec![
                ("src/a.ts".into(), None, "modified".into()),
                ("new.ts".into(), Some("old.ts".into()), "renamed".into()),
                ("gone.ts".into(), None, "deleted".into()),
                ("é t.md".into(), None, "added".into()),
            ]
        );
        let counts =
            parse_numstat("3\t1\tsrc/a.ts\x002\t2\t\x00old.ts\x00new.ts\x00-\t-\timg.png\x00");
        assert_eq!(counts["src/a.ts"], (Some(3), Some(1)));
        assert_eq!(counts["new.ts"], (Some(2), Some(2)));
        assert_eq!(counts["img.png"], (None, None));
    }

    #[test]
    fn lists_the_changes_against_head_or_where_a_branch_forked() {
        let Some(repo) = repo() else { return };
        let dir = repo.path();
        std::fs::write(dir.join("a.txt"), "un\ntrois\n").unwrap();
        std::fs::write(dir.join("b.txt"), "nouveau\n").unwrap();
        let now = changes(dir, None).unwrap();
        assert_eq!(now.compared, "HEAD");
        assert_eq!(
            now.files,
            vec![
                ChangedFile {
                    path: "a.txt".into(),
                    old_path: None,
                    status: "modified".into(),
                    added: Some(1),
                    removed: Some(1)
                },
                ChangedFile {
                    path: "b.txt".into(),
                    old_path: None,
                    status: "untracked".into(),
                    added: Some(1),
                    removed: Some(0)
                },
            ]
        );
        // Committed on a branch: still the agent's work against where it forked from main.
        sh(dir, &["checkout", "-q", "-b", "agent"]);
        sh(dir, &["add", "-A"]);
        sh(dir, &["commit", "-q", "-m", "work"]);
        assert!(changes(dir, None).unwrap().files.is_empty());
        let forked = changes(dir, Some("main")).unwrap();
        assert_eq!(
            forked
                .files
                .iter()
                .map(|f| f.path.as_str())
                .collect::<Vec<_>>(),
            ["a.txt", "b.txt"]
        );
        assert_eq!(forked.files[1].status, "added");
        assert!(changes(dir, Some("--output=x")).is_err());
        assert!(
            changes(dir, Some("nope"))
                .unwrap_err()
                .contains("base introuvable")
        );
    }

    #[test]
    fn gives_a_file_s_diff_an_untracked_one_included() {
        let Some(repo) = repo() else { return };
        let dir = repo.path();
        std::fs::write(dir.join("a.txt"), "un\ntrois\n").unwrap();
        std::fs::write(dir.join("b.txt"), "nouveau\n").unwrap();
        let files = changes(dir, None).unwrap().files;
        let a = file_diff(dir, &files[0], None).unwrap();
        assert!(a.contains("-deux") && a.contains("+trois"), "{a}");
        let b = file_diff(dir, &files[1], None).unwrap();
        assert!(b.contains("+nouveau"), "{b}");
    }

    #[test]
    fn reads_the_repository_s_files_but_nothing_outside_it() {
        let Some(repo) = repo() else { return };
        let dir = repo.path();
        std::fs::write(dir.join(".gitignore"), "target/\n").unwrap();
        std::fs::create_dir(dir.join("target")).unwrap();
        std::fs::write(dir.join("target").join("out.bin"), [0u8, 1, 2]).unwrap();
        std::fs::write(dir.join("img.bin"), [0u8, 1, 2]).unwrap();
        assert_eq!(files(dir).unwrap(), [".gitignore", "a.txt", "img.bin"]);
        let read = read_file(dir, "a.txt").unwrap();
        assert_eq!(
            read,
            FileText {
                text: Some("un\ndeux\n".into()),
                size: 8,
                truncated: false
            }
        );
        assert_eq!(read_file(dir, "img.bin").unwrap().text, None);
        assert!(read_file(dir, "../secret").is_err());
        assert!(read_file(dir, "C:/Windows/win.ini").is_err());
        assert!(read_file(dir, "/etc/passwd").is_err());
    }

    fn untracked(path: &str) -> ChangedFile {
        ChangedFile {
            path: path.into(),
            old_path: None,
            status: "untracked".into(),
            added: None,
            removed: None,
        }
    }

    #[test]
    fn never_diffs_a_file_outside_the_repository() {
        let Some(repo) = repo() else { return };
        let dir = repo.path();
        let outside = dir.parent().unwrap().join(format!(
            "{}-outside.txt",
            dir.file_name().unwrap().to_string_lossy()
        ));
        std::fs::write(&outside, "secret\n").unwrap();
        let name = format!("../{}", outside.file_name().unwrap().to_string_lossy());
        assert!(file_diff(dir, &untracked(&name), None).is_err());
        assert!(file_diff(dir, &untracked(&outside.to_string_lossy()), None).is_err());
        let renamed = ChangedFile {
            old_path: Some(name.clone()),
            status: "renamed".into(),
            ..untracked("a.txt")
        };
        assert!(file_diff(dir, &renamed, None).is_err());
        std::fs::remove_file(outside).unwrap();
    }

    #[test]
    fn sees_the_whole_repository_from_a_subfolder() {
        let Some(repo) = repo() else { return };
        let dir = repo.path();
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::create_dir_all(dir.join("other")).unwrap();
        std::fs::write(dir.join("sub").join("s.txt"), "s\n").unwrap();
        std::fs::write(dir.join("other").join("new.txt"), "n\n").unwrap();
        let from_sub = dir.join("sub");
        let listed: Vec<String> = changes(&from_sub, None)
            .unwrap()
            .files
            .into_iter()
            .map(|f| f.path)
            .collect();
        assert_eq!(listed, ["other/new.txt", "sub/s.txt"]);
        assert_eq!(
            files(&from_sub).unwrap(),
            ["a.txt", "other/new.txt", "sub/s.txt"]
        );
    }

    #[test]
    fn ignores_the_user_s_external_diff_tool() {
        let Some(repo) = repo() else { return };
        let dir = repo.path();
        sh(dir, &["config", "diff.external", "echo autre-outil"]);
        std::fs::write(dir.join("a.txt"), "un\ntrois\n").unwrap();
        let file = changes(dir, None).unwrap().files.remove(0);
        let diff = file_diff(dir, &file, None).unwrap();
        assert!(diff.contains("+trois"), "{diff}");
    }

    #[test]
    fn reads_no_more_than_its_limit_of_a_big_file() {
        let Some(repo) = repo() else { return };
        let dir = repo.path();
        std::fs::write(dir.join("big.txt"), "x\n".repeat(MAX_BYTES)).unwrap();
        let big = changes(dir, None)
            .unwrap()
            .files
            .into_iter()
            .find(|f| f.path == "big.txt")
            .unwrap();
        assert_eq!((big.added, big.status.as_str()), (None, "untracked"));
        let read = read_file(dir, "big.txt").unwrap();
        assert!(read.truncated && read.text.unwrap().len() <= MAX_BYTES);
        assert_eq!(read.size, 2 * MAX_BYTES as u64);
        let diff = file_diff(dir, &big, None).unwrap();
        assert!(diff.len() <= MAX_BYTES + 32 && diff.ends_with("[diff tronqué]\n"));
    }

    #[test]
    fn finds_the_default_branch_to_compare_with() {
        let Some(repo) = repo() else { return };
        assert_eq!(default_base(repo.path()).as_deref(), Some("main"));
    }
}
