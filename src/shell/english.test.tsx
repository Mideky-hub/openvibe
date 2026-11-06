// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { activityThresholdStore } from "@/app/agentSettings";
import { canvasStore } from "@/canvas/canvasStore";
import { agentsStore } from "@/fleet/agentsStore";
import { defaultAgentStore } from "@/fleet/defaultAgentChoice";
import { AGENT_IDS } from "@/ipc/pty";
import { HomeScreen } from "@/home/HomeScreen";
import { ProjectCard } from "@/home/ProjectCard";
import { homeMessages } from "@/home/messages";
import { langStore, messages } from "@/i18n";
import { setLanguage } from "@/i18n/settings";
import { nodesStore } from "@/store/nodes";
import { projectsStore } from "@/store/projects";
import { uiStore } from "@/store/ui";
import { CloseAgentDialog } from "./CloseAgentDialog";
import { ProjectPicker } from "./ProjectPicker";
import { SettingsMenu } from "./SettingsMenu";
import { ToolRail } from "./ToolRail";
import { shellMessages } from "./messages";

// Excalidraw does not load under Vitest (roughjs).
vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/i18n/settings", () => ({ setLanguage: vi.fn(() => Promise.resolve()), loadLanguage: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  langStore.setState({ choice: "system", lang: "en" });
  mockWindows("main");
  mockIPC((cmd) => (cmd.startsWith("list_") ? [] : cmd === "plugin:window|is_maximized" ? false : undefined), { shouldMockEvents: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  clearMocks();
  vi.clearAllMocks();
  langStore.setState({ choice: "system", lang: "fr" });
});

