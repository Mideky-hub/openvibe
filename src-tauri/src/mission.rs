//! Worktrees and branches of a mission (spec orchestrateur §7.4, §7.6, §7.7).
//! OpenVibe works beside the user's folder, never in their branch: no push,
//! no force.

use crate::tr;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::process::hide_window;

/// A worktree OpenVibe made, on a branch of its own.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub slug: String,
    pub branch: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Merge {
    Merged,
    /// The agent's branch has no commit the mission's lacks.
    Empty,
    /// The merge was undone; these files conflicted.
    Conflict {
        files: Vec<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeReport {
    pub merge: Merge,
    /// The agent left changes uncommitted in its worktree: they are not merged.
    pub uncommitted: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cleanup {
    pub removed: Vec<String>,
    pub kept: Vec<String>,
}

const MAX_SLUG: usize = 40;

/// Latin letters with accents or macrons, as plain ASCII: "Athéna" → "athena", "Fūjin" → "fujin".
fn fold(c: char) -> Option<&'static str> {
    Some(match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'ā' => "a",
        'ç' => "c",
        'è' | 'é' | 'ê' | 'ë' | 'ē' => "e",
        'ì' | 'í' | 'î' | 'ï' | 'ī' => "i",
        'ñ' => "n",
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ō' => "o",
        'ù' | 'ú' | 'û' | 'ü' | 'ū' => "u",
        'ý' | 'ÿ' => "y",
        'œ' => "oe",
        'æ' => "ae",
        _ => return None,
    })
}

/// A name made safe for a branch and a folder: lowercase ASCII and dashes.
pub fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars().flat_map(char::to_lowercase) {
        if let Some(plain) = fold(c) {
            out.push_str(plain);
        } else if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let mut cut: String = out.chars().take(MAX_SLUG).collect();
    while cut.ends_with('-') {
        cut.pop();
    }
    if cut.is_empty() {
        "mission".into()
    } else {
        cut
    }
}

fn git(dir: &Path, args: &[&str]) -> Result<String, String> {
    let output = hide_window(Command::new("git").arg("-C").arg(dir).args(args))
        .output()
        .map_err(|err| tr!("git introuvable : {err}", "git not found: {err}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// The repository's root, and the folder of its worktrees: `<parent>/<folder>.worktrees`.
fn locate(project: &Path) -> Result<(PathBuf, PathBuf), String> {
    let root = git(project, &["rev-parse", "--show-toplevel"]).map_err(|_| {
        tr!(
            "Le dossier du projet n'est pas un dépôt git.",
            "The project folder is not a git repository."
        )
    })?;
    // git answers with forward slashes, even on Windows.
    let root = PathBuf::from(if cfg!(windows) {
        root.replace('/', "\\")
    } else {
        root
    });
    let name = root
        .file_name()
        .ok_or_else(|| {
            tr!(
                "Le dépôt n'a pas de nom de dossier.",
                "The repository has no folder name."
            )
        })?
        .to_string_lossy()
        .into_owned();
    let parent = root.parent().ok_or_else(|| {
        tr!(
            "Le dépôt n'a pas de dossier parent.",
            "The repository has no parent folder."
        )
    })?;
    let dir = parent.join(format!("{name}.worktrees"));
    Ok((root, dir))
}

fn add_worktree(root: &Path, dir: &Path, slug: &str, from: &str) -> Result<Worktree, String> {
    let branch = format!("openvibe/{slug}");
    if git(
        root,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("refs/heads/{branch}"),
        ],
    )
    .is_ok()
    {
        return Err(tr!(
            "La branche {branch} existe déjà.",
            "The branch {branch} already exists."
        ));
    }
    let path = dir.join(slug);
    if path.exists() {
        let shown = path.display();
        return Err(tr!(
            "Le dossier {shown} existe déjà.",
            "The folder {shown} already exists."
        ));
    }
    let shown = path.to_string_lossy().into_owned();
    git(root, &["worktree", "add", "-b", &branch, &shown, from])?;
    Ok(Worktree {
        slug: slug.into(),
        branch,
        path: shown,
    })
}

fn no_commit() -> String {
    tr!(
        "Le dépôt n'a pas encore de commit : fais un premier commit, puis relance la mission.",
        "The repository has no commit yet: make a first commit, then launch the mission again."
    )
}

/// The mission's branch, from the project's current commit, and its worktree (where merges happen).
pub fn prepare(project: &Path, name: &str) -> Result<Worktree, String> {
    let (root, dir) = locate(project)?;
    // Without a commit, git only says « invalid reference: HEAD » (final review H2).
    if git(&root, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_err() {
        return Err(no_commit());
    }
    add_worktree(&root, &dir, &slug(name), "HEAD")
}

/// An agent's branch, from the mission's, and its worktree. `mission` is the mission's slug.
pub fn add_agent(project: &Path, mission: &str, agent: &str) -> Result<Worktree, String> {
    let (root, dir) = locate(project)?;
    let name = format!("{mission}-{}", slug(agent));
    add_worktree(&root, &dir, &name, &format!("openvibe/{mission}"))
}

/// Merges an agent's branch into the mission's, in the mission's worktree; a conflict is undone.
pub fn merge_agent(mission: &Path, agent: &Path, branch: &str) -> Result<MergeReport, String> {
    let uncommitted = !git(agent, &["status", "--porcelain"])
        .unwrap_or_default()
        .is_empty();
    let ahead = git(
        mission,
        &["rev-list", "--count", &format!("HEAD..{branch}")],
    )?;
    if ahead == "0" {
        return Ok(MergeReport {
            merge: Merge::Empty,
            uncommitted,
        });
    }
    match git(mission, &["merge", "--no-ff", "--no-edit", branch]) {
        Ok(_) => Ok(MergeReport {
            merge: Merge::Merged,
            uncommitted,
        }),
        Err(err) => {
            let files: Vec<String> = git(mission, &["diff", "--name-only", "--diff-filter=U"])
                .unwrap_or_default()
                .lines()
                .map(str::to_string)
                .collect();
            if files.is_empty() {
                // A hook that refused the commit leaves the merge half done:
                // the next merges would all fail on it (final review H2).
                if git(mission, &["rev-parse", "-q", "--verify", "MERGE_HEAD"]).is_ok() {
                    let _ = git(mission, &["merge", "--abort"]);
                    return Err(tr!(
                        "La fusion de {branch} a échoué et a été annulée : {err}",
                        "Merging {branch} failed and was cancelled: {err}"
                    ));
                }
                return Err(err);
            }
            let _ = git(mission, &["merge", "--abort"]);
            Ok(MergeReport {
                merge: Merge::Conflict { files },
                uncommitted,
            })
        }
    }
}

/// Never forced: a worktree with uncommitted changes stays.
fn remove_worktree(root: &Path, name: String, path: &Path, done: &mut Cleanup) {
    match git(root, &["worktree", "remove", &path.to_string_lossy()]) {
        Ok(_) => done.removed.push(name),
        Err(err) => done.kept.push(kept_worktree(&name, &err)),
    }
}

/// Why `git worktree remove` left a worktree: its changes, or something else
/// (a folder locked by a process) that git's own message then names.
fn kept_worktree(name: &str, git_error: &str) -> String {
    if git_error.contains("modified or untracked files") {
        return tr!(
            "{name} (changements non commités)",
            "{name} (uncommitted changes)"
        );
    }
    let cause = git_error.lines().next().unwrap_or_default().trim();
    format!("{name} ({cause})")
}

/// Undoes a launch that failed (final review H2): its fresh worktrees and
/// branches go, newest first, so the plan can be launched again. Never
/// forced: a worktree with changes or a branch with commits stays.
pub fn discard(project: &Path, trees: &[Worktree]) -> Result<Cleanup, String> {
    let (root, _) = locate(project)?;
    let mut done = Cleanup::default();
    for tree in trees.iter().rev() {
        if Path::new(&tree.path).exists()
            && let Err(err) = git(&root, &["worktree", "remove", &tree.path])
        {
            done.kept.push(kept_worktree(&tree.slug, &err));
            continue;
        }
        match git(&root, &["branch", "-d", &tree.branch]) {
            Ok(_) => done.removed.push(tree.slug.clone()),
            Err(_) => {
                let branch = &tree.branch;
                done.kept.push(tr!(
                    "{branch} (branche non fusionnée)",
                    "{branch} (branch not merged)"
                ));
            }
        }
    }
    Ok(done)
}

/// Removes the worktrees whose branch is merged into the mission's, then the
/// mission's own when none is left; the branches stay for the user.
pub fn cleanup(project: &Path, mission: &str, agents: &[String]) -> Result<Cleanup, String> {
    let (root, dir) = locate(project)?;
    let merged = git(
        &root,
        &[
            "branch",
            "--format=%(refname:short)",
            "--merged",
            &format!("openvibe/{mission}"),
        ],
    )?;
    let merged: Vec<&str> = merged.lines().map(str::trim).collect();
    let mut done = Cleanup::default();
    for agent in agents {
        let name = format!("{mission}-{}", slug(agent));
        let path = dir.join(&name);
        if !path.exists() {
            continue;
        }
        if merged.contains(&format!("openvibe/{name}").as_str()) {
            remove_worktree(&root, name, &path, &mut done);
        } else {
            done.kept.push(tr!(
                "{name} (branche non fusionnée)",
                "{name} (branch not merged)"
            ));
        }
    }
    let path = dir.join(mission);
    if path.exists() && done.kept.is_empty() {
        remove_worktree(&root, mission.to_string(), &path, &mut done);
    }
    Ok(done)
}

#[cfg(test)]
mod tests {
    use std::process::Command;

    #[test]
    fn a_worktree_kept_for_another_reason_than_changes_says_so() {
        let changes = "fatal: 'x' contains modified or untracked files, use --force to delete it";
        assert_eq!(
            crate::i18n::in_english(|| super::kept_worktree("isis", changes)),
            "isis (uncommitted changes)"
        );
        let locked = "error: failed to delete 'C:/w/isis': Permission denied\nmore";
        assert_eq!(
            super::kept_worktree("isis", locked),
            "isis (error: failed to delete 'C:/w/isis': Permission denied)"
        );
    }

    use super::*;

    fn run(dir: &Path, args: &[&str]) -> String {
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
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    fn commit(dir: &Path, file: &str, content: &str, message: &str) {
        std::fs::write(dir.join(file), content).unwrap();
        run(dir, &["add", file]);
        run(dir, &["commit", "-q", "-m", message]);
    }

    /// A repository `proj` with one commit on `main`, inside a temporary parent folder.
    fn project() -> Option<(tempfile::TempDir, PathBuf)> {
        if Command::new("git").arg("--version").output().is_err() {
            return None; // git is not installed on this machine
        }
        let parent = tempfile::tempdir().unwrap();
        let proj = parent.path().join("proj");
        std::fs::create_dir(&proj).unwrap();
        run(&proj, &["init", "-q", "-b", "main"]);
        for (key, value) in [
            ("user.name", "t"),
            ("user.email", "t@t"),
            ("commit.gpgsign", "false"),
            ("core.autocrlf", "false"),
        ] {
            run(&proj, &["config", key, value]);
        }
        commit(&proj, "a.txt", "a\n", "init");
        Some((parent, proj))
    }

    /// `project()` before its first commit.
    fn repo_without_commit() -> Option<(tempfile::TempDir, PathBuf)> {
        if Command::new("git").arg("--version").output().is_err() {
            return None;
        }
        let parent = tempfile::tempdir().unwrap();
        let proj = parent.path().join("proj");
        std::fs::create_dir(&proj).unwrap();
        run(&proj, &["init", "-q", "-b", "main"]);
        Some((parent, proj))
    }

    #[test]
    fn a_repository_without_a_commit_is_told_so() {
        let Some((_parent, proj)) = repo_without_commit() else {
            return;
        };
        assert_eq!(
            prepare(&proj, "auth").unwrap_err(),
            "Le dépôt n'a pas encore de commit : fais un premier commit, puis relance la mission."
        );
    }

    fn same(a: impl AsRef<Path>, b: impl AsRef<Path>) -> bool {
        std::fs::canonicalize(a).unwrap() == std::fs::canonicalize(b).unwrap()
    }

    #[test]
    fn slugs_are_safe_for_branches_and_folders() {
        assert_eq!(
            slug("Ajoute l'Authentification !"),
            "ajoute-l-authentification"
        );
        assert_eq!(slug("Athéna 2"), "athena-2");
        assert_eq!(slug("Œuvre complète"), "oeuvre-complete");
        assert_eq!(slug("Ōkuninushi"), "okuninushi");
        assert_eq!(slug("  --  "), "mission");
        let long = slug(&"a b ".repeat(30));
        assert!(long.len() <= 40 && !long.ends_with('-'), "{long}");
    }

    #[test]
    fn prepares_the_mission_branch_and_worktree_beside_the_project() {
        let Some((parent, proj)) = project() else {
            return;
        };
        let tree = prepare(&proj, "Ajoute l'Authentification").unwrap();
        assert_eq!(tree.slug, "ajoute-l-authentification");
        assert_eq!(tree.branch, "openvibe/ajoute-l-authentification");
        assert!(same(
            &tree.path,
            parent
                .path()
                .join("proj.worktrees")
                .join("ajoute-l-authentification")
        ));
        assert!(Path::new(&tree.path).join("a.txt").exists());
        assert_eq!(
            run(Path::new(&tree.path), &["branch", "--show-current"]),
            tree.branch
        );
        // The user's folder is untouched: same branch, nothing to commit.
        assert_eq!(run(&proj, &["branch", "--show-current"]), "main");
        assert_eq!(run(&proj, &["status", "--porcelain"]), "");
    }

    #[test]
    fn refuses_a_mission_that_exists_or_a_folder_outside_git() {
        let Some((parent, proj)) = project() else {
            return;
        };
        prepare(&proj, "auth").unwrap();
        assert!(prepare(&proj, "auth").unwrap_err().contains("existe déjà"));
        let plain = parent.path().join("plain");
        std::fs::create_dir(&plain).unwrap();
        assert_eq!(
            prepare(&plain, "auth").unwrap_err(),
            "Le dossier du projet n'est pas un dépôt git."
        );
    }

    #[test]
    fn gives_each_agent_a_branch_from_the_missions() {
        let Some((parent, proj)) = project() else {
            return;
        };
        let mission = prepare(&proj, "auth").unwrap();
        commit(Path::new(&mission.path), "m.txt", "m\n", "mission base");
        let agent = add_agent(&proj, &mission.slug, "Athéna").unwrap();
        assert_eq!(agent.slug, "auth-athena");
        assert_eq!(agent.branch, "openvibe/auth-athena");
        assert!(same(
            &agent.path,
            parent.path().join("proj.worktrees").join("auth-athena")
        ));
        assert!(Path::new(&agent.path).join("m.txt").exists());
    }

    #[test]
    fn merges_an_agents_commits_into_the_mission() {
        let Some((_parent, proj)) = project() else {
            return;
        };
        let mission = prepare(&proj, "auth").unwrap();
        let athena = add_agent(&proj, &mission.slug, "Athéna").unwrap();
        let apollon = add_agent(&proj, &mission.slug, "Apollon").unwrap();
        commit(Path::new(&athena.path), "login.txt", "login\n", "login");
        std::fs::write(Path::new(&apollon.path).join("draft.txt"), "x").unwrap();
        let m = Path::new(&mission.path);
        assert_eq!(
            merge_agent(m, Path::new(&athena.path), &athena.branch).unwrap(),
            MergeReport {
                merge: Merge::Merged,
                uncommitted: false
            }
        );
        assert!(m.join("login.txt").exists());
        assert_eq!(
            merge_agent(m, Path::new(&apollon.path), &apollon.branch).unwrap(),
            MergeReport {
                merge: Merge::Empty,
                uncommitted: true
            }
        );
    }

    #[test]
    fn a_merge_refused_by_a_hook_is_undone() {
        let Some((parent, proj)) = project() else {
            return;
        };
        let mission = prepare(&proj, "auth").unwrap();
        let athena = add_agent(&proj, &mission.slug, "Athéna").unwrap();
        commit(Path::new(&athena.path), "login.txt", "login\n", "login");
        // Worktrees share the repository's config, so its hooks.
        let hooks = parent.path().join("hooks");
        std::fs::create_dir(&hooks).unwrap();
        std::fs::write(hooks.join("pre-merge-commit"), "#!/bin/sh\nexit 1\n").unwrap();
        run(
            &proj,
            &["config", "core.hooksPath", &hooks.to_string_lossy()],
        );
        let m = Path::new(&mission.path);
        let err = merge_agent(m, Path::new(&athena.path), &athena.branch).unwrap_err();
        assert!(err.contains("annulée"), "{err}");
        assert!(git(m, &["rev-parse", "-q", "--verify", "MERGE_HEAD"]).is_err());
        assert_eq!(run(m, &["status", "--porcelain"]), "");
        std::fs::remove_file(hooks.join("pre-merge-commit")).unwrap();
        let again = merge_agent(m, Path::new(&athena.path), &athena.branch).unwrap();
        assert_eq!(again.merge, Merge::Merged);
    }

    #[test]
    fn a_conflict_is_undone_and_its_files_named() {
        let Some((_parent, proj)) = project() else {
            return;
        };
        let mission = prepare(&proj, "auth").unwrap();
        let athena = add_agent(&proj, &mission.slug, "Athéna").unwrap();
        let m = Path::new(&mission.path);
        commit(m, "a.txt", "mission\n", "mission side");
        commit(Path::new(&athena.path), "a.txt", "athena\n", "agent side");
        let report = merge_agent(m, Path::new(&athena.path), &athena.branch).unwrap();
        assert_eq!(
            report.merge,
            Merge::Conflict {
                files: vec!["a.txt".into()]
            }
        );
        assert_eq!(run(m, &["status", "--porcelain"]), "");
        assert_eq!(
            std::fs::read_to_string(m.join("a.txt")).unwrap().trim_end(),
            "mission"
        );
    }

    #[test]
    fn discard_undoes_a_failed_launch_and_never_drops_work() {
        let Some((parent, proj)) = project() else {
            return;
        };
        let mission = prepare(&proj, "auth").unwrap();
        let athena = add_agent(&proj, &mission.slug, "Athéna").unwrap();
        let apollon = add_agent(&proj, &mission.slug, "Apollon").unwrap();
        commit(Path::new(&apollon.path), "api.txt", "api\n", "api");
        let done = discard(&proj, &[mission.clone(), athena, apollon]).unwrap();
        assert_eq!(
            done.removed,
            vec!["auth-athena".to_string(), "auth".to_string()]
        );
        assert_eq!(
            done.kept,
            vec!["openvibe/auth-apollon (branche non fusionnée)".to_string()]
        );
        assert!(!parent.path().join("proj.worktrees").join("auth").exists());
        assert_eq!(
            run(&proj, &["branch", "--list", "openvibe/*"]),
            "openvibe/auth-apollon"
        );
        // The same plan can be launched again.
        prepare(&proj, "auth").unwrap();
    }

    #[test]
    fn cleanup_removes_merged_worktrees_and_keeps_the_branches() {
        let Some((parent, proj)) = project() else {
            return;
        };
        let mission = prepare(&proj, "auth").unwrap();
        let athena = add_agent(&proj, &mission.slug, "Athéna").unwrap();
        let apollon = add_agent(&proj, &mission.slug, "Apollon").unwrap();
        commit(Path::new(&athena.path), "login.txt", "login\n", "login");
        commit(Path::new(&apollon.path), "api.txt", "api\n", "api");
        let m = Path::new(&mission.path);
        merge_agent(m, Path::new(&athena.path), &athena.branch).unwrap();
        let names = vec!["Athéna".to_string(), "Apollon".to_string()];
        let first = cleanup(&proj, &mission.slug, &names).unwrap();
        assert_eq!(first.removed, vec!["auth-athena".to_string()]);
        assert_eq!(
            first.kept,
            vec!["auth-apollon (branche non fusionnée)".to_string()]
        );
        assert!(m.exists());
        merge_agent(m, Path::new(&apollon.path), &apollon.branch).unwrap();
        let second = cleanup(&proj, &mission.slug, &names).unwrap();
        assert_eq!(
            second.removed,
            vec!["auth-apollon".to_string(), "auth".to_string()]
        );
        assert!(!parent.path().join("proj.worktrees").join("auth").exists());
        let branches = run(&proj, &["branch", "--list", "openvibe/*"]);
        assert!(branches.contains("openvibe/auth-apollon") && branches.contains("openvibe/auth"));
    }
}
