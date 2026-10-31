// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { requestUi } from "@/commands/uiRequests";
import { nodesStore, sessionOf } from "@/store/nodes";
import { markForAutostart, mountTerminal } from "../terminal/registry";
import { MISSING_GRACE_MS } from "../terminal/MissingNode";
import { OrchestratorNode } from "./OrchestratorNode";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("../terminal/registry", () => ({ mountTerminal: vi.fn(), layoutTerminal: vi.fn(), markForAutostart: vi.fn(), relaunchTerminal: vi.fn() }));
// happy-dom may lack it; the node observes its terminal's host.
globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("opens its name editor on request (« Renommer » of its radial menu)", async () => {
  mockIPC(() => undefined);
  await nodesStore.getState().create("chef", { workspaceId: "w1", kind: "orchestrator", payload: { name: "chef de backend" } });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<OrchestratorNode nodeId="chef" />));
  expect(host.querySelector("header input")).toBeNull();
  await act(async () => requestUi({ kind: "renameOrchestrator", id: "chef" }));
  const field = host.querySelector<HTMLInputElement>("header input")!;
  expect(field.value).toBe("chef de backend");
  expect(document.activeElement).toBe(field);
  await act(async () => root.unmount());
  host.remove();
});

it("gives an orchestrator of before its Claude session, and shows its terminal (spec orchestrateur §6)", async () => {
  mockIPC(() => undefined);
  await nodesStore.getState().create("ancien", { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef" } });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<OrchestratorNode nodeId="ancien" />));
  const session = sessionOf(nodesStore.getState().nodes.ancien)!;
  expect(session).toMatchObject({ name: "Chef", agent: "claude", role: "orchestrator" });
  expect(session.claudeSessionId).toMatch(/^[0-9a-f-]{36}$/);
  expect(markForAutostart).toHaveBeenCalledWith("ancien");
  expect(mountTerminal).toHaveBeenCalledWith("ancien", expect.any(HTMLElement), session, 1);
  expect(host.querySelector('[data-orchestrator="ancien"] textarea')).toBeNull();
  expect(host.querySelector('[data-mission="ancien"]')).not.toBeNull();
  await act(async () => root.unmount());
  host.remove();
});

it("does not flash « introuvable » while a copy's record is on its way", async () => {
  vi.useFakeTimers();
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<OrchestratorNode nodeId="copie-fantome" />));
  expect(host.textContent).toBe("");
  await act(async () => void vi.advanceTimersByTime(MISSING_GRACE_MS + 1));
  expect(host.textContent).not.toBe("");
  vi.useRealTimers();
  await act(async () => root.unmount());
});
