import { screenRectOf } from "@/fleet/placement";
import { useNow } from "@/lib/useNow";
import { budgetBar, type BudgetTone } from "@/mission/mission";
import { memberBudgets } from "@/mission/store";
import type { Step } from "@/nodes/steps";
import { terminalOf, useNodes } from "@/store/nodes";
import { useSubagents } from "@/store/subagents";
import { useTerminalStatus } from "@/store/terminalStatus";
import { useCanvas, type CanvasView } from "../canvasStore";
import type { Rect } from "../groups";
import { BUDGET_COLOR, dotsOf, TIMELINE_GAP } from "./timeline";

/**
 * Each Claude terminal's steps, under it (spec orchestrateur §5). Like the
 * group backdrops, the layer sits under the nodes and takes no pointer: a
 * frieze never covers nor blocks the header of the row below it. It is drawn
 * at the scene's size and scaled like the nodes.
 */
export function StepTimelines() {
  const rects = useCanvas((s) => s.nodeRects);
  const view = useCanvas((s) => s.view);
  const nodes = useNodes((s) => s.nodes);
  // The budget bars move with time, not only with the canvas (spec orchestrateur §8.3).
  const now = useNow(15_000);
  const budgets = memberBudgets(nodes, now);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Object.entries(rects).map(([id, rect]) => {
        const steps = terminalOf(nodes[id])?.steps ?? [];
        const budget = budgets[id];
        return steps.length || budget ? <Timeline key={id} nodeId={id} steps={steps} budget={budget} rect={rect} view={view} /> : null;
      })}
    </div>
  );
}

function Timeline(props: { nodeId: string; steps: Step[]; budget?: { spent: number; budget: number }; rect: Rect; view: CanvasView }) {
  const { nodeId, steps, budget, rect, view } = props;
  const running = useSubagents(nodeId);
  // A step "en cours" only pulses under a process that runs (not after an interruption or a crash).
  const alive = useTerminalStatus(nodeId).state === "running";
  const screen = screenRectOf(rect, view);
  const dots = dotsOf(steps, rect.width);
  return (
    <div
      data-steps={nodeId}
      className="absolute h-[21px]"
      style={{
        left: screen.x,
        top: screen.y + screen.height + TIMELINE_GAP * view.zoom,
        width: rect.width,
        transform: `scale(${view.zoom})`,
        transformOrigin: "0 0",
      }}
    >
      {budget && <BudgetBar {...budgetBar(budget.spent, budget.budget)} title={`${Math.floor(budget.spent)} / ${budget.budget} min`} />}
      {steps.length > 0 && <div className="absolute inset-x-0 top-[3px] h-px bg-ov-line" />}
      {dots.map((dot, i) => (
        <div key={i} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: dot.x, width: dot.slot }}>
          <span className={dot.state === "en_cours" && alive ? "size-[7px] animate-pulse rounded-full" : "size-[7px] rounded-full"} style={{ backgroundColor: dot.color }} />
          <span className="mt-px flex max-w-full px-1 text-[9px] leading-[11px] text-ov-text-2">
            <span className="truncate">{dot.title}</span>
            {dot.state === "en_cours" && running > 0 && <span className="shrink-0">{` ×${running}`}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Time spent over budget, in the gap between the terminal and its steps. */
function BudgetBar({ ratio, tone, title }: { ratio: number; tone: BudgetTone; title: string }) {
  return (
    <div className="absolute inset-x-0 -top-[3px] h-[2px] bg-ov-line" aria-label={title}>
      <div className="h-full" style={{ width: `${ratio * 100}%`, backgroundColor: BUDGET_COLOR[tone] }} />
    </div>
  );
}
