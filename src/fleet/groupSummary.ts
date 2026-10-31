import { messages } from "@/i18n";
import { fleetMessages } from "./messages";

/**
 * Counters of a group label (spec habillage §11.4): "4 · 2 en cours", or
 * "4 · inactif".
 */
export function countsText(members: number, working: number): string {
  return messages(fleetMessages).summary.counts(members, working);
}

/** Names of the members still running, listed by the "Fermer le groupe" confirmation (spec §11.4). */
export function livingAgents(
  memberIds: readonly string[],
  nameOf: (id: string) => string,
  running: (id: string) => boolean,
): string[] {
  return memberIds.filter(running).map(nameOf);
}

/** "· 1 attend", shown in amber after the counters; null when nobody waits. */
export function waitingText(waiting: number): string | null {
  if (waiting <= 0) return null;
  return messages(fleetMessages).summary.waiting(waiting);
}

/** "1 agent", "8 agents". */
export function agentsText(count: number): string {
  return messages(fleetMessages).summary.agents(count);
}

/** "0 groupe", "2 groupes". */
export function groupsText(count: number): string {
  return messages(fleetMessages).summary.groups(count);
}

/** Members in `activity` whose process runs: an activity can outlive a process that was stopped. */
export function membersIn(
  memberIds: readonly string[],
  activity: "working" | "waiting",
  activityOf: (id: string) => string | undefined,
  running: (id: string) => boolean,
): number {
  return memberIds.filter((id) => running(id) && activityOf(id) === activity).length;
}
