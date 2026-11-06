import { useState, type ReactNode } from "react";
import { Crosshair, Pause, Scan, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "zustand";
import { useCanvas } from "@/canvas/canvasStore";
import { focusNode, frameNodes } from "@/canvas/focusNode";
import { BUDGET_COLOR } from "@/canvas/overlay/timeline";
import { canPause, pauseAgents } from "@/fleet/broadcast";
import { requestCloseOrchestrator } from "@/fleet/orchestrators";
import { requestClose } from "@/fleet/terminals";
import { messages, useMessages } from "@/i18n";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/useNow";
import { openReview } from "@/review/reviewStore";
import { agentActivityStore, useActivities } from "@/store/agentActivity";
import { terminalOf, useNodes, type NodeRecord } from "@/store/nodes";
import { isRunning, terminalStatusStore } from "@/store/terminalStatus";
import { teamTree, type StateFilter } from "./map";
import { missionMessages } from "./messages";
import { budgetBar, budgetOf, memberTime, type Member, type Mission } from "./mission";
import { modelLabel } from "./router";
import { agentState, memberGroupOf, type AgentState } from "./store";

const FILTERS: readonly StateFilter[] = ["tous", "travaille", "attend", "inactif", "arrêté"];

const DOTS: Record<AgentState, string> = {
  travaille: "bg-ov-working",
  attend: "bg-ov-waiting animate-pulse",
  inactif: "bg-ov-text-2",
  arrêté: "bg-ov-text-2/60",
};

/** The team's consoles, each once: an agent that took a second sub-task is in the team twice. */
const teamIds = (mission: Mission) => [...new Set(mission.members.flatMap((m) => (m.nodeId ? [m.nodeId] : [])))];

/** Whether the agent is at work and may be paused, as the fleet panel tells it (spec habillage §14). */
function pausable(nodes: Record<string, NodeRecord>, nodeId: string): boolean {
  const agent = terminalOf(nodes[nodeId])?.agent;
  return agent !== undefined && canPause({ agent, running: isRunning(nodeId), activity: agentActivityStore.getState().activities[nodeId]?.activity });
}

/**
 * The map of a running mission (#63): the orchestrator, then its team's
 * consoles under their groups, filtered by state and searched; the inspector
 * under it acts on the orchestrator or on the console chosen.
 */
export function MissionMap({ nodeId, mission }: { nodeId: string; mission: Mission }) {
  const t = useMessages(missionMessages);
  // The states follow the agents' activity and processes; the groups, the canvas.
  useActivities();
  useStore(terminalStatusStore, (s) => s.statuses);
  useCanvas((s) => s.frames);
  const nodes = useNodes((s) => s.nodes);
  const [state, setState] = useState<StateFilter>("tous");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(nodeId);
  const branches = teamTree(mission.members, { groupOf: memberGroupOf, stateOf: agentState, state, query });
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === "tous" ? mission.members.length : mission.members.filter((m) => agentState(m.nodeId) === f).length]));
  const inspected = mission.members.find((m) => m.nodeId !== "" && m.nodeId === selected);
  const orchestrator = nodes[nodeId];
  const name = orchestrator?.kind === "orchestrator" ? orchestrator.payload.name : "";
  const rootState = agentState(nodeId);
  const row = (member: Member) => (
    <MemberRow key={member.nodeId || member.name} mission={mission} member={member} selected={member === inspected} onSelect={() => setSelected(member.nodeId)} />
  );
  return (
    <div data-map className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t.map.filter} className="flex overflow-hidden rounded border border-ov-line">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={state === f}
              onClick={() => setState(f)}
              className={cn("px-1.5 py-0.5 text-[11px] hover:bg-ov-hover", state === f ? "bg-ov-selected text-ov-text" : "text-ov-text-2")}
            >
              {f === "tous" ? t.map.all : t.agent[f]} <span className="font-mono text-ov-text-3">{counts[f]}</span>
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1 rounded bg-ov-field px-1.5 text-ov-text-3">
          <Search className="size-3 shrink-0" />
          <input
            type="search"
            aria-label={t.map.search}
            placeholder={t.map.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-28 bg-transparent py-0.5 text-ov-text outline-none"
          />
        </label>
      </div>
      <ul>
        <li data-map-root className="flex flex-col gap-1">
          <button
            type="button"
            aria-label={t.map.inspect(name)}
            aria-pressed={!inspected}
            onClick={() => setSelected(nodeId)}
            className={cn("flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-ov-hover", !inspected ? "bg-ov-selected" : "bg-ov-card")}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", DOTS[rootState])} />
            <span className="font-medium text-ov-text">{name}</span>
            <span className="text-ov-text-3">{t.map.orchestrator}</span>
            <span className="ml-auto shrink-0">{t.agent[rootState]}</span>
          </button>
          <ul className="ml-2 flex flex-col gap-1 border-l border-ov-line pl-2">
            {branches.map((branch) =>
              branch.id === null ? (
                branch.members.map(row)
              ) : (
                <li key={branch.id} data-map-group={branch.name} className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ov-text-2">
                    {branch.name || t.map.noGroup}
                    <span className="font-mono font-normal text-ov-text-3">{branch.members.length}</span>
                  </span>
                  <ul className="ml-2 flex flex-col gap-1 border-l border-ov-line pl-2">{branch.members.map(row)}</ul>
                </li>
              ),
            )}
            {branches.length === 0 && mission.members.length > 0 && <li className="px-1 text-ov-text-3">{t.map.noMatch}</li>}
          </ul>
        </li>
      </ul>
      <Inspector nodeId={nodeId} name={name} mission={mission} member={inspected} nodes={nodes} />
    </div>
  );
}

