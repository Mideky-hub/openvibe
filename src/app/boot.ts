import { messages } from "@/i18n";
import { appMessages } from "./messages";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { loadAgentsPanel } from "@/fleet/agentsPanelState";
import { agentActivitySnapshot, onAgentActivity } from "@/ipc/activity";
import { onAgentSubagents } from "@/ipc/mcp";
import { onPtyExit, ptyList } from "@/ipc/pty";
import { installMcp } from "@/mcp/router";
import { installMissionClock } from "@/mission/clock";
import { installKeepAwake } from "@/mission/keepAwake";
import { installMissionEvents } from "@/mission/events";
import { forgetLivePty, setLivePtys } from "@/nodes/terminal/registry";
import { installWaitingAlerts } from "@/shell/waitingAlert";
import { agentActivityStore } from "@/store/agentActivity";
import { subagentsStore } from "@/store/subagents";
import { terminalStatusStore } from "@/store/terminalStatus";
import { installUsage } from "@/usage/usageStore";
import { projectsStore, setForgetWorkspaces } from "@/store/projects";
import { saveBeforeClose } from "./close";
import { forgetWorkspaces } from "./forget";
import { loadLanguage } from "@/i18n/settings";
import { loadThemeSettings } from "./theme";
import { loadNativeNotifications } from "./nativeNotifications";
import { loadAgentSettings } from "./agentSettings";
import { loadShortcuts } from "@/commands/shortcutSettings";
import { loadUpdateSettings, startUpdateChecks } from "./updates";
import { syncWindowTitle } from "./windowTitle";

let booting: Promise<void> | undefined;

/**
 * Starts the app once (React's StrictMode runs effects twice in development).
 * Order matters: exits are listened to before any terminal starts, and running
 * sessions are known before any terminal node mounts.
 */
export function boot(): Promise<void> {
  booting ??= (async () => {
    await loadLanguage();
    await loadThemeSettings();
    await loadUpdateSettings();
    await loadNativeNotifications();
    await loadAgentSettings();
    await loadShortcuts();
    await loadAgentsPanel();
    await onPtyExit(({ nodeId, exitCode }) => {
      forgetLivePty(nodeId);
      terminalStatusStore.getState().set(nodeId, { state: "exited", code: exitCode });
      agentActivityStore.getState().remove(nodeId);
    });
    // Listened to before the snapshot: no change can fall between the two.
    await onAgentActivity((event) => agentActivityStore.getState().apply(event));
    await onAgentSubagents(({ nodeId, running }) => subagentsStore.getState().set(nodeId, running));
    const activity = await agentActivitySnapshot();
    agentActivityStore.getState().load(activity.activities);
    // What the sessions ran before this page loaded: the count is not lost on a reload.
    for (const { nodeId, running } of activity.subagents ?? []) subagentsStore.getState().set(nodeId, running);
    if (!activity.hooksAvailable) toast.warning(messages(appMessages).hooksDown);
    await installMcp();
    await installUsage();
    installMissionEvents();
    installMissionClock();
    installKeepAwake();
    installWaitingAlerts();
    setLivePtys(await ptyList());
    await getCurrentWindow().onCloseRequested(saveBeforeClose);
    setForgetWorkspaces(forgetWorkspaces);
    syncWindowTitle();
    await projectsStore.getState().init();
    startUpdateChecks();
  })();
  return booting;
}
