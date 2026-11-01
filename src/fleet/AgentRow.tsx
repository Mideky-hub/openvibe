import type { ReactNode } from "react";
import { Crosshair, FileDiff, Pause, Play, Smartphone, X } from "lucide-react";
import { focusNode } from "@/canvas/focusNode";
import { useMessages } from "@/i18n";
import { HeaderButton } from "@/nodes/terminal/TerminalHeader";
import { openReview } from "@/review/reviewStore";
import { StatusPill } from "@/nodes/terminal/StatusPill";
import { useActivity } from "@/store/agentActivity";
import { terminalOf, useNodes } from "@/store/nodes";
import { useTerminalStatus } from "@/store/terminalStatus";
import { canPause, canResume, pauseAgents, resumeAgent } from "./broadcast";
import { agentInk, AGENTS, INDIGO } from "./catalog";
import { fleetMessages } from "./messages";
import { useRemoteLink } from "./remoteControl";
import { requestClose } from "./terminals";

/**
 * One agent of the fleet panel or of an orchestrator: logo, name, agent, pill;
 * on hover, Centrer, Pause, Reprendre and Fermer (spec habillage §5.5, §13).
 */
export function AgentRow(props: { id: string; onOpen?: () => void; trailing?: ReactNode; showCenter?: boolean }) {
  const { id, onOpen, trailing, showCenter = true } = props;
  const t = useMessages(fleetMessages).agentRow;
  const payload = useNodes((s) => terminalOf(s.nodes[id]));
  const status = useTerminalStatus(id);
  const activity = useActivity(id);
  const remote = useRemoteLink(id);
  if (!payload) return null;
  const meta = AGENTS[payload.agent];
  const name = payload.name || meta.label;
  const facts = { agent: payload.agent, running: status.state === "running", activity: activity?.activity };
  return (
    <div className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-ov-hover">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span
          className="grid size-6 shrink-0 place-items-center rounded-md"
          style={{ backgroundColor: `color-mix(in srgb, ${meta.tint} 18%, transparent)`, color: agentInk(meta.tint) }}
        >
          <meta.Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ov-text">
          {name} <span className="text-ov-text-2">{meta.label}</span>
        </span>
      </button>
      {remote?.state === "on" && (
        <span title={t.remoteOn} aria-label={t.remoteOn} className="text-ov-accent">
          <Smartphone className="size-3.5" />
        </span>
      )}
      <StatusPill status={status} activity={activity} indigo={meta.tint === INDIGO} />
      {trailing}
      <span className="hidden items-center gap-0.5 group-hover:flex group-focus-within:flex">
        {showCenter && (
          <HeaderButton label={t.center(name)} onClick={() => focusNode(id)}>
            <Crosshair />
          </HeaderButton>
        )}
        <HeaderButton label={t.review(name)} onClick={() => openReview(id)}>
          <FileDiff />
        </HeaderButton>
        {canPause(facts) && (
          <HeaderButton label={t.pause(name)} onClick={() => void pauseAgents([id])}>
            <Pause />
          </HeaderButton>
        )}
        {canResume(facts) && (
          <HeaderButton label={t.resume(name)} onClick={() => void resumeAgent(id)}>
            <Play />
          </HeaderButton>
        )}
        <HeaderButton label={t.close(name)} onClick={() => requestClose(id)}>
          <X />
        </HeaderButton>
      </span>
    </div>
  );
}
