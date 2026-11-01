//! Where an overnight mission takes its tasks (spec mission de nuit §5.1). The
//! orchestrator may not run commands: OpenVibe reads the source for it.

use std::path::Path;
use std::process::Command;

use crate::process::hide_window;
use crate::pty::shell::which_locate;
use crate::tr;

/// A backlog is a text file; past this it is not one to read whole.
const MAX_BACKLOG: u64 = 4 * 1024 * 1024;
const MAX_ISSUES: &str = "100";

/// `BACKLOG.md` at the project's root.
pub fn backlog(project: &Path) -> Result<String, String> {
    let path = project.join("BACKLOG.md");
    let size = std::fs::metadata(&path)
        .map_err(|_| {
            tr!(
                "pas de BACKLOG.md dans ce projet",
                "no BACKLOG.md in this project"
            )
        })?
        .len();
    if size > MAX_BACKLOG {
        return Err(tr!("BACKLOG.md est trop gros", "BACKLOG.md is too large"));
    }
    std::fs::read_to_string(&path).map_err(|err| err.to_string())
}

/// Only labelled issues: the repository may be public, and anybody's text
/// would guide agents nobody watches. Labelling takes rights on the repository.
fn issue_args(label: &str) -> Vec<String> {
    [
        "issue",
        "list",
        "--state",
        "open",
        "--limit",
        MAX_ISSUES,
        "--json",
        "number,title,body,url",
    ]
    .iter()
    .map(|arg| arg.to_string())
    .chain([format!("--label={label}")])
    .collect()
}

/// The open issues with `label`, as `gh` gives them in JSON.
pub fn github_issues(project: &Path, label: &str) -> Result<String, String> {
    let label = label.trim();
    if label.is_empty() {
        return Err(tr!("il faut un label", "a label is needed"));
    }
    let gh = which_locate("gh").ok_or_else(|| {
        tr!(
            "gh introuvable : installe GitHub CLI",
            "gh not found: install GitHub CLI"
        )
    })?;
    let output = hide_window(
        Command::new(gh)
            .current_dir(project)
            .args(issue_args(label)),
    )
    .output()
    .map_err(|err| err.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_backlog_at_the_projects_root() {
        let dir = tempfile::tempdir().unwrap();
        assert!(backlog(dir.path()).is_err());
        std::fs::write(dir.path().join("BACKLOG.md"), "- Un\n").unwrap();
        assert_eq!(backlog(dir.path()).unwrap(), "- Un\n");
    }

    #[test]
    fn asks_gh_for_open_issues_with_the_label_only() {
        let args = issue_args("overnight");
        assert_eq!(args[..4], ["issue", "list", "--state", "open"]);
        assert!(args.contains(&"--label=overnight".to_string()));
    }

    #[test]
    fn a_label_stays_one_argument() {
        // Glued to its flag: a label starting with a dash cannot become an option of gh.
        assert!(issue_args("--repo=x/y").contains(&"--label=--repo=x/y".to_string()));
    }

    #[test]
    fn refuses_no_label() {
        let dir = tempfile::tempdir().unwrap();
        assert!(github_issues(dir.path(), "  ").is_err());
    }
}
