import { useState } from "react";
import { ChevronDown, Ellipsis, Layers, Network, Pause, Play, Plus, Rocket, SquareTerminal, X } from "lucide-react";
import { useStore } from "zustand";
import { useCanvas } from "@/canvas/canvasStore";
import { focusNode } from "@/canvas/focusNode";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMessages } from "@/i18n";
import { formatDuration } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { cn } from "@/lib/utils";
import { launchMission } from "@/mission/launch";
import { missionOf } from "@/mission/store";
import { readOrchestratorPayload } from "@/nodes/types";
import { IconButton } from "@/shell/buttons";
import { BOTTOM_BAR_HEIGHT, TOP_ROW_HEIGHT } from "@/shell/layout";
import { useActivities } from "@/store/agentActivity";
import { terminalOf, useNodes } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { AgentMenu } from "./AgentMenu";
import { AgentRow } from "./AgentRow";
import { setAgentsFilter, setAgentsPanel, useAgentsPanel } from "./agentsPanelState";
import { pauseAll, resumeAll, workspaceTerminalIds } from "./broadcast";
import { AGENTS } from "./catalog";
import { ComposeGroup } from "./ComposeGroup";
import { FLEET_FILTERS, filterCounts, fleetSections, fleetStateOf, type FleetAgent } from "./fleetView";
import { GroupMenu } from "./GroupMenu";
import { countsText } from "./groupSummary";
import { fleetMessages } from "./messages";
import { launchFour, newConsole } from "./quickActions";
import { RESUME_OFFER_ROOM, resumeOfferStore } from "./ResumeAllToast";

const OUTSIDE = "outside";

