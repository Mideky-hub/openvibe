//! The git window (spec fenêtre git): what the project's repository holds, and
//! what the user does to it by hand: commit, discard one file, push.

use crate::tr;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use serde::Serialize;

use crate::git;
use crate::review::{self, ChangedFile};

/// The commits the history shows at most.
pub const MAX_LOG: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoState {
    pub branch: String,
    /// `origin/main`; None without an upstream.
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    /// What a push would reach (`origin/main`); None when it cannot.
    pub push_to: Option<String>,
    /// Why it cannot: `noRemote`, `manyRemotes`, `detached`, `noCommit`.
    pub no_push: Option<String>,
    pub files: Vec<ChangedFile>,
    /// `files` stops at `review::MAX_ENTRIES`.
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    /// Seconds since the epoch.
    pub date: i64,
    pub subject: String,
}

/// Writes change the repository: unlike `review::command`, no optional lock is
/// skipped, a path is never a pattern (spec fenêtre git §2.4), and git never
/// waits for an answer nobody can type.
fn command(root: &Path, args: &[&str]) -> Command {
    let mut command = review::command(root, &["--literal-pathspecs"]);
    command.args(args).env("GIT_TERMINAL_PROMPT", "0");
    command.stdin(Stdio::null());
    command
}

/// What git says went wrong: on stderr, but "nothing to commit" comes on stdout.
fn failure(output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let text = if stderr.trim().is_empty() {
        String::from_utf8_lossy(&output.stdout)
    } else {
        stderr
    };
    text.trim().to_string()
}

fn run(root: &Path, args: &[&str]) -> Result<String, String> {
    let output = command(root, args)
        .output()
        .map_err(|err| tr!("git introuvable : {err}", "git not found: {err}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(failure(&output))
    }
}

/// `args` with the paths on stdin: Windows limits a command line to 32 000 characters.
fn run_on_paths(root: &Path, args: &[&str], paths: &[&str]) -> Result<(), String> {
    let mut child = command(root, args)
        .args(["--pathspec-from-file=-", "--pathspec-file-nul"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| tr!("git introuvable : {err}", "git not found: {err}"))?;
    let list: Vec<u8> = paths
        .iter()
        .flat_map(|path| path.bytes().chain([0]))
        .collect();
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(&list).map_err(|err| err.to_string())?;
    }
    let output = child.wait_with_output().map_err(|err| err.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(failure(&output))
    }
}

/// `git rev-list --left-right --count upstream...HEAD`: behind, then ahead.
fn parse_counts(output: &str) -> (u32, u32) {
    let mut counts = output.split_whitespace().map(|n| n.parse().unwrap_or(0));
    let behind = counts.next().unwrap_or(0);
    (behind, counts.next().unwrap_or(0))
}

/// The remote a branch without upstream goes to: `origin`, or the only one.
fn push_remote(remotes: &str) -> Result<String, &'static str> {
    let names: Vec<&str> = remotes
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    match names.as_slice() {
        [] => Err("noRemote"),
        [only] => Ok((*only).to_string()),
        many if many.contains(&"origin") => Ok("origin".into()),
        _ => Err("manyRemotes"),
    }
}

