import { getCurrentWindow } from "@tauri-apps/api/window";
import { onAction, sendNotification, type ActionPerformed } from "@tauri-apps/plugin-notification";
import { goToAgent } from "@/commands/goToRun";
import { currentWaitingAgents } from "@/fleet/waitingAgents";
import { messages } from "@/i18n";
import { agentActivityStore } from "@/store/agentActivity";
import { projectsStore } from "@/store/projects";
import { shellMessages } from "./messages";

const warn = (error: unknown) => console.warn("Windows notification failed", error);

async function alertFor(nodeId: string) {
  const agent = currentWaitingAgents().find((a) => a.id === nodeId);
  if (!agent || (await getCurrentWindow().isFocused())) return;
  sendNotification({ title: "OpenVibe", body: messages(shellMessages).waitingNotice.question(agent.name), extra: { nodeId } });
}

/** A click on the notification: back to the window, on the agent if it still waits and a canvas can show it. */
async function comeBack({ actionId, notification }: ActionPerformed) {
  if (actionId !== "tap") return;
  const appWindow = getCurrentWindow();
  await appWindow.unminimize();
  await appWindow.setFocus();
  const agent = currentWaitingAgents().find((a) => a.id === notification?.extra.nodeId);
  if (agent && projectsStore.getState().view === "project") goToAgent(agent);
}

/**
 * A Windows notification when an agent starts waiting while the window is not
 * focused (spec notification §8). Installed after the activity snapshot, so a
 * reload does not repeat the waits already known. Its failures are only
 * logged: the notice in the window says the same.
 */
export function installWaitingAlerts(): () => void {
  const listening = onAction((event) => void comeBack(event).catch(warn)).catch(warn);
  const unsubscribe = agentActivityStore.subscribe((state, previous) => {
    for (const [nodeId, { activity }] of Object.entries(state.activities)) {
      if (activity === "waiting" && previous.activities[nodeId]?.activity !== "waiting") void alertFor(nodeId).catch(warn);
    }
  });
  return () => {
    unsubscribe();
    void listening.then((listener) => listener?.unregister());
  };
}
