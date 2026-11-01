import { pauseAgents } from "@/fleet/broadcast";
import { setRemoteControl } from "@/fleet/remoteControl";
import { messages } from "@/i18n";
import { ptySendText } from "@/ipc/pty";
import { endMission, launchMission, mergeMission, reassignTask } from "@/mission/launch";
import { budgetOf, memberTime, NEW_AGENT, oneLine, proposedPlan, proposedTasks, remainingGlobal, sameName, spentMin, type Member, type Mission } from "@/mission/mission";
import { freeMembers, giveNext, pumpQueue } from "@/mission/queue";
import { boardView } from "@/kanban/missionLink";
import { LEVELS, modelLabel } from "@/mission/router";
import { readTickets } from "@/mission/tickets";
import { linkedBoards } from "@/kanban/orchestrate";
import { agentGroup, agentState, linkedClaudeAgents, linkedGroups, missionOf, canvasKnown, setMission, updateMember } from "@/mission/store";
import { terminalText } from "@/nodes/terminal/registry";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore, sessionOf, terminalOf } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { refused, said, type ToolResult } from "./agentTools";
import { agentMessages } from "./messages";
import { outAgent, outAgentState, outLevel, outMission, outReport, outStep } from "./protocol";

const NO_ARGS = { type: "object", properties: {} } as const;
const t = () => messages(agentMessages);

/** The orchestrator's tools (spec orchestrateur §7.2), named in English, described in the interface's language. */
export function orchestratorTools() {
  const d = t().tools;
  return [
    { name: "mission", description: d.mission, inputSchema: NO_ARGS },
    {
      name: "propose_plan",
      description: d.proposePlan,
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 60, description: d.planName },
          task: { type: "string", description: d.planTask },
          subtasks: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                title: { type: "string", maxLength: 60 },
                brief: { type: "string" },
                agent: { type: "string", description: d.planAgent },
                group: { type: "string", description: d.planGroup },
                budget_min: { type: "integer", minimum: 1 },
                level: { type: "string", enum: ["low", "medium", "high", "extreme"], description: d.planLevel },
                card: { type: "string", description: d.planCard },
              },
              required: ["title", "brief", "agent", "budget_min"],
            },
          },
        },
        required: ["name", "task", "subtasks"],
      },
    },
    {
      name: "add_tasks",
      description: d.addTasks,
      inputSchema: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                title: { type: "string", maxLength: 60 },
                brief: { type: "string" },
                budget_min: { type: "integer", minimum: 1 },
                level: { type: "string", enum: ["low", "medium", "high", "extreme"], description: d.planLevel },
                group: { type: "string", description: d.taskGroup },
                card: { type: "string", description: d.taskCard },
              },
              required: ["title", "brief", "budget_min"],
            },
          },
        },
        required: ["tasks"],
      },
    },
    { name: "queue", description: d.queue, inputSchema: NO_ARGS },
    { name: "next_task", description: d.nextTask, inputSchema: { type: "object", properties: { agent: { type: "string" } }, required: ["agent"] } },
    { name: "tickets", description: d.tickets, inputSchema: NO_ARGS },
    { name: "board", description: d.board, inputSchema: NO_ARGS },
    { name: "team", description: d.team, inputSchema: NO_ARGS },
    {
      name: "read_output",
      description: d.readOutput,
      inputSchema: { type: "object", properties: { agent: { type: "string" }, lines: { type: "integer", minimum: 1, maximum: 200 } }, required: ["agent"] },
    },
    {
      name: "write",
      description: d.write,
      inputSchema: { type: "object", properties: { agent: { type: "string" }, text: { type: "string" } }, required: ["agent", "text"] },
    },
    {
      name: "extend",
      description: d.extend,
      inputSchema: { type: "object", properties: { agent: { type: "string" }, minutes: { type: "integer", minimum: 1 } }, required: ["agent", "minutes"] },
    },
    { name: "interrupt", description: d.interrupt, inputSchema: { type: "object", properties: { agent: { type: "string" } }, required: ["agent"] } },
    {
      name: "reassign",
      description: d.reassign,
      inputSchema: { type: "object", properties: { subtask: { type: "string" }, agent: { type: "string" } }, required: ["subtask", "agent"] },
    },
    { name: "merge", description: d.merge, inputSchema: NO_ARGS },
    {
      name: "finish",
      description: d.finish,
      inputSchema: { type: "object", properties: { summary: { type: "string" }, check: { type: "array", items: { type: "string" }, description: d.finishCheck } }, required: ["summary"] },
    },
    {
      name: "remote_control",
      description: d.remoteControl,
      inputSchema: {
        type: "object",
        properties: { on: { type: "boolean" }, agents: { type: "array", minItems: 1, items: { type: "string" }, description: d.remoteAgents } },
        required: ["on", "agents"],
      },
    },
  ];
}

