import { call } from "./invoke";

/** A worktree OpenVibe made for a mission, on its own branch (spec orchestrateur §7.4). */
export interface Worktree {
  slug: string;
  branch: string;
  path: string;
}

export type Merge = { kind: "merged" } | { kind: "empty" } | { kind: "conflict"; files: string[] };

export interface MergeReport {
  merge: Merge;
  /** Changes left uncommitted in the agent's worktree: not merged. */
  uncommitted: boolean;
}

export interface Cleanup {
  removed: string[];
  kept: string[];
}

export const missionPrepare = (project: string, name: string) => call<Worktree>("mission_prepare", { project, name });
/** `mission`: the mission's slug; `agent`: the agent's name. */
export const missionAddAgent = (project: string, mission: string, agent: string) => call<Worktree>("mission_add_agent", { project, mission, agent });
/** `mission`, `agent`: their worktrees' paths. */
export const missionMerge = (mission: string, agent: string, branch: string) => call<MergeReport>("mission_merge", { mission, agent, branch });
export const missionCleanup = (project: string, mission: string, agents: string[]) => call<Cleanup>("mission_cleanup", { project, mission, agents });
export const missionBacklog = (project: string) => call<string>("mission_backlog", { project });
/** The open issues with `label`, in `gh`'s JSON. */
export const missionIssues = (project: string, label: string) => call<string>("mission_issues", { project, label });
/** Undoes a launch that failed: its fresh worktrees and branches, never forced. */
export const missionDiscard = (project: string, trees: Worktree[]) => call<Cleanup>("mission_discard", { project, trees });
