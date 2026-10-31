import { showNode } from "@/canvas/arrive";
import { canvasStore } from "@/canvas/canvasStore";
import { pauseAgents } from "@/fleet/broadcast";
import { GROUP_GAP, groupGrid } from "@/fleet/groupLayout";
import { closeGroup, launchGroup, showGroups } from "@/fleet/groups";
import { defaultLaunchOptions } from "@/fleet/launchAgent";
import { nextName } from "@/fleet/names";
import { namesInWorkspace, pantheonForNewGroup } from "@/fleet/naming";
import { linkOrchestrator } from "@/fleet/orchestrators";
import { addTerminal, removeNodes } from "@/fleet/terminals";
import { messages } from "@/i18n";
import { missionAddAgent, missionCleanup, missionDiscard, missionMerge, missionPrepare, type Cleanup, type Worktree } from "@/ipc/mission";
import { ptySendText, ptyWrite } from "@/ipc/pty";
import { newConversation, newTerminalPayload } from "@/nodes/terminal/launch";
import { freshText, quietFor, relaunchTerminal, stopTerminal } from "@/nodes/terminal/registry";
import { agentMessages } from "@/mcp/messages";
import { outReport } from "@/mcp/protocol";
import { nodesStore, sessionOf, terminalOf } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { notify } from "./events";
import { NEW_AGENT, NEW_MISSION, oneLine, pastTask, sameName, type Member, type Mission, type SubTask } from "./mission";
import { whenReady } from "./ready";
import { modelFor } from "./router";
import { linkedClaudeAgents, linkedGroups, missionOf, orchestratorShown, setMission, updateMember } from "./store";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const t = () => messages(agentMessages);

/** What an agent of the mission reads first (spec orchestrateur §7.3, §7.4). */
export function subTaskText(mission: string, task: SubTask, branch: string, handover?: string): string {
  const brief = oneLine(task.brief);
  const text = t().lines.subTask(mission, task.title, `${brief}${/[.!?]$/.test(brief) ? "" : "."}`, task.budgetMin, branch);
  return handover ? `${text} ${handover}` : text;
}

/** What the next agent learns of the previous one (spec §7.2 reassign). */
export function handoverText(from: Member): string {
  const l = t().lines;
  const report = from.report ? l.handoverReport(outReport(from.report.status), oneLine(from.report.summary)) : l.handoverNoReport;
  return l.handover(from.name, report, from.branch);
}

/**
 * A linked agent moves to `cwd` in a new conversation: a Claude session does
 * not resume from another folder (spec §7.3). It takes `model`, the router's,
 * or none to go back to Claude's own (spec maj §3).
 */
export function restartIn(nodeId: string, cwd: string, model?: string): Promise<void> {
  const payload = terminalOf(nodesStore.getState().nodes[nodeId]);
  if (!payload) return Promise.resolve();
  const patch = { cwd, model, ...newConversation() };
  nodesStore.getState().update(nodeId, patch);
  return relaunchTerminal(nodeId, { ...payload, ...patch }, "new");
}

/** Right of the orchestrator, tops aligned; `launchGroup` moves it down past what it would cover. */
function besideOrchestrator(orchestratorId: string, count: number) {
  const element = canvasStore.getState().api?.getSceneElements().find((e) => e.id === orchestratorId);
  if (!element) return undefined;
  const grid = groupGrid(count);
  return { x: element.x + element.width + GROUP_GAP + grid.width / 2, y: element.y + grid.height / 2 };
}

const frameCenter = (frame: { x: number; y: number; width: number; height: number }) => ({ x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 });

/** The terminal of an agent created for the mission, in its worktree. */
const agentPayload = (name: string, cwd: string, model?: string) => ({
  ...newTerminalPayload({ ...defaultLaunchOptions(), cwd, agent: "claude" }, name),
  ...(model ? { model } : {}),
});

/** Like a linked agent, a group chosen in the plan may be gone at the go-ahead (spec groupes spécialisés §4). */
function checkGroups(orchestratorId: string, plan: readonly SubTask[]) {
  const linked = linkedGroups(orchestratorId);
  const lost = plan.find((task) => task.group && !linked.some((g) => g.id === task.group?.id));
  if (lost?.group) throw new Error(t().launch.groupLost(lost.group.name));
}