/** Internal names of the orchestrator's tools (`./protocol.ts`). */
export const ORCHESTRATOR_ONLY = new Set(["mission", "proposer_plan", "add_tasks", "queue", "next_task", "tickets", "board", "equipe", "lire_sortie", "ecrire", "prolonger", "interrompre", "reattribuer", "fusionner", "terminer", "remote_control"]);

const json = (value: unknown) => said(JSON.stringify(value, null, 2));
const formed = (mission: Mission) => mission.state === "en_cours" || mission.state === "terminee";

function memberNamed(mission: Mission, raw: unknown): Member | string {
  if (!formed(mission)) return t().orchestrator.notFormed;
  const name = typeof raw === "string" ? raw : "";
  return mission.members.find((m) => sameName(m.name, name)) ?? t().orchestrator.notMember(name);
}

function modelOfSubTask(mission: Mission, subtask: { title: string; level?: keyof typeof LEVELS }): string | null {
  const holder = mission.members.find((m) => !m.handedTo && m.task === subtask.title);
  if (holder) return holder.model ? modelLabel(holder.model) : null;
  return mission.router && subtask.level ? LEVELS[subtask.level].modelLabel : null;
}

function describeMission(orchestratorId: string, mission: Mission): ToolResult {
  const team = new Set(mission.members.map((m) => m.nodeId));
  return json({
    state: outMission(mission.state),
    name: mission.name ?? null,
    task: mission.task ?? null,
    global_budget_min: mission.budgetMin ?? null,
    max_agents: mission.maxAgents,
    router: mission.router === true,
    branch: mission.branch ?? null,
    plan:
      mission.plan?.map((s) => ({
        title: s.title,
        brief: s.brief,
        agent: outAgent(s.agent),
        group: s.group?.name ?? null,
        budget_min: s.budgetMin,
        level: s.level ? outLevel(s.level) : null,
        // Once an agent holds the sub-task, its own model counts: reassign may have given it to one that keeps its own.
        model: modelOfSubTask(mission, s),
        card: s.card ?? null,
      })) ?? null,
    linked_agents: canvasKnown(orchestratorId)
      ? linkedClaudeAgents(orchestratorId)
          .filter((a) => !team.has(a.nodeId))
          .map((a) => ({ name: a.name, state: outAgentState(agentState(a.nodeId)), ...agentGroup(a.nodeId) }))
      : null,
    linked_groups: canvasKnown(orchestratorId) ? linkedGroups(orchestratorId).map(({ name, speciality }) => ({ name, speciality })) : null,
    linked_agents_note: canvasKnown(orchestratorId) ? null : t().orchestrator.hiddenAgents,
    queue_waiting: mission.queue?.length ?? 0,
    left_min: remainingGlobal(mission, Date.now()) ?? null,
    overnight: mission.overnight === true,
    auto_launch: mission.autoLaunch === true,
    elapsed_min: mission.state === "en_cours" && mission.startedAt !== undefined ? Math.floor((Date.now() - mission.startedAt) / 60_000) : null,
    error: mission.error ?? null,
  });
}

function proposePlan(orchestratorId: string, mission: Mission, args: Record<string, unknown>): ToolResult {
  if (mission.state === "lancement" || mission.state === "en_cours") return refused(t().orchestrator.running);
  if (mission.state === "terminee") return refused(t().orchestrator.finished);
  const onCanvas = (s: Record<string, unknown> | null) => !sameName(String(s?.agent ?? ""), NEW_AGENT) || Boolean(s?.groupe);
  const named = Array.isArray(args.sous_taches) && args.sous_taches.some((s) => onCanvas(s as Record<string, unknown> | null));
  if (named && !canvasKnown(orchestratorId)) return refused(t().orchestrator.hiddenWorkspace);
  const cards = linkedBoards(orchestratorId).flatMap(({ board }) => Object.keys(board.cards));
  const result = proposedPlan(args, mission, linkedClaudeAgents(orchestratorId).map((a) => a.name), linkedGroups(orchestratorId), cards);
  if (typeof result === "string") return refused(result);
  setMission(orchestratorId, { state: "plan", ...result, error: undefined });
  // The dialog was the go-ahead: the user has left (spec mission de nuit §5.1).
  if (mission.overnight && mission.autoLaunch) {
    void launchMission(orchestratorId);
    return said(t().orchestrator.launchingNight);
  }
  return said(t().orchestrator.proposed(result.plan.length));
}

