import { describe, expect, it, vi } from "vitest";
import { groupGrid } from "@/fleet/groupLayout";
import type { GroupPlan } from "@/fleet/groups";
import type { TeamPreset } from "./model";
import { deployPreset, type DeployDeps } from "./deploy";

const preset: TeamPreset = {
  id: "1",
  name: "Dev HQ",
  savedAt: 1,
  groups: [
    { name: "Backend", role: "backend", speciality: "API", agents: ["claude", "codex"], x: 0, y: 0 },
    { name: "Tests", role: "testers", agents: ["gemini"], x: 1000, y: 0 },
  ],
  orchestrators: [{ name: "Chef", groups: [1, 0] }],
};

function deps(over: Partial<DeployDeps> = {}) {
  const calls: string[] = [];
  const plans: { plan: GroupPlan; at: { x: number; y: number } }[] = [];
  const made: DeployDeps = {
    center: { x: 0, y: 0 },
    obstacles: [],
    fallback: "shell",
    isAvailable: () => true,
    launchGroup: vi.fn(async (plan: GroupPlan, at: { x: number; y: number }) => {
      plans.push({ plan, at });
      calls.push(`group ${plan.name}`);
      return { frameId: `f${plans.length}`, nodeIds: plan.agents.map((_a: string, i: number) => `n${plans.length}${i}`) };
    }),
    orchestrate: vi.fn(async (groupId) => {
      calls.push(`orchestrate ${groupId}`);
      return "chef1";
    }),
    link: vi.fn((o, g) => void calls.push(`link ${o} ${g}`)),
    rename: vi.fn((o, name) => void calls.push(`rename ${o} ${name}`)),
    fit: vi.fn((ids: string[]) => void calls.push(`fit ${ids.join(",")}`)),
    ...over,
  };
  return { made, calls, plans };
}

describe("deployPreset", () => {
  it("poses each group in order, then the orchestrator linked to the first of its groups, then the others, and says what it made", async () => {
    const { made, calls } = deps();
    const result = await deployPreset(preset, made);
    // The view ends on the whole team: every group and orchestrator posed, once, after the last one.
    expect(calls).toEqual(["group Backend", "group Tests", "orchestrate f2", "link chef1 f1", "rename chef1 Chef", "fit f1,f2,chef1"]);
    expect(result).toEqual({ groups: 2, agents: 3, orchestrators: 1, substituted: 0, orchestratorsSkipped: 0 });
  });

  it("poses each group with its role and speciality: its agents start knowing them", async () => {
    const { made, plans } = deps();
    await deployPreset(preset, made);
    expect(plans.map(({ plan }) => plan)).toEqual([
      { name: "Backend", role: "backend", speciality: "API", agents: ["claude", "codex"] },
      { name: "Tests", role: "testers", agents: ["gemini"] },
    ]);
  });

  it("keeps the team's shape around the view's center: relative positions, each group centered on its own grid", async () => {
    const { made, plans } = deps();
    await deployPreset(preset, made);
    const [first, second] = plans;
    const one = groupGrid(2);
    const two = groupGrid(1);
    // The groups' tops are 1000 apart in x and level: their centers follow their own grids.
    expect(second.at.x - first.at.x).toBe(1000 + (two.width - one.width) / 2);
    expect(second.at.y - first.at.y).toBe((two.height - one.height) / 2);
    // The whole team's box is centered on the view.
    const width = 1000 + two.width;
    expect(first.at.x - one.width / 2).toBe(-width / 2);
  });

  it("pushes the team below what the view's center would cover", async () => {
    const { made, plans } = deps({ obstacles: [{ x: -5000, y: -5000, width: 10000, height: 10000 }] });
    await deployPreset(preset, made);
    expect(plans[0].at.y).toBeGreaterThan(5000);
  });

  it("replaces an agent missing from this computer by the default one, and counts it", async () => {
    const { made, plans } = deps({ isAvailable: (agent) => agent !== "codex" });
    const result = await deployPreset(preset, made);
    expect(plans[0].plan.agents).toEqual(["claude", "shell"]);
    expect(result.substituted).toBe(1);
  });

  it("leaves the orchestrator out without Claude Code, and says so", async () => {
    const { made, calls } = deps({ orchestrate: vi.fn(async () => null) });
    const result = await deployPreset(preset, made);
    expect(calls.some((c) => c.startsWith("link") || c.startsWith("rename"))).toBe(false);
    expect(result).toMatchObject({ orchestrators: 0, orchestratorsSkipped: 1 });
  });

  it("goes on with the next group when one cannot be posed", async () => {
    const launch = vi.fn(async (plan: GroupPlan) => (plan.name === "Backend" ? null : { frameId: "f9", nodeIds: ["n"] }));
    const { made, calls } = deps({ launchGroup: launch });
    const result = await deployPreset(preset, made);
    expect(result.groups).toBe(1);
    // The orchestrator links to what exists: the second group only.
    expect(calls).toContain("orchestrate f9");
    expect(calls.some((c) => c.startsWith("link"))).toBe(false);
  });
});

it("fits nothing when nothing was posed", async () => {
  const { made } = deps({ launchGroup: vi.fn(async () => null) });
  await deployPreset(preset, made);
  expect(made.fit).not.toHaveBeenCalled();
});
