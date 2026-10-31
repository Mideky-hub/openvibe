import { messages } from "@/i18n";
import { mcpReply, onMcpCall, type McpCall } from "@/ipc/mcp";
import { notesTool, notesToolSpec } from "@/notes/agentTool";
import { nodesStore, terminalOf } from "@/store/nodes";
import { AGENT_ONLY, agentTools, declareSteps, markStep, refused, report } from "./agentTools";
import { agentMessages } from "./messages";
import { ORCHESTRATOR_ONLY, orchestratorTool, orchestratorTools } from "./orchestratorTools";
import { internalCall, RENAMED } from "./protocol";

const t = () => messages(agentMessages).router;

/** The interface's answer to one MCP call of a node, by its kind (spec orchestrateur §4.1, §4.3). */
export async function answer(call: McpCall): Promise<unknown> {
  const record = nodesStore.getState().nodes[call.nodeId];
  const orchestrator = record?.kind === "orchestrator";
  if (call.method === "tools/list") return { tools: [...(orchestrator ? orchestratorTools() : agentTools()), notesToolSpec()] };
  const asked = String(call.params.name ?? "");
  const { name, args } = internalCall(asked, (call.params.arguments ?? {}) as Record<string, unknown>);
  // A conversation resumed from before the English names may still call a former one.
  if (!name) return refused(Object.prototype.hasOwnProperty.call(RENAMED, asked) ? t().renamed(RENAMED[asked]) : t().unknown(asked));
  // Read-only and for all: the caller's project comes from the base, it may not be the one on screen.
  if (name === "notes") return notesTool(call.nodeId, orchestrator, args);
  if (orchestrator) return AGENT_ONLY.has(name) ? refused(t().agentsOnly) : orchestratorTool(call.nodeId, name, args);
  if (!terminalOf(record)) return refused(t().gone);
  if (ORCHESTRATOR_ONLY.has(name)) return refused(t().orchestratorOnly);
  switch (name) {
    case "declarer_etapes":
      return declareSteps(call.nodeId, args);
    case "etape":
      return markStep(call.nodeId, args);
    case "rendre_compte":
      return report(call.nodeId, args);
    default:
      return refused(t().unknown(asked));
  }
}

/** For the app's whole life: every call gets an answer, a failure included. */
export async function installMcp() {
  await onMcpCall(async (call) => {
    let result: unknown;
    try {
      result = await answer(call);
    } catch (error) {
      result = refused(t().failed(String(error)));
    }
    await mcpReply(call.callId, result);
  });
}