/** `tickets`: OpenVibe reads the source, the orchestrator may not run commands (spec mission de nuit §5.1). */
async function tickets(orchestratorId: string, mission: Mission): Promise<ToolResult> {
  const project = sessionOf(nodesStore.getState().nodes[orchestratorId])?.cwd;
  if (!mission.tickets || !project) return refused(t().orchestrator.noTickets);
  try {
    return json({ note: t().orchestrator.ticketsNote, tickets: await readTickets(project, mission.tickets) });
  } catch (error) {
    return refused(t().orchestrator.ticketsFailed(error instanceof Error ? error.message : String(error)));
  }
}

function addTasks(orchestratorId: string, mission: Mission, args: Record<string, unknown>): ToolResult {
  if (mission.state === "terminee") return refused(t().orchestrator.finished);
  const grouped = Array.isArray(args.tasks) && args.tasks.some((s) => Boolean((s as Record<string, unknown> | null)?.groupe));
  if (grouped && !canvasKnown(orchestratorId)) return refused(t().orchestrator.hiddenWorkspace);
  const cards = linkedBoards(orchestratorId).flatMap(({ board }) => Object.keys(board.cards));
  const tasks = proposedTasks(args, mission, linkedGroups(orchestratorId), cards);
  if (typeof tasks === "string") return refused(tasks);
  const queue = [...(mission.queue ?? []), ...tasks];
  setMission(orchestratorId, { queue });
  void pumpQueue(orchestratorId);
  return said(t().orchestrator.queued(tasks.length, queue.length));
}

function describeQueue(mission: Mission): ToolResult {
  return json({
    waiting: (mission.queue ?? []).map((s) => ({ title: s.title, brief: s.brief, budget_min: s.budgetMin, level: s.level ? outLevel(s.level) : null, group: s.group?.name ?? null, card: s.card ?? null })),
    free_agents: freeMembers(mission).map((m) => m.name),
  });
}

async function nextTask(orchestratorId: string, mission: Mission, args: Record<string, unknown>): Promise<ToolResult> {
  const member = memberNamed(mission, args.agent);
  if (typeof member === "string") return refused(member);
  if (mission.state !== "en_cours") return refused(t().orchestrator.noMission);
  if (member.handedTo) return refused(t().orchestrator.handedAway(member.name));
  const result = await giveNext(orchestratorId, member);
  return "given" in result ? said(result.given) : refused(result.refused);
}

const timeText = (spent: number | undefined, budget: number) => (spent === undefined ? `? / ${budget} min` : `${Math.floor(spent)} / ${budget} min`);

/** `board`: the Kanban boards handed to this orchestrator. */
function describeBoards(orchestratorId: string): ToolResult {
  const boards = linkedBoards(orchestratorId);
  if (boards.length === 0) return said(t().orchestrator.noBoard);
  return json({ note: t().orchestrator.boardNote, boards: boards.map(({ nodeId, board }) => boardView(nodeId, board)) });
}

function describeTeam(orchestratorId: string, mission: Mission): ToolResult {
  if (!formed(mission)) return refused(t().orchestrator.notFormed);
  const nodes = nodesStore.getState().nodes;
  const now = Date.now();
  // Groups live on the scene: never read, they are unknown, which null would not say.
  const shown = canvasKnown(orchestratorId);
  return json(
    mission.members.map((m) => ({
      name: m.name,
      ...(shown ? agentGroup(m.nodeId) : {}),
      subtask: m.task,
      state: outAgentState(agentState(m.nodeId)),
      steps: terminalOf(nodes[m.nodeId])?.steps?.map((s) => `${s.title}: ${outStep(s.state)}`) ?? [],
      time: timeText(memberTime(mission, m, now), budgetOf(m)),
      overdue: m.overdue ?? 0,
      handed_to: m.handedTo ?? null,
      finished: m.done ?? [],
      model: m.model ? modelLabel(m.model) : null,
      branch: m.branch,
      report: m.report ? { status: outReport(m.report.status), summary: m.report.summary } : null,
      merged: m.merged === true,
    })),
  );
}

