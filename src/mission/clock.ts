import { toast } from "sonner";
import { messages } from "@/i18n";
import { agentMessages } from "@/mcp/messages";
import { nodesStore } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { notify } from "./events";
import { overruns } from "./mission";
import { missionMessages } from "./messages";
import { isOrchestratorClosed, missionOf, setMission, updateMember } from "./store";

/** How often the missions' clocks are read. */
export const CLOCK_MS = 15_000;

/** Overruns whose line waits for a free orchestrator: not queued twice, and recorded as told only once typed. */
const waiting = new Set<string>();

/** One look at every running mission's budgets (spec §8.2); it never stops an agent. */
export function checkBudgets(now = Date.now()) {
  for (const [orchestratorId, record] of Object.entries(nodesStore.getState().nodes)) {
    const mission = missionOf(record);
    if (!mission || isOrchestratorClosed(orchestratorId)) continue;
    const found = overruns(mission, now);
    const lines = messages(agentMessages).lines;
    const said = messages(missionMessages);
    for (const overrun of found.members) {
      // The clock runs while OpenVibe is closed: a stopped agent's overrun is for its restart, not a burst of toasts.
      if (!isRunning(overrun.nodeId)) continue;
      const key = `${orchestratorId}:${overrun.nodeId}:${overrun.level}`;
      if (waiting.has(key)) continue;
      const before = mission.members.find((m) => m.nodeId === overrun.nodeId)?.overdue ?? 0;
      if (overrun.level === 2) toast.warning(said.overBudgetTwice(overrun.name, overrun.budget));
      const told = () => {
        waiting.delete(key);
        updateMember(orchestratorId, overrun.nodeId, { overdue: overrun.level });
      };
      if (before < 1) {
        // Recorded as told once typed: a line lost with the app is told again at the next start.
        waiting.add(key);
        notify(orchestratorId, lines.budgetOver(overrun.name, overrun.task, overrun.budget), told);
      } else told();
    }
    if (found.global && !waiting.has(`${orchestratorId}:global`)) {
      waiting.add(`${orchestratorId}:global`);
      toast.warning(said.globalOver(mission.name ?? "", mission.budgetMin ?? 0));
      notify(orchestratorId, lines.globalOver(mission.budgetMin ?? 0), () => {
        waiting.delete(`${orchestratorId}:global`);
        setMission(orchestratorId, { globalOverdue: true });
      });
    }
  }
}

/** For the app's whole life. */
export function installMissionClock(): () => void {
  const timer = setInterval(() => checkBudgets(), CLOCK_MS);
  return () => clearInterval(timer);
}
