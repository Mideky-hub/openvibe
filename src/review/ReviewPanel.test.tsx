// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { sendToAgents } from "@/fleet/broadcast";
import { langStore } from "@/i18n";
import { toast } from "sonner";
import { nodesStore } from "@/store/nodes";
import { ReviewPanel } from "./ReviewPanel";
import { reviewStore } from "./reviewStore";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/fleet/broadcast", () => ({ sendToAgents: vi.fn(() => Promise.resolve({ sent: 1, skipped: [], waiting: [], unsuited: [] })) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { warning: vi.fn(), error: vi.fn() }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DIFF = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n const x = 1;\n-const y = 2;\n+const y = 3;\n";
let cutList = false;
let calls: { cmd: string; args: Record<string, unknown> }[];
let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  calls = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: args as Record<string, unknown> });
    if (cmd === "review_default_base") return "main";
    if (cmd === "review_changes")
      return {
        compared: "abc123",
        truncated: cutList,
        files: [
          { path: "src/a.ts", oldPath: null, status: "modified", added: 1, removed: 1 },
          { path: "notes.md", oldPath: null, status: "untracked", added: 4, removed: 0 },
        ],
      };
    if (cmd === "review_file_diff") return DIFF;
    if (cmd === "review_files") return ["README.md", "src/a.ts"];
    if (cmd === "review_read_file") return { text: "# Projet\nBonjour\n", size: 17, truncated: false };
    return undefined;
  });
  vi.mocked(sendToAgents).mockClear();
  await nodesStore.getState().create("isis", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: "Isis", name: "Isis", agent: "claude", cwd: "C:/code/proj", shell: "default", command: "" },
  });
  reviewStore.setState({ nodeId: null, remarks: [] });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ReviewPanel />));
  await act(async () => reviewStore.getState().open("isis"));
});
afterEach(async () => {
  langStore.setState({ lang: "fr" });
  await act(async () => root.unmount());
  host.remove();
  clearMocks();
});

const text = () => host.textContent ?? "";
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label)!;

it("lists what the agent changed since its base, and shows a file's diff (spec maj §5)", async () => {
  await vi.waitFor(() => expect(text()).toContain("src/a.ts"));
  expect(text()).toContain("Isis");
  expect(text()).toContain("Depuis main");
  expect(calls.find((c) => c.cmd === "review_changes")?.args).toEqual({ path: "C:/code/proj", base: "main" });
  await vi.waitFor(() => expect(host.querySelectorAll("[data-diff-line]").length).toBe(4));
  expect([...host.querySelectorAll("[data-diff-line]")].map((l) => l.getAttribute("data-diff-line"))).toEqual(["hunk", "ctx", "del", "add"]);
  await act(async () => button("Non commité").click());
  await vi.waitFor(() => expect(calls.filter((c) => c.cmd === "review_changes").pop()?.args).toEqual({ path: "C:/code/proj", base: null }));
});

it("says when the list of changes was cut", async () => {
  await vi.waitFor(() => expect(text()).toContain("src/a.ts"));
  expect(text()).not.toContain("Liste coupée");
  cutList = true;
  await act(async () => button("Non commité").click());
  await vi.waitFor(() => expect(text()).toContain("Liste coupée : seuls les 2 premiers changements"));
});

it("takes remarks on lines and sends them to the agent in one message", async () => {
  await vi.waitFor(() => expect(host.querySelectorAll("[data-diff-line]").length).toBe(4));
  await act(async () => (host.querySelector('[data-diff-line="add"]') as HTMLElement).click());
  const field = host.querySelector<HTMLInputElement>('[aria-label="Remarque sur cette ligne"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "Pourquoi 3 ?");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(reviewStore.getState().remarks).toEqual([{ file: "src/a.ts", line: 2, text: "Pourquoi 3 ?" }]);
  await act(async () => button("Envoyer à Isis").click());
  expect(sendToAgents).toHaveBeenCalledWith(["isis"], expect.stringContaining("- src/a.ts:2 — Pourquoi 3 ?"));
  await vi.waitFor(() => expect(reviewStore.getState().remarks).toEqual([]));
});

it("browses the repository's files, read-only", async () => {
  await act(async () => button("Fichiers").click());
  await vi.waitFor(() => expect(text()).toContain("README.md"));
  await act(async () => button("README.md").click());
  await vi.waitFor(() => expect(text()).toContain("Bonjour"));
  expect(calls.find((c) => c.cmd === "review_read_file")?.args).toEqual({ path: "C:/code/proj", file: "README.md" });
});

it("keeps its remarks when closed and opened again on the same agent (final review maj §5)", async () => {
  await act(async () => reviewStore.getState().add({ file: "src/a.ts", line: 2, text: "Pourquoi 3 ?" }));
  await act(async () => reviewStore.getState().close());
  await act(async () => reviewStore.getState().open("isis"));
  expect(reviewStore.getState().remarks).toHaveLength(1);
  await act(async () => reviewStore.getState().open("thot"));
  expect(reviewStore.getState().remarks).toEqual([]);
});

it("closes on Escape, unless another part of the window already used it (final review maj §5)", async () => {
  const menu = document.createElement("div");
  document.body.append(menu);
  menu.addEventListener("keydown", (e) => e.preventDefault());
  await act(async () => menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(reviewStore.getState().nodeId).toBe("isis");
  const area = document.createElement("textarea");
  document.body.append(area);
  await act(async () => area.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(reviewStore.getState().nodeId).toBe("isis");
  await act(async () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(reviewStore.getState().nodeId).toBeNull();
});


it("shows the review in English", async () => {
  await act(async () => langStore.setState({ lang: "en" }));
  await vi.waitFor(() => expect(text()).toContain("src/a.ts"));
  expect(text()).toContain("Review · Isis");
  expect(text()).toContain("Since main");
  expect(text()).toContain("Uncommitted");
  expect(host.querySelector('[title*="modified"]')).not.toBeNull();
  await vi.waitFor(() => expect(host.querySelectorAll("[data-diff-line]").length).toBe(4));
  await act(async () => reviewStore.getState().add({ file: "src/a.ts", line: 2, text: "Why 3?" }));
  expect(text()).toContain("1 remark");
  expect(button("Send to Isis")).toBeDefined();
  await act(async () => button("Send to Isis").click());
  expect(toast).toHaveBeenCalledWith("Review sent to Isis");
});