function MemberRow({ mission, member, selected, onSelect }: { mission: Mission; member: Member; selected: boolean; onSelect: () => void }) {
  const t = useMessages(missionMessages);
  const now = useNow(15_000);
  const steps = useNodes((s) => terminalOf(s.nodes[member.nodeId])?.steps) ?? [];
  const done = steps.filter((s) => s.state === "fait").length;
  const state = agentState(member.nodeId);
  return (
    <li data-member={member.name} className={cn("flex items-center gap-2 rounded px-2 py-1", selected ? "bg-ov-selected" : "bg-ov-card")}>
      <button type="button" aria-label={t.map.inspect(member.name)} aria-pressed={selected} onClick={onSelect} className="flex min-w-0 items-center gap-2 text-left">
        <span className={cn("size-1.5 shrink-0 rounded-full", DOTS[state])} />
        <span className="font-medium text-ov-text">{member.name}</span>
        <span className="min-w-0 truncate">{member.task}</span>
      </button>
      {member.done && member.done.length > 0 && (
        <span data-finished className="shrink-0 text-[11px] text-ov-text-3" title={t.finishedBefore(member.done.join(", "))}>
          ✓ {member.done.length}
        </span>
      )}
      {member.model && <span className="shrink-0 font-mono text-[11px]">{modelLabel(member.model)}</span>}
      <span className="ml-auto shrink-0">{t.agent[state]}</span>
      {steps.length > 0 && (
        <span className="shrink-0 font-mono text-[11px]">
          {done}/{steps.length}
        </span>
      )}
      {member.handedTo ? (
        <span className="shrink-0">→ {member.handedTo}</span>
      ) : member.sentAt !== undefined ? (
        <MemberTime spent={memberTime(mission, member, now)} budget={budgetOf(member)} />
      ) : null}
      <button
        type="button"
        title={t.reviewTitle(member.name)}
        aria-label={t.reviewLabel(member.name)}
        onClick={() => openReview(member.nodeId)}
        className="shrink-0 rounded px-1 text-[11px] text-ov-text-2 hover:bg-ov-field hover:text-ov-text"
      >
        {t.diff}
      </button>
      {member.report && (
        <span title={member.report.summary} className="shrink-0 rounded bg-ov-field px-1.5 text-[11px] text-ov-text">
          {t.report[member.report.status]}
          {member.merged ? t.merged : ""}
        </span>
      )}
    </li>
  );
}

/** A member's time, unless it cannot be told (a mission ended before end times were kept); coloured like its bar (spec §8.3). */
function MemberTime({ spent, budget }: { spent: number | undefined; budget: number }) {
  const t = useMessages(missionMessages);
  if (spent === undefined) return null;
  return (
    <span className="shrink-0 font-mono text-[11px]" style={{ color: BUDGET_COLOR[budgetBar(spent, budget).tone] }}>
      {t.spent(Math.floor(spent), budget)}
    </span>
  );
}

/**
 * Acts on what the map points at with the actions OpenVibe already has: the
 * fleet panel's centering and pause, the header's close and its confirmation.
 * On the orchestrator, the pause and the framing take the whole team.
 */
function Inspector(props: { nodeId: string; name: string; mission: Mission; member: Member | undefined; nodes: Record<string, NodeRecord> }) {
  const { nodeId, name, mission, member, nodes } = props;
  const t = useMessages(missionMessages);
  const team = teamIds(mission);
  const id = member?.nodeId ?? nodeId;
  const exists = nodes[id] !== undefined;
  const frame = () => {
    if (!frameNodes([nodeId, ...team])) toast.error(messages(missionMessages).map.frameMissing);
  };
  return (
    <div data-inspector className="flex flex-col gap-1.5 rounded border border-ov-line px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="font-medium text-ov-text">{member?.name ?? name}</span>
        <span className="text-ov-text-3">{member ? t.map.console : t.map.orchestrator}</span>
        <span className="ml-auto">{t.agent[agentState(id)]}</span>
      </div>
      {member && <p className="truncate">{member.task}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <Action disabled={!exists} onClick={() => focusNode(id)} icon={<Crosshair />}>
          {t.map.goTo}
        </Action>
        {member ? (
          <Action disabled={!pausable(nodes, id)} onClick={() => void pauseAgents([id])} icon={<Pause />}>
            {t.map.pause}
          </Action>
        ) : (
          <Action disabled={!team.some((m) => pausable(nodes, m))} onClick={() => void pauseAgents(team)} icon={<Pause />}>
            {t.map.pauseTeam}
          </Action>
        )}
        <Action onClick={frame} icon={<Scan />}>
          {t.map.frame}
        </Action>
        <Action danger disabled={!exists} onClick={() => (member ? requestClose(id) : requestCloseOrchestrator(nodeId))} icon={<X />}>
          {t.map.close}
        </Action>
      </div>
    </div>
  );
}

function Action(props: { children: ReactNode; icon: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        "flex items-center gap-1 rounded border border-ov-line px-2 py-0.5 text-[11px] hover:bg-ov-card disabled:opacity-50 disabled:hover:bg-transparent [&_svg]:size-3",
        props.danger ? "text-ov-danger" : "text-ov-text",
      )}
    >
      {props.icon}
      {props.children}
    </button>
  );
}
