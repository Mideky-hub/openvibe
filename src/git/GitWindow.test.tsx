// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { toast } from "sonner";
import { langStore } from "@/i18n";
import type { LogEntry, NoPush, RepoState } from "@/ipc/repo";
import type { ChangedFile } from "@/ipc/review";
import { reviewStore } from "@/review/reviewStore";
import { projectsStore } from "@/store/projects";
import { sourceFiles } from "@/theme/cssBlocks";
import { GitWindow } from "./GitWindow";
import { gitWindowStore } from "./gitWindowStore";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const file = (path: string, status: ChangedFile["status"] = "modified", counts: [number, number] | null = [2, 1]): ChangedFile => ({
  path,
  oldPath: null,
  status,
  added: counts?.[0] ?? null,
  removed: counts?.[1] ?? null,
});

const base: RepoState = { branch: "main", upstream: "origin/main", ahead: 2, behind: 0, pushTo: "origin/main", noPush: null, files: [], truncated: false };

let repo: RepoState;
let history: LogEntry[];
let calls: { cmd: string; args: Record<string, unknown> }[];
let fail: Record<string, string>;
let host: HTMLDivElement;
let root: Root;

const called = (cmd: string) => calls.filter((c) => c.cmd === cmd);

beforeEach(() => {
  repo = { ...base, files: [file("src/a.ts"), file("b.txt", "untracked", [4, 0])] };
  history = [{ hash: "abcdef0123", shortHash: "abcdef0", author: "Mathilde", date: 1_700_000_000, subject: "feat: the first one" }];
  calls = [];
  fail = {};
  vi.mocked(toast).mockClear();
  vi.mocked(toast.error).mockClear();
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: args as Record<string, unknown> });
    if (fail[cmd]) throw fail[cmd];
    if (cmd === "repo_state") return repo;
    if (cmd === "repo_history") return history;
    if (cmd === "review_file_diff") return "@@ -1,2 +1,2 @@\n ctx\n-old\n+new\n";
    if (cmd === "repo_commit") return "1234567";
  });
  projectsStore.setState({ projects: [{ id: "p", name: "api", path: "C:/code/api", position: 0, lastOpenedAt: 0, workspaceCount: 1, missing: false, liveAgents: 0 }], activeId: "p" });
  reviewStore.setState({ nodeId: null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  clearMocks();
  document.body.replaceChildren();
  gitWindowStore.setState({ path: null });
  langStore.setState({ lang: "fr" });
});

const render = async () => {
  gitWindowStore.getState().open("C:/code/api");
  await act(async () => root.render(<GitWindow />));
};
const button = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
const labelled = (label: string) => document.body.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const check = (label: string) => labelled(label) as HTMLInputElement;
const typeMessage = (value: string) =>
  act(async () => {
    const area = labelled("Message du commit") as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, value);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });

describe("the changes (spec fenêtre git §3.1)", () => {
  it("lists the files with status and +/−, all checked", async () => {
    await render();
    const row = document.body.querySelector<HTMLElement>("[data-git-file='src/a.ts']")!;
    expect(row.textContent).toContain("M");
    expect(row.textContent).toContain("+2");
    expect(row.textContent).toContain("−1");
    expect(check("Inclure src/a.ts").checked).toBe(true);
    expect(check("Inclure b.txt").checked).toBe(true);
    expect(button("Valider (2)")).toBeTruthy();
    expect(document.body.textContent).toContain("Modifications (2)");
  });

  it("marks a binary file without counts", async () => {
    repo.files = [file("logo.png", "modified", null)];
    await render();
    const row = document.body.querySelector("[data-git-file='logo.png']")!;
    expect(row.textContent).not.toContain("+");
  });

  it("shows the diff of the file clicked, read-only, with the review panel's rows", async () => {
    await render();
    expect(document.body.querySelector("[data-diff-line]")).not.toBeNull();
    await act(async () => button("b.txt")!.click());
    expect(called("review_file_diff").pop()!.args).toMatchObject({ path: "C:/code/api", file: repo.files[1], base: null });
    expect(document.body.querySelector("[data-diff-line='add']")!.textContent).toContain("new");
    expect(document.body.querySelector("[data-diff-line='add']")!.getAttribute("title")).toBeNull();
  });

  it("checks and unchecks all, and a new file arrives checked while unchecked ones stay so", async () => {
    await render();
    await act(async () => check("Tout inclure").click());
    expect(check("Inclure src/a.ts").checked).toBe(false);
    expect(button("Valider (0)")!.disabled).toBe(true);
    await act(async () => check("Tout inclure").click());
    expect(check("Inclure src/a.ts").checked).toBe(true);
    await act(async () => check("Inclure src/a.ts").click());
    repo = { ...repo, files: [...repo.files, file("new.ts", "untracked")] };
    await act(async () => labelled("Actualiser").click());
    expect(check("Inclure src/a.ts").checked).toBe(false);
    expect(check("Inclure new.ts").checked).toBe(true);
  });

  it("says when the list was cut: what is not shown cannot be committed", async () => {
    repo = { ...repo, truncated: true };
    await render();
    expect(document.body.textContent).toContain("Liste coupée : seuls les 2 premiers changements");
  });

  it("says when nothing changed", async () => {
    repo.files = [];
    await render();
    expect(document.body.textContent).toContain("Rien à valider");
  });

  it("says why a folder cannot be read", async () => {
    fail.repo_state = "pas un dépôt git";
    await render();
    expect(document.body.textContent).toContain("pas un dépôt git");
  });
});