function readOutput(mission: Mission, args: Record<string, unknown>): ToolResult {
  const member = memberNamed(mission, args.agent);
  if (typeof member === "string") return refused(member);
  const lines = typeof args.lignes === "number" ? Math.min(200, Math.max(1, Math.floor(args.lignes))) : 50;
  return said(terminalText(member.nodeId, lines) || t().orchestrator.emptyTerminal);
}

async function write(mission: Mission, args: Record<string, unknown>): Promise<ToolResult> {
  const member = memberNamed(mission, args.agent);
  if (typeof member === "string") return refused(member);
  const text = typeof args.texte === "string" ? oneLine(args.texte) : "";
  if (!text) return refused(t().orchestrator.nothingToWrite);
  if (!isRunning(member.nodeId)) return refused(t().orchestrator.stopped(member.name));
  if (agentActivityStore.getState().activities[member.nodeId]?.activity === "waiting") return refused(t().orchestrator.waiting(member.name));
  await ptySendText(member.nodeId, text);
  return said(t().orchestrator.written(member.name));
}

function prolong(orchestratorId: string, mission: Mission, args: Record<string, unknown>): ToolResult {
  if (mission.state !== "en_cours") return refused(t().orchestrator.noMission);
  const member = memberNamed(mission, args.agent);
  if (typeof member === "string") return refused(member);
  if (member.handedTo) return refused(t().orchestrator.handedAway(member.name));
  if (member.report) return refused(t().orchestrator.alreadyReported(member.name));
  const minutes = args.minutes;
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1) return refused(t().orchestrator.wholeMinutes);
  const extraMin = (member.extraMin ?? 0) + minutes;
  const budget = member.budgetMin + extraMin;
  const spent = spentMin(member, Date.now());
  // Real time: its new target must end before the global budget does (spec mission de nuit §3).
  const left = remainingGlobal(mission, Date.now());
  if (left !== undefined && budget - spent > left) return refused(t().orchestrator.globalLeft(left));
  // Below its new budget it may be told again later; still past it, it is not told twice (spec §8.2).
  const overdue = spent >= 2 * budget ? 2 : spent >= budget ? 1 : undefined;
  updateMember(orchestratorId, member.nodeId, { extraMin, overdue });
  return said(t().orchestrator.extended(member.name, minutes, budget));
}

async function interrupt(mission: Mission, args: Record<string, unknown>): Promise<ToolResult> {
  const member = memberNamed(mission, args.agent);
  if (typeof member === "string") return refused(member);
  // The same as « Pause »: « Tout reprendre » knows it.
  if ((await pauseAgents([member.nodeId])) === 0) return refused(t().orchestrator.notWorking(member.name));
  return said(t().orchestrator.interrupted(member.name));
}

async function reassign(orchestratorId: string, mission: Mission, args: Record<string, unknown>): Promise<ToolResult> {
  if (mission.state !== "en_cours") return refused(t().orchestrator.noMission);
  const title = typeof args.sous_tache === "string" ? args.sous_tache : "";
  const from = mission.members.find((m) => !m.handedTo && sameName(m.task, title));
  if (!from) return refused(t().orchestrator.noSubtask(title));
  const result = await reassignTask(orchestratorId, from.nodeId, typeof args.agent === "string" ? args.agent : "");
  return typeof result === "string" ? refused(result) : said(t().orchestrator.handedTo(from.task, result.name));
}

function finish(orchestratorId: string, mission: Mission, args: Record<string, unknown>): ToolResult {
  if (mission.state !== "en_cours") return refused(t().orchestrator.noMission);
  const summary = typeof args.bilan === "string" ? args.bilan.trim() : "";
  if (!summary) return refused(t().orchestrator.summaryMissing);
  const handChecks = Array.isArray(args.check) ? args.check.filter((line): line is string => typeof line === "string" && line.trim() !== "").map(oneLine) : [];
  if (handChecks.length > 0) setMission(orchestratorId, { handChecks });
  endMission(orchestratorId, summary);
  return said(t().orchestrator.ended);
}

