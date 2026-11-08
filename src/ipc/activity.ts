import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { call } from "./invoke";

export type Activity = "idle" | "working" | "waiting";

/** Mirrors Rust's `ActivityEvent`; `since` is a wall-clock time in ms. */
export interface ActivityEvent {
  nodeId: string;
  activity: Activity;
  since: number;
  /** What a waiting agent says it waits for, cleaned by Rust; untrusted, plain text only (spec notification §7). */
  message?: string;
  /** The order of Rust's changes, which `since` cannot give: Rust always sends it. */
  seq?: number;
}

export interface ActivitySnapshot {
  hooksAvailable: boolean;
  activities: ActivityEvent[];
  /** The sessions running subagents when the page loaded. */
  subagents: { nodeId: string; running: number }[];
}

export const agentActivitySnapshot = () => call<ActivitySnapshot>("agent_activity_snapshot");

export function onAgentActivity(handler: (event: ActivityEvent) => void): Promise<UnlistenFn> {
  return listen<ActivityEvent>("agent-activity", (event) => handler(event.payload));
}