describe("the commit (spec fenêtre git §3.2)", () => {
  it("needs a message and a file", async () => {
    await render();
    expect(button("Valider (2)")!.disabled).toBe(true);
    await typeMessage("   ");
    expect(button("Valider (2)")!.disabled).toBe(true);
    await typeMessage("fix: something");
    expect(button("Valider (2)")!.disabled).toBe(false);
  });

  it("commits the checked files only, then empties the message and reads again", async () => {
    await render();
    await act(async () => check("Inclure b.txt").click());
    await typeMessage("fix: something");
    calls = [];
    await act(async () => button("Valider (1)")!.click());
    expect(called("repo_commit")[0].args).toEqual({ path: "C:/code/api", files: [repo.files[0]], message: "fix: something" });
    expect((labelled("Message du commit") as HTMLTextAreaElement).value).toBe("");
    expect(called("repo_state").length).toBe(1);
    expect(toast).toHaveBeenCalledWith("Commit 1234567 créé");
  });

  it("keeps the message and the choices through a look at the history", async () => {
    await render();
    await act(async () => check("Inclure b.txt").click());
    await typeMessage("fix: something");
    await act(async () => button("Historique")!.click());
    await act(async () => button("Modifications")!.click());
    expect((labelled("Message du commit") as HTMLTextAreaElement).value).toBe("fix: something");
    expect(check("Inclure b.txt").checked).toBe(false);
  });

  it("never pushes after a commit", async () => {
    await render();
    await typeMessage("fix: something");
    await act(async () => button("Valider (2)")!.click());
    expect(called("repo_push")).toEqual([]);
  });

  it("shows git's refusal and keeps the message", async () => {
    fail.repo_commit = "pre-commit: no way";
    await render();
    await typeMessage("fix: something");
    await act(async () => button("Valider (2)")!.click());
    expect(document.body.querySelector("[role='alert']")!.textContent).toContain("pre-commit: no way");
    expect((labelled("Message du commit") as HTMLTextAreaElement).value).toBe("fix: something");
  });
});

describe("discarding (spec fenêtre git §3.3)", () => {
  const ask = (path: string) => act(async () => labelled(`Abandonner ${path}`).click());

  it("touches nothing before the dialog's button", async () => {
    await render();
    await ask("src/a.ts");
    expect(called("repo_discard")).toEqual([]);
    const dialog = document.body.querySelector("[role='dialog']")!;
    expect(dialog.textContent).toContain("src/a.ts");
    expect(dialog.textContent).toContain("irréversible");
  });

  it("does nothing when cancelled", async () => {
    await render();
    await ask("src/a.ts");
    await act(async () => button("Annuler")!.click());
    expect(called("repo_discard")).toEqual([]);
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
  });

  it("discards the confirmed file exactly as it was listed, then reads again", async () => {
    await render();
    await ask("src/a.ts");
    calls = [];
    await act(async () => button("Abandonner ce fichier")!.click());
    expect(called("repo_discard")[0].args).toEqual({ path: "C:/code/api", file: repo.files[0] });
    expect(called("repo_state").length).toBe(1);
  });

  it("says an untracked file will be deleted", async () => {
    await render();
    await ask("b.txt");
    expect(document.body.querySelector("[role='dialog']")!.textContent).toContain("sera supprimé");
  });

  it("shows the refusal when the file changed meanwhile, and reads again", async () => {
    fail.repo_discard = "src/a.ts a changé depuis la confirmation : rien n'a été touché.";
    await render();
    await ask("src/a.ts");
    calls = [];
    await act(async () => button("Abandonner ce fichier")!.click());
    expect(document.body.querySelector("[role='alert']")!.textContent).toContain("rien n'a été touché");
    expect(called("repo_state").length).toBe(1);
  });
});