type Team = Required<Pick<Mission, "project" | "slug" | "branch" | "worktree">> & Pick<Mission, "frameId" | "members">;

/** The relaunch of each linked agent: it is judged ready only once it is done. */
type Restarts = Map<string, Promise<void>>;

/** OpenVibe — not the AI — forms the team: every worktree first, then the agents (spec §7.3). */
async function formTeam(orchestratorId: string, workspaceId: string, project: string, mission: Mission, restarts: Restarts): Promise<Team> {
  const plan = mission.plan ?? [];
  const linked = linkedClaudeAgents(orchestratorId);
  const agents = plan.map((task) => (task.agent === NEW_AGENT ? null : (linked.find((a) => sameName(a.name, task.agent)) ?? null)));
  const lost = plan.find((task, i) => task.agent !== NEW_AGENT && !agents[i]);
  if (lost) throw new Error(t().launch.unlinked(lost.agent));
  checkGroups(orchestratorId, plan);
  const pantheon = pantheonForNewGroup(workspaceId);
  const taken = namesInWorkspace(workspaceId);
  const pantheonOf = (task: SubTask) => canvasStore.getState().frames.find((f) => f.id === task.group?.id)?.group?.pantheon ?? pantheon;
  const made: Worktree[] = [];
  const joined: string[] = [];
  let frameId: string | undefined;
  try {
    const root = await missionPrepare(project, mission.name ?? "mission");
    made.push(root);
    const members: Member[] = [];
    for (const [i, task] of plan.entries()) {
      const agent = agents[i];
      const name = agent?.name ?? nextName(pantheonOf(task), taken);
      taken.push(name);
      const tree = await missionAddAgent(project, root.slug, name);
      made.push(tree);
      const model = modelFor(mission, task);
      members.push({
        nodeId: agent?.nodeId ?? "",
        name,
        task: task.title,
        budgetMin: task.budgetMin,
        linked: agent !== null,
        branch: tree.branch,
        worktree: tree.path,
        ...(model ? { model } : {}),
        ...(task.group ? { group: task.group.id } : {}),
      });
    }
    // Its canvas is the one on screen only: the user may have left it during the git work (final review H2).
    if (!orchestratorShown(orchestratorId)) throw new Error(t().launch.leftWorkspace);
    checkGroups(orchestratorId, plan);
    const created = members.filter((m) => !m.linked && !m.group);
    if (created.length > 0) {
      const group = await launchGroup(
        { name: `Mission ${mission.name}`, role: "general", agents: created.map(() => "claude" as const) },
        defaultLaunchOptions(),
        besideOrchestrator(orchestratorId, created.length),
        { pantheon, names: created.map((m) => m.name), cwds: created.map((m) => m.worktree), models: created.map((m) => m.model) },
      );
      if (!group) throw new Error(t().launch.groupFailed);
      created.forEach((member, i) => (member.nodeId = group.nodeIds[i]));
      frameId = group.frameId;
      linkOrchestrator(orchestratorId, group.frameId);
    }
    for (const [i, member] of members.entries()) {
      const group = plan[i].group;
      if (!group) continue;
      const frame = canvasStore.getState().frames.find((f) => f.id === group.id);
      if (!frame) throw new Error(t().launch.groupLost(group.name));
      const nodeId = await addTerminal(workspaceId, agentPayload(member.name, member.worktree, member.model), frameCenter(frame), frame.id);
      if (!nodeId) throw new Error(t().launch.groupFailed);
      member.nodeId = nodeId;
      joined.push(nodeId);
    }
    // launchGroup framed its own group only, and an agent out of sight does not start.
    if (joined.length > 0) showGroups([...new Set(members.flatMap((m) => m.group ?? []).concat(frameId ?? []))]);
    // Linked agents move only once the whole team exists (final review H2).
    for (const member of members) if (member.linked) restarts.set(member.nodeId, restartIn(member.nodeId, member.worktree, member.model));
    return { project, slug: root.slug, branch: root.branch, worktree: root.path, frameId, members };
  } catch (error) {
    // Its terminals first: no agent may sit in a folder that goes.
    if (joined.length > 0) removeNodes(joined);
    if (frameId) closeGroup(frameId);
    // What this launch made goes, so the plan can be launched again; never forced (final review H2).
    if (made.length > 0) await missionDiscard(project, made).catch(() => undefined);
    throw error;
  }
}

