import { describe, expect, it } from "vitest";
import type { SceneFrame } from "@/canvas/groups";
import {
  capturePreset,
  MAX_NAME,
  MAX_PRESETS,
  presetAgentCount,
  presetNameOf,
  readPresets,
  withoutPreset,
  withPreset,
  type TeamPreset,
} from "./model";

const frame = (id: string, x: number, y: number, role: string, memberIds: string[], speciality?: string): SceneFrame =>
  ({ id, name: id.toUpperCase(), x, y, width: 800, height: 400, group: { role, pantheon: "egyptian", ...(speciality ? { speciality } : {}) }, memberIds }) as SceneFrame;
const plain = { id: "p", name: "dessin", x: 0, y: 0, width: 10, height: 10, group: null, memberIds: ["t9"] } as SceneFrame;
const agents: Record<string, string> = { a: "claude", b: "codex", c: "claude", d: "gemini" };

const input = (over: Partial<Parameters<typeof capturePreset>[0]> = {}) => ({
  frames: [frame("back", 1000, 500, "backend", ["a", "b"], "API"), frame("tests", 1900, 500, "testers", ["c"]), plain],
  agentOf: (id: string) => agents[id] as never,
  orchestrators: [{ id: "chef", name: "Chef" }, { id: "seul", name: "Seul" }],
  links: { chef: { groupIds: ["tests", "back", "p"], nodeIds: ["x"] }, seul: { groupIds: [], nodeIds: ["a"] } },
  ...over,
});

describe("capturePreset", () => {
  it("keeps the groups, their agents and the orchestrators linked to a group, positions relative to the top-left", () => {
    const preset = capturePreset(input(), "Dev HQ", "id1", 5)!;
    expect(preset).toMatchObject({ id: "id1", name: "Dev HQ", savedAt: 5 });
    expect(preset.groups).toEqual([
      { name: "BACK", role: "backend", speciality: "API", agents: ["claude", "codex"], x: 0, y: 0 },
      { name: "TESTS", role: "testers", agents: ["claude"], x: 900, y: 0 },
    ]);
    // Linked to a plain frame and a terminal too: only the groups stay; the orchestrator without a group is left out.
    expect(preset.orchestrators).toEqual([{ name: "Chef", groups: [1, 0] }]);
    expect(presetAgentCount(preset)).toBe(3);
  });

  it("leaves out a group without agent, and is null without any group to keep", () => {
    const preset = capturePreset(input({ frames: [frame("vide", 0, 0, "docs", []), frame("back", 40, 60, "backend", ["a"])] }), "X", "i", 1)!;
    expect(preset.groups.map((g) => g.name)).toEqual(["BACK"]);
    expect(preset.groups[0]).toMatchObject({ x: 0, y: 0 });
    expect(capturePreset(input({ frames: [plain] }), "X", "i", 1)).toBeNull();
  });

  it("drops a member whose agent is unknown", () => {
    const preset = capturePreset(input({ agentOf: (id) => (id === "a" ? ("claude" as never) : undefined) }), "X", "i", 1)!;
    expect(preset.groups[0].agents).toEqual(["claude"]);
  });
});

describe("readPresets", () => {
  const good: TeamPreset = { id: "1", name: "A", savedAt: 1, groups: [{ name: "G", role: "backend", agents: ["claude"], x: 0, y: 0 }], orchestrators: [{ name: "C", groups: [0] }] };

  it("reads a good list, and nothing from a damaged setting", () => {
    expect(readPresets({ version: 1, presets: [good] })).toEqual([good]);
    for (const bad of [null, undefined, 3, "x", [], { version: 2, presets: [good] }, { version: 1, presets: "no" }]) expect(readPresets(bad)).toEqual([]);
  });

  it("drops a preset that is invalid and keeps the others", () => {
    const broken = [
      { ...good, id: "2", name: "" },
      { ...good, id: "3", groups: [] },
      { ...good, id: "4", groups: [{ ...good.groups[0], role: "nope" }] },
      { ...good, id: "5", groups: [{ ...good.groups[0], agents: ["claude", "robot"] }] },
      { ...good, id: "6", orchestrators: [{ name: "C", groups: [7] }] },
      { ...good, id: "7", groups: [{ ...good.groups[0], agents: Array(13).fill("claude") }] },
      { ...good, id: "8", groups: [{ ...good.groups[0], x: "left" }] },
    ];
    expect(readPresets({ version: 1, presets: [...broken, good] })).toEqual([good]);
  });

  it("keeps at most 50 presets and trims names", () => {
    const many = Array.from({ length: MAX_PRESETS + 5 }, (_, i) => ({ ...good, id: String(i), name: ` n${i} ` }));
    const read = readPresets({ version: 1, presets: many });
    expect(read).toHaveLength(MAX_PRESETS);
    expect(read[0].name).toBe("n0");
  });
});

describe("names and the list", () => {
  const preset = (name: string, id = name): TeamPreset => ({ id, name, savedAt: 1, groups: [{ name: "G", role: "docs", agents: ["claude"], x: 0, y: 0 }], orchestrators: [] });

  it("trims a name, refuses an empty one and cuts a long one", () => {
    expect(presetNameOf("  Dev   HQ ")).toBe("Dev HQ");
    expect(presetNameOf("   ")).toBeNull();
    expect(presetNameOf("x".repeat(MAX_NAME + 20))).toHaveLength(MAX_NAME);
  });

  it("replaces a preset of the same name whatever the case, else appends, and is full at 50", () => {
    const list = [preset("Dev HQ", "1"), preset("Tests", "2")];
    expect(withPreset(list, preset("dev hq", "9"))!.map((p) => p.id)).toEqual(["9", "2"]);
    expect(withPreset(list, preset("Docs", "3"))!.map((p) => p.id)).toEqual(["1", "2", "3"]);
    const full = Array.from({ length: MAX_PRESETS }, (_, i) => preset(`p${i}`));
    expect(withPreset(full, preset("new"))).toBeNull();
    expect(withPreset(full, preset("P3", "z"))).not.toBeNull();
  });

  it("removes a preset by id", () => {
    expect(withoutPreset([preset("A", "1"), preset("B", "2")], "1").map((p) => p.id)).toEqual(["2"]);
  });
});
