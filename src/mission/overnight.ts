import { messages } from "@/i18n";
import { agentMessages } from "@/mcp/messages";
import { notify } from "./events";
import { setMission } from "./store";
import type { TicketSource } from "./tickets";

export const DEFAULT_AWAY_HOURS = 8;
export const MAX_AWAY_HOURS = 72;
export const DEFAULT_LABEL = "overnight";

export interface OvernightChoice {
  awayMin: number;
  agents: number;
  source: TicketSource;
  autoLaunch: boolean;
}

/** The dialog's answer: the mission is set for the night, then the orchestrator gets its orders (spec mission de nuit §5.1). */
export function startOvernight(orchestratorId: string, choice: OvernightChoice) {
  const { awayMin, agents, source, autoLaunch } = choice;
  setMission(orchestratorId, { overnight: true, budgetMin: awayMin, maxAgents: agents, tickets: source, autoLaunch: autoLaunch || undefined });
  notify(orchestratorId, messages(agentMessages).lines.overnightStart(awayMin, agents, autoLaunch));
}