/** Types `text`, its sub-task, in a member's terminal once it is ready (spec §7.3). */
export async function assign(orchestratorId: string, member: Member, text: string, restarted: Promise<void> = Promise.resolve()) {
  const id = member.nodeId;
  // Before its relaunch ends, its screen and silence are the previous session's (final review H2).
  await restarted.catch(() => undefined);
  const ready = await whenReady({ running: () => isRunning(id), quietMs: () => quietFor(id), screen: () => freshText(id, 50), press: (keys) => ptyWrite(id, keys) });
  if (missionOf(nodesStore.getState().nodes[orchestratorId])?.state !== "en_cours") return;
  if (!isRunning(id)) {
    notify(orchestratorId, t().lines.notStarted(member.name));
    return;
  }
  // Its shell outlives a Claude that quit: the sub-task would be typed as a command (README mission).
  if (!ready) {
    notify(orchestratorId, t().lines.notReady(member.name));
    return;
  }
  await ptySendText(id, text);
  updateMember(orchestratorId, id, { sentAt: Date.now() });
}

/** « Lancer la mission » (spec §7.3): the plan's go-ahead. A second click while it launches does nothing. */
export async function launchMission(orchestratorId: string): Promise<void> {
  const record = nodesStore.getState().nodes[orchestratorId];
  const mission = missionOf(record);
  const session = sessionOf(record);
  if (!record || !mission || !session || mission.state !== "plan" || !mission.plan?.length) return;
  // The router was turned on after the plan: without levels, every agent would get Claude's default model (final review maj §3).
  if (mission.router && [...mission.plan, ...(mission.queue ?? [])].some((task) => !task.level)) {
    const error = t().lines.levelsMissing;
    setMission(orchestratorId, { error });
    notify(orchestratorId, t().lines.proposeLevels(error));
    return;
  }
  setMission(orchestratorId, { state: "lancement", error: undefined });
  const restarts: Restarts = new Map();
  let team: Team;
  try {
    team = await formTeam(orchestratorId, record.workspaceId, session.cwd, mission, restarts);
  } catch (error) {
    setMission(orchestratorId, { state: "plan", error: errorText(error) });
    notify(orchestratorId, t().lines.couldNotStart(errorText(error)));
    return;
  }
  setMission(orchestratorId, { state: "en_cours", startedAt: Date.now(), ...team });
  const names = team.members.map((m) => `${m.name} (${m.task})`).join(", ");
  notify(orchestratorId, t().lines.goAhead(names, team.branch));
  const plan = mission.plan;
  team.members.forEach((member, i) => void assign(orchestratorId, member, subTaskText(mission.name ?? "", plan[i], member.branch), restarts.get(member.nodeId)));
}

/** `finish` (spec §7.7): created agents close, linked ones go back to the project. */
export function endMission(orchestratorId: string, summary: string) {
  const mission = missionOf(nodesStore.getState().nodes[orchestratorId]);
  if (mission?.state !== "en_cours") return;
  // Ended first: the agents stopping now are no events.
  setMission(orchestratorId, { state: "terminee", summary, endedAt: Date.now() });
  for (const member of mission.members) if (member.linked && mission.project) void restartIn(member.nodeId, mission.project);
  if (orchestratorShown(orchestratorId)) {
    if (mission.frameId) closeGroup(mission.frameId);
    // Those who joined a group go alone: it stays, with its own agents (spec groupes spécialisés §4).
    const joined = mission.members.filter((m) => !m.linked && m.group).map((m) => m.nodeId);
    if (joined.length > 0) removeNodes(joined);
    return;
  }
  // Away from its workspace its canvas cannot change: the created agents stop, freeing their worktrees (final review H2).
  for (const member of mission.members) if (!member.linked) stopTerminal(member.nodeId);
}

/** The merges under way, by mission worktree: git merges one branch at a time there. */
const merging = new Map<string, Promise<unknown>>();

