import type { NodeRecord } from "@/store/nodes";
import type { TerminalStatus } from "@/store/terminalStatus";

/**
 * Terminals restored stopped that can pick their conversation back up (spec
 * habillage §7.4). A terminal never shown yet has no status: it counts as stopped,
 * unless its process still runs in Rust (webview reload). Only terminals on the
 * canvas count: a closed one keeps its record in memory for undo.
 */
export function resumableTerminals(
  nodes: Record<string, NodeRecord>,
  statuses: Record<string, TerminalStatus>,
  workspaceId: string,
  alive: ReadonlySet<string>,
  onScene: ReadonlySet<string>,
): string[] {
  return Object.entries(nodes)
    .filter(
      ([id, node]) =>
        node.workspaceId === workspaceId &&
        node.kind === "terminal" &&
        !node.payload.oneShot &&
        onScene.has(id) &&
        !alive.has(id) &&
        (statuses[id]?.state ?? "stopped") === "stopped",
    )
    .map(([id]) => id);
}
