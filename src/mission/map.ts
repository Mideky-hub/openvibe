import type { Member } from "./mission";
import type { AgentState } from "./store";

export type StateFilter = AgentState | "tous";

/** A group of the team and its consoles; `id` null for the consoles in no group. */
export interface TeamBranch {
  id: string | null;
  name: string | null;
  members: Member[];
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");

/**
 * The team of the mission map (#63): its consoles under their groups, in the
 * team's order, kept when they are in the state filtered on and match the
 * search (name, task or group). A group left empty is dropped.
 */
export function teamTree(
  members: readonly Member[],
  options: { groupOf: (member: Member) => { id: string; name: string } | null; stateOf: (nodeId: string) => AgentState; state: StateFilter; query: string },
): TeamBranch[] {
  const query = fold(options.query.trim());
  const branches = new Map<string | null, TeamBranch>();
  for (const member of members) {
    const group = options.groupOf(member);
    if (options.state !== "tous" && options.stateOf(member.nodeId) !== options.state) continue;
    if (query && ![member.name, member.task, group?.name ?? ""].some((text) => fold(text).includes(query))) continue;
    const key = group?.id ?? null;
    const branch = branches.get(key) ?? { id: key, name: group?.name ?? null, members: [] };
    branch.members.push(member);
    branches.set(key, branch);
  }
  // The consoles in no group come after the groups.
  return [...branches.values()].sort((a, b) => Number(a.id === null) - Number(b.id === null));
}
