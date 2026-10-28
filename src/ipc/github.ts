import { call } from "./invoke";

// GitHub access goes through the `gh` CLI; failures (missing, not authenticated) raise an `AppError` of kind "github".

export type IssueState = "open" | "closed";

export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: IssueState;
  url: string;
  closedAt: string | null;
  labels: string[];
}

export interface GithubProjectItem {
  id: string;
  title: string;
  /** Option name of the project's Status field, null when unset. */
  status: string | null;
  content: {
    kind: "issue" | "pullRequest" | "draft";
    /** "owner/name"; null for a draft. */
    repo: string | null;
    number: number | null;
    url: string | null;
    body: string;
  };
}

export interface CreatedIssue {
  number: number;
  url: string;
}

/** "owner/name" of the `origin` remote; null when it is not a GitHub remote. */
export const githubDetectRepo = (path: string) => call<string | null>("github_detect_repo", { path });

/** Open issues, plus those closed within the last `closedWithinDays` days. */
export const githubListIssues = (path: string, repo: string, closedWithinDays: number) =>
  call<GithubIssue[]>("github_list_issues", { path, repo, closedWithinDays });

export const githubListProjectItems = (path: string, owner: string, projectNumber: number) =>
  call<GithubProjectItem[]>("github_list_project_items", { path, owner, projectNumber });

/** Option names of the project's Status field, in board order. */
export const githubProjectStatuses = (path: string, owner: string, projectNumber: number) =>
  call<string[]>("github_project_statuses", { path, owner, projectNumber });

export const githubCreateIssue = (path: string, repo: string, title: string, body: string) =>
  call<CreatedIssue>("github_create_issue", { path, repo, title, body });

export const githubSetIssueState = (path: string, repo: string, number: number, state: IssueState) =>
  call<void>("github_set_issue_state", { path, repo, number, state });

export const githubMoveProjectItem = (path: string, owner: string, projectNumber: number, itemId: string, status: string) =>
  call<void>("github_move_project_item", { path, owner, projectNumber, itemId, status });
