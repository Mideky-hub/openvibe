import { useRef } from "react";
import { Copy, X } from "lucide-react";
import { toast } from "sonner";
import { useCanvas } from "@/canvas/canvasStore";
import { AGENTS } from "@/fleet/catalog";
import { duplicateTerminal, requestClose } from "@/fleet/terminals";
import { useActivity } from "@/store/agentActivity";
import { terminalOf, useNodes } from "@/store/nodes";
import { useTerminalStatus } from "@/store/terminalStatus";
import { ArrivalFlash } from "./ArrivalFlash";
import { frameStyle, WAITING_GLOW } from "./frame";
import { MissingNode } from "./MissingNode";
import { ResumeCard } from "./ResumeCard";
import { HeaderButton, TerminalHeader } from "./TerminalHeader";
import { useTerminalHost } from "./useTerminalHost";
import { useMessages } from "@/i18n";
import { nodesMessages } from "@/nodes/messages";

export function TerminalNode({ nodeId }: { nodeId: string }) {
  const payload = useNodes((s) => terminalOf(s.nodes[nodeId]));
  const status = useTerminalStatus(nodeId);
  const activity = useActivity(nodeId);
  const workspaceId = useNodes((s) => s.nodes[nodeId]?.workspaceId);
  const selected = useCanvas((s) => s.view.selectedIds.includes(nodeId));
  const hostRef = useRef<HTMLDivElement>(null);
  const hasPayload = payload !== undefined;
  const t = useMessages(nodesMessages).terminal;

  useTerminalHost(nodeId, hostRef, hasPayload);

  if (!payload) {
    // A copy is marked as starting before its record is made (adoptCopies): it may take longer than the grace.
    return <MissingNode text={t.notFound} pending={status.state === "starting"} />;
  }

  const waiting = status.state === "running" && activity?.activity === "waiting";
  return (
    <div
      data-terminal={nodeId}
      className="relative flex h-full flex-col overflow-hidden rounded-xl bg-ov-terminal"
      style={frameStyle(AGENTS[payload.agent].tint, selected, waiting)}
    >
      <TerminalHeader
        nodeId={nodeId}
        payload={payload}
        status={status}
        activity={activity}
        actions={
          <>
            <HeaderButton
              label={t.duplicate}
              onClick={() =>
                workspaceId &&
                void duplicateTerminal(workspaceId, nodeId).catch((error: unknown) =>
                  toast.error(t.duplicateFailed(String(error))),
                )
              }
            >
              <Copy />
            </HeaderButton>
            <HeaderButton close label={t.close} onClick={() => requestClose(nodeId)}>
              <X />
            </HeaderButton>
          </>
        }
      />
      {/* The padding sits on a wrapper: the grid is sized from the host's
          client size, which would include padding set on the host itself. */}
      <div className="relative min-h-0 flex-1 px-1 pt-1">
        <div ref={hostRef} className="relative h-full w-full overflow-hidden" />
        <ResumeCard nodeId={nodeId} payload={payload} status={status} />
      </div>
      {waiting && <div className="pointer-events-none absolute inset-0 z-20 rounded-xl" style={{ boxShadow: WAITING_GLOW }} />}
      <ArrivalFlash nodeId={nodeId} />
    </div>
  );
}