function oneMergeAtATime<T>(worktree: string, merge: () => Promise<T>): Promise<T> {
  const turn = (merging.get(worktree) ?? Promise.resolve()).then(merge, merge);
  merging.set(worktree, turn.catch(() => undefined));
  return turn;
}

/** Merges one member's branch into the mission's: what to say of it, and whether its branch is in. */
export function mergeMember(orchestratorId: string, worktree: string, member: Member): Promise<{ line: string; merged: boolean; uncommitted: boolean }> {
  const m = t().merge;
  return oneMergeAtATime(worktree, async () => {
    try {
      const { merge, uncommitted } = await missionMerge(worktree, member.worktree, member.branch);
      const note = uncommitted ? m.uncommitted : "";
      if (merge.kind === "conflict") return { line: m.conflict(member.name, merge.files.join(", "), note), merged: false, uncommitted };
      const said = merge.kind === "merged" ? m.merged : member.merged ? m.already : m.empty;
      // It may have taken another task meanwhile: that one is not merged.
      const now = missionOf(nodesStore.getState().nodes[orchestratorId])?.members.find((other) => other.nodeId === member.nodeId);
      if (now?.task === member.task && now.report?.at === member.report?.at) updateMember(orchestratorId, member.nodeId, { merged: true });
      return { line: m.line(member.name, said, note), merged: true, uncommitted };
    } catch (error) {
      return { line: m.failed(member.name, errorText(error)), merged: false, uncommitted: false };
    }
  });
}

/** `merge` (spec §7.6): the branches of the agents done since the last merge. */
export async function mergeMission(orchestratorId: string): Promise<string> {
  const m = t().merge;
  const mission = missionOf(nodesStore.getState().nodes[orchestratorId]);
  if (!mission?.worktree) return m.noBranch;
  // Merged ones too: a merge with nothing new is harmless, and new commits after a merge get in (final review H2).
  // A handed-over agent's branch goes in through its successor's (final review H3).
  const ready = mission.members.filter((m) => m.report?.status === "termine" && !m.handedTo);
  if (ready.length === 0) return m.nothing;
  const lines: string[] = [];
  for (const member of ready) lines.push((await mergeMember(orchestratorId, mission.worktree, member)).line);
  return `${m.header(mission.branch ?? "")}\n${lines.join("\n")}`;
}

/** « Nettoyer la mission » (spec §7.7): merged worktrees go, the branches stay; the orchestrator is free again. */
export async function cleanMission(orchestratorId: string): Promise<Cleanup | string> {
  const mission = missionOf(nodesStore.getState().nodes[orchestratorId]);
  if (mission?.state !== "terminee") return t().launch.notFinished;
  const next: Mission = { ...NEW_MISSION, maxAgents: mission.maxAgents };
  if (mission.budgetMin !== undefined) next.budgetMin = mission.budgetMin;
  // The router is a setting like the budget: the next mission keeps it checked.
  if (mission.router) next.router = true;
  try {
    return mission.project && mission.slug ? await missionCleanup(mission.project, mission.slug, mission.members.map((m) => m.name)) : { removed: [], kept: [] };
  } catch (error) {
    return errorText(error);
  } finally {
    // Freed even when git fails (project moved, worktrees removed by hand): never stuck « terminée » (final review H2).
    nodesStore.getState().update(orchestratorId, { mission: next });
  }
}

