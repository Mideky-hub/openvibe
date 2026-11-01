import { beforeEach, expect, it, vi } from "vitest";
import { setKeepAwake } from "@/ipc/mission";
import { nodesStore, type NodeRecord } from "@/store/nodes";
import { installKeepAwake, wantsAwake } from "./keepAwake";
import { NEW_MISSION, type Mission } from "./mission";
import { setOrchestratorClosed } from "./store";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/ipc/mission", () => ({ setKeepAwake: vi.fn(() => Promise.resolve()) }));

const orchestrator = (mission: Partial<Mission>): NodeRecord => ({ workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef", mission: { ...NEW_MISSION, ...mission } } });

beforeEach(() => {
  vi.clearAllMocks();
  nodesStore.setState({ nodes: {} });
});

it("keeps the PC awake during a running night only (spec mission de nuit §5.4)", () => {
  expect(wantsAwake({ chef: orchestrator({ state: "en_cours", overnight: true }) })).toBe(true);
  expect(wantsAwake({ chef: orchestrator({ state: "plan", overnight: true }) })).toBe(false);
  expect(wantsAwake({ chef: orchestrator({ state: "terminee", overnight: true }) })).toBe(false);
  expect(wantsAwake({ chef: orchestrator({ state: "en_cours" }) })).toBe(false);
});

it("lets go of a closed orchestrator's night", () => {
  setOrchestratorClosed("chef", true);
  expect(wantsAwake({ chef: orchestrator({ state: "en_cours", overnight: true }) })).toBe(false);
  setOrchestratorClosed("chef", false);
});

it("takes the PC at the start of the night and releases it at the end, once each", () => {
  const off = installKeepAwake();
  vi.mocked(setKeepAwake).mockClear();
  nodesStore.setState({ nodes: { chef: orchestrator({ state: "en_cours", overnight: true }) } });
  nodesStore.setState({ nodes: { chef: orchestrator({ state: "en_cours", overnight: true, name: "x" }) } });
  expect(vi.mocked(setKeepAwake).mock.calls).toEqual([[true]]);
  nodesStore.setState({ nodes: { chef: orchestrator({ state: "terminee", overnight: true }) } });
  expect(vi.mocked(setKeepAwake).mock.calls).toEqual([[true], [false]]);
  off();
});

it("takes it back at the start when a night was already running", () => {
  nodesStore.setState({ nodes: { chef: orchestrator({ state: "en_cours", overnight: true }) } });
  const off = installKeepAwake();
  expect(setKeepAwake).toHaveBeenCalledWith(true);
  off();
});

it("does not hold the PC past the night when the orchestrator never finished (review)", () => {
  const min = 60_000;
  const night = { chef: orchestrator({ state: "en_cours", overnight: true, startedAt: 0, budgetMin: 60 }) };
  expect(wantsAwake(night, 59 * min)).toBe(true);
  expect(wantsAwake(night, 85 * min)).toBe(true);
  expect(wantsAwake(night, 91 * min)).toBe(false);
});

it("lets go at the start too: a reloaded page must release what Rust still holds (review)", () => {
  const off = installKeepAwake();
  expect(vi.mocked(setKeepAwake).mock.calls).toEqual([[false]]);
  off();
});
