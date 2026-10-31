// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { canvasStore } from "@/canvas/canvasStore";
import { BOTTOM_BAR_HEIGHT, TOP_ROW_HEIGHT } from "@/shell/layout";
import { nodesStore } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { requestUi } from "@/commands/uiRequests";
import { agentsPanelStore } from "./agentsPanelState";
import { AgentsPanel } from "./AgentsPanel";
import { newConsole } from "./quickActions";

// Excalidraw does not load under Vitest (roughjs); the panel only reaches it through menu actions.
vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("./quickActions", () => ({ newConsole: vi.fn(), launchFour: vi.fn(), placeOrchestrator: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  // The composer loads the agents and shells when it opens.
  mockIPC((cmd) => (cmd.startsWith("list_") ? [] : undefined));
  agentsPanelStore.setState({ open: true, filter: "all" });
  await nodesStore.getState().create("ada", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: "Ada", name: "Ada", agent: "claude", cwd: "C:/code", shell: "default", command: "" },
  });
  terminalStatusStore.getState().set("ada", { state: "stopped" });
  canvasStore.getState().setNodeIds(["ada"]);
  canvasStore.setState({ frames: [] });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<AgentsPanel />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  clearMocks();
});

const byLabel = (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);

it("floats under the tabs, down to the command bar at most, with the chips' actions (spec identité §5.6)", () => {
  const panel = host.firstElementChild as HTMLElement;
  expect(panel.style.top).toBe(`${TOP_ROW_HEIGHT + 14}px`);
  expect(panel.style.maxHeight).toBe(`calc(100% - ${TOP_ROW_HEIGHT + 14 + BOTTOM_BAR_HEIGHT + 14}px)`);
  for (const label of ["Lancer un agent", "Nouvelle console", "Composer un groupe", "Tout mettre en pause", "Tout reprendre", "Plus d'actions", "Fermer le panneau"]) {
    expect(byLabel(label), label).not.toBeNull();
  }
});

it("starts « Nouvelle console » at the center of the view, the click not taken for a point", async () => {
  await act(async () => byLabel("Nouvelle console")!.click());
  expect(newConsole).toHaveBeenCalledWith();
});

it("filters on the store's filter, labelled Prêts for idle agents", async () => {
  const filters = [...host.querySelectorAll<HTMLButtonElement>("[data-filter]")];
  expect(filters.map((f) => f.textContent?.replace(/\d+$/, ""))).toEqual(["Tous", "En cours", "Attend", "Actifs", "Prêts", "Arrêtés"]);
  await act(async () => filters[5].click());
  expect(agentsPanelStore.getState().filter).toBe("stopped");
  expect(filters[5].dataset.on).toBe("true");
});

it("wraps its filters rather than clipping one, and says when a filter hides every agent", async () => {
  const row = host.querySelector("[data-filter]")!.parentElement!;
  expect(row.className).toContain("flex-wrap");
  await act(async () => agentsPanelStore.setState({ filter: "working" }));
  expect(host.textContent).toContain("Aucun agent dans ce filtre");
  await act(async () => canvasStore.getState().setNodeIds([]));
  await act(async () => agentsPanelStore.setState({ filter: "all" }));
  expect(host.textContent).toContain("Aucun agent");
  expect(host.textContent).not.toContain("dans ce filtre");
});

it("offers a group's menu on its header, on hover; « Hors groupe » has none (spec identité §5.6)", async () => {
  expect(host.querySelector('[aria-label="Menu du groupe"]')).toBeNull();
  await act(async () =>
    canvasStore.setState({
      frames: [{ id: "g1", name: "Backend", x: 0, y: 0, width: 10, height: 10, group: { role: "general", pantheon: "egypt" }, memberIds: ["ada"] }],
    }),
  );
  const menu = host.querySelector<HTMLButtonElement>('[aria-label="Menu du groupe"]')!;
  expect(menu.closest("[data-group-header]")!.querySelector("[data-section]")!.textContent).toContain("Backend");
  expect(menu.className).toContain("group-hover/section:opacity-100");
  await act(async () => menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect([...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)).toContain("Renommer");
});

it("folds a group and closes", async () => {
  expect(host.textContent).toContain("Ada");
  await act(async () => host.querySelector<HTMLButtonElement>("[data-section]")!.click());
  expect(host.textContent).not.toContain("Ada");
  await act(async () => byLabel("Fermer le panneau")!.click());
  expect(agentsPanelStore.getState().open).toBe(false);
});

it("opens « Composer un groupe » and a group's menu on request", async () => {
  await act(async () => requestUi({ kind: "composeGroup" }));
  expect(document.querySelector('[data-slot="popover-content"]')).not.toBeNull();
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await act(async () =>
    canvasStore.setState({
      frames: [{ id: "g1", name: "Backend", x: 0, y: 0, width: 10, height: 10, group: { role: "general", pantheon: "egypt" }, memberIds: ["ada"] }],
    }),
  );
  await act(async () => requestUi({ kind: "groupMenu", id: "g1" }));
  expect([...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)).toContain("Renommer");
});
