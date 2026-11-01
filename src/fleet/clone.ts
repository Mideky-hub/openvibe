import type { TerminalPayload } from "@/nodes/types";

/** A new agent copying another: same agent, folder and shell; its own name and conversation. */
export function cloneTerminalPayload(source: TerminalPayload, name: string): TerminalPayload {
  const copy: TerminalPayload = { ...source, name };
  delete copy.claudeSessionId;
  // Its steps belong to the source's conversation (spec orchestrateur §5).
  delete copy.steps;
  // A mission's model and Remote Control were asked for the source only (final review maj §3).
  delete copy.model;
  delete copy.remoteControl;
  // An install runs once, when asked for, and a copy starts by itself: it is a plain shell in the same folder.
  if (copy.oneShot) {
    copy.agent = "shell";
    copy.command = "";
    delete copy.oneShot;
  }
  if (copy.agent === "claude") copy.claudeSessionId = crypto.randomUUID();
  return copy;
}
