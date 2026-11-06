import { toast } from "sonner";
import { createStore, useStore } from "zustand";
import { AGENTS_WITHOUT_OPTIONS } from "@/fleet/catalog";
import { defaultAgentStore, type DefaultAgentChoice } from "@/fleet/defaultAgentChoice";
import { messages } from "@/i18n";
import { setActivityThreshold as applyThreshold } from "@/ipc/activity";
import { getSetting, setSetting } from "@/ipc/db";
import { appMessages } from "./messages";

const DEFAULT_AGENT_KEY = "agents.default";
const THRESHOLD_KEY = "agents.activityThresholdMs";

/** The quiet times the settings offer before an agent without hooks reads PRÊT; 1.5 s is Rust's default. */
export const ACTIVITY_THRESHOLDS = [1000, 1500, 3000, 5000] as const;
const DEFAULT_THRESHOLD = 1500;

export const activityThresholdStore = createStore<{ ms: number }>()(() => ({ ms: DEFAULT_THRESHOLD }));
export const useActivityThreshold = () => useStore(activityThresholdStore, (s) => s.ms);

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const notSaved = (error: unknown) => toast.error(messages(appMessages).settingNotSaved(message(error)));

/** A saved default agent, if it still is one: an agent that starts without options. */
export function readDefaultAgent(value: unknown): DefaultAgentChoice {
  return AGENTS_WITHOUT_OPTIONS.find((id) => id === value) ?? "auto";
}

function readThreshold(value: unknown): number | null {
  return ACTIVITY_THRESHOLDS.find((ms) => ms === value) ?? null;
}

/** At boot. An unreadable setting keeps its default. */
export async function loadAgentSettings() {
  try {
    const [agent, threshold] = await Promise.all([getSetting<unknown>(DEFAULT_AGENT_KEY), getSetting<unknown>(THRESHOLD_KEY)]);
    defaultAgentStore.setState({ choice: readDefaultAgent(agent) });
    const ms = readThreshold(threshold);
    if (ms !== null) {
      activityThresholdStore.setState({ ms });
      await applyThreshold(ms);
    }
  } catch (error) {
    console.warn(`agent settings: ${message(error)}`);
  }
}

export async function setDefaultAgent(choice: DefaultAgentChoice) {
  defaultAgentStore.setState({ choice });
  await setSetting(DEFAULT_AGENT_KEY, choice).catch(notSaved);
}

export async function setActivityThreshold(ms: number) {
  activityThresholdStore.setState({ ms });
  await Promise.all([setSetting(THRESHOLD_KEY, ms).catch(notSaved), applyThreshold(ms).catch(notSaved)]);
}
