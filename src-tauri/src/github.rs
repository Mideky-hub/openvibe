//! GitHub issues and Projects for the Kanban, through the `gh` CLI: OpenVibe
//! stores no token, the user's own `gh auth login` is used.

use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::process::hide_window;
use crate::tr;

/// Enough for a Kanban; `gh` stops at 30 by default.
const ISSUE_LIMIT: &str = "200";
const ITEM_LIMIT: &str = "500";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub number: u64,
    pub title: String,
    pub body: String,
    /// "open" or "closed".
    pub state: String,
    pub url: String,
    pub closed_at: Option<String>,
    pub labels: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemContent {
    /// "issue", "pullRequest" or "draft".
    pub kind: String,
    pub repo: Option<String>,
    pub number: Option<u64>,
    pub url: Option<String>,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectItem {
    pub id: String,
    pub title: String,
    pub status: Option<String>,
    pub content: ItemContent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedIssue {
    pub number: u64,
    pub url: String,
}

/// The Status field of a project: what `gh project item-edit` needs to move an item.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusField {
    pub id: String,
    pub options: Vec<(String, String)>,
}

/// "owner/name" of a github.com remote URL, in its https, ssh or scp form.
pub fn parse_remote(url: &str) -> Option<String> {
    let url = url.trim();
    let rest = ["https://", "http://", "ssh://", "git://"]
        .iter()
        .find_map(|scheme| url.strip_prefix(scheme))
        .map(|rest| rest.rsplit_once('@').map_or(rest, |(_, host)| host))
        .and_then(|rest| rest.strip_prefix("github.com/"))
        .or_else(|| url.split_once("@github.com:").map(|(_, path)| path))?;
    let rest = rest.trim_end_matches('/');
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let mut parts = rest.split('/');
    let (owner, name) = (parts.next()?, parts.next()?);
    if owner.is_empty() || name.is_empty() || parts.next().is_some() {
        return None;
    }
    Some(format!("{owner}/{name}"))
}

/// `gh issue list --json number,title,body,state,url,closedAt,labels`.
pub fn parse_issues(json: &str) -> AppResult<Vec<Issue>> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Label {
        name: String,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Raw {
        number: u64,
        title: String,
        #[serde(default)]
        body: String,
        state: String,
        url: String,
        #[serde(default)]
        closed_at: Option<String>,
        #[serde(default)]
        labels: Vec<Label>,
    }
    let raw: Vec<Raw> = serde_json::from_str(json).map_err(unreadable)?;
    Ok(raw
        .into_iter()
        .map(|issue| Issue {
            number: issue.number,
            title: issue.title,
            body: issue.body,
            state: issue.state.to_lowercase(),
            url: issue.url,
            // gh writes the zero date for an open issue.
            closed_at: issue
                .closed_at
                .filter(|at| !at.is_empty() && !at.starts_with("0001-")),
            labels: issue.labels.into_iter().map(|label| label.name).collect(),
        })
        .collect())
}

/// `gh project item-list --format json`: `{ items: [{ id, title, status?, content }] }`.
/// The Status field comes as the lowercased field name.
pub fn parse_project_items(json: &str) -> AppResult<Vec<ProjectItem>> {
    let root: Value = serde_json::from_str(json).map_err(unreadable)?;
    let items = root
        .get("items")
        .and_then(Value::as_array)
        .ok_or_else(|| unreadable("items"))?;
    let text = |value: &Value, key: &str| value.get(key).and_then(Value::as_str).map(String::from);
    Ok(items
        .iter()
        .filter_map(|item| {
            let content = item.get("content").unwrap_or(&Value::Null);
            let kind = match content.get("type").and_then(Value::as_str) {
                Some("Issue") => "issue",
                Some("PullRequest") => "pullRequest",
                _ => "draft",
            };
            Some(ProjectItem {
                id: text(item, "id")?,
                title: text(item, "title")
                    .or_else(|| text(content, "title"))
                    .unwrap_or_default(),
                status: text(item, "status").filter(|status| !status.is_empty()),
                content: ItemContent {
                    kind: kind.into(),
                    repo: text(content, "repository"),
                    number: content.get("number").and_then(Value::as_u64),
                    url: text(content, "url"),
                    body: text(content, "body").unwrap_or_default(),
                },
            })
        })
        .collect())
}

/// `gh project field-list --format json`: the single-select field named Status.
pub fn parse_status_field(json: &str) -> AppResult<Option<StatusField>> {
    let root: Value = serde_json::from_str(json).map_err(unreadable)?;
    let fields = root
        .get("fields")
        .and_then(Value::as_array)
        .ok_or_else(|| unreadable("fields"))?;
    Ok(fields
        .iter()
        .find(|field| {
            field.get("name").and_then(Value::as_str) == Some("Status")
                && field.get("options").is_some()
        })
        .and_then(|field| {
            let options = field.get("options")?.as_array()?;
            Some(StatusField {
                id: field.get("id")?.as_str()?.into(),
                options: options
                    .iter()
                    .filter_map(|option| {
                        Some((
                            option.get("id")?.as_str()?.into(),
                            option.get("name")?.as_str()?.into(),
                        ))
                    })
                    .collect(),
            })
        }))
}

/// `gh project view --format json`: the project's node id.
pub fn parse_project_id(json: &str) -> AppResult<String> {
    let root: Value = serde_json::from_str(json).map_err(unreadable)?;
    root.get("id")
        .and_then(Value::as_str)
        .map(String::from)
        .ok_or_else(|| unreadable("id"))
}

/// `gh issue create` prints the new issue's URL, which ends with its number.
pub fn parse_created_issue(stdout: &str) -> AppResult<CreatedIssue> {
    let url = stdout
        .lines()
        .map(str::trim)
        .rfind(|line| line.starts_with("https://"))
        .ok_or_else(|| unreadable(stdout))?;
    let number = url
        .rsplit('/')
        .next()
        .and_then(|n| n.parse().ok())
        .ok_or_else(|| unreadable(url))?;
    Ok(CreatedIssue {
        number,
        url: url.into(),
    })
}

/// YYYY-MM-DD of a Unix day count (Howard Hinnant's civil_from_days).
pub fn date_of_day(days: i64) -> String {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}

fn unreadable(detail: impl std::fmt::Display) -> AppError {
    AppError::Github(tr!(
        "réponse de gh illisible : {detail}",
        "unreadable gh output: {detail}"
    ))
}

/// Runs `gh` in `path`; a missing CLI, a missing login and a failed call each say so.
fn gh(path: &Path, args: &[&str]) -> AppResult<String> {
    let program = crate::pty::shell::which_locate("gh").ok_or_else(|| {
        AppError::Github(tr!(
            "GitHub CLI (gh) introuvable : installez-la (https://cli.github.com) puis lancez `gh auth login`.",
            "GitHub CLI (gh) not found: install it (https://cli.github.com) then run `gh auth login`."
        ))
    })?;
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(path)
        .env("GH_PROMPT_DISABLED", "1");
    if let Some(env_path) = crate::pty::env_path::current() {
        command.env("PATH", env_path);
    }
    let output = hide_window(&mut command).output()?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.contains("gh auth login") || stderr.contains("not logged") {
        return Err(AppError::Github(tr!(
            "GitHub CLI non authentifiée : lancez `gh auth login` dans un terminal.",
            "GitHub CLI not authenticated: run `gh auth login` in a terminal."
        )));
    }
    if stderr.contains("missing required scopes") || stderr.contains("read:project") {
        return Err(AppError::Github(tr!(
            "Accès aux Projects GitHub refusé : lancez `gh auth refresh -s project`.",
            "Access to GitHub Projects denied: run `gh auth refresh -s project`."
        )));
    }
    Err(AppError::Github(tr!(
        "gh a échoué : {stderr}",
        "gh failed: {stderr}"
    )))
}

/// "owner/name" of the project's `origin` remote; None when it is not on github.com.
pub fn detect_repo(path: &Path) -> Option<String> {
    let output = hide_window(
        Command::new("git")
            .arg("-C")
            .arg(path)
            .args(["remote", "get-url", "origin"]),
    )
    .output()
    .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_remote(&String::from_utf8_lossy(&output.stdout))
}

const ISSUE_FIELDS: &str = "number,title,body,state,url,closedAt,labels";

/// Open issues, then those closed within the last `closed_within_days` days.
pub fn list_issues(path: &Path, repo: &str, closed_within_days: u32) -> AppResult<Vec<Issue>> {
    let open = gh(
        path,
        &[
            "issue",
            "list",
            "--repo",
            repo,
            "--state",
            "open",
            "--limit",
            ISSUE_LIMIT,
            "--json",
            ISSUE_FIELDS,
        ],
    )?;
    let mut issues = parse_issues(&open)?;
    if closed_within_days > 0 {
        let today = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |since| since.as_secs() as i64 / 86_400);
        let search = format!(
            "closed:>={}",
            date_of_day(today - i64::from(closed_within_days))
        );
        let closed = gh(
            path,
            &[
                "issue",
                "list",
                "--repo",
                repo,
                "--state",
                "closed",
                "--search",
                &search,
                "--limit",
                ISSUE_LIMIT,
                "--json",
                ISSUE_FIELDS,
            ],
        )?;
        issues.extend(parse_issues(&closed)?);
    }
    Ok(issues)
}

