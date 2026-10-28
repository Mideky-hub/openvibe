import type { MissionState, ReportStatus } from "@/mission/mission";
import type { Level } from "@/mission/router";
import type { AgentState } from "@/mission/store";
import type { StepState } from "@/nodes/steps";

/**
 * OpenVibe's MCP tools speak English to every agent (spec première version
 * §7.1): names, arguments and values. Inside, the saved ids stay French
 * (`en_cours`, `faible`…); this module translates at the boundary, and still
 * takes the French values a resumed conversation may send.
 */

/** Each tool's English name → its internal (former) name. */
const TOOLS: Record<string, string> = {
  declare_steps: "declarer_etapes",
  step: "etape",
  report: "rendre_compte",
  mission: "mission",
  propose_plan: "proposer_plan",
  team: "equipe",
  read_output: "lire_sortie",
  write: "ecrire",
  extend: "prolonger",
  interrupt: "interrompre",
  reassign: "reattribuer",
  merge: "fusionner",
  finish: "terminer",
  remote_control: "remote_control",
  board: "board",
};

/** The former names, for the agent that still calls one: what it is called now. */
export const RENAMED: Record<string, string> = Object.fromEntries(
  Object.entries(TOOLS)
    .filter(([english, french]) => english !== french)
    .map(([english, french]) => [french, english]),
);

/** Each tool's English argument → its internal one; unlisted arguments keep their name. */
const ARGS: Record<string, Record<string, string>> = {
  declarer_etapes: { steps: "etapes" },
  etape: { title: "titre", state: "etat" },
  rendre_compte: { summary: "resume", status: "statut" },
  proposer_plan: { name: "nom", task: "tache", subtasks: "sous_taches" },
  lire_sortie: { lines: "lignes" },
  ecrire: { text: "texte" },
  reattribuer: { subtask: "sous_tache" },
  terminer: { summary: "bilan" },
  remote_control: { on: "actif" },
};
const SUBTASK_ARGS: Record<string, string> = { title: "titre", brief: "consigne", level: "niveau" };

const STEP_IN: Record<string, StepState> = { in_progress: "en_cours", done: "fait", failed: "echec" };
const REPORT_IN: Record<string, ReportStatus> = { done: "termine", blocked: "bloque", failed: "echec" };
const LEVEL_IN: Record<string, Level> = { low: "faible", medium: "moyen", high: "eleve", extreme: "extreme" };
const AGENT_IN: Record<string, string> = { new: "nouveau" };
const TARGET_IN: Record<string, string> = { all: "tous", me: "moi" };

/** An English value, else the value as sent (a French one is still understood). */
const valueIn = (table: Record<string, string>, value: unknown) =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(table, value.toLowerCase()) ? table[value.toLowerCase()] : value;

function renamed(args: Record<string, unknown>, names: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [names[key] ?? key, value]));
}

/**
 * The internal name and arguments of a call; an unknown or former name gives
 * an empty name (the router answers it).
 */
export function internalCall(name: string, raw: Record<string, unknown>): { name: string; args: Record<string, unknown> } {
  const internal = Object.prototype.hasOwnProperty.call(TOOLS, name) ? TOOLS[name] : "";
  if (!internal) return { name: "", args: raw };
  const args = renamed(raw, ARGS[internal] ?? {});
  if (internal === "etape") args.etat = valueIn(STEP_IN, args.etat);
  if (internal === "rendre_compte") args.statut = valueIn(REPORT_IN, args.statut);
  if (internal === "reattribuer") args.agent = valueIn(AGENT_IN, args.agent);
  if (internal === "remote_control" && Array.isArray(args.agents)) args.agents = args.agents.map((target) => valueIn(TARGET_IN, target));
  if (internal === "proposer_plan" && Array.isArray(args.sous_taches)) {
    args.sous_taches = args.sous_taches.map((item) => {
      if (typeof item !== "object" || item === null) return item;
      const task = renamed(item as Record<string, unknown>, SUBTASK_ARGS);
      task.agent = valueIn(AGENT_IN, task.agent);
      if (task.niveau !== undefined) task.niveau = valueIn(LEVEL_IN, task.niveau);
      return task;
    });
  }
  return { name: internal, args };
}

const MISSION_OUT: Record<MissionState, string> = { redaction: "drafting", plan: "plan", lancement: "launching", en_cours: "running", terminee: "finished" };
const STEP_OUT: Record<StepState, string> = { a_venir: "pending", en_cours: "in_progress", fait: "done", echec: "failed" };
const REPORT_OUT: Record<ReportStatus, string> = { termine: "done", bloque: "blocked", echec: "failed" };
const AGENT_OUT: Record<AgentState, string> = { travaille: "working", attend: "waiting", inactif: "idle", arrêté: "stopped" };
const LEVEL_OUT: Record<Level, string> = { faible: "low", moyen: "medium", eleve: "high", extreme: "extreme" };

export const outMission = (state: MissionState) => MISSION_OUT[state];
export const outStep = (state: StepState) => STEP_OUT[state];
export const outReport = (status: ReportStatus) => REPORT_OUT[status];
export const outAgentState = (state: AgentState) => AGENT_OUT[state];
export const outLevel = (level: Level) => LEVEL_OUT[level];
/** A plan's agent: a linked agent's name, or "new". */
export const outAgent = (agent: string) => (agent === "nouveau" ? "new" : agent);
