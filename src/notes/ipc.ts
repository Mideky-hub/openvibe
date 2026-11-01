import { call } from "@/ipc/invoke";
import type { OpenedFile, WriteOutcome } from "@/ipc/studio";

export interface Note {
  name: string;
  text: string;
  version: string;
}

/** `skipped`: the notes left out, binary, too big, or past the limits (spec notes §3). */
export interface NoteList {
  notes: Note[];
  skipped: number;
}

export interface AgentNote {
  name: string;
  /** Attached to the caller's group, or to the groups of an orchestrator's agents. */
  attached: boolean;
}

export const notesAll = (projectId: string) => call<NoteList>("notes_all", { projectId });
export const notesRead = (projectId: string, name: string) => call<OpenedFile>("notes_read", { projectId, name });
/** Null when the note no longer exists. */
export const notesVersion = (projectId: string, name: string) => call<string | null>("notes_version", { projectId, name });
export const notesWrite = (projectId: string, name: string, text: string, expected: string | null) =>
  call<WriteOutcome>("notes_write", { projectId, name, text, expected });
/** The project is that of the first node. */
export const notesAgentList = (nodeIds: readonly string[]) => call<AgentNote[]>("notes_agent_list", { nodeIds });
export const notesAgentRead = (nodeId: string, name: string) => call<string>("notes_agent_read", { nodeId, name });
