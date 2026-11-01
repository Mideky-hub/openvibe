// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { gitWindowStore } from "@/git/gitWindowStore";
import { langStore } from "@/i18n";
import { projectsStore } from "@/store/projects";
import { GitChip } from "./GitChip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let status: { branch: string; changed: number } | null;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  status = { branch: "main", changed: 3 };
  mockIPC((cmd) => (cmd === "git_status" ? status : undefined));
  projectsStore.setState({ projects: [{ id: "p", name: "api", path: "C:/code/api", position: 0, lastOpenedAt: 0, workspaceCount: 1, missing: false, liveAgents: 0 }], activeId: "p" });
  gitWindowStore.setState({ path: null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  clearMocks();
  langStore.setState({ lang: "fr" });
});

it("opens the git window on the project's folder (spec fenêtre git §3)", async () => {
  await act(async () => root.render(<GitChip />));
  const chip = host.querySelector("button")!;
  expect(chip.textContent).toContain("main");
  expect(chip.textContent).toContain("3");
  expect(chip.getAttribute("aria-label")).toBe("Ouvrir la fenêtre git · main");
  await act(async () => chip.click());
  expect(gitWindowStore.getState().path).toBe("C:/code/api");
});

it("words it in English", async () => {
  langStore.setState({ lang: "en" });
  await act(async () => root.render(<GitChip />));
  expect(host.querySelector("button")!.getAttribute("aria-label")).toBe("Open the git window · main");
});

it("shows nothing outside a repository", async () => {
  status = null;
  await act(async () => root.render(<GitChip />));
  expect(host.querySelector("button")).toBeNull();
});
