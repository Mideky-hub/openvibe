// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { canvasStore } from "@/canvas/canvasStore";
import { agentsPanelStore } from "@/fleet/agentsPanelState";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore } from "@/store/nodes";
import { closeStudio, studioStore } from "@/studio/studioStore";
import { terminalStatusStore } from "@/store/terminalStatus";
import { ActivityRail } from "./ActivityRail";

// Excalidraw does not load under Vitest (roughjs); the rail only reaches it through the settings menu's actions.
vi.mock("@excalidraw/excalidraw", () => ({}));

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

it("opens the code studio (spec studio code §6)", async () => {
  closeStudio();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ActivityRail />));
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Studio Code"]')!.click());
  expect(studioStore.getState().open).toBe(true);
  closeStudio();
  await act(async () => root.unmount());
  host.remove();
});
