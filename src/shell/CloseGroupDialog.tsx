import { nodeNameOf } from "@/nodes/types";
import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCanvas } from "@/canvas/canvasStore";
import { useMessages } from "@/i18n";
import { closeGroup } from "@/fleet/groups";
import { livingAgents } from "@/fleet/groupSummary";
import { useNodes } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { uiStore, useUi } from "@/store/ui";
import { shellMessages } from "./messages";

/** "Fermer le groupe Backend ?" listing the agents still running (spec habillage §11.4). */
export function CloseGroupDialog() {
  const t = useMessages(shellMessages).closeGroup;
  const groupId = useUi((s) => s.closingGroup);
  const group = useCanvas((s) => s.frames.find((f) => f.id === groupId) ?? null);
  const nodes = useNodes((s) => s.nodes);
  const statuses = useStore(terminalStatusStore, (s) => s.statuses);
  const living = group
    ? livingAgents(group.memberIds, (id) => nodeNameOf(nodes[id]?.payload) || "Agent", (id) => statuses[id]?.state === "running")
    : [];
  const close = () => uiStore.getState().setClosingGroup(null);

  return (
    <Dialog open={groupId !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.title(group?.name)}</DialogTitle>
          <DialogDescription>{t.description(living)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            {t.cancel}
          </Button>
          <Button
            className="bg-ov-danger text-white hover:bg-ov-danger/90"
            onClick={() => {
              if (groupId) closeGroup(groupId);
              close();
            }}
          >
            {t.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
