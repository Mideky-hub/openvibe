import { Repeat } from "lucide-react";
import { requestUi } from "@/commands/uiRequests";
import { useMessages } from "@/i18n";
import { useLoops } from "./live";
import { loopsMessages } from "./messages";

/**
 * Visible as long as a loop runs (spec boucles §1): how many, how many runs
 * so far, and « Tout arrêter » one click away. Each run costs real usage.
 */
export function LoopsIndicator() {
  const t = useMessages(loopsMessages).indicator;
  const runtime = useLoops((s) => s.runtime);
  const stopAll = useLoops((s) => s.stopAll);
  const running = Object.values(runtime).filter((r) => r.running);
  if (running.length === 0) return null;
  const runs = running.reduce((sum, r) => sum + r.runs, 0);
  return (
    <div
      data-loops-indicator
      className="ov-glass-strong fixed bottom-[76px] left-4 z-30 flex items-center gap-2 rounded-full py-1 pl-3 pr-1 text-xs text-ov-text"
    >
      <Repeat className="size-3.5 text-ov-accent" />
      <button type="button" aria-label={t.open} onClick={() => requestUi({ kind: "loops" })} className="font-mono">
        {t.label(running.length, runs)}
      </button>
      <button
        type="button"
        data-stop-all
        onClick={stopAll}
        className="h-6 rounded-full bg-ov-danger px-2.5 text-[11px] font-semibold text-white hover:brightness-110"
      >
        {t.stopAll}
      </button>
    </div>
  );
}
