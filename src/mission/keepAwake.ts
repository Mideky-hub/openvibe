import { setKeepAwake } from "@/ipc/mission";
import { nodesStore, type NodeRecord } from "@/store/nodes";
import { CLOCK_MS } from "./clock";
import { isOrchestratorClosed, missionOf } from "./store";

/** Whether a running overnight mission needs the PC awake (spec mission de nuit §5.4). */
export function wantsAwake(nodes: Record<string, NodeRecord>): boolean {
  return Object.entries(nodes).some(([id, record]) => {
    const mission = missionOf(record);
    return mission?.state === "en_cours" && mission.overnight === true && !isOrchestratorClosed(id);
  });
}

/** For the app's whole life: follows the missions, so every way a mission ends releases the PC. */
export function installKeepAwake(): () => void {
  let on = false;
  const apply = () => {
    const wanted = wantsAwake(nodesStore.getState().nodes);
    if (wanted === on) return;
    on = wanted;
    void setKeepAwake(wanted).catch(() => (on = !wanted));
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