/** A new agent for a handed-over sub-task: its worktree, its terminal in the mission's group, started now. */
async function newMember(orchestratorId: string, workspaceId: string, mission: Mission, task: SubTask): Promise<Member | string> {
  if (!mission.project || !mission.slug) return t().launch.noFolder;
  const { frames } = canvasStore.getState();
  // The sub-task's group if it still exists, else the mission's (spec groupes spécialisés §4).
  const chosen = frames.find((f) => f.id === task.group?.id);
  const frame = chosen ?? frames.find((f) => f.id === mission.frameId);
  const pantheon = frame?.group?.pantheon ?? pantheonForNewGroup(workspaceId);
  const name = nextName(pantheon, namesInWorkspace(workspaceId));
  let tree: Worktree;
  try {
    tree = await missionAddAgent(mission.project, mission.slug, name);
  } catch (error) {
    return errorText(error);
  }
  const model = modelFor(mission, task);
  let nodeId: string | null = null;
  if (frame) {
    nodeId = await addTerminal(workspaceId, agentPayload(name, tree.path, model), frameCenter(frame), frame.id);
  } else {
    const group = await launchGroup(
      { name: `Mission ${mission.name}`, role: "general", agents: ["claude"] },
      defaultLaunchOptions(),
      besideOrchestrator(orchestratorId, 1),
      { pantheon, names: [name], cwds: [tree.path], models: [model] },
    );
    if (group) {
      nodeId = group.nodeIds[0];
      linkOrchestrator(orchestratorId, group.frameId);
      setMission(orchestratorId, { frameId: group.frameId });
    }
  }
  if (!nodeId) {
    await missionDiscard(mission.project, [tree]).catch(() => undefined);
    return t().reassign.createFailed;
  }
  // Shown, it starts like any new agent; a second start would break its session (seen in the app, H3).
  if (frame) showNode(nodeId);
  return {
    nodeId,
    name,
    task: task.title,
    budgetMin: task.budgetMin,
    linked: false,
    branch: tree.branch,
    worktree: tree.path,
    ...(model ? { model } : {}),
    ...(chosen ? { group: chosen.id } : {}),
  };
}

/** `reassign` (spec §7.2): to a member who reported, or to a new agent; it gets the previous one's report and branch. */
export async function reassignTask(orchestratorId: string, fromNodeId: string, target: string): Promise<{ name: string } | string> {
  const r = t().reassign;
  const record = nodesStore.getState().nodes[orchestratorId];
  const mission = missionOf(record);
  if (!record || mission?.state !== "en_cours") return r.noMission;
  const from = mission.members.find((m) => m.nodeId === fromNodeId && !m.handedTo);
  const task = mission.plan?.find((s) => s.title === from?.task);
  if (!from || !task) return r.notFound;
  let to: Member;
  if (sameName(target, NEW_AGENT)) {
    if (!orchestratorShown(orchestratorId)) return r.hidden;
    // A handed-away agent's session stays open: only the running ones count against the cap.
    if (mission.members.filter((m) => isRunning(m.nodeId)).length >= mission.maxAgents) return r.teamFull(mission.maxAgents);
    const made = await newMember(orchestratorId, record.workspaceId, mission, task);
    if (typeof made === "string") return made;
    to = made;
  } else {
    const found = mission.members.find((m) => sameName(m.name, target) && m.nodeId !== from.nodeId && !m.handedTo);
    if (!found) return r.notOther(target);
    if (!found.report) return r.notDone(found.name);
    // A stopped session would only say « n'a pas démarré » a minute later.
    if (!isRunning(found.nodeId)) return r.targetStopped(found.name);
    // Its entry takes the new sub-task: its finished work must be in the mission's branch first (final review H3).
    const finished = found.report.status === "termine";
    if (finished && !found.merged) return r.notMerged(found.name, found.task);
    to = {
      ...found,
      task: task.title,
      budgetMin: task.budgetMin,
      extraMin: undefined,
      overdue: undefined,
      report: undefined,
      sentAt: undefined,
      merged: undefined,
      done: finished ? [...(found.done ?? []), found.task] : found.done,
      past: [...(found.past ?? []), pastTask(found, found.report)],
    };
  }
  const latest = missionOf(nodesStore.getState().nodes[orchestratorId]) ?? mission;
  const members = latest.members.map((m) => (m.nodeId === from.nodeId ? { ...m, handedTo: to.name } : m.nodeId === to.nodeId ? to : m));
  setMission(orchestratorId, { members: members.some((m) => m.nodeId === to.nodeId) ? members : [...members, to] });
  // The previous agent stops: its sub-task is another's now (final review H3).
  await pauseAgents([from.nodeId]).catch(() => 0);
  if (isRunning(from.nodeId)) {
    void ptySendText(from.nodeId, t().lines.handedAway(from.task, to.name)).catch(() => undefined);
  }
  void assign(orchestratorId, to, subTaskText(mission.name ?? "", task, to.branch, handoverText(from)));
  return { name: to.name };
}
