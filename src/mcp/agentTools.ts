import { langStore, messages } from "@/i18n";
import { declaredSteps, markedSteps, MAX_STEPS } from "@/nodes/steps";
import { notify } from "@/mission/events";
import { oneLine } from "@/mission/mission";
import { finishMissionCard, flagMissionCard } from "@/kanban/orchestrate";
import { isOrchestratorClosed, memberOf, missionOf, updateMember } from "@/mission/store";
import { nodesStore, terminalOf } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { agentMessages } from "./messages";
import { outReport, outStep } from "./protocol";

/** What a tool answers: MCP text content, an error the agent can read. */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export const said = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
export const refused = (text: string): ToolResult => ({ ...said(text), isError: true });

const t = () => messages(agentMessages);

/** The tools of any Claude session (spec orchestrateur §4.4), described in the interface's language. */
export function agentTools() {
  const d = t().tools;
  return [
    {
      name: "declare_steps",
      description: d.declareSteps,
      inputSchema: {
        type: "object",
        properties: { steps: { type: "array", items: { type: "string", maxLength: 40 }, minItems: 1, maxItems: MAX_STEPS } },
        required: ["steps"],
      },
    },
    {
      name: "step",
      description: d.step,
      inputSchema: {
        type: "object",
        properties: { title: { type: "string" }, state: { type: "string", enum: ["in_progress", "done", "failed"] } },
        required: ["title", "state"],
      },
    },
    {
      name: "report",
      description: d.report,
      inputSchema: {
        type: "object",
        properties: { summary: { type: "string" }, status: { type: "string", enum: ["done", "blocked", "failed"] } },
        required: ["summary", "status"],
      },
    },
  ];
}

/** Internal names of the agents' tools (`./protocol.ts`). */
export const AGENT_ONLY = new Set(["declarer_etapes", "etape", "rendre_compte"]);

export function declareSteps(nodeId: string, args: Record<string, unknown>): ToolResult {
  const steps = declaredSteps(args.etapes);
  if (typeof steps === "string") return refused(steps);
  nodesStore.getState().update(nodeId, { steps });
  return said(t().agent.declared(steps.length));
}

export function markStep(nodeId: string, args: Record<string, unknown>): ToolResult {
  const current = terminalOf(nodesStore.getState().nodes[nodeId])?.steps ?? [];
  const steps = markedSteps(current, args.titre, args.etat);
  if (typeof steps === "string") return refused(steps);
  nodesStore.getState().update(nodeId, { steps });
  const step = steps.find((s) => s.title.toLowerCase() === String(args.titre).trim().toLowerCase())!;
  // French reads « en cours », English the protocol's "in_progress".
  const state = langStore.getState().lang === "fr" ? step.state.replace("_", " ") : outStep(step.state);
  return said(t().agent.marked(step.title, state));
}

/** `report`: outside a mission there is no one to tell; inside, its orchestrator hears it (spec §7.5). */
export function report(nodeId: string, args: Record<string, unknown>): ToolResult {
  const found = memberOf(nodeId, { evenClosed: true });
  if (!found) return said(t().agent.noMission);
  const summary = typeof args.resume === "string" ? args.resume.trim() : "";
  const status = args.statut;
  if (!summary) return refused(t().agent.summarize);
  if (status !== "termine" && status !== "bloque" && status !== "echec") return refused(t().agent.unknownStatus(String(status)));
  // `merge` merges every « done » branch again: a merged one stays so until then (final review H2).
  updateMember(found.orchestratorId, nodeId, { report: { summary, status, at: Date.now() } });
  // Its Kanban card follows: done, or on alert in « En cours ».
  const plan = missionOf(nodesStore.getState().nodes[found.orchestratorId])?.plan;
  if (status === "termine") void finishMissionCard(found.orchestratorId, plan, found.member.task).catch(() => undefined);
  else flagMissionCard(found.orchestratorId, plan, found.member.task, status === "bloque" ? "blocked" : "failed");
  // Queued even when nobody listens: a relaunched or restored orchestrator hears it then (final review R3).
  notify(found.orchestratorId, t().agent.reported(found.member.name, outReport(status), oneLine(summary)));
  if (isOrchestratorClosed(found.orchestratorId) || !isRunning(found.orchestratorId)) return said(t().agent.unheard);
  return said(t().agent.sent);
}
