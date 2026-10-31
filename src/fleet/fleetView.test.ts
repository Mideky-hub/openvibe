import { describe, expect, it } from "vitest";
import type { SceneFrame } from "@/canvas/groups";
import { filterCounts, fleetSections, fleetStateOf, type FleetAgent } from "./fleetView";

const agent = (id: string, state: FleetAgent["state"]): FleetAgent => ({ id, name: id, agent: "claude", state, since: 0 });
const frame = (id: string, memberIds: string[], role: "backend" | "docs" | null = "backend"): SceneFrame => ({
  id,
  name: id.toUpperCase(),
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  group: role ? { role, pantheon: "greek" } : null,
  memberIds,
});

describe("fleetStateOf", () => {
  it("takes the activity of a running agent, active (like its pill) while unknown", () => {
    expect(fleetStateOf({ state: "running" }, { activity: "waiting", since: 1 })).toBe("waiting");
    expect(fleetStateOf({ state: "running" })).toBe("active");
    expect(fleetStateOf({ state: "starting" })).toBe("idle");
  });

  it("calls every other process state stopped", () => {
    expect(fleetStateOf({ state: "stopped" }, { activity: "working", since: 1 })).toBe("stopped");
    expect(fleetStateOf({ state: "exited", code: 0 })).toBe("stopped");
    expect(fleetStateOf({ state: "error", message: "x" })).toBe("stopped");
  });
});

describe("fleetSections", () => {
  const agents = [agent("a", "working"), agent("b", "idle"), agent("c", "waiting"), agent("d", "stopped")];
  const frames = [frame("g1", ["a", "b"]), frame("plain", ["c"], null), frame("g2", ["d"], "docs")];

  it("lists each group in scene order, then the agents outside groups", () => {
    const sections = fleetSections(agents, frames, "all");
    expect(sections.map((s) => [s.id, s.name, s.agents.map((a) => a.id)])).toEqual([
      ["g1", "G1", ["a", "b"]],
      ["g2", "G2", ["d"]],
      [null, "Hors groupe", ["c"]],
    ]);
    expect(sections[0].color).toBe("#AA88D2");
    expect(sections[2].color).toBeNull();
  });

  it("keeps only the agents of the filter and drops empty sections", () => {
    expect(fleetSections(agents, frames, "working").map((s) => [s.id, s.agents.map((a) => a.id)])).toEqual([["g1", ["a"]]]);
    expect(fleetSections(agents, frames, "waiting").map((s) => s.id)).toEqual([null]);
  });
});

describe("filterCounts", () => {
  it("counts the agents of each filter", () => {
    expect(filterCounts([agent("a", "working"), agent("b", "working"), agent("c", "stopped")])).toEqual({
      all: 3,
      working: 2,
      waiting: 0,
      active: 0,
      idle: 0,
      stopped: 1,
    });
  });
});