pub fn list_project_items(path: &Path, owner: &str, number: u32) -> AppResult<Vec<ProjectItem>> {
    let number = number.to_string();
    let json = gh(
        path,
        &[
            "project",
            "item-list",
            &number,
            "--owner",
            owner,
            "--limit",
            ITEM_LIMIT,
            "--format",
            "json",
        ],
    )?;
    parse_project_items(&json)
}

fn status_field(path: &Path, owner: &str, number: &str) -> AppResult<StatusField> {
    let json = gh(
        path,
        &[
            "project",
            "field-list",
            number,
            "--owner",
            owner,
            "--format",
            "json",
        ],
    )?;
    parse_status_field(&json)?.ok_or_else(|| {
        AppError::NotFound(tr!(
            "ce Project GitHub n'a pas de champ Status",
            "this GitHub Project has no Status field"
        ))
    })
}

/// The Status options of the project, in their order on GitHub.
pub fn project_statuses(path: &Path, owner: &str, number: u32) -> AppResult<Vec<String>> {
    let field = status_field(path, owner, &number.to_string())?;
    Ok(field.options.into_iter().map(|(_, name)| name).collect())
}

pub fn create_issue(path: &Path, repo: &str, title: &str, body: &str) -> AppResult<CreatedIssue> {
    let stdout = gh(
        path,
        &[
            "issue", "create", "--repo", repo, "--title", title, "--body", body,
        ],
    )?;
    parse_created_issue(&stdout)
}

