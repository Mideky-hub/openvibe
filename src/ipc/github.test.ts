// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { githubCreateIssue, githubDetectRepo, githubListIssues, githubMoveProjectItem, githubSetIssueState } from "./github";

afterEach(() => clearMocks());

it("passes camelCase arguments to the github commands", async () => {
  const calls: [string, unknown][] = [];
  mockIPC((cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === "github_create_issue") return { number: 3, url: "u" };
    if (cmd === "github_list_issues") return [];
    return null;
  });

  await githubDetectRepo("/repo");
  await githubListIssues("/repo", "o/r", 14);
  await expect(githubCreateIssue("/repo", "o/r", "T", "B")).resolves.toEqual({ number: 3, url: "u" });
  await githubSetIssueState("/repo", "o/r", 3, "closed");
  await githubMoveProjectItem("/repo", "o", 2, "PVTI_1", "Done");

  expect(calls).toEqual([
    ["github_detect_repo", { path: "/repo" }],
    ["github_list_issues", { path: "/repo", repo: "o/r", closedWithinDays: 14 }],
    ["github_create_issue", { path: "/repo", repo: "o/r", title: "T", body: "B" }],
    ["github_set_issue_state", { path: "/repo", repo: "o/r", number: 3, state: "closed" }],
    ["github_move_project_item", { path: "/repo", owner: "o", projectNumber: 2, itemId: "PVTI_1", status: "Done" }],
  ]);
});

it("surfaces gh failures as github AppErrors", async () => {
  mockIPC(() => {
    throw { kind: "github", message: "gh is not authenticated" };
  });
  await expect(githubDetectRepo("/repo")).rejects.toMatchObject({ kind: "github" });
});
