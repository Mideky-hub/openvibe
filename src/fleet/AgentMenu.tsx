import { useEffect, useRef, useState, type ReactElement } from "react";
import { Check, Kanban, Layers, Network, SquareTerminal } from "lucide-react";
import { toast } from "sonner";
import { useUiRequest } from "@/commands/uiRequests";
import { placeKanban } from "@/kanban/place";
import { messages, useMessages } from "@/i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AgentId } from "@/ipc/pty";
import { uiStore } from "@/store/ui";
import { agentsStore, useAgents } from "./agentsStore";
import { AGENT_ORDER, agentInk, AGENTS, defaultAgent } from "./catalog";
import { defaultLaunchOptions, launchAgent, type LaunchOptions } from "./launchAgent";
import { fleetMessages } from "./messages";
import { LaunchOptionsForm } from "./LaunchOptionsForm";
import { OllamaPicker } from "./OllamaPicker";
import { launchFour, newConsole, placeOrchestrator } from "./quickActions";
import type { Point } from "./terminals";

type View = "agents" | "options" | "ollama";

/** "Lancer un agent", opened from the tool rail's ＋ or the agents panel (spec identité §5.4, §5.6). */
export function AgentMenu({
  trigger,
  side = "right",
  answersRequests = false,
}: {
  trigger: (open: boolean) => ReactElement;
  side?: "right" | "left" | "bottom";
  /** The tool rail's menu answers the palette's « Lancer un agent personnalisé… » and « Lancer Ollama… ». */
  answersRequests?: boolean;
}) {
  const t = useMessages(fleetMessages);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("agents");
  const [options, setOptions] = useState<LaunchOptions | null>(null);
  const agents = useAgents((s) => s.agents);
  const shells = useAgents((s) => s.shells);
  const current = options ?? defaultLaunchOptions();
  const fallback = defaultAgent(agents);
  const available = (id: AgentId) => agents.find((a) => a.id === id)?.available ?? false;

  const requestedView = useRef<View | null>(null);
  const [placeAt, setPlaceAt] = useState<Point | null>(null);

  useEffect(() => {
    if (!open) {
      setPlaceAt(null);
      return;
    }
    setView(requestedView.current ?? "agents");
    requestedView.current = null;
    void agentsStore.getState().load();
  }, [open]);

  useUiRequest(
    "agentMenu",
    (request) => {
      requestedView.current = request.view;
      setPlaceAt(request.at ?? null);
      setOpen(true);
      return true;
    },
    answersRequests,
  );

  const place = (agent: AgentId, launch: LaunchOptions) => {
    setOpen(false);
    // « Autre agent… » of the radial menu: launched where the right click was (spec menu radial §4.1).
    if (placeAt) void launchAgent(agent, launch, placeAt).catch((error: unknown) => toast.error(messages(fleetMessages).launchFailed(String(error))));
    else uiStore.getState().setPlacing({ agent, options: launch });
  };

  const pick = (agent: AgentId) => {
    if (agent === "ollama") setView("ollama");
    else if (agent === "custom" && !current.command.trim()) setView("options");
    else place(agent, current);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger(open)}</PopoverTrigger>
      <PopoverContent side={side} align="start" className="w-72 p-2">
        {view === "agents" && (
          <>
            <p className="ov-label px-2 pb-1 pt-1">{t.agentMenu.title}</p>
            <div className="flex flex-col">
              {AGENT_ORDER.map((id) => {
                const meta = AGENTS[id];
                const usable = available(id);
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!usable}
                    title={usable ? undefined : t.agentMenu.notFound(meta.binary)}
                    onClick={() => pick(id)}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-ov-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span
                      className="grid size-7 place-items-center rounded-md"
                      style={{ backgroundColor: `color-mix(in srgb, ${meta.tint} 18%, transparent)`, color: agentInk(meta.tint) }}
                    >
                      <meta.Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-ov-text">{meta.label}</span>
                      <span className="block text-[11px] text-ov-text-2">{meta.vendor}</span>
                    </span>
                    {id === fallback && <Check className="size-3.5 text-ov-accent" />}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  newConsole(placeAt ?? undefined);
                }}
                className="mt-1 flex items-center gap-2.5 rounded-lg border-t border-ov-line px-2 py-1.5 text-left hover:bg-ov-hover"
              >
                <span className="grid size-7 place-items-center rounded-md bg-ov-field text-ov-text-2">
                  <SquareTerminal className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-[13px] font-medium text-ov-text">{t.agentMenu.newConsole}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  launchFour(placeAt ?? undefined);
                }}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-ov-hover"
              >
                <span className="grid size-7 place-items-center rounded-md bg-ov-field text-ov-text-2">
                  <Layers className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-[13px] font-medium text-ov-text">{t.agentMenu.launchFour}</span>
              </button>
              {/* Spec habillage §10.1: placed the same way as an agent. */}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (placeAt) placeOrchestrator(placeAt);
                  else uiStore.getState().setPlacing({ orchestrator: true });
                }}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-ov-hover"
              >
                <span className="grid size-7 place-items-center rounded-md bg-ov-accent-soft text-ov-accent">
                  <Network className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ov-text">{t.agentMenu.orchestrator}</span>
                  <span className="block text-[11px] text-ov-text-2">{t.agentMenu.orchestratorHint}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  placeKanban(placeAt ?? undefined);
                }}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-ov-hover"
              >
                <span className="grid size-7 place-items-center rounded-md bg-ov-field text-ov-text-2">
                  <Kanban className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ov-text">{t.agentMenu.kanban}</span>
                  <span className="block text-[11px] text-ov-text-2">{t.agentMenu.kanbanHint}</span>
                </span>
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-ov-line px-2 pt-2 text-[11px] text-ov-text-2">
              <span>{placeAt ? t.agentMenu.placedWhereClicked : t.agentMenu.thenClickCanvas}</span>
              <button type="button" className="text-ov-accent hover:underline" onClick={() => setView("options")}>
                {t.agentMenu.options}
              </button>
            </div>
          </>
        )}
        {view === "options" && (
          <LaunchOptionsForm
            value={current}
            shells={shells}
            onChange={setOptions}
            onBack={() => setView("agents")}
            footer={
              <button
                type="button"
                disabled={!current.command.trim()}
                onClick={() => place("custom", current)}
                className="h-8 rounded-full bg-ov-accent text-xs font-semibold text-white disabled:opacity-40"
              >
                {t.agentMenu.launchCustom}
              </button>
            }
          />
        )}
        {view === "ollama" && (
          <OllamaPicker
            aiderAvailable={available("aider")}
            onBack={() => setView("agents")}
            onPick={(ollama) => place("ollama", { ...current, ollama })}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
