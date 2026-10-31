// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { langStore } from "@/i18n";
import { NEW_MISSION } from "@/mission/mission";
import { nodesStore } from "@/store/nodes";
import { missionBranchFor, parseDiff, reviewMessage } from "./review";

const DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -10,3 +10,4 @@ export function a() {",
  " const x = 1;",
  "-const y = 2;",
  "+const y = 3;",
  "+const z = 4;",
  " return x;",
  "\\ No newline at end of file",
  "",
].join("\n");

describe("parseDiff (spec maj §5)", () => {
  it("numbers each line on its side and keeps the hunks' headers", () => {
    const { lines, binary } = parseDiff(DIFF);
    expect(binary).toBe(false);
    expect(lines.map((l) => [l.kind, l.old ?? null, l.new ?? null, l.text])).toEqual([
      ["hunk", null, null, "@@ -10,3 +10,4 @@ export function a() {"],
      ["ctx", 10, 10, "const x = 1;"],
      ["del", 11, null, "const y = 2;"],
      ["add", null, 11, "const y = 3;"],
      ["add", null, 12, "const z = 4;"],
      ["ctx", 12, 13, "return x;"],
      ["meta", null, null, "\\ No newline at end of file"],
    ]);
  });

  it("knows a binary file, a cut diff and an empty one", () => {
    expect(parseDiff("diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n").binary).toBe(true);
    const cut = parseDiff(`${DIFF}[diff tronqué]\n`).lines;
    expect(cut[cut.length - 1]).toEqual({ kind: "meta", text: "[diff tronqué]" });
    expect(parseDiff("")).toEqual({ lines: [], binary: false });
  });

  it("reads a new file's hunk, numbered from 1", () => {
    const { lines } = parseDiff("--- /dev/null\n+++ b/b.txt\n@@ -0,0 +1,2 @@\n+un\n+deux\n");
    expect(lines.filter((l) => l.kind === "add").map((l) => l.new)).toEqual([1, 2]);
  });
});

describe("reviewMessage", () => {
  it("gathers the remarks in one message, each with its file and line", () => {
    expect(
      reviewMessage([
        { file: "src/a.ts", line: 12, text: "Renomme z." },
        { file: "src/a.ts", line: 11, side: "old", text: "Pourquoi retirer y ?" },
        { file: "README.md", text: "Documente l'option." },
      ]),
    ).toBe(
      "Revue de code de tes changements :\n- src/a.ts:12 — Renomme z.\n- src/a.ts (ligne 11 supprimée) — Pourquoi retirer y ?\n- README.md — Documente l'option.\nCorrige ce qui doit l'être, puis dis-moi ce que tu as changé.",
    );
  });
});

describe("reviewMessage in English (spec première version §7.1)", () => {
  it("follows the interface's language", () => {
    langStore.setState({ lang: "en" });
    try {
      expect(reviewMessage([{ file: "src/a.ts", line: 11, side: "old", text: "Why?" }, { file: "README.md", text: "Document it." }])).toBe(
        "Code review of your changes:\n- src/a.ts (line 11 removed) — Why?\n- README.md — Document it.\nFix what needs fixing, then tell me what you changed.",
      );
    } finally {
      langStore.setState({ lang: "fr" });
    }
  });
});

describe("missionBranchFor", () => {
  beforeEach(() => mockIPC(() => undefined));

  it("compares a mission's agent with the mission's branch, where its own forked", async () => {
    await nodesStore.getState().create("chef", {
      workspaceId: "w1",
      kind: "orchestrator",
      payload: {
        name: "Chef",
        mission: { ...NEW_MISSION, state: "en_cours", branch: "openvibe/auth", members: [{ nodeId: "isis", name: "Isis", task: "t", budgetMin: 5, linked: true, branch: "openvibe/auth-isis", worktree: "C:/w" }] },
      },
    });
    expect(missionBranchFor("isis")).toBe("openvibe/auth");
    expect(missionBranchFor("thot")).toBeNull();
  });
});

import { remarkRow } from "./review";

it("finds the row of a remark by its line text when the numbers have drifted (backlog 27 oct)", () => {
  const { lines } = parseDiff("@@ -1,2 +1,3 @@\n+new first\n const x = 1;\n+const y = 3;\n");
  expect(remarkRow(lines, { file: "a", line: 2, lineText: "const y = 3;", text: "?" })).toBe(3);
  expect(remarkRow(lines, { file: "a", line: 2, lineText: "gone", text: "?" })).toBe(-1);
  expect(remarkRow(lines, { file: "a", line: 1, text: "no text" })).toBe(1);
});

it("quotes the line in the message the agent reads (backlog 27 oct)", () => {
  expect(reviewMessage([{ file: "a.ts", line: 3, lineText: "const y = 3;", text: "why?" }])).toContain("a.ts:3 `const y = 3;` — why?");
});
