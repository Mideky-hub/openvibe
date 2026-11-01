// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { canvasStore } from "@/canvas/canvasStore";
import { agentsPanelStore } from "@/fleet/agentsPanelState";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore } from "@/store/nodes";
import { closeNotes, notesStore } from "@/notes/notesStore";
import { openCodeWorkspace } from "@/studio/navigate";
import { projectsStore } from "@/store/projects";
import { terminalStatusStore } from "@/store/terminalStatus";
import { ActivityRail } from "./ActivityRail";

// Excalidraw does not load under Vitest (roughjs); the rail only reaches it through the settings menu's actions.
vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/studio/navigate", () => ({ openCodeWorkspace: vi.fn(async () => undefined) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => mockIPC(() => undefined));
afterEach(() => clearMocks());

it("toggles the agents panel and shows how many agents wait (spec identité §5.5)", async () => {
  await nodesStore.getState().create("alan", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: "Alan", name: "Alan", agent: "codex", cwd: "C:/code", shell: "default", command: "" },
  });
  terminalStatusStore.getState().set("alan", { state: "running" });
  agentActivityStore.getState().apply({ nodeId: "alan", activity: "waiting", since: 0 });
  canvasStore.getState().setNodeIds(["alan"]);
  agentsPanelStore.setState({ open: false, filter: "all" });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ActivityRail />));
  const agents = host.querySelector<HTMLButtonElement>('[aria-label="Agents"]')!;
  expect(agents.querySelector("[data-pip]")?.textContent).toBe("1");
  await act(async () => agents.click());
  expect(agentsPanelStore.getState().open).toBe(true);
  expect(host.querySelector('[aria-label="Réglages"]')).not.toBeNull();
  await act(async () => root.unmount());
  host.remove();
});

it("opens the notes (spec notes §6)", async () => {
  closeNotes();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ActivityRail />));
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Notes"]')!.click());
  expect(notesStore.getState().open).toBe(true);
  closeNotes();
  await act(async () => root.unmount());
  host.remove();
});

it("opens the code studio (spec studio code §6)", async () => {
  projectsStore.setState({ activeId: "p1" });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ActivityRail />));
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Code Studio"]')!.click());
  expect(openCodeWorkspace).toHaveBeenCalled();
  projectsStore.setState({ activeId: null });
  await act(async () => root.unmount());
  host.remove();
});
