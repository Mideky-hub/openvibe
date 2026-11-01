import { useState, type ReactNode } from "react";
import { ChevronDown, FileDiff, RotateCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { accountsMessages } from "@/accounts/messages";
import { useAccounts } from "@/accounts/store";
import { useUiRequest } from "@/commands/uiRequests";
import { useCanvas } from "@/canvas/canvasStore";
import { groupOf } from "@/canvas/groups";
import { agentInk, AGENTS, AGENTS_WITHOUT_OPTIONS, INDIGO } from "@/fleet/catalog";
import { RemoteButton } from "@/fleet/RemoteButton";
import { modelLabel } from "@/mission/router";
import { openReview } from "@/review/reviewStore";
import { ROLES } from "@/fleet/roles";
import type { AgentId } from "@/ipc/pty";
import type { TerminalPayload } from "@/nodes/types";
import type { AgentActivity } from "@/store/agentActivity";
import { nodesStore } from "@/store/nodes";
import type { TerminalStatus } from "@/store/terminalStatus";
import { newConversation, switchedAgent, type LaunchMode } from "./launch";
import { relaunchTerminal, stopTerminal } from "./registry";
import { StatusPill } from "./StatusPill";
import { TerminalOptionsDialog } from "./TerminalOptionsDialog";
import { useMessages } from "@/i18n";
import { nodesMessages } from "@/nodes/messages";


export function HeaderButton(props: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      className="grid size-5 place-items-center rounded text-ov-text-2 hover:bg-ov-card hover:text-ov-text [&_svg]:size-3.5"
    >
      {props.children}
    </button>
  );
}

function switchAgent(nodeId: string, payload: TerminalPayload, agent: AgentId) {
  nodesStore.getState().update(nodeId, switchedAgent(payload, agent));
}

function RelaunchMenu(props: { nodeId: string; payload: TerminalPayload; running: boolean }) {
  const { nodeId, payload, running } = props;
  const t = useMessages(nodesMessages).header;
  const relaunch = (mode: LaunchMode) => relaunchTerminal(nodeId, payload, mode);
  const newSession = () => {
    const fresh = newConversation();
    nodesStore.getState().update(nodeId, fresh);
    relaunchTerminal(nodeId, { ...payload, ...fresh }, "new");
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t.relaunch}
          aria-label={t.relaunch}
          className="grid size-5 place-items-center rounded text-ov-text-2 hover:bg-ov-card hover:text-ov-text [&_svg]:size-3.5"
        >
          <RotateCw />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {payload.agent === "claude" ? (
          <>
            <DropdownMenuItem onSelect={() => relaunch("resume")}>{t.resumeSession}</DropdownMenuItem>
            <DropdownMenuItem onSelect={newSession}>{t.newSession}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => relaunch("continue")}>{t.latestInFolder}</DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={() => relaunch("new")}>{t.relaunch}</DropdownMenuItem>
        )}
        {running && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => stopTerminal(nodeId)}>
              {t.stopProcess}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The Claude profile a terminal started with (spec comptes §6), once there is a choice to show:
 * at least one profile besides the default one.
 */
export function AccountChip({ accountId }: { accountId?: string }) {
  const t = useMessages(accountsMessages);
  const profiles = useAccounts((s) => s.profiles);
  if (profiles.length === 0) return null;
  const profile = profiles.find((p) => p.id === accountId);
  return (
    <span
      data-account={profile?.id ?? "default"}
      title={t.chipTitle(profile?.configDir ?? t.defaultHint)}
      className="max-w-[90px] truncate rounded px-1 text-[10px] text-ov-text-2"
    >
      {profile?.name ?? t.defaultName}
    </span>
  );
}

/** The model a mission's router chose; it stays after the mission until cleared (final review maj §3). */
function ModelChip({ nodeId, model }: { nodeId: string; model: string }) {
  const t = useMessages(nodesMessages).header;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-model={model}
          title={t.modelChosen(model)}
          className="rounded px-1 font-mono text-[10px] text-ov-text-2 hover:bg-ov-card hover:text-ov-text"
        >
          {modelLabel(model)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => nodesStore.getState().update(nodeId, { model: undefined })}>
          {t.modelDefault}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Header of a terminal node (spec habillage §7.1). */
export function TerminalHeader(props: {
  nodeId: string;
  payload: TerminalPayload;
  status: TerminalStatus;
  activity?: AgentActivity;
  actions?: ReactNode;
}) {
  const { nodeId, payload, status, activity, actions } = props;
  const t = useMessages(nodesMessages).header;
  const [editing, setEditing] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // « Renommer » of the palette.
  useUiRequest("renameTerminal", (request) => {
    if (request.id !== nodeId) return false;
    setEditing(true);
    return true;
  });
  const meta = AGENTS[payload.agent];
  const role = useCanvas((s) => groupOf(s.frames, nodeId)?.group.role);

  return (
    <header
      title={payload.title}
      className="flex h-7 shrink-0 items-center gap-1.5 border-b border-ov-line bg-ov-terminal-head px-2 text-xs"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Agent" className="flex items-center gap-0.5 rounded px-0.5 hover:bg-ov-card">
            <meta.Icon className="size-3.5" style={{ color: agentInk(meta.tint) }} />
            <ChevronDown className="size-3 text-ov-text-2" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {/* Only agents that start without options can be switched to from the header. */}
          {AGENTS_WITHOUT_OPTIONS.map((id) => {
            const Icon = AGENTS[id].Icon;
            return (
              <DropdownMenuItem key={id} onSelect={() => switchAgent(nodeId, payload, id)}>
                <Icon style={{ color: agentInk(AGENTS[id].tint) }} /> {AGENTS[id].label}
                {id === payload.agent && <span className="ml-auto text-ov-text-2">{t.current}</span>}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOptionsOpen(true)}>{t.options}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: role ? ROLES[role].color : "var(--ov-idle)" }}
      />
      {editing ? (
        <Input
          autoFocus
          defaultValue={payload.name}
          className="h-5 w-32 px-1 text-xs"
          onBlur={(e) => {
            const name = e.currentTarget.value.trim();
            if (name) nodesStore.getState().update(nodeId, { name });
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <span
          className="truncate font-semibold text-ov-text"
          onDoubleClick={() => setEditing(true)}
          title={t.doubleClickRename}
        >
          {payload.name || meta.label}
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <StatusPill status={status} activity={activity} indigo={meta.tint === INDIGO} />
        {payload.agent === "claude" && <AccountChip accountId={payload.accountId} />}
        {payload.model && <ModelChip nodeId={nodeId} model={payload.model} />}
        {payload.agent === "claude" && <RemoteButton nodeId={nodeId} wanted={payload.remoteControl === true} running={status.state === "running"} />}
        <HeaderButton label={t.review} onClick={() => openReview(nodeId)}>
          <FileDiff />
        </HeaderButton>
        <RelaunchMenu nodeId={nodeId} payload={payload} running={status.state === "running"} />
        {actions}
      </div>
      {optionsOpen && <TerminalOptionsDialog nodeId={nodeId} payload={payload} onClose={() => setOptionsOpen(false)} />}
    </header>
  );
}
