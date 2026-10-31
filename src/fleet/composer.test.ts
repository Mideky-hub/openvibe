import { describe, expect, it } from "vitest";
import { agentsOf, resizeSlots } from "./composer";

describe("resizeSlots", () => {
  it("keeps the agents already chosen and adds default slots", () => {
    expect(resizeSlots(["codex"], 3)).toEqual(["codex", null, null]);
  });

  it("drops the last slots when the group shrinks", () => {
    expect(resizeSlots(["codex", "claude", null], 2)).toEqual(["codex", "claude"]);
  });

  it("keeps a group between 1 and 12 agents", () => {
    expect(resizeSlots([], 0)).toHaveLength(1);
    expect(resizeSlots([], 40)).toHaveLength(12);
  });
});

describe("agentsOf", () => {
  it("gives the default agent to the slots nobody chose", () => {
    expect(agentsOf(["codex", null], "claude")).toEqual(["codex", "claude"]);
  });
});
