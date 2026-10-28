import { pauseAgents } from "@/fleet/broadcast";
import { setRemoteControl } from "@/fleet/remoteControl";
import { messages } from "@/i18n";
import { ptySendText } from "@/ipc/pty";
import { endMission, mergeMission, reassignTask } from "@/mission/launch";
import { budgetOf, memberTime, NEW_AGENT, oneLine, proposedPlan, remainingGlobal, sameName, spentMin, type Member, type Mission } from "@/mission/mission";
import { boardView } from "@/kanban/missionLink";
import { LEVELS, modelLabel } from "@/mission/router";
import { linkedBoards } from "@/kanban/orchestrate";
import { agentState, linkedClaudeAgents, missionOf, orchestratorShown, setMission, updateMember } from "@/mission/store";
import { terminalText } from "@/nodes/terminal/registry";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore, terminalOf } from "@/store/nodes";
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
    { name: "finish", description: d.finish, inputSchema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } },
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
export const ORCHESTRATOR_ONLY = new Set(["mission", "proposer_plan", "equipe", "lire_sortie", "ecrire", "prolonger", "interrompre", "reattribuer", "fusionner", "terminer", "remote_control", "board"]);

const json = (value: unknown) => said(JSON.stringify(value, null, 2));
const formed = (mission: Mission) => mission.state === "en_cours" || mission.state === "terminee";

function memberNamed(mission: Mission, raw: unknown): Member | string {
  if (!formed(mission)) return t().orchestrator.notFormed;
  const name = typeof raw === "string" ? raw : "";
  return mission.members.find((m) => sameName(m.name, name)) ?? t().orchestrator.notMember(name);
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
        budget_min: s.budgetMin,
        level: s.level ? outLevel(s.level) : null,
        model: mission.router && s.level ? LEVELS[s.level].modelLabel : null,
        card: s.card ?? null,
      })) ?? null,
    linked_agents: orchestratorShown(orchestratorId)
      ? linkedClaudeAgents(orchestratorId)
          .filter((a) => !team.has(a.nodeId))
          .map((a) => ({ name: a.name, state: outAgentState(agentState(a.nodeId)) }))
      : t().orchestrator.hiddenAgents,
    left_min: remainingGlobal(mission) ?? null,
    elapsed_min: mission.state === "en_cours" && mission.startedAt !== undefined ? Math.floor((Date.now() - mission.startedAt) / 60_000) : null,
    error: mission.error ?? null,
  });
}

function proposePlan(orchestratorId: string, mission: Mission, args: Record<string, unknown>): ToolResult {
  if (mission.state === "lancement" || mission.state === "en_cours") return refused(t().orchestrator.running);
  if (mission.state === "terminee") return refused(t().orchestrator.finished);
  const named = Array.isArray(args.sous_taches) && args.sous_taches.some((s) => !sameName(String((s as Record<string, unknown> | null)?.agent ?? ""), NEW_AGENT));
  if (named && !orchestratorShown(orchestratorId)) return refused(t().orchestrator.hiddenWorkspace);
  const cards = linkedBoards(orchestratorId).flatMap(({ board }) => Object.keys(board.cards));
  const result = proposedPlan(args, mission, linkedClaudeAgents(orchestratorId).map((a) => a.name), cards);
  if (typeof result === "string") return refused(result);
  setMission(orchestratorId, { state: "plan", ...result, error: undefined });
  return said(t().orchestrator.proposed(result.plan.length));
}

const timeText = (spent: number | undefined, budget: number) => (spent === undefined ? `? / ${budget} min` : `${Math.floor(spent)} / ${budget} min`);

/** `board`: the Kanban boards handed to this orchestrator. */
function describeBoards(orchestratorId: string): ToolResult {
  const boards = linkedBoards(orchestratorId);
  if (boards.length === 0) return said(t().orchestrator.noBoard);
  return json(boards.map(({ nodeId, board }) => boardView(nodeId, board)));
}

function describeTeam(mission: Mission): ToolResult {
  if (!formed(mission)) return refused(t().orchestrator.notFormed);
  const nodes = nodesStore.getState().nodes;
  const now = Date.now();
  return json(
    mission.members.map((m) => ({
      name: m.name,
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
  const minutes = args.minutes;
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1) return refused(t().orchestrator.wholeMinutes);
  const left = remainingGlobal(mission);
  if (left !== undefined && minutes > left) return refused(t().orchestrator.globalLeft(Math.max(0, left)));
  const extraMin = (member.extraMin ?? 0) + minutes;
  const budget = member.budgetMin + extraMin;
  const spent = spentMin(member, Date.now());
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
  endMission(orchestratorId, summary);
  return said(t().orchestrator.ended);
}

/** Its team as `remote_control` names it: the linked Claude agents and the mission's members. */
function teamOf(orchestratorId: string, mission: Mission): { nodeId: string; name: string }[] {
  const team = orchestratorShown(orchestratorId) ? linkedClaudeAgents(orchestratorId) : [];
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
  for (const name of names) {
    if (sameName(name, "moi")) chosen.push({ nodeId: orchestratorId, name: o.you });
    else if (sameName(name, "tous")) chosen.push(...team);
    else {
      const found = team.find((t) => sameName(t.name, name));
      if (found) chosen.push(found);
      else unknown.push(name);
    }
  }
  if (unknown.length > 0) return refused(o.remoteUnknown(unknown.join(", ")));
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
    case "equipe":
      return describeTeam(mission);
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
    case "fusionner":
      return mission.state === "en_cours" ? said(await mergeMission(orchestratorId)) : refused(t().orchestrator.noMission);
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
