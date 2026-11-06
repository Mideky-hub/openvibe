import type { Rect } from "@/canvas/groups";
import { clearSpot, groupGrid } from "@/fleet/groupLayout";
import type { GroupPlan } from "@/fleet/groups";
import type { Point } from "@/fleet/terminals";
import type { AgentId } from "@/ipc/pty";
import type { TeamPreset } from "./model";

/** What deploying needs from the app: tests give it fakes, so no real agent ever starts (spec presets §3). */
export interface DeployDeps {
  /** The center of the view, in scene coordinates. */
  center: Point;
  /** What already covers the scene. */
  obstacles: readonly Rect[];
  /** Replaces an agent not found on this computer. */
  fallback: AgentId;
  isAvailable: (agent: AgentId) => boolean;
  /** Poses a group centered on `at`; null when it could not. */
  launchGroup: (plan: GroupPlan, at: Point) => Promise<{ frameId: string; nodeIds: string[] } | null>;
  /** A new orchestrator linked to a group; its id, or null (without Claude Code, nothing is posed). */
  orchestrate: (groupId: string) => Promise<string | null>;
  link: (orchestratorId: string, groupId: string) => void;
  rename: (orchestratorId: string, name: string) => void;
  /** Brings the view onto what was posed: every group and orchestrator, once, at the end. */
  fit: (ids: string[]) => void;
}

export interface DeployResult {
  groups: number;
  agents: number;
  orchestrators: number;
  /** Agents replaced by the default one. */
  substituted: number;
  orchestratorsSkipped: number;
}

/**
 * Poses a preset (spec presets §3): its groups around the view's center, in
 * their saved places, then each orchestrator linked to its groups. A group
 * that cannot be posed is left out; the rest goes on.
 */
export async function deployPreset(preset: TeamPreset, deps: DeployDeps): Promise<DeployResult> {
  const grids = preset.groups.map((g) => groupGrid(g.agents.length));
  const width = Math.max(...preset.groups.map((g, i) => g.x + grids[i].width));
  const height = Math.max(...preset.groups.map((g, i) => g.y + grids[i].height));
  const origin = clearSpot({ x: deps.center.x - width / 2, y: deps.center.y - height / 2, width, height }, deps.obstacles);
  const result: DeployResult = { groups: 0, agents: 0, orchestrators: 0, substituted: 0, orchestratorsSkipped: 0 };
  const frames: (string | null)[] = [];
  const posed: string[] = [];
  for (const [i, group] of preset.groups.entries()) {
    const agents = group.agents.map((agent) => {
      if (deps.isAvailable(agent)) return agent;
      result.substituted += 1;
      return deps.fallback;
    });
    const at = { x: origin.x + group.x + grids[i].width / 2, y: origin.y + group.y + grids[i].height / 2 };
    const plan = { name: group.name, role: group.role, ...(group.speciality ? { speciality: group.speciality } : {}), agents };
    const made = await deps.launchGroup(plan, at);
    frames.push(made?.frameId ?? null);
    if (!made) continue;
    result.groups += 1;
    posed.push(made.frameId);
    result.agents += made.nodeIds.length;
  }
  for (const orchestrator of preset.orchestrators) {
    const targets = orchestrator.groups.flatMap((i) => frames[i] ?? []);
    if (targets.length === 0) {
      result.orchestratorsSkipped += 1;
      continue;
    }
    const id = await deps.orchestrate(targets[0]);
    if (id === null) {
      result.orchestratorsSkipped += 1;
      continue;
    }
    for (const groupId of targets.slice(1)) deps.link(id, groupId);
    deps.rename(id, orchestrator.name);
    posed.push(id);
    result.orchestrators += 1;
  }
  if (posed.length > 0) deps.fit(posed);
  return result;
}