/** Its team as `remote_control` names it: the linked Claude agents and the mission's members. */
function teamOf(orchestratorId: string, mission: Mission): { nodeId: string; name: string }[] {
  const team = canvasKnown(orchestratorId) ? linkedClaudeAgents(orchestratorId) : [];
  for (const member of mission.members) {
    if (!member.handedTo && !team.some((t) => t.nodeId === member.nodeId)) team.push({ nodeId: member.nodeId, name: member.name });
  }
  return team;
}

async function remote(orchestratorId: string, mission: Mission, args: Record<string, unknown>): Promise<ToolResult> {
  const o = t().orchestrator;
  if (typeof args.actif !== "boolean") return refused(o.remoteOnMissing);
  const on = args.actif;
  const names = Array.isArray(args.agents) ? args.agents.filter((name): name is string => typeof name === "string") : [];
  if (names.length === 0) return refused(o.remoteAgentsMissing);
  const team = teamOf(orchestratorId, mission);
  const chosen: { nodeId: string; name: string }[] = [];
  const unknown: string[] = [];
  const ambiguous: string[] = [];
  for (const name of names) {
    if (sameName(name, "moi")) chosen.push({ nodeId: orchestratorId, name: o.you });
    else if (sameName(name, "tous")) chosen.push(...team);
    else {
      const found = team.filter((t) => sameName(t.name, name));
      // Two agents of the same name: the first would be picked silently.
      if (found.length > 1) ambiguous.push(name);
      else if (found.length === 1) chosen.push(found[0]);
      else unknown.push(name);
    }
  }
  if (unknown.length > 0) return refused(o.remoteUnknown(unknown.join(", ")));
  if (ambiguous.length > 0) return refused(o.remoteAmbiguous(ambiguous.join(", ")));
  const targets = chosen.filter((t, i) => chosen.findIndex((other) => other.nodeId === t.nodeId) === i);
  if (targets.length === 0) return refused(o.remoteNone);
  const results = await Promise.all(targets.map(async (t) => ({ ...t, running: isRunning(t.nodeId), result: await setRemoteControl(t.nodeId, on) })));
  const r = o.remote;
  return said(
    results
      .map(({ nodeId, name, running, result }) => {
        if (!result) return r.notClaude(name);
        if ("error" in result) return r.failed(name, result.error);
        // Its own session is in the turn of this very call.
        if ("later" in result) return nodeId === orchestratorId ? r.laterSelf(name) : r.later(name);
        if (!result.on) return r.off(name);
        if (!running) return r.nextStart(name);
        return r.on(name, result.url ?? r.noLink);
      })
      .join("\n"),
  );
}

/** One call of the orchestrator, by internal name; it acts on its own mission only (spec orchestrateur §4.3). */
export async function orchestratorTool(orchestratorId: string, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const mission = missionOf(nodesStore.getState().nodes[orchestratorId]);
  if (!mission) return refused(t().orchestrator.gone);
  switch (name) {
    case "mission":
      return describeMission(orchestratorId, mission);
    case "proposer_plan":
      return proposePlan(orchestratorId, mission, args);
    case "add_tasks":
      return addTasks(orchestratorId, mission, args);
    case "queue":
      return describeQueue(mission);
    case "next_task":
      return nextTask(orchestratorId, mission, args);
    case "tickets":
      return tickets(orchestratorId, mission);
    case "equipe":
      return describeTeam(orchestratorId, mission);
    case "lire_sortie":
      return readOutput(mission, args);
    case "ecrire":
      return write(mission, args);
    case "prolonger":
      return prolong(orchestratorId, mission, args);
    case "interrompre":
      return mission.state === "en_cours" ? interrupt(mission, args) : refused(t().orchestrator.noMission);
    case "reattribuer":
      return reassign(orchestratorId, mission, args);
    case "fusionner": {
      if (mission.state !== "en_cours") return refused(t().orchestrator.noMission);
      const merged = await mergeMission(orchestratorId);
      // A conflict held an agent back: merged now, it can take the next task.
      void pumpQueue(orchestratorId);
      return said(merged);
    }
    case "terminer":
      return finish(orchestratorId, mission, args);
    case "remote_control":
      return remote(orchestratorId, mission, args);
    case "board":
      return describeBoards(orchestratorId);
    default:
      return refused(t().router.unknown(name));
  }
}
