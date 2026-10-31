import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMessages } from "@/i18n";
import { removeNodes } from "@/fleet/terminals";
import { useActivity } from "@/store/agentActivity";
import { useNodes } from "@/store/nodes";
import { uiStore, useUi } from "@/store/ui";
import { shellMessages } from "./messages";

/**
 * "Fermer Isis ?" before closing a running agent (spec habillage §7.5), or
 * "Fermer 2 agents ?" when an undo or Suppr took several at once (retours J8b).
 * An orchestrator in mission says what its closing leaves behind (spec
 * première version §5.4).
 */
export function CloseAgentDialog() {
  const t = useMessages(shellMessages).closeAgent;
  const closing = useUi((s) => s.closing);
  const nodes = useNodes((s) => s.nodes);
  const activity = useActivity(closing?.agents[0] ?? "")?.activity;
  const names = (closing?.agents ?? []).map((id) => nodes[id]?.payload.name || "Agent");
  const close = () => uiStore.getState().setClosing(null);
  const one = names.length <= 1;
  const name = names[0] ?? t.fallbackName;
  const first = closing?.agents[0] ? nodes[closing.agents[0]] : undefined;
  const orchestrator = one && first?.kind === "orchestrator";
  const inMission = orchestrator && first.payload.mission?.state === "en_cours";
  // Spec habillage §7.5: « est en cours » or « est prête », by what the agent is doing.
  const state = activity === "working" ? "Working" : activity === "idle" ? "Ready" : null;
  const description = !one
    ? t.several(names)
    : inMission
      ? t.inMission(name)
      : orchestrator
        ? state ? t[`orchestrator${state}`](name) : t.orchestrator(name)
        : state ? t[`agent${state}`](name) : t.agent(name);

  return (
    <Dialog open={closing !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{one ? t.titleOne(name) : t.titleMany(names.length)}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            {t.cancel}
          </Button>
          <Button
            className="bg-ov-danger text-white hover:bg-ov-danger/90"
            onClick={() => {
              if (closing) removeNodes(closing.remove);
              close();
            }}
          >
            {orchestrator ? t.confirmOrchestrator : one ? t.confirmOne : t.confirmMany}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