describe("the history (spec fenêtre git §3.4)", () => {
  it("shows hash, author and date", async () => {
    await render();
    await act(async () => button("Historique")!.click());
    const row = document.body.querySelector<HTMLElement>("[data-git-commit='abcdef0123']")!;
    expect(row.textContent).toContain("abcdef0");
    expect(row.textContent).toContain("feat: the first one");
    expect(row.textContent).toContain("Mathilde");
    expect(row.textContent).toMatch(/2023/);
  });

  it("says when there is no commit", async () => {
    history = [];
    await render();
    await act(async () => button("Historique")!.click());
    expect(document.body.textContent).toContain("Aucun commit");
  });
});

describe("pushing (spec fenêtre git §3.5)", () => {
  it("only ever pushes on the button's click", async () => {
    await render();
    await act(async () => labelled("Actualiser").click());
    await act(async () => button("Historique")!.click());
    expect(called("repo_push")).toEqual([]);
    calls = [];
    await act(async () => button("Pousser 2 → origin/main")!.click());
    expect(called("repo_push")).toEqual([{ cmd: "repo_push", args: { path: "C:/code/api" } }]);
    expect(called("repo_state").length).toBe(1);
    expect(toast).toHaveBeenCalledWith("Poussé vers origin/main");
  });

  it("offers a branch without upstream", async () => {
    repo = { ...repo, upstream: null, ahead: 0 };
    await render();
    expect(button("Pousser → origin/main")!.disabled).toBe(false);
  });

  it("is greyed when up to date", async () => {
    repo = { ...repo, ahead: 0 };
    await render();
    expect(button("Pousser")!.disabled).toBe(true);
    expect(button("Pousser")!.title).toBe("Déjà à jour");
  });

  it.each<[NoPush, string]>([
    ["noRemote", "Ce dépôt n'a pas de dépôt distant"],
    ["manyRemotes", "Plusieurs dépôts distants, aucun origin : pousse depuis un terminal"],
    ["detached", "HEAD détachée : aucune branche à pousser"],
    ["noCommit", "Aucun commit à pousser"],
  ])("says why it cannot push: %s", async (noPush, why) => {
    repo = { ...repo, upstream: null, ahead: 0, pushTo: null, noPush };
    await render();
    expect(button("Pousser")!.disabled).toBe(true);
    expect(button("Pousser")!.title).toBe(why);
  });

  it("shows a refused push", async () => {
    fail.repo_push = "rejected: fetch first";
    await render();
    await act(async () => button("Pousser 2 → origin/main")!.click());
    expect(document.body.querySelector("[role='alert']")!.textContent).toContain("rejected: fetch first");
  });

  it("has one caller in the whole application: the window's button (spec fenêtre git §2.3)", () => {
    const callers = Object.entries(sourceFiles()).filter(([, text]) => /repoPush|repo_push/.test(text));
    expect(callers.map(([path]) => path.replace(/\\/g, "/").replace(/^.*src\//, "")).sort()).toEqual(["git/GitWindow.tsx", "ipc/repo.ts"]);
  });
});

describe("the window", () => {
  it("closes on its button and when the review panel opens", async () => {
    await render();
    await act(async () => labelled("Fermer").click());
    expect(gitWindowStore.getState().path).toBeNull();
    await render();
    await act(async () => reviewStore.getState().open("isis"));
    expect(gitWindowStore.getState().path).toBeNull();
  });

  it("closes the review panel when it opens", async () => {
    reviewStore.getState().open("isis");
    gitWindowStore.getState().open("C:/code/api");
    expect(reviewStore.getState().nodeId).toBeNull();
  });

  it("closes when another project opens", async () => {
    await render();
    await act(async () => projectsStore.setState({ activeId: null }));
    expect(gitWindowStore.getState().path).toBeNull();
  });

  it("speaks English", async () => {
    langStore.setState({ lang: "en" });
    await render();
    expect(document.body.textContent).toContain("Changes (2)");
    expect(button("Commit (2)")).toBeTruthy();
    expect(button("Push 2 → origin/main")).toBeTruthy();
    await act(async () => labelled("Discard src/a.ts").click());
    expect(document.body.querySelector("[role='dialog']")!.textContent).toContain("cannot be undone");
    await act(async () => button("Cancel")!.click());
    await act(async () => button("History")!.click());
    expect(document.body.querySelector("[data-git-commit]")).not.toBeNull();
  });
});
