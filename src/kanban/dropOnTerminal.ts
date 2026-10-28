import { toast } from "sonner";
import { canvasStore } from "@/canvas/canvasStore";
import { findTerminalAt } from "@/canvas/hitTest";
import { sceneOf } from "@/fleet/placement";
import { messages } from "@/i18n";
import { ptySendText } from "@/ipc/pty";
import { nodesStore, terminalOf } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { cardText } from "./board";
import { kanbanMessages } from "./messages";

// WebView2 may end a drag with clientX/clientY at 0: the last dragover is where it was dropped.
let lastDragPoint: { x: number; y: number } | null = null;
let tracking = false;

function trackDragPoint() {
  if (tracking || typeof window === "undefined") return;
  tracking = true;
  window.addEventListener("dragover", (event) => (lastDragPoint = { x: event.clientX, y: event.clientY }), true);
}

/** Called when a card starts being dragged, so its drop point is known. */
export function startCardDrag() {
  trackDragPoint();
  lastDragPoint = null;
}

/** The terminal node under a window point, if any. */
export function terminalAtClient(client: { x: number; y: number }): string | null {
  const { api, view } = canvasStore.getState();
  if (!api) return null;
  const scene = sceneOf(client, view);
  return findTerminalAt(api.getSceneElements(), scene.x, scene.y)?.id ?? null;
}

/** Types the card's text into a running terminal, then Enter (issue #29). */
export async function sendCardToTerminal(nodeId: string, cardId: string, terminalId: string): Promise<boolean> {
  const t = messages(kanbanMessages);
  const record = nodesStore.getState().nodes[nodeId];
  const card = record?.kind === "kanban" ? record.payload.cards[cardId] : undefined;
  if (!card) return false;
  const terminal = terminalOf(nodesStore.getState().nodes[terminalId]);
  const name = terminal?.name || terminal?.title || t.agent;
  if (!isRunning(terminalId)) {
    toast.error(t.notRunning(name));
    return false;
  }
  try {
    await ptySendText(terminalId, cardText(card));
    toast.success(t.sent(name));
    return true;
  } catch (error) {
    toast.error(t.sendFailed(String(error)));
    return false;
  }
}

/** A card dropped outside its board: on a terminal, its text goes to the agent. */
export function dropCardOutside(nodeId: string, cardId: string, clientX: number, clientY: number) {
  const point = lastDragPoint ?? { x: clientX, y: clientY };
  lastDragPoint = null;
  const terminalId = terminalAtClient(point);
  if (terminalId) void sendCardToTerminal(nodeId, cardId, terminalId);
}
