import { useEffect } from "react";
import { History, X } from "lucide-react";
import { toast } from "sonner";
import { canvasStore } from "@/canvas/canvasStore";
import { liveNodeIds } from "@/canvas/sceneSync";
import { createStore, useStore } from "zustand";
import { isLiveInRust, resumeTerminal } from "@/nodes/terminal/registry";
import { nodesStore, useNodes } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { useMessages } from "@/i18n";
import { fleetMessages } from "./messages";
import { resumableTerminals } from "./resumable";

/** The offer sits bottom-right, where the agents panel may reach: the panel stops above it. */
export const resumeOfferStore = createStore<{ open: boolean }>()(() => ({ open: false }));
/** The room the offer takes from the window's bottom edge, in px (zoom control, margin, the toast). */
export const RESUME_OFFER_ROOM = 170;

/** Workspaces whose offer was answered: it does not come back before the next launch. */
const answered = new Set<string>();
const toastId = (workspaceId: string) => `resume-all-${workspaceId}`;
const RELAUNCH_STAGGER_MS = 300;

function liveSet(ids: string[]): Set<string> {
  return new Set(ids.filter(isLiveInRust));
}

/** Terminals on the canvas on screen; closed ones are kept in memory for undo. */
function sceneSet(): Set<string> {
  return new Set(liveNodeIds(canvasStore.getState().api?.getSceneElements() ?? []));
}

function ResumeAllToast({ workspaceId }: { workspaceId: string }) {
  const t = useMessages(fleetMessages).resumeAll;
  const nodes = useNodes((s) => s.nodes);
  const statuses = useStore(terminalStatusStore, (s) => s.statuses);
  const ids = resumableTerminals(nodes, statuses, workspaceId, liveSet(Object.keys(nodes)), sceneSet());

  useEffect(() => {
    if (ids.length === 0) {
      toast.dismiss(toastId(workspaceId));
      resumeOfferStore.setState({ open: false });
    }
  }, [ids.length, workspaceId]);

  const answer = () => {
    answered.add(workspaceId);
    toast.dismiss(toastId(workspaceId));
    resumeOfferStore.setState({ open: false });
  };
  const resumeAll = () => {
    answer();
    ids.forEach((id, i) => setTimeout(() => resumeTerminal(id), i * RELAUNCH_STAGGER_MS));
  };

  return (
    <div className="ov-glass-strong flex w-[360px] items-start gap-3 rounded-[14px] p-3 text-ov-text">
      <History className="mt-0.5 size-4 shrink-0 text-ov-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t.title}</p>
        <p className="text-xs text-ov-text-2">
          {t.body(ids.length)}
        </p>
        <div className="mt-2 flex gap-2">
          <button type="button" className="h-7 rounded-[8px] bg-ov-accent px-3 text-xs font-semibold text-ov-on-accent" onClick={resumeAll}>
            {t.yes}
          </button>
          <button type="button" className="h-7 rounded-[8px] bg-ov-field px-3 text-xs text-ov-text" onClick={answer}>
            {t.no}
          </button>
        </div>
      </div>
      <button type="button" aria-label={t.close} className="text-ov-text-2 hover:text-ov-text" onClick={answer}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Offers to resume the stopped terminals of a workspace (spec habillage §7.4). */
export function offerResumeAll(workspaceId: string) {
  if (answered.has(workspaceId)) return;
  const nodes = nodesStore.getState().nodes;
  const statuses = terminalStatusStore.getState().statuses;
  if (resumableTerminals(nodes, statuses, workspaceId, liveSet(Object.keys(nodes)), sceneSet()).length === 0) return;
  resumeOfferStore.setState({ open: true });
  toast.custom(() => <ResumeAllToast workspaceId={workspaceId} />, {
    id: toastId(workspaceId),
    duration: Infinity,
  });
}

/** Leaving the workspace hides the offer without answering it. */
export function dismissResumeOffer(workspaceId: string) {
  toast.dismiss(toastId(workspaceId));
  resumeOfferStore.setState({ open: false });
}