pub fn set_issue_state(path: &Path, repo: &str, number: u64, state: &str) -> AppResult<()> {
    let verb = match state {
        "closed" => "close",
        "open" => "reopen",
        other => {
            return Err(AppError::InvalidInput(tr!(
                "état d'issue inconnu : {other}",
                "unknown issue state: {other}"
            )));
        }
    };
    gh(path, &["issue", verb, &number.to_string(), "--repo", repo])?;
    Ok(())
}

/// Sets the item's Status to the option named `status` (case-insensitive).
pub fn move_project_item(
    path: &Path,
    owner: &str,
    number: u32,
    item_id: &str,
    status: &str,
) -> AppResult<()> {
    let number = number.to_string();
    let field = status_field(path, owner, &number)?;
    let wanted = status.trim().to_lowercase();
    let option = field
        .options
        .iter()
        .find(|(_, name)| name.trim().to_lowercase() == wanted)
        .map(|(id, _)| id.clone())
        .ok_or_else(|| {
            AppError::NotFound(tr!(
                "statut « {status} » absent du Project GitHub",
                "status \"{status}\" not in the GitHub Project"
            ))
        })?;
    let view = gh(
        path,
        &[
            "project", "view", &number, "--owner", owner, "--format", "json",
        ],
    )?;
    let project_id = parse_project_id(&view)?;
    gh(
        path,
        &[
            "project",
            "item-edit",
            "--id",
            item_id,
            "--project-id",
            &project_id,
            "--field-id",
            &field.id,
            "--single-select-option-id",
            &option,
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_github_remotes_in_every_form() {
        let repo = Some("acme/widget".to_string());
        assert_eq!(parse_remote("https://github.com/acme/widget.git\n"), repo);
        assert_eq!(parse_remote("https://github.com/acme/widget"), repo);
        assert_eq!(parse_remote("https://token@github.com/acme/widget/"), repo);
        assert_eq!(parse_remote("git@github.com:acme/widget.git"), repo);
        assert_eq!(parse_remote("ssh://git@github.com/acme/widget.git"), repo);
        assert_eq!(parse_remote("https://gitlab.com/acme/widget.git"), None);
        assert_eq!(parse_remote("https://github.com/acme"), None);
        assert_eq!(parse_remote(""), None);
    }

    #[test]
    fn reads_issues_with_lowercase_state_and_label_names() {
        let json = r#"[
          {"number":12,"title":"Crash","body":"steps","state":"OPEN","url":"https://github.com/a/b/issues/12",
           "closedAt":"0001-01-01T00:00:00Z","labels":[{"id":"x","name":"bug","color":"red"}]},
          {"number":3,"title":"Old","body":"","state":"CLOSED","url":"https://github.com/a/b/issues/3",
           "closedAt":"2026-10-20T10:00:00Z","labels":[]}
        ]"#;
        let issues = parse_issues(json).unwrap();
        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].state, "open");
        assert_eq!(issues[0].closed_at, None);
        assert_eq!(issues[0].labels, vec!["bug".to_string()]);
        assert_eq!(issues[1].state, "closed");
        assert_eq!(issues[1].closed_at.as_deref(), Some("2026-10-20T10:00:00Z"));
        assert!(parse_issues("[]").unwrap().is_empty());
        assert!(matches!(parse_issues("nope"), Err(AppError::Github(_))));
    }

    #[test]
    fn reads_project_items_and_their_status() {
        let json = r#"{"items":[
          {"id":"PVTI_1","title":"Crash","status":"In Progress","repository":"https://github.com/a/b",
           "content":{"type":"Issue","number":12,"repository":"a/b","title":"Crash","url":"https://github.com/a/b/issues/12","body":"steps"}},
          {"id":"PVTI_2","title":"Idea","content":{"type":"DraftIssue","title":"Idea","body":"maybe"}},
          {"id":"PVTI_3","title":"Fix","status":"","content":{"type":"PullRequest","number":4,"repository":"a/b","url":"https://github.com/a/b/pull/4"}}
        ],"totalCount":3}"#;
        let items = parse_project_items(json).unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].status.as_deref(), Some("In Progress"));
        assert_eq!(items[0].content.kind, "issue");
        assert_eq!(items[0].content.repo.as_deref(), Some("a/b"));
        assert_eq!(items[0].content.number, Some(12));
        assert_eq!(items[1].content.kind, "draft");
        assert_eq!(items[1].content.number, None);
        assert_eq!(items[1].status, None);
        assert_eq!(items[2].content.kind, "pullRequest");
        assert_eq!(items[2].status, None);
        assert!(parse_project_items("{}").is_err());
    }

    #[test]
    fn finds_the_status_field_and_its_options() {
        let json = r#"{"fields":[
          {"id":"F_title","name":"Title","type":"ProjectV2Field"},
          {"id":"F_status","name":"Status","type":"ProjectV2SingleSelectField",
           "options":[{"id":"o1","name":"Todo"},{"id":"o2","name":"Done"}]}
        ],"totalCount":2}"#;
        let field = parse_status_field(json).unwrap().unwrap();
        assert_eq!(field.id, "F_status");
        assert_eq!(
            field.options,
            vec![("o1".into(), "Todo".into()), ("o2".into(), "Done".into())]
        );
        assert_eq!(parse_status_field(r#"{"fields":[]}"#).unwrap(), None);
    }

    #[test]
    fn reads_the_project_id_and_the_created_issue() {
        assert_eq!(
            parse_project_id(r#"{"id":"PVT_9","number":1}"#).unwrap(),
            "PVT_9"
        );
        assert!(parse_project_id("{}").is_err());
        let created =
            parse_created_issue("\nCreating issue in a/b\n\nhttps://github.com/a/b/issues/42\n")
                .unwrap();
        assert_eq!(
            created,
            CreatedIssue {
                number: 42,
                url: "https://github.com/a/b/issues/42".into()
            }
        );
        assert!(parse_created_issue("nothing").is_err());
    }

    #[test]
    fn converts_unix_days_to_dates() {
        assert_eq!(date_of_day(0), "1970-01-01");
        assert_eq!(date_of_day(19_782), "2024-02-29");
        assert_eq!(date_of_day(20_754), "2026-10-28");
    }
}
