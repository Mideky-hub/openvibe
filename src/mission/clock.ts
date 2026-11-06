import { toast } from "sonner";
import { messages } from "@/i18n";
import { agentMessages } from "@/mcp/messages";
import { nodesStore } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { notify } from "./events";
import { overruns, remainingGlobal, windingDown } from "./mission";
import { missionMessages } from "./messages";
import { isOrchestratorClosed, missionOf, setMission, updateMember } from "./store";

/** How often the missions' clocks are read. */
export const CLOCK_MS = 15_000;

/** Mission lines that wait for a free orchestrator: not queued twice, and recorded as told only once typed. */
const waiting = new Set<string>();
/** The worst overrun of a member whose line waits: saved with that line once typed, never before (issue #67). */
const reached = new Map<string, 1 | 2>();

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
      const key = `${orchestratorId}:${overrun.nodeId}`;
      const held = reached.get(key);
      if (held !== undefined && held >= overrun.level) continue;
      const before = mission.members.find((m) => m.nodeId === overrun.nodeId)?.overdue ?? 0;
      // Overnight a budget is a target and nobody is there: the morning report shows it (spec mission de nuit §3).
      if (overrun.level === 2 && !mission.overnight) toast.warning(said.overBudgetTwice(overrun.name, overrun.budget));
      if (held !== undefined) {
        // Its line still waits in memory: this step is saved with it, so a quit before it is typed loses neither.
        reached.set(key, overrun.level);
        continue;
      }
      if (before >= 1) {
        updateMember(orchestratorId, overrun.nodeId, { overdue: overrun.level });
        continue;
      }
      // Recorded as told once typed: a line lost with the app is told again at the next start.
      reached.set(key, overrun.level);
      const over = mission.overnight ? lines.targetOver : lines.budgetOver;
      notify(orchestratorId, over(overrun.name, overrun.task, overrun.budget), () => {
        const level = reached.get(key) ?? overrun.level;
        reached.delete(key);
        const known = missionOf(nodesStore.getState().nodes[orchestratorId])?.members.find((m) => m.nodeId === overrun.nodeId)?.overdue ?? 0;
        updateMember(orchestratorId, overrun.nodeId, { overdue: Math.max(known, level) as 1 | 2 });
      });
    }
    if (mission.state === "en_cours" && !mission.windDownTold && !mission.globalOverdue && !found.global && windingDown(mission, now) && !waiting.has(`${orchestratorId}:windDown`)) {
      waiting.add(`${orchestratorId}:windDown`);
      notify(orchestratorId, lines.windDown(remainingGlobal(mission, now) ?? 0), () => {
        waiting.delete(`${orchestratorId}:windDown`);
        setMission(orchestratorId, { windDownTold: true });
      });
    }
    if (found.global && !waiting.has(`${orchestratorId}:global`)) {
      waiting.add(`${orchestratorId}:global`);
      if (!mission.overnight) toast.warning(said.globalOver(mission.name ?? "", mission.budgetMin ?? 0));
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
