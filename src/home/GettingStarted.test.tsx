// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import { agentsStore } from "@/fleet/agentsStore";
import { langStore } from "@/i18n";
import { AGENT_IDS, type AgentInfo } from "@/ipc/pty";
import type { Project } from "@/ipc/db";
import { HomeScreen } from "./HomeScreen";

// Excalidraw does not load under Vitest (roughjs); the search field reaches it through the command registry.
vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const only = (...ids: string[]): AgentInfo[] => AGENT_IDS.map((id) => ({ id, available: id === "shell" || id === "custom" || ids.includes(id) }));
const project: Project = { id: "p1", name: "api", path: "C:/code/api", position: 0, lastOpenedAt: 0, workspaceCount: 1, missing: false, liveAgents: 0 };

let agents: AgentInfo[];
let projects: Project[];
let calls: string[];
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  agents = only();
  projects = [];
  calls = [];
  agentsStore.setState({ agents: [], shells: [], loaded: false });
  mockWindows("main");
  mockIPC(
    (cmd) => {
      calls.push(cmd);
      if (cmd === "list_projects") return projects;
      if (cmd === "list_agents") return agents;
      if (cmd === "list_shells") return ["powershell"];
      if (cmd === "refresh_path") return null;
      if (cmd === "plugin:window|is_maximized") return false;
    },
    { shouldMockEvents: true },
  );
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

const render = () => act(async () => root.render(<HomeScreen />));
const panel = () => host.querySelector<HTMLElement>("[data-getting-started]");
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;

it("guides a newcomer without agent nor project: three steps, Claude Code's command first (spec première version §7.2)", async () => {
  await render();
  expect(panel()?.textContent).toContain("Bien démarrer");
  const steps = [...panel()!.querySelectorAll<HTMLElement>("li[data-step]")].map((li) => [li.dataset.step, li.dataset.done]);
  expect(steps).toEqual([
    ["agent", "false"],
    ["project", "false"],
    ["launch", "false"],
  ]);
  const card = host.querySelector<HTMLElement>("[data-no-agent]")!;
  expect(card.textContent).toContain("Aucun agent de code trouvé");
  expect(card.querySelector("code")!.textContent).toBe("irm https://claude.ai/install.ps1 | iex");
  // Claude Code first: the orchestrator, missions and usage need it.
  expect(card.textContent!.indexOf("Claude Code")).toBeLessThan(card.textContent!.indexOf("Codex"));
});

it("copies Claude Code's install command and opens the official pages", async () => {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  await render();
  await act(async () => button("Copier").click());
  expect(writeText).toHaveBeenCalledWith("irm https://claude.ai/install.ps1 | iex");
  const codex = [...host.querySelectorAll<HTMLElement>("[data-no-agent] [data-link]")].find((a) => a.textContent?.includes("Codex"))!;
  await act(async () => codex.click());
  expect(openUrl).toHaveBeenCalledWith("https://github.com/openai/codex");
});

it("reads Windows' PATH again before looking for the agents, then shows the steps done (spec §7.2)", async () => {
  await render();
  agents = only("claude");
  calls = [];
  await act(async () => button("Vérifier à nouveau").click());
  expect(calls.filter((c) => c === "refresh_path" || c === "list_agents")).toEqual(["refresh_path", "list_agents"]);
  expect(host.querySelector("[data-no-agent]")).toBeNull();
  expect(panel()!.querySelector<HTMLElement>("li[data-step='agent']")!.dataset.done).toBe("true");
});

it("disappears once an agent is installed and a project added", async () => {
  agents = only("codex");
  projects = [project];
  await render();
  expect(panel()).toBeNull();
  expect(host.querySelector("[data-no-agent]")).toBeNull();
});

it("shows nothing before the agents are known, so it never flashes", async () => {
  projects = [project];
  mockIPC((cmd) => {
    if (cmd === "list_projects") return projects;
    if (cmd === "list_agents" || cmd === "list_shells") return new Promise(() => undefined);
    if (cmd === "plugin:window|is_maximized") return false;
  });
  await render();
  expect(panel()).toBeNull();
});

it("speaks English when the interface does", async () => {
  langStore.setState({ lang: "en" });
  await render();
  expect(panel()?.textContent).toContain("Getting started");
  expect(host.querySelector("[data-no-agent]")!.textContent).toContain("No coding agent found");
  expect(button("Check again")).toBeTruthy();
});

it("says so when listing the agents fails, instead of silently hiding the panel", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_projects") return [];
    if (cmd === "list_agents") throw new Error("boom");
    if (cmd === "list_shells") return [];
    if (cmd === "plugin:window|is_maximized") return false;
  });
  await render();
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("boom"));
});

it("tells screen readers a step is done, with text instead of an aria-label on a span", async () => {
  agents = only("claude");
  await render();
  const done = panel()!.querySelector<HTMLElement>("li[data-step='agent']")!;
  expect(done.querySelector(".sr-only")?.textContent).toBe("fait");
  expect(done.querySelector("[aria-label]")).toBeNull();
});

it("tells the user when the clipboard refuses the install command", async () => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) }, configurable: true });
  await render();
  await act(async () => button("Copier").click());
  expect(toast.error).toHaveBeenCalled();
});