const open = (trigger: Element) => act(async () => void trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
const menuItems = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')];

it("the tool rail speaks English", async () => {
  canvasStore.setState({ api: null });
  await act(async () => root.render(<ToolRail />));
  const labels = [...host.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
  expect(labels).toEqual(["Select (V)", "Hand (H)", "Shapes", "Text (T)", "Pen (P)", "Eraser (E)", "Image", "Icons", "Launch an agent", "Fit the view"]);
});

it("the project picker menu speaks English", async () => {
  projectsStore.setState({ projects: [], activeId: null } as never);
  await act(async () => root.render(<ProjectPicker />));
  expect(host.querySelector("button")!.textContent).toBe("Project");
  await open(host.querySelector("button")!);
  expect(menuItems().map((i) => i.textContent)).toEqual(["All projects…", "Close the project"]);
});

it("the settings menu offers the language, applies a choice, and its labels are English", async () => {
  await act(async () => root.render(<SettingsMenu trigger={<button type="button">gear</button>} />));
  await open(host.querySelector("button")!);
  const items = menuItems();
  expect(items.map((i) => i.textContent?.trim())).toEqual([
    "System",
    "Light (Ivory)",
    "Dark (Clay)",
    "Transparency effects",
    "System",
    "Français",
    "English",
    "Default agent",
    "Activity threshold",
    "Keyboard shortcuts…",
    "Export the scene…",
    "Import a scene…",
    "Export as PNG…",
    "Windows notifications",
    "Check for updates automatically",
    "Check for updates",
    "About OpenVibe",
    "Open the logs folder",
    "Troubleshooting…",
  ]);
  expect(document.body.textContent).toContain("Language");
  expect(items[4].getAttribute("aria-checked")).toBe("true");
  await act(async () => items[5].click());
  expect(setLanguage).toHaveBeenCalledWith("fr");
});

const openSub = (label: string) => {
  const trigger = menuItems().find((i) => i.textContent?.trim() === label)!;
  return act(async () => {
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
};

it("the settings menu sets the default agent among those found, and the activity threshold (issue #84)", async () => {
  agentsStore.setState({ agents: AGENT_IDS.map((id) => ({ id, available: id === "claude" || id === "gemini" })), loaded: true } as never);
  await act(async () => root.render(<SettingsMenu trigger={<button type="button">gear</button>} />));
  await open(host.querySelector("button")!);
  await openSub("Default agent");
  const agents = menuItems().filter((i) => i.getAttribute("role") === "menuitemradio" && i.closest('[data-slot="dropdown-menu-sub-content"]'));
  expect(agents.map((i) => i.textContent?.trim())).toEqual(["Automatic (Claude, Codex, Shell)", "Claude", "Codex", "Gemini", "Qwen Code", "Cursor", "OpenCode", "Aider", "Shell"]);
  expect(agents.find((i) => i.textContent === "Codex")!.getAttribute("aria-disabled")).toBe("true");
  expect(agents.find((i) => i.textContent === "Shell")!.getAttribute("aria-disabled")).toBeNull();
  await act(async () => agents.find((i) => i.textContent === "Gemini")!.click());
  expect(defaultAgentStore.getState().choice).toBe("gemini");
  defaultAgentStore.setState({ choice: "auto" });

  await open(host.querySelector("button")!);
  await openSub("Activity threshold");
  const thresholds = menuItems().filter((i) => i.closest('[data-slot="dropdown-menu-sub-content"]'));
  expect(thresholds.map((i) => i.textContent?.trim())).toEqual(["1 s", "1.5 s", "3 s", "5 s"]);
  expect(thresholds[1].getAttribute("aria-checked")).toBe("true");
  await act(async () => thresholds[2].click());
  expect(activityThresholdStore.getState().ms).toBe(3000);
  activityThresholdStore.setState({ ms: 1500 });
});

it("the settings menu marks the saved language choice", async () => {
  langStore.setState({ choice: "fr", lang: "fr" });
  await act(async () => root.render(<SettingsMenu trigger={<button type="button">gear</button>} />));
  await open(host.querySelector("button")!);
  const checked = menuItems().filter((i) => i.getAttribute("aria-checked") === "true").map((i) => i.textContent);
  expect(checked).toContain("Français");
  expect(document.body.textContent).toContain("Langue");
});

it("the home screen speaks English", async () => {
  await act(async () => root.render(<HomeScreen />));
  expect(host.querySelector("h1")!.textContent).toBe("Projects");
  expect(host.textContent).toContain("Add a project");
  expect(host.textContent).toContain("No projects");
  expect(host.textContent).toContain("Search for a project");
});

it("a project card counts in English", async () => {
  const project = { id: "p1", name: "mk", path: "C:/mk", position: 0, lastOpenedAt: Date.now(), workspaceCount: 1, missing: false, liveAgents: 2 };
  await act(async () => root.render(<ProjectCard project={project} />));
  expect(host.textContent).toContain("1 workspace");
  expect(host.textContent).toContain("2 active agents");
  expect(host.textContent).toContain("just now");
});

it("the close agent dialog speaks English", async () => {
  await nodesStore.getState().create("t1", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: "Isis", name: "Isis", agent: "claude", cwd: "C:/code", shell: "default", command: "" },
  });
  uiStore.getState().setClosing({ agents: ["t1"], remove: ["t1"] } as never);
  await act(async () => root.render(<CloseAgentDialog />));
  expect(document.body.textContent).toContain("Close Isis?");
  expect(document.body.textContent).toContain("Isis is still running. Closing it ends its session.");
  expect(document.body.textContent).toContain("Cancel");
  expect(document.body.textContent).toContain("Close the agent");
  uiStore.getState().setClosing(null);
});

it("sentences with a count follow English grammar", () => {
  const t = messages(shellMessages);
  expect(t.removeWorkspace.confirm("API", 1)).toBe('Delete "API"? 1 agent will be stopped and its contents erased.');
  expect(t.removeWorkspace.confirm("API", 3)).toBe('Delete "API"? 3 agents will be stopped and its contents erased.');
  expect(t.removeWorkspace.confirm("API", 0)).toBe('Delete "API"? Its contents will be erased.');
  expect(t.agentCounts.activeCount(3)).toBe("3 active");
  expect(t.percent(56)).toBe("56%");
  expect(messages(homeMessages).card.workspaces(0)).toBe("0 workspaces");
});
