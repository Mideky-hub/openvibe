import { X } from "lucide-react";
import { canvasStore, useCanvas } from "@/canvas/canvasStore";
import { useMessages } from "@/i18n";
import { shellMessages } from "./messages";
import { TOP_ROW_HEIGHT } from "./layout";

/**
 * Zen (Alt+Z) and reading (Alt+R) hide the tools: a small glass pill under the
 * bars, at the right, says where you are and leaves (spec identité §5.10, dense glass).
 */
export function ModeExit() {
  const t = useMessages(shellMessages).modeExit;
  const mode = useCanvas((s) => s.view.mode);
  if (!mode) return null;
  const leave = () => canvasStore.getState().api?.updateScene({ appState: { zenModeEnabled: false, viewModeEnabled: false } });
  return (
    <button
      type="button"
      onClick={leave}
      style={{ top: TOP_ROW_HEIGHT + 10 }}
      className="ov-glass-strong absolute right-3 z-30 flex h-7 items-center gap-1.5 rounded-full px-3 text-[11.5px] text-ov-text-2 hover:text-ov-text"
    >
      <X className="size-3.5" />
      {mode === "zen" ? t.zen : t.reading}
    </button>
  );
}
