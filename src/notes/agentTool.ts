import { messages } from "@/i18n";
import { refused, said, type ToolResult } from "@/mcp/agentTools";
import { linkedClaudeAgents } from "@/mission/store";
import { errorText } from "@/studio/parts";
import { notesAgentList, notesAgentRead } from "./ipc";
import { notesMessages } from "./messages";

/** Protects the agent's context: a longer note is cut, and says so (spec notes §3). */
const MAX_CHARS = 100_000;

const t = () => messages(notesMessages).tool;

/** Additive and read-only: offered to every Claude session, next to its own tools (spec notes §3). */
export function notesToolSpec() {
  return {
    name: "notes",
    description: t().description,
    inputSchema: { type: "object", properties: { name: { type: "string", description: t().name } } },
  };
}

async function list(nodeId: string, orchestrator: boolean): Promise<ToolResult> {
  const callers = orchestrator ? [nodeId, ...linkedClaudeAgents(nodeId).map((agent) => agent.nodeId)] : [nodeId];
  const notes = await notesAgentList(callers);
  if (notes.length === 0) return said(t().none);
  const lines = notes.map((note) => `- ${note.name}${note.attached ? ` (${t().attached})` : ""}`);
  return said([t().header(notes.length), ...lines].join("\n"));
}

async function read(nodeId: string, name: string): Promise<ToolResult> {
  const text = await notesAgentRead(nodeId, name);
  return said(text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n${t().cut(MAX_CHARS)}` : text);
}

/** The tool `notes`: the list without argument, a note with `name`. */
export async function notesTool(nodeId: string, orchestrator: boolean, args: Record<string, unknown>): Promise<ToolResult> {
  const { name } = args;
  if (name !== undefined && typeof name !== "string") return refused(t().noName);
  try {
    return name ? await read(nodeId, name) : await list(nodeId, orchestrator);
  } catch (error) {
    return refused(errorText(error));
  }
}
