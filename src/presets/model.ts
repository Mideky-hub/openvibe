import { isGroup, type SceneFrame } from "@/canvas/groups";
import { AGENTS } from "@/fleet/catalog";
import { MAX_GROUP_SIZE } from "@/fleet/composer";
import { isRoleId, type RoleId } from "@/fleet/roles";
import type { AgentId } from "@/ipc/pty";
import type { Links } from "@/fleet/wires";

/** A group of a preset: what it is for and who staffs it, placed relative to the team's top-left corner. */
export interface PresetGroup {
  name: string;
  role: RoleId;
  speciality?: string;
  agents: AgentId[];
  x: number;
  y: number;
}

/** An orchestrator of a preset: its name and the groups it is linked to (indexes into `groups`). */
export interface PresetOrchestrator {
  name: string;
  groups: number[];
}

/** The shape of a team (spec presets §1): never its content. */
export interface TeamPreset {
  id: string;
  name: string;
  savedAt: number;
  groups: PresetGroup[];
  orchestrators: PresetOrchestrator[];
}

export const MAX_PRESETS = 50;
export const MAX_NAME = 60;
/** Version of the saved setting (`presets.teams`). */
export const PRESETS_VERSION = 1;

/** A name as kept: spaces folded and trimmed, cut at the limit; null when nothing is left. */
export function presetNameOf(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim();
  return name === "" ? null : name;
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase("fr") === b.toLocaleLowerCase("fr");

export interface CaptureInput {
  frames: readonly SceneFrame[];
  /** The agent of a terminal node, undefined when unknown. */
  agentOf: (nodeId: string) => AgentId | undefined;
  /** The orchestrators of the scene on screen. */
  orchestrators: readonly { id: string; name: string }[];
  links: Readonly<Record<string, Links>>;
}

/**
 * The team on screen as a preset (spec presets §3): groups with at least one
 * agent, and the orchestrators linked to one of them. Null when there is no
 * group to keep.
 */
export function capturePreset(input: CaptureInput, name: string, id: string, now: number): TeamPreset | null {
  const kept = input.frames
    .filter(isGroup)
    .map((frame) => ({ frame, agents: frame.memberIds.map(input.agentOf).filter((a): a is AgentId => a !== undefined) }))
    .filter((entry) => entry.agents.length > 0);
  if (kept.length === 0) return null;
  const left = Math.min(...kept.map((e) => e.frame.x));
  const top = Math.min(...kept.map((e) => e.frame.y));
  const groups: PresetGroup[] = kept.map(({ frame, agents }) => ({
    name: frame.name,
    role: frame.group.role,
    ...(frame.group.speciality ? { speciality: frame.group.speciality } : {}),
    agents: agents.slice(0, MAX_GROUP_SIZE),
    x: frame.x - left,
    y: frame.y - top,
  }));
  const indexOf = new Map(kept.map((e, i) => [e.frame.id, i]));
  const orchestrators = input.orchestrators.flatMap((o) => {
    const linked = (input.links[o.id]?.groupIds ?? []).flatMap((groupId) => indexOf.get(groupId) ?? []);
    return linked.length > 0 ? [{ name: o.name, groups: linked }] : [];
  });
  return { id, name, savedAt: now, groups, orchestrators };
}

export function presetAgentCount(preset: TeamPreset): number {
  return preset.groups.reduce((sum, group) => sum + group.agents.length, 0);
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function readGroup(raw: unknown): PresetGroup | null {
  if (!isObject(raw) || typeof raw.name !== "string" || !isRoleId(raw.role)) return null;
  if (typeof raw.x !== "number" || typeof raw.y !== "number" || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
  if (!Array.isArray(raw.agents) || raw.agents.length === 0 || raw.agents.length > MAX_GROUP_SIZE) return null;
  if (!raw.agents.every((a): a is AgentId => typeof a === "string" && a in AGENTS)) return null;
  const speciality = typeof raw.speciality === "string" && raw.speciality !== "" ? raw.speciality : undefined;
  return { name: raw.name, role: raw.role, ...(speciality ? { speciality } : {}), agents: raw.agents, x: raw.x, y: raw.y };
}

function readPreset(raw: unknown): TeamPreset | null {
  if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.name !== "string" || typeof raw.savedAt !== "number") return null;
  const name = presetNameOf(raw.name);
  if (name === null || !Array.isArray(raw.groups) || raw.groups.length === 0 || !Array.isArray(raw.orchestrators)) return null;
  const groups = raw.groups.map(readGroup);
  if (groups.some((g) => g === null)) return null;
  const orchestrators: PresetOrchestrator[] = [];
  for (const o of raw.orchestrators) {
    if (!isObject(o) || typeof o.name !== "string" || !Array.isArray(o.groups) || o.groups.length === 0) return null;
    if (!o.groups.every((g): g is number => Number.isInteger(g) && g >= 0 && g < groups.length)) return null;
    orchestrators.push({ name: o.name, groups: o.groups });
  }
  return { id: raw.id, name, savedAt: raw.savedAt, groups: groups as PresetGroup[], orchestrators };
}

/** The presets of the saved setting: a damaged one is left out, the others stay (spec presets §3). */
export function readPresets(raw: unknown): TeamPreset[] {
  if (!isObject(raw) || raw.version !== PRESETS_VERSION || !Array.isArray(raw.presets)) return [];
  return raw.presets.flatMap((p) => readPreset(p) ?? []).slice(0, MAX_PRESETS);
}

/** The list with `preset` added, replacing the one of the same name; null when the list is full. */
export function withPreset(list: readonly TeamPreset[], preset: TeamPreset): TeamPreset[] | null {
  const at = list.findIndex((p) => sameName(p.name, preset.name));
  if (at !== -1) return list.map((p, i) => (i === at ? preset : p));
  return list.length >= MAX_PRESETS ? null : [...list, preset];
}

export function withoutPreset(list: readonly TeamPreset[], id: string): TeamPreset[] {
  return list.filter((p) => p.id !== id);
}
