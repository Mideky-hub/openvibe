// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { toast } from "sonner";
import { showAbout } from "@/app/about";
import { canvasStore, EMPTY_VIEW } from "@/canvas/canvasStore";
import { agentsStore } from "@/fleet/agentsStore";
import { launchAt, launchFour, newConsole, placeOrchestrator } from "@/fleet/quickActions";
import { launchGroup } from "@/fleet/groups";
import { launchAgent } from "@/fleet/launchAgent";
import { addOrchestrator } from "@/fleet/orchestrators";
import { workspacesStore } from "@/store/workspaces";
import { readSource } from "@/theme/cssBlocks";
import { focusCommandBar } from "./commandBarFocus";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("@/fleet/launchAgent", () => ({ launchAgent: vi.fn(() => Promise.resolve()), defaultLaunchOptions: () => ({ cwd: "C:/code", shell: "default", title: "", command: "" }) }));
vi.mock("@/fleet/orchestrators", () => ({ addOrchestrator: vi.fn(() => Promise.resolve()) }));
vi.mock("@/fleet/groups", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/fleet/groups")>()),
  launchGroup: vi.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  mockIPC((cmd) => (cmd === "plugin:app|version" ? "0.1.0" : undefined));
  canvasStore.setState({ view: { ...EMPTY_VIEW, width: 1000, height: 800 } });
  workspacesStore.setState({ activeId: "w1" } as never);
});
afterEach(() => {
  clearMocks();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it("tells OpenVibe's version (« À propos d'OpenVibe »)", async () => {
  await showAbout();
  expect(toast).toHaveBeenCalledWith("OpenVibe 0.1.0", { description: "Canvas d'agents local et open source." });
});

it("launches an agent, or places an orchestrator, at the center of the view", () => {
  launchAt("codex");
  const [agent, , center] = vi.mocked(launchAgent).mock.calls[0];
  expect(agent).toBe("codex");
  expect(center).toEqual({ x: 500, y: 400 });
  placeOrchestrator();
  expect(addOrchestrator).toHaveBeenCalledWith("w1", { x: 500, y: 400 });
});

it("launches an agent, places an orchestrator or a group of four where the radial menu was opened", async () => {
  launchAt("codex", { x: 10, y: 20 });
  expect(vi.mocked(launchAgent).mock.lastCall?.[2]).toEqual({ x: 10, y: 20 });
  placeOrchestrator({ x: 30, y: 40 });
  expect(addOrchestrator).toHaveBeenLastCalledWith("w1", { x: 30, y: 40 });
  await launchFour({ x: 50, y: 60 });
  expect(vi.mocked(launchGroup).mock.lastCall?.[2]).toEqual({ x: 50, y: 60 });
});

it("puts the cursor in the command bar's field (« Écrire une consigne »)", () => {
  expect(focusCommandBar()).toBe(false);
  document.body.innerHTML = '<div data-command-bar><textarea></textarea></div>';
  expect(focusCommandBar()).toBe(true);
  expect(document.activeElement).toBe(document.querySelector("textarea"));
  expect(readSource("shell/CommandBar.tsx")).toContain("data-command-bar");
});

it("keeps one implementation of each action: the buttons call the shared ones", () => {
  expect(readSource("shell/ToolRail.tsx")).toContain("fitScene");
  expect(readSource("shell/ZoomControl.tsx")).toContain("zoomTo(");
  expect(readSource("shell/SettingsMenu.tsx")).toContain("exportCurrentScene");
  expect(readSource("shell/SettingsMenu.tsx")).toContain("showAbout");
  expect(readSource("home/HomeScreen.tsx")).toContain('from "./addProject"');
  expect(readSource("shell/WorkspaceTabs.tsx")).toContain('from "./workspaceActions"');
  expect(readSource("shell/WindowControls.tsx")).toContain("toggleMaximizeWindow");
});

it("waits for the agent list before « Nouvelle console », instead of launching a Shell", async () => {
  agentsStore.setState({ agents: [], shells: [], loaded: false });
  mockIPC((cmd) => (cmd === "list_agents" ? [{ id: "claude", available: true }] : cmd === "list_shells" ? [] : undefined));
  await newConsole({ x: 1, y: 2 });
  expect(vi.mocked(launchAgent).mock.lastCall?.[0]).toBe("claude");
});
