import { toast } from "sonner";
import { messages } from "@/i18n";
import { canvasStore } from "@/canvas/canvasStore";
import type { Point } from "@/fleet/terminals";
import { radialMessages } from "./messages";

/** Excalidraw's container: its keys, copy and paste act when it has the keyboard. */
const container = () => document.querySelector<HTMLElement>(".excalidraw-container");
/** The canvas Excalidraw reads pointers from, above its static one. */
const interactiveCanvas = () => document.querySelector<HTMLCanvasElement>(".excalidraw canvas.interactive");

/** The keyboard to the canvas, the selection kept (`releaseToCanvas` clears it). */
export function focusCanvas() {
  container()?.focus();
}

export interface CanvasKey {
  key: string;
  code: string;
  ctrl?: boolean;
  shift?: boolean;
}

/** Excalidraw's own shortcuts for what its API cannot do: its keyTests read these fields (0.18.1). */
export const CANVAS_KEYS = {
  duplicate: { key: "d", code: "KeyD", ctrl: true },
  front: { key: "]", code: "BracketRight", ctrl: true, shift: true },
  back: { key: "[", code: "BracketLeft", ctrl: true, shift: true },
  lock: { key: "L", code: "KeyL", ctrl: true, shift: true },
  delete: { key: "Delete", code: "Delete" },
} satisfies Record<string, CanvasKey>;

export function pressCanvasKey({ key, code, ctrl = false, shift = false }: CanvasKey) {
  focusCanvas();
  container()?.dispatchEvent(new KeyboardEvent("keydown", { key, code, ctrlKey: ctrl, shiftKey: shift, bubbles: true, cancelable: true }));
}

/** Copier: Excalidraw's `copy` listener writes the selection to the system clipboard itself. */
export function copyCanvasSelection() {
  focusCanvas();
  document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true }));
}

/** The clipboard as a paste carries it; null, with a toast, when empty or unreadable (spec menu radial §7). */
export async function readClipboard(): Promise<DataTransfer | null> {
  const data = new DataTransfer();
  try {
    for (const item of await navigator.clipboard.read()) {
      for (const type of item.types) {
        const blob = await item.getType(type);
        if (type.startsWith("image/")) data.items.add(new File([blob], "image", { type }));
        else data.setData(type, await blob.text());
      }
    }
  } catch {
    toast.error(messages(radialMessages).clipboardUnreadable);
    return null;
  }
  if (data.types.length === 0) {
    toast(messages(radialMessages).clipboardEmpty);
    return null;
  }
  return data;
}

/** The clipboard's text, for a terminal or an orchestrator; null, with a toast, when there is none. */
export async function readClipboardText(): Promise<string | null> {
  const data = await readClipboard();
  if (!data) return null;
  const text = data.getData("text/plain");
  // The clipboard holds something, an image say: not "empty".
  if (text === "") toast(messages(radialMessages).clipboardNoText);
  return text === "" ? null : text;
}

/** Coller at a window point: Excalidraw pastes where the pointer last moved, over its canvas only. */
export async function pasteOnCanvasAt(client: Point) {
  const data = await readClipboard();
  if (!data) return;
  // Excalidraw does not paste over an active node (its body takes the pointer): say so.
  if (document.elementFromPoint(client.x, client.y)?.closest("[data-terminal], [data-orchestrator]")) {
    toast(messages(radialMessages).pasteBlocked);
    return;
  }
  focusCanvas();
  document.dispatchEvent(new PointerEvent("pointermove", { clientX: client.x, clientY: client.y, bubbles: true }));
  document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
}

/**
 * Texte: a text starts at a window point, as by a double-click on the canvas.
 * Excalidraw's double-click starts one only with the selection tool, and crops
 * a lone selected image: both are set first, the double-click a frame after.
 */
export function startTextAt(client: Point) {
  const api = canvasStore.getState().api;
  api?.updateScene({ appState: { selectedElementIds: {}, selectedGroupIds: {} } });
  api?.setActiveTool({ type: "selection" });
  focusCanvas();
  requestAnimationFrame(() =>
    interactiveCanvas()?.dispatchEvent(new MouseEvent("dblclick", { clientX: client.x, clientY: client.y, bubbles: true, cancelable: true })),
  );
}

const nativeMenus = new WeakSet<Event>();

/** « Plus… »: Excalidraw's own menu at a window point; the ring's listener lets this one through. */
export function openNativeMenuAt(client: Point) {
  const event = new MouseEvent("contextmenu", { clientX: client.x, clientY: client.y, button: 2, bubbles: true, cancelable: true });
  nativeMenus.add(event);
  interactiveCanvas()?.dispatchEvent(event);
}

export function isNativeMenu(event: Event): boolean {
  return nativeMenus.has(event);
}
