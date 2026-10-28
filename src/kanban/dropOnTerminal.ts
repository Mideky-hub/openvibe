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
let dragging: { nodeId: string; cardId: string } | null = null;
let dropped = false;
let tracking = false;

/** Outside every board: there, a card is ours to drop, not Excalidraw's (it would make a text element of it). */
const outsideBoards = (event: Event) => !(event.target instanceof Element && event.target.closest("[data-kanban]"));

function trackDragPoint() {
  if (tracking || typeof window === "undefined") return;
  tracking = true;
  window.addEventListener(
    "dragover",
    (event) => {
      lastDragPoint = { x: event.clientX, y: event.clientY };
      if (!dragging || !outsideBoards(event)) return;
      event.stopPropagation();
      if (terminalAtClient(lastDragPoint)) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }
    },
    true,
  );
  window.addEventListener(
    "drop",
    (event) => {
      if (!dragging || !outsideBoards(event)) return;
      event.preventDefault();
      event.stopPropagation();
      dropped = true;
      const terminalId = terminalAtClient({ x: event.clientX, y: event.clientY });
      if (terminalId) void sendCardToTerminal(dragging.nodeId, dragging.cardId, terminalId);
    },
    true,
  );
}

/** Called when a card starts being dragged, so its drop point is known and Excalidraw does not take it. */
export function startCardDrag(nodeId?: string, cardId?: string) {
  trackDragPoint();
  lastDragPoint = null;
  dropped = false;
  dragging = nodeId && cardId ? { nodeId, cardId } : null;
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
  dragging = null;
  // Already sent by the drop listener.
  if (dropped) return;
  const point = lastDragPoint ?? { x: clientX, y: clientY };
  lastDragPoint = null;
  const terminalId = terminalAtClient(point);
  if (terminalId) void sendCardToTerminal(nodeId, cardId, terminalId);
}
