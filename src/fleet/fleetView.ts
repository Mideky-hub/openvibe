import { messages } from "@/i18n";
import type { SceneFrame } from "@/canvas/groups";
import type { AgentId } from "@/ipc/pty";
import type { AgentActivity } from "@/store/agentActivity";
import type { TerminalStatus } from "@/store/terminalStatus";
import { fleetMessages } from "./messages";
import { ROLES } from "./roles";

/** What the fleet panel tells about an agent (spec habillage §5.5). */
/** `active`: the process runs and its activity is not known (the pill says ACTIF). */
export type FleetState = "working" | "waiting" | "active" | "idle" | "stopped";
export type FleetFilter = "all" | FleetState;

export const FLEET_FILTERS: readonly { id: FleetFilter; label: string }[] = (["all", "working", "waiting", "active", "idle", "stopped"] as const).map(
  (id) => ({
    id,
    get label() {
      return messages(fleetMessages).filters[id];
    },
  }),
);

export interface FleetAgent {
  id: string;
  name: string;
  agent: AgentId;
  state: FleetState;
  /** Since when the agent is in its state (running agents only). */
  since?: number;
}

export interface FleetSection {
  /** The group's frame, or null for the agents outside groups. */
  id: string | null;
  name: string;
  color: string | null;
  agents: FleetAgent[];
}

/** A running agent takes its activity (idle until known); any other process state is stopped. */
export function fleetStateOf(status: TerminalStatus, activity?: AgentActivity): FleetState {
  if (status.state === "running") return activity?.activity ?? "active";
  if (status.state === "starting") return "idle";
  return "stopped";
}

/** Each group in scene order, then "Hors groupe"; only the agents of `filter`, no empty section. */
export function fleetSections(
  agents: readonly FleetAgent[],
  frames: readonly SceneFrame[],
  filter: FleetFilter,
): FleetSection[] {
  const shown = agents.filter((a) => filter === "all" || a.state === filter);
  const inGroups = new Set<string>();
  const sections: FleetSection[] = [];
  for (const frame of frames) {
    if (!frame.group) continue;
    frame.memberIds.forEach((id) => inGroups.add(id));
    const members = shown.filter((a) => frame.memberIds.includes(a.id));
    if (members.length > 0) {
      sections.push({ id: frame.id, name: frame.name, color: ROLES[frame.group.role].color, agents: members });
    }
  }
  const outside = shown.filter((a) => !inGroups.has(a.id));
  if (outside.length > 0) sections.push({ id: null, name: messages(fleetMessages).outsideGroup, color: null, agents: outside });
  return sections;
}

export function filterCounts(agents: readonly FleetAgent[]): Record<FleetFilter, number> {
  const counts: Record<FleetFilter, number> = { all: agents.length, working: 0, waiting: 0, active: 0, idle: 0, stopped: 0 };
  for (const a of agents) counts[a.state]++;
  return counts;
}
