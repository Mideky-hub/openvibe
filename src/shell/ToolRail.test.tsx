// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { launchFour, newConsole } from "@/fleet/quickActions";
import { launchAgent } from "@/fleet/launchAgent";
import { agentsStore } from "@/fleet/agentsStore";
import { requestUi } from "@/commands/uiRequests";
import { ToolRail } from "./ToolRail";

// Excalidraw does not load under Vitest (roughjs); the rail drives it through the store's api only.
vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/kanban/place", () => ({ placeKanban: vi.fn() }));
vi.mock("@/fleet/quickActions", () => ({ newConsole: vi.fn(), launchFour: vi.fn(), placeOrchestrator: vi.fn() }));
vi.mock("@/fleet/launchAgent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/fleet/launchAgent")>()),
  launchAgent: vi.fn(() => Promise.resolve()),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const setActiveTool = vi.fn();

beforeEach(async () => {
  mockIPC((cmd) => (cmd.startsWith("list_") ? [] : undefined));
  setActiveTool.mockClear();
  canvasStore.setState({ api: { setActiveTool } as unknown as ExcalidrawImperativeAPI });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ToolRail />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  clearMocks();
});

const byLabel = (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;

it("offers the canvas tools in the spec's order, each setting its Excalidraw tool (spec identité §5.4)", async () => {
  const labels = [...host.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
  expect(labels).toEqual(["Sélection (V)", "Main (H)", "Formes", "Texte (T)", "Stylo (P)", "Gomme (E)", "Image", "Icônes", "Lancer un agent", "Ajuster la vue"]);
  const tools: [string, string][] = [
    ["Sélection (V)", "selection"],
    ["Main (H)", "hand"],
    ["Texte (T)", "text"],
    ["Gomme (E)", "eraser"],
    ["Image", "image"],
  ];
  for (const [label, type] of tools) {
    await act(async () => byLabel(label).click());
    expect(setActiveTool).toHaveBeenLastCalledWith({ type });
  }
});

it("holds the catalog, Nouvelle console, Lancer 4 agents, Orchestrateur and Kanban in its ＋ (spec identité §5.4, §11)", async () => {
  const menuEntries = () =>
    [...document.querySelectorAll<HTMLButtonElement>('[data-slot="popover-content"] button')].map((b) => b.textContent ?? "");
  await act(async () => byLabel("Lancer un agent").click());
  const entries = menuEntries();
  expect(entries[0]).toContain("Claude");
  expect(entries.slice(-5, -1)).toEqual(["Nouvelle console", "Lancer 4 agents", expect.stringContaining("Orchestrateur"), expect.stringContaining("Kanban")]);
  const click = (text: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('[data-slot="popover-content"] button')].find((b) => b.textContent === text)!.click();
  await act(async () => click("Nouvelle console"));
  expect(newConsole).toHaveBeenCalledTimes(1);
  await act(async () => byLabel("Lancer un agent").click());
  await act(async () => click("Lancer 4 agents"));
  expect(launchFour).toHaveBeenCalledTimes(1);
});

it("opens the ＋ menu on request, on the custom command's options or on Ollama's models", async () => {
  await act(async () => requestUi({ kind: "agentMenu", view: "options" }));
  expect(document.querySelector('[data-slot="popover-content"]')!.textContent).toContain("Lancer la commande personnalisée");
});

it("launches the agent chosen in the ＋ menu where the radial menu was opened (« Autre agent… »)", async () => {
  await act(async () => requestUi({ kind: "agentMenu", view: "agents", at: { x: 10, y: 20 } }));
  await act(async () => agentsStore.setState({ agents: [{ id: "claude", available: true }] } as never));
  const menu = document.querySelector('[data-slot="popover-content"]')!;
  expect(menu.textContent).toContain("lancé là où tu as cliqué");
  const claude = [...menu.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Claude"))!;
  await act(async () => claude.click());
  expect(launchAgent).toHaveBeenCalledWith("claude", expect.objectContaining({ shell: expect.any(String) }), { x: 10, y: 20 });
});