/** The agents of the workspace on screen, by group (spec identité §5.6); it replaces the fleet panel. */
export function AgentsPanel() {
  const t = useMessages(fleetMessages).panel;
  const filter = useAgentsPanel((s) => s.filter);
  const offer = useStore(resumeOfferStore, (s) => s.open);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const now = useNow(15_000);
  const nodeIds = useCanvas((s) => s.nodeIds);
  const frames = useCanvas((s) => s.frames);
  const nodes = useNodes((s) => s.nodes);
  const statuses = useStore(terminalStatusStore, (s) => s.statuses);
  const activities = useActivities();

  const agents: FleetAgent[] = nodeIds.flatMap((id) => {
    const payload = terminalOf(nodes[id]);
    if (!payload) return [];
    const status = statuses[id] ?? { state: "stopped" as const };
    const state = fleetStateOf(status, activities[id]);
    return [
      {
        id,
        name: payload.name || AGENTS[payload.agent].label,
        agent: payload.agent,
        state,
        since: state === "stopped" ? undefined : activities[id]?.since,
      },
    ];
  });
  const orchestrators = nodeIds.flatMap((id) =>
    nodes[id]?.kind === "orchestrator" ? [{ id, name: readOrchestratorPayload(nodes[id]?.payload).name, planned: missionOf(nodes[id])?.state === "plan" && !!missionOf(nodes[id])?.plan?.length }] : [],
  );
  const counts = filterCounts(agents);
  const sections = fleetSections(agents, frames, filter);
  const keyOf = (id: string | null) => id ?? OUTSIDE;
  const fold = (key: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <aside
      className="ov-glass-strong absolute right-[72px] z-30 flex w-[318px] flex-col overflow-hidden rounded-[14px]"
      style={{ top: TOP_ROW_HEIGHT + 14, maxHeight: `calc(100% - ${TOP_ROW_HEIGHT + 14 + (offer ? RESUME_OFFER_ROOM : BOTTOM_BAR_HEIGHT) + 14}px)` }}
    >
      <header className="flex h-9 shrink-0 items-center border-b border-ov-line pl-3 pr-1.5">
        <span className="ov-label">{t.title}</span>
        <div className="ml-auto flex items-center">
          <AgentMenu
            side="left"
            trigger={() => (
              <IconButton label={t.launchAgent}>
                <Plus />
              </IconButton>
            )}
          />
          <IconButton label={t.newConsole} onClick={() => newConsole()}>
            <SquareTerminal />
          </IconButton>
          <ComposeGroup
            side="left"
            answersRequests
            trigger={
              <IconButton label={t.composeGroup}>
                <Layers />
              </IconButton>
            }
          />
          <IconButton label={t.pauseAll} onClick={() => void pauseAll(workspaceTerminalIds())}>
            <Pause />
          </IconButton>
          <IconButton label={t.resumeAll} onClick={() => void resumeAll(workspaceTerminalIds())}>
            <Play />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label={t.moreActions}>
                <Ellipsis />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => launchFour()}>{t.launchFour}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setFolded(new Set([...sections.map((s) => keyOf(s.id)), "orchestrators"]))}>
                {t.foldAll}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setFolded(new Set())}>{t.unfoldAll}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <IconButton label={t.closePanel} onClick={() => setAgentsPanel(false)}>
            <X />
          </IconButton>
        </div>
      </header>
      <div className="flex shrink-0 flex-wrap gap-px px-2 pb-1.5 pt-2">
        {FLEET_FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            data-filter={id}
            data-on={id === filter}
            onClick={() => setAgentsFilter(id)}
            className={cn(
              "whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[11.5px]",
              id === filter ? "bg-ov-accent-soft text-ov-accent" : "text-ov-text-2 hover:bg-ov-hover",
            )}
          >
            {label}
            <span className="ml-1 font-mono text-[10.5px]">{counts[id]}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {sections.length === 0 && orchestrators.length === 0 && (
          <p className="py-4 text-center text-xs text-ov-text-2">
            {agents.length > 0 ? t.noneInFilter : t.none}
          </p>
        )}
        {sections.map((section) => {
          const key = keyOf(section.id);
          const open = !folded.has(key);
          return (
            <section key={key}>
              <div data-group-header className="group/section flex items-center rounded-[6px] pr-0.5 hover:bg-ov-hover">
                <button
                  type="button"
                  data-section={key}
                  onClick={() => fold(key)}
                  className="flex h-[26px] min-w-0 flex-1 items-center gap-1.5 px-1.5 text-left text-[11.5px]"
                >
                  <ChevronDown className={cn("size-3.5 text-ov-text-2 transition-transform", !open && "-rotate-90")} />
                  <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: section.color ?? "var(--ov-text-3)" }} />
                  <span className="truncate font-semibold tracking-[0.03em] text-ov-text uppercase">{section.name}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10.5px] text-ov-text-2">
                    {countsText(section.agents.length, section.agents.filter((a) => a.state === "working").length)}
                  </span>
                </button>
                {section.id && (
                  <GroupMenu
                    groupId={section.id}
                    answersRequests
                    trigger={
                      <IconButton
                        label={t.groupMenu}
                        className="size-[22px] opacity-0 group-hover/section:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                      >
                        <Ellipsis />
                      </IconButton>
                    }
                  />
                )}
              </div>
              {open &&
                section.agents.map((a) => (
                  <AgentRow
                    key={a.id}
                    id={a.id}
                    onOpen={() => focusNode(a.id)}
                    trailing={
                      <span className="w-10 shrink-0 text-right font-mono text-[10.5px] text-ov-text-2">
                        {a.since !== undefined ? formatDuration(now - a.since) : ""}
                      </span>
                    }
                  />
                ))}
            </section>
          );
        })}
        {orchestrators.length > 0 && (
          <section>
            <button
              type="button"
              data-section="orchestrators"
              onClick={() => fold("orchestrators")}
              className="flex h-[26px] w-full items-center gap-1.5 rounded-[6px] px-1.5 text-left text-[11.5px] hover:bg-ov-hover"
            >
              <ChevronDown
                className={cn("size-3.5 text-ov-text-2 transition-transform", folded.has("orchestrators") && "-rotate-90")}
              />
              <span className="font-semibold tracking-[0.03em] text-ov-text uppercase">{t.orchestrators}</span>
              <span className="ml-auto font-mono text-[10.5px] text-ov-text-2">{orchestrators.length}</span>
            </button>
            {!folded.has("orchestrators") &&
              orchestrators.map((o) => (
                <div key={o.id} data-orchestrator={o.id} className="flex h-[26px] items-center gap-2 rounded-[6px] pl-6 pr-1 text-[12.5px] hover:bg-ov-hover">
                  <Network className="size-3.5 shrink-0 text-ov-accent" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-ov-text">{o.name}</span>
                  {o.planned && (
                    <IconButton label={t.launchMission(o.name)} className="size-[22px]" onClick={() => void launchMission(o.id)}>
                      <Rocket />
                    </IconButton>
                  )}
                </div>
              ))}
          </section>
        )}
      </div>
    </aside>
  );
}