/// The upstream, and where a push would go or why it cannot.
fn push_target(root: &Path, branch: &str) -> (Option<String>, Result<String, &'static str>) {
    if branch == "HEAD" {
        return (None, Err("detached"));
    }
    if run(root, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_err() {
        return (None, Err("noCommit"));
    }
    let upstream = run(
        root,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    )
    .ok()
    .map(|name| name.trim().to_string())
    .filter(|name| !name.is_empty());
    if let Some(upstream) = upstream {
        return (Some(upstream.clone()), Ok(upstream));
    }
    let target = run(root, &["remote"])
        .map_err(|_| "noRemote")
        .and_then(|remotes| push_remote(&remotes))
        .map(|remote| format!("{remote}/{branch}"));
    (None, target)
}

/// Everything the window shows but the history.
pub fn state(dir: &Path) -> Result<RepoState, String> {
    let root = review::root(dir)?;
    let branch = git::status(&root)
        .ok_or_else(|| tr!("pas un dépôt git", "not a git repository"))?
        .branch;
    let (upstream, target) = push_target(&root, &branch);
    let (behind, ahead) = match &upstream {
        Some(name) => run(
            &root,
            &[
                "rev-list",
                "--left-right",
                "--count",
                &format!("{name}...HEAD"),
            ],
        )
        .map(|counts| parse_counts(&counts))
        .unwrap_or((0, 0)),
        None => (0, 0),
    };
    let changes = review::changes(dir, None)?;
    Ok(RepoState {
        branch,
        upstream,
        ahead,
        behind,
        push_to: target.as_ref().ok().cloned(),
        no_push: target.err().map(str::to_string),
        files: changes.files,
        truncated: changes.truncated,
    })
}

/// Every path of the changes: a rename counts its two.
fn all_paths(files: &[ChangedFile]) -> Result<Vec<&str>, String> {
    let mut paths = Vec::new();
    for file in files {
        for path in std::iter::once(file.path.as_str()).chain(file.old_path.as_deref()) {
            review::relative(path)?;
            paths.push(path);
        }
    }
    Ok(paths)
}

/// Commits exactly `files`, whatever else is staged (spec fenêtre git §3.2); the new commit's short hash.
pub fn commit(dir: &Path, files: &[ChangedFile], message: &str) -> Result<String, String> {
    let message = message.trim();
    if message.is_empty() {
        return Err(tr!("le message est vide", "the message is empty"));
    }
    if files.is_empty() {
        return Err(tr!("aucun fichier choisi", "no file chosen"));
    }
    let root = review::root(dir)?;
    let paths = all_paths(files)?;
    let (present, gone): (Vec<&str>, Vec<&str>) = paths
        .iter()
        .partition(|path| root.join(path).symlink_metadata().is_ok());
    // A file gone from the disk may be gone from the index too, where `git add` would not find it.
    if !gone.is_empty() {
        run_on_paths(
            &root,
            &["rm", "--cached", "--quiet", "--ignore-unmatch"],
            &gone,
        )?;
    }
    if !present.is_empty() {
        run_on_paths(&root, &["add"], &present)?;
    }
    run_on_paths(
        &root,
        &["commit", "--quiet", "--only", "-m", message],
        &paths,
    )?;
    Ok(run(&root, &["rev-parse", "--short", "HEAD"])?
        .trim()
        .to_string())
}

/// Puts one file back as it was (spec fenêtre git §3.3), if it still is what the
/// user confirmed: an agent may have written to it since (§2.2).
pub fn discard(dir: &Path, file: &ChangedFile) -> Result<(), String> {
    let root = review::root(dir)?;
    let paths = all_paths(std::slice::from_ref(file))?;
    let current = review::changes(dir, None)?.files;
    if !current.contains(file) {
        let path = &file.path;
        return Err(tr!(
            "{path} a changé depuis la confirmation : rien n'a été touché.",
            "{path} changed since you confirmed: nothing was touched."
        ));
    }
    match file.status.as_str() {
        "untracked" => run(&root, &["clean", "--force", "--quiet", "--", &file.path]).map(|_| ()),
        "added" => run(&root, &["rm", "--force", "--quiet", "--", &file.path]).map(|_| ()),
        _ => run_on_paths(
            &root,
            &["restore", "--source=HEAD", "--staged", "--worktree"],
            &paths,
        ),
    }
}

const SEPARATOR: char = '\u{1f}';

/// `git log` with `%H %h %an %at %s` separated by `SEPARATOR`, one commit a line.
fn parse_log(output: &str) -> Vec<LogEntry> {
    output
        .lines()
        .filter_map(|line| {
            let mut fields = line.splitn(5, SEPARATOR);
            Some(LogEntry {
                hash: fields.next()?.to_string(),
                short_hash: fields.next()?.to_string(),
                author: fields.next()?.to_string(),
                date: fields.next()?.parse().ok()?,
                subject: fields.next()?.to_string(),
            })
        })
        .collect()
}

/// The branch's last commits; none in a repository without a commit.
pub fn history(dir: &Path) -> Result<Vec<LogEntry>, String> {
    let root = review::root(dir)?;
    if run(&root, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_err() {
        return Ok(Vec::new());
    }
    let format = format!("--format=%H{SEPARATOR}%h{SEPARATOR}%an{SEPARATOR}%at{SEPARATOR}%s");
    let count = format!("--max-count={MAX_LOG}");
    Ok(parse_log(&run(&root, &["log", &count, &format])?))
}

/// Only ever called by the window's Push button (spec fenêtre git §2.3); never with `--force`.
pub fn push(dir: &Path) -> Result<(), String> {
    let root = review::root(dir)?;
    let branch = git::status(&root)
        .ok_or_else(|| tr!("pas un dépôt git", "not a git repository"))?
        .branch;
    let (upstream, target) = push_target(&root, &branch);
    let Ok(target) = target else {
        return Err(tr!("rien vers où pousser", "nowhere to push to"));
    };
    if upstream.is_some() {
        return run(&root, &["push", "--quiet"]).map(|_| ());
    }
    let remote = target.split('/').next().unwrap_or_default();
    run(
        &root,
        &["push", "--quiet", "--set-upstream", remote, "HEAD"],
    )
    .map(|_| ())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;

    use super::*;

    fn raw(dir: &Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .expect("git is installed");
        assert!(output.status.success(), "git {args:?}: {output:?}");
        String::from_utf8_lossy(&output.stdout).into_owned()
    }

    /// A temporary repository without remote, one commit in, its identity its own.
    fn repo() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        raw(&root, &["init", "-q", "-b", "main"]);
        raw(&root, &["config", "user.name", "Test"]);
        raw(&root, &["config", "user.email", "t@t"]);
        raw(&root, &["config", "commit.gpgsign", "false"]);
        raw(&root, &["config", "core.autocrlf", "false"]);
        fs::write(root.join("a.txt"), "one\n").unwrap();
        raw(&root, &["add", "a.txt"]);
        raw(&root, &["commit", "-q", "-m", "first"]);
        (dir, root)
    }

    fn file(root: &Path, path: &str) -> ChangedFile {
        state(root)
            .unwrap()
            .files
            .into_iter()
            .find(|f| f.path == path)
            .unwrap_or_else(|| panic!("{path} is not changed"))
    }

    fn committed(root: &Path) -> String {
        raw(root, &["show", "--pretty=", "--name-status", "HEAD"])
    }

    #[test]
    fn reads_the_branch_and_the_changes() {
        let (_dir, root) = repo();
        fs::write(root.join("a.txt"), "one\ntwo\n").unwrap();
        fs::write(root.join("new.txt"), "x\n").unwrap();
        let read = state(&root).unwrap();
        assert_eq!(read.branch, "main");
        assert_eq!(read.upstream, None);
        assert_eq!(read.no_push.as_deref(), Some("noRemote"));
        assert_eq!(read.push_to, None);
        assert!(!read.truncated);
        let found: Vec<_> = read
            .files
            .iter()
            .map(|f| (f.path.as_str(), f.status.as_str(), f.added, f.removed))
            .collect();
        assert_eq!(
            found,
            vec![
                ("a.txt", "modified", Some(1), Some(0)),
                ("new.txt", "untracked", Some(1), Some(0))
            ]
        );
    }

    #[test]
    fn refuses_a_folder_outside_a_repository() {
        let dir = tempfile::tempdir().unwrap();
        assert!(state(dir.path()).is_err());
    }

    #[test]
    fn commits_only_the_chosen_files_even_when_others_are_staged() {
        let (_dir, root) = repo();
        fs::write(root.join("a.txt"), "changed\n").unwrap();
        fs::write(root.join("b.txt"), "b\n").unwrap();
        fs::write(root.join("c.txt"), "c\n").unwrap();
        raw(&root, &["add", "c.txt"]);
        let chosen = vec![file(&root, "a.txt"), file(&root, "b.txt")];
        let hash = commit(&root, &chosen, "  two files  ").unwrap();
        assert!(!hash.is_empty());
        assert_eq!(
            raw(&root, &["log", "-1", "--format=%s"]).trim(),
            "two files"
        );
        assert_eq!(committed(&root), "M\ta.txt\nA\tb.txt\n");
        // c.txt was left as it was: staged, and not committed.
        assert_eq!(raw(&root, &["status", "--porcelain"]), "A  c.txt\n");
    }

    #[test]
    fn commits_a_deletion_staged_or_not_and_a_rename() {
        let (_dir, root) = repo();
        fs::write(root.join("b.txt"), "b\n").unwrap();
        fs::write(root.join("c.txt"), "some content to be renamed\n").unwrap();
        raw(&root, &["add", "."]);
        raw(&root, &["commit", "-q", "-m", "more"]);
        fs::remove_file(root.join("a.txt")).unwrap();
        raw(&root, &["rm", "-q", "b.txt"]);
        raw(&root, &["mv", "c.txt", "d.txt"]);
        let chosen = state(&root).unwrap().files;
        assert_eq!(chosen.len(), 3);
        commit(&root, &chosen, "tidy").unwrap();
        assert_eq!(raw(&root, &["status", "--porcelain"]), "");
    }

    #[test]
    fn commits_the_first_commit_of_a_repository() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        raw(&root, &["init", "-q", "-b", "main"]);
        raw(&root, &["config", "user.name", "Test"]);
        raw(&root, &["config", "user.email", "t@t"]);
        raw(&root, &["config", "commit.gpgsign", "false"]);
        fs::write(root.join("a.txt"), "x\n").unwrap();
        assert_eq!(state(&root).unwrap().no_push.as_deref(), Some("noCommit"));
        assert_eq!(history(&root).unwrap(), Vec::new());
        commit(&root, &[file(&root, "a.txt")], "start").unwrap();
        assert_eq!(history(&root).unwrap()[0].subject, "start");
    }

    #[test]
    fn git_reads_a_path_as_a_name_never_as_a_pattern() {
        let (_dir, root) = repo();
        fs::write(root.join("b.txt"), "x\n").unwrap();
        // As a pattern, `[b].txt` would stage b.txt.
        assert!(run_on_paths(&root, &["add"], &["[b].txt"]).is_err());
        assert_eq!(raw(&root, &["status", "--porcelain"]), "?? b.txt\n");
    }

    /// git takes `[a].txt` for that file while it exists, and for a pattern
    /// matching `a.txt` once it is gone: the case that would hit the wrong file.
    fn brackets_gone_beside_a_changed_file() -> (tempfile::TempDir, PathBuf) {
        let (dir, root) = repo();
        fs::write(root.join("[a].txt"), "x\n").unwrap();
        raw(&root, &["add", "."]);
        raw(&root, &["commit", "-q", "-m", "brackets"]);
        fs::write(root.join("a.txt"), "changed\n").unwrap();
        fs::remove_file(root.join("[a].txt")).unwrap();
        (dir, root)
    }

    #[test]
    fn a_path_is_never_a_pattern_when_committing() {
        let (_dir, root) = brackets_gone_beside_a_changed_file();
        commit(&root, &[file(&root, "[a].txt")], "only the brackets").unwrap();
        assert_eq!(committed(&root), "D\t[a].txt\n");
        assert_eq!(raw(&root, &["status", "--porcelain"]), " M a.txt\n");
    }

    #[test]
    fn refuses_an_empty_commit_and_a_path_outside_the_repository() {
        let (_dir, root) = repo();
        fs::write(root.join("a.txt"), "changed\n").unwrap();
        let chosen = file(&root, "a.txt");
        assert!(commit(&root, std::slice::from_ref(&chosen), "   ").is_err());
        assert!(commit(&root, &[], "message").is_err());
        let outside = ChangedFile {
            path: "../evil.txt".into(),
            ..chosen
        };
        assert!(commit(&root, &[outside], "message").is_err());
        assert_eq!(raw(&root, &["log", "--format=%s"]).trim(), "first");
    }

    #[test]
    fn says_what_git_says_when_a_commit_fails() {
        let (_dir, root) = repo();
        fs::write(root.join("a.txt"), "changed\n").unwrap();
        let chosen = file(&root, "a.txt");
        fs::create_dir_all(root.join(".git/hooks")).unwrap();
        fs::write(
            root.join(".git/hooks/pre-commit"),
            "#!/bin/sh\necho no way >&2\nexit 1\n",
        )
        .unwrap();
        assert_eq!(commit(&root, &[chosen], "refused").unwrap_err(), "no way");
    }

    #[test]
    fn discards_a_modified_file_and_nothing_else() {
        let (_dir, root) = repo();
        fs::write(root.join("b.txt"), "b\n").unwrap();
        raw(&root, &["add", "b.txt"]);
        raw(&root, &["commit", "-q", "-m", "second"]);
        fs::write(root.join("a.txt"), "changed\n").unwrap();
        fs::write(root.join("b.txt"), "changed too\n").unwrap();
        discard(&root, &file(&root, "a.txt")).unwrap();
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "one\n");
        assert_eq!(
            fs::read_to_string(root.join("b.txt")).unwrap(),
            "changed too\n"
        );
    }

    #[test]
    fn discards_staged_changes_too_and_brings_a_deleted_file_back() {
        let (_dir, root) = repo();
        fs::write(root.join("a.txt"), "staged\n").unwrap();
        raw(&root, &["add", "a.txt"]);
        discard(&root, &file(&root, "a.txt")).unwrap();
        assert_eq!(raw(&root, &["status", "--porcelain"]), "");
        fs::remove_file(root.join("a.txt")).unwrap();
        discard(&root, &file(&root, "a.txt")).unwrap();
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "one\n");
    }

    #[test]
    fn discarding_an_untracked_or_added_file_deletes_only_it() {
        let (_dir, root) = repo();
        fs::create_dir(root.join("sub")).unwrap();
        fs::write(root.join("sub/new.txt"), "x\n").unwrap();
        fs::write(root.join("sub/other.txt"), "y\n").unwrap();
        fs::write(root.join("added.txt"), "z\n").unwrap();
        raw(&root, &["add", "added.txt"]);
        discard(&root, &file(&root, "sub/new.txt")).unwrap();
        discard(&root, &file(&root, "added.txt")).unwrap();
        assert!(!root.join("sub/new.txt").exists());
        assert!(!root.join("added.txt").exists());
        assert!(root.join("sub/other.txt").exists());
    }

    #[test]
    fn discarding_a_rename_gives_the_old_file_back() {
        let (_dir, root) = repo();
        fs::write(root.join("long.txt"), "some content to be renamed\n").unwrap();
        raw(&root, &["add", "."]);
        raw(&root, &["commit", "-q", "-m", "more"]);
        raw(&root, &["mv", "long.txt", "moved.txt"]);
        let renamed = file(&root, "moved.txt");
        assert_eq!(renamed.status, "renamed");
        discard(&root, &renamed).unwrap();
        assert!(root.join("long.txt").exists());
        assert!(!root.join("moved.txt").exists());
        assert_eq!(raw(&root, &["status", "--porcelain"]), "");
    }

    #[test]
    fn a_path_is_never_a_pattern_when_discarding() {
        let (_dir, root) = brackets_gone_beside_a_changed_file();
        // Staged, so that nothing named `[a].txt` is left for git to find but in HEAD.
        raw(&root, &["rm", "-q", "--cached", "[a].txt"]);
        discard(&root, &file(&root, "[a].txt")).unwrap();
        assert_eq!(fs::read_to_string(root.join("[a].txt")).unwrap(), "x\n");
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "changed\n");
    }

    #[test]
    fn refuses_to_discard_a_file_that_changed_since_the_confirmation() {
        let (_dir, root) = repo();
        fs::write(root.join("a.txt"), "seen by the user\n").unwrap();
        let confirmed = file(&root, "a.txt");
        fs::write(
            root.join("a.txt"),
            "seen by the user\nand an agent's line\n",
        )
        .unwrap();
        let error = discard(&root, &confirmed).unwrap_err();
        assert!(error.contains("a.txt"), "{error}");
        let kept = fs::read_to_string(root.join("a.txt")).unwrap();
        assert!(kept.contains("an agent's line"));
    }

    #[test]
    fn refuses_to_discard_what_is_not_a_change() {
        let (_dir, root) = repo();
        let invented = ChangedFile {
            path: "a.txt".into(),
            old_path: None,
            status: "modified".into(),
            added: Some(1),
            removed: Some(1),
        };
        assert!(discard(&root, &invented).is_err());
        let outside = ChangedFile {
            path: "../a.txt".into(),
            ..invented
        };
        assert!(discard(&root, &outside).is_err());
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "one\n");
    }

    #[test]
    fn lists_the_history_with_hash_author_and_date() {
        let (_dir, root) = repo();
        fs::write(root.join("a.txt"), "two\n").unwrap();
        commit(&root, &[file(&root, "a.txt")], "second | with a pipe").unwrap();
        let log = history(&root).unwrap();
        assert_eq!(log.len(), 2);
        assert_eq!(log[0].subject, "second | with a pipe");
        assert_eq!(log[0].author, "Test");
        assert!(log[0].date > 0);
        assert_eq!(log[0].hash.len(), 40);
        assert!(log[0].hash.starts_with(&log[0].short_hash));
    }

    #[test]
    fn limits_the_history() {
        let line = format!("h{SEPARATOR}s{SEPARATOR}a{SEPARATOR}1{SEPARATOR}x\nbroken\n");
        assert_eq!(parse_log(&line).len(), 1);
        assert_eq!(parse_counts("3\t2\n"), (3, 2));
        assert_eq!(parse_counts(""), (0, 0));
    }

    #[test]
    fn chooses_the_remote_of_a_branch_without_upstream() {
        assert_eq!(push_remote(""), Err("noRemote"));
        assert_eq!(push_remote("mine\n"), Ok("mine".into()));
        assert_eq!(push_remote("fork\norigin\n"), Ok("origin".into()));
        assert_eq!(push_remote("a\nb\n"), Err("manyRemotes"));
    }

    /// A local bare repository only: no test ever reaches a real remote.
    fn with_bare_remote(root: &Path) -> tempfile::TempDir {
        let bare = tempfile::tempdir().unwrap();
        raw(bare.path(), &["init", "-q", "--bare", "-b", "main"]);
        let url = bare.path().to_string_lossy().into_owned();
        raw(root, &["remote", "add", "origin", &url]);
        bare
    }

    #[test]
    fn pushes_to_a_local_bare_repository_setting_the_upstream_then_following_it() {
        let (_dir, root) = repo();
        let bare = with_bare_remote(&root);
        let first = state(&root).unwrap();
        assert_eq!(first.push_to.as_deref(), Some("origin/main"));
        assert_eq!(first.upstream, None);
        push(&root).unwrap();
        let tip = |dir: &Path| raw(dir, &["rev-parse", "main"]);
        assert_eq!(tip(bare.path()), tip(&root));
        assert_eq!(
            state(&root).unwrap().upstream.as_deref(),
            Some("origin/main")
        );

        fs::write(root.join("a.txt"), "two\n").unwrap();
        commit(&root, &[file(&root, "a.txt")], "second").unwrap();
        let ahead = state(&root).unwrap();
        assert_eq!((ahead.ahead, ahead.behind), (1, 0));
        push(&root).unwrap();
        assert_eq!(tip(bare.path()), tip(&root));
        assert_eq!(state(&root).unwrap().ahead, 0);
    }

    #[test]
    fn says_why_a_refused_push_failed_and_never_forces_it() {
        let (_dir, root) = repo();
        let bare = with_bare_remote(&root);
        push(&root).unwrap();
        fs::write(root.join("a.txt"), "two\n").unwrap();
        commit(&root, &[file(&root, "a.txt")], "local").unwrap();
        raw(&root, &["push", "-q"]);
        let published = raw(bare.path(), &["rev-parse", "main"]);
        raw(&root, &["reset", "-q", "--hard", "HEAD~1"]);
        fs::write(root.join("a.txt"), "other\n").unwrap();
        commit(&root, &[file(&root, "a.txt")], "diverged").unwrap();
        assert!(!push(&root).unwrap_err().is_empty());
        assert_eq!(raw(bare.path(), &["rev-parse", "main"]), published);
    }

    #[test]
    fn refuses_to_push_without_a_remote_or_on_a_detached_head() {
        let (_dir, root) = repo();
        assert!(push(&root).is_err());
        let bare = with_bare_remote(&root);
        raw(&root, &["checkout", "-q", "--detach"]);
        let read = state(&root).unwrap();
        assert_eq!(read.no_push.as_deref(), Some("detached"));
        assert!(push(&root).is_err());
        assert_eq!(raw(bare.path(), &["for-each-ref"]), "");
    }
}
