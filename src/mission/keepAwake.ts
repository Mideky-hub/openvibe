import { setKeepAwake } from "@/ipc/mission";
import { nodesStore, type NodeRecord } from "@/store/nodes";
import { CLOCK_MS } from "./clock";
import type { Mission } from "./mission";
import { isOrchestratorClosed, missionOf } from "./store";

/** Past the time away, a night is over even if nobody said so: an orchestrator that died never calls `finish`. */
const GRACE_MIN = 30;
const MINUTE = 60_000;

function pastTheNight({ startedAt, budgetMin }: Mission, now: number): boolean {
  return startedAt !== undefined && budgetMin !== undefined && now - startedAt >= (budgetMin + GRACE_MIN) * MINUTE;
}

/** Whether a running overnight mission needs the PC awake (spec mission de nuit §5.4). */
export function wantsAwake(nodes: Record<string, NodeRecord>, now = Date.now()): boolean {
  return Object.entries(nodes).some(([id, record]) => {
    const mission = missionOf(record);
    return mission?.state === "en_cours" && mission.overnight === true && !isOrchestratorClosed(id) && !pastTheNight(mission, now);
  });
}

/** For the app's whole life: follows the missions, so every way a mission ends releases the PC. */
export function installKeepAwake(): () => void {
  // Unknown at the start: a reloaded page must not believe nothing is held.
  let on: boolean | null = null;
  const apply = () => {
    const wanted = wantsAwake(nodesStore.getState().nodes);
    if (wanted === on) return;
    on = wanted;
    void setKeepAwake(wanted).catch(() => (on = null));
  };
  apply();
  const off = nodesStore.subscribe(apply);
  // Closing an orchestrator changes no node.
  const timer = setInterval(apply, CLOCK_MS);
  return () => {
    off();
    clearInterval(timer);
  };
}
