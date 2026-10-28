import { useEffect, useRef, useState } from "react";
import { ChevronDown, Network, X } from "lucide-react";
import { useCanvas } from "@/canvas/canvasStore";
import { useUiRequest } from "@/commands/uiRequests";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { pauseAll, resumeAll } from "@/fleet/broadcast";
import { RemoteButton } from "@/fleet/RemoteButton";
import { setRemoteControlAll } from "@/fleet/remoteControl";
import { defaultLaunchOptions } from "@/fleet/launchAgent";
import { renameOrchestrator, requestCloseOrchestrator } from "@/fleet/orchestrators";
import { linkedAgents, NO_LINKS } from "@/fleet/wires";
import type { Activity } from "@/ipc/activity";
import { useNativeKeyDown } from "@/lib/useNativeKeyDown";
import { useNow } from "@/lib/useNow";
import { clockText } from "@/mission/mission";
import { MissionPanel } from "@/mission/MissionPanel";
import { useActivity } from "@/store/agentActivity";
import { nodesStore, useNodes } from "@/store/nodes";
import { useTerminalStatus, type TerminalStatus } from "@/store/terminalStatus";
import { frameStyle, WAITING_GLOW } from "../terminal/frame";
import { orchestratorSession } from "../terminal/launch";
import { markForAutostart } from "../terminal/registry";
import { ResumeCard } from "../terminal/ResumeCard";
import { HeaderButton } from "../terminal/TerminalHeader";
import { useTerminalHost } from "../terminal/useTerminalHost";
import { ToolsUnavailable } from "./ToolsUnavailable";
import { useMessages } from "@/i18n";
import { nodesMessages } from "@/nodes/messages";

/** The manager of a team: its Claude session, then its mission (spec orchestrateur §6). */
export function OrchestratorNode({ nodeId }: { nodeId: string }) {
  const t = useMessages(nodesMessages).orchestrator;
  const record = useNodes((s) => s.nodes[nodeId]);
  const links = useCanvas((s) => s.links[nodeId] ?? NO_LINKS);
  const frames = useCanvas((s) => s.frames);
  const selected = useCanvas((s) => s.view.selectedIds.includes(nodeId));
  const status = useTerminalStatus(nodeId);
  const activity = useActivity(nodeId);
  const hostRef = useRef<HTMLDivElement>(null);
  const session = record?.kind === "orchestrator" ? record.payload.session : undefined;
  const now = useNow(15_000);
  const clock = record?.kind === "orchestrator" && record.payload.mission ? clockText(record.payload.mission, now) : null;

  useEffect(() => {
    const current = nodesStore.getState().nodes[nodeId];
    // An orchestrator of before gets its session when first shown (spec orchestrateur §6).
    if (current?.kind !== "orchestrator" || current.payload.session) return;
    nodesStore.getState().update(nodeId, { session: orchestratorSession(current.payload.name, defaultLaunchOptions()) });
    markForAutostart(nodeId);
  }, [nodeId]);
  useTerminalHost(nodeId, hostRef, session !== undefined);

  if (record?.kind !== "orchestrator") {
    return (
      <div className="grid h-full place-items-center rounded-xl border border-ov-line bg-ov-surface text-sm text-ov-text-2">
        {t.notFound}
      </div>
    );
  }

  const linked = linkedAgents(links, frames);
  const waiting = status.state === "running" && activity?.activity === "waiting";
  return (
    <div
      data-orchestrator={nodeId}
      className="relative flex h-full flex-col overflow-hidden rounded-xl bg-ov-surface-2"
      style={frameStyle("var(--ov-accent)", selected, waiting)}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-ov-line px-3">
        <Network className="size-4 shrink-0 text-ov-accent" />
        <NameField nodeId={nodeId} value={record.payload.name} onCommit={(name) => renameOrchestrator(nodeId, name)} />
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-ov-text-2">
          {clock && <span title={t.clockTitle}>{clock}</span>}
          <span>{sessionLabel(t.session, status, activity?.activity)}</span>
        </span>
        {session && <RemoteButton nodeId={nodeId} wanted={session.remoteControl === true} running={status.state === "running"} />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t.menu}
              className="grid size-5 place-items-center rounded text-ov-text-2 hover:bg-ov-card hover:text-ov-text"
            >
              <ChevronDown className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => void pauseAll(linked.agentIds)}>{t.pauseAll}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void resumeAll(linked.agentIds)}>{t.resumeAll}</DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Spec maj §2: the orchestrator and its team, followed from the phone. */}
            <DropdownMenuItem onSelect={() => void setRemoteControlAll([nodeId, ...linked.agentIds], true)}>{t.remoteTeam}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void setRemoteControlAll([nodeId, ...linked.agentIds], false)}>{t.remoteOff}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <HeaderButton label={t.close} onClick={() => requestCloseOrchestrator(nodeId)}>
          <X />
        </HeaderButton>
      </header>
      <div className="relative min-h-[120px] flex-1 bg-ov-terminal px-1 pt-1">
        <div ref={hostRef} className="relative h-full w-full overflow-hidden" />
        {session && <ResumeCard nodeId={nodeId} payload={session} status={status} />}
        {status.state === "error" && status.kind === "toolsUnavailable" && <ToolsUnavailable nodeId={nodeId} message={status.message} />}
      </div>
      <MissionPanel nodeId={nodeId} />
      {waiting && <div className="pointer-events-none absolute inset-0 z-20 rounded-xl" style={{ boxShadow: WAITING_GLOW }} />}
    </div>
  );
}

/** What its session does, in the header. */
function sessionLabel(t: (typeof nodesMessages)["fr"]["orchestrator"]["session"], status: TerminalStatus, activity: Activity | undefined): string {
  if (status.state === "starting") return t.starting;
  if (status.state === "error" && status.kind === "toolsUnavailable") return t.toolsUnavailable;
  if (status.state !== "running") return t.stopped;
  return activity === "working" ? t.working : activity === "waiting" ? t.waiting : t.idle;
}

/** The orchestrator's name; a double-click edits it, Enter or a click elsewhere keeps it, Escape cancels. */
function NameField({ nodeId, value, onCommit }: { nodeId: string; value: string; onCommit: (name: string) => void }) {
  const t = useMessages(nodesMessages).orchestrator;
  const [editing, setEditing] = useState(false);
  // « Renommer » of the orchestrator's radial menu.
  useUiRequest("renameOrchestrator", (request) => {
    if (request.id !== nodeId) return false;
    setEditing(true);
    return true;
  });
  if (!editing) {
    return (
      <span className="truncate text-[13px] font-semibold text-ov-text" onDoubleClick={() => setEditing(true)} title={t.doubleClickRename}>
        {value}
      </span>
    );
  }
  return (
    <NameInput
      initial={value}
      onDone={(name) => {
        if (name !== null) onCommit(name);
        setEditing(false);
      }}
    />
  );
}

/** Mounted while editing, so its key listener finds the field. */
function NameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [draft, setDraft] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  useNativeKeyDown(input, (e) => {
    if (e.key === "Enter") input.current?.blur();
    if (e.key === "Escape") {
      cancelled.current = true;
      onDone(null);
    }
  });
  return (
    <input
      ref={input}
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (!cancelled.current) onDone(draft);
      }}
      className="w-36 rounded bg-ov-card px-1 text-[13px] font-semibold text-ov-text outline-none"
    />
  );
}
