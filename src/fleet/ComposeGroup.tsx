import { useEffect, useState, type ReactElement } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { returnKeyboardToCanvas } from "@/canvas/keyboardFocus";
import { useUiRequest } from "@/commands/uiRequests";
import { messages, useMessages } from "@/i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AgentId } from "@/ipc/pty";
import { cn } from "@/lib/utils";
import { agentsStore, useAgents } from "./agentsStore";
import { agentInk, AGENTS, AGENTS_WITHOUT_OPTIONS, defaultAgent } from "./catalog";
import { agentsOf, DEFAULT_GROUP_SIZE, MAX_GROUP_SIZE, resizeSlots, type Slot } from "./composer";
import { fleetMessages } from "./messages";
import { launchGroup } from "./groups";
import { ROLE_ORDER, ROLES, type RoleId } from "./roles";

function AgentLogo({ agent, className }: { agent: AgentId; className?: string }) {
  const meta = AGENTS[agent];
  return (
    <span
      className={cn("grid size-7 place-items-center rounded-md", className)}
      style={{ backgroundColor: `color-mix(in srgb, ${meta.tint} 18%, transparent)`, color: agentInk(meta.tint) }}
    >
      <meta.Icon className="size-4" />
    </span>
  );
}

/** A slot of the grid: the agent's logo and label; a click opens the agents (spec §11.2). */
function SlotButton(props: { agent: AgentId; choices: AgentId[]; onPick: (agent: AgentId) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-[10px] border border-ov-line bg-ov-card hover:border-ov-text-2"
        >
          <AgentLogo agent={props.agent} />
          <span className="max-w-full truncate px-1 text-[11px] text-ov-text">{AGENTS[props.agent].label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {props.choices.map((id) => {
          const meta = AGENTS[id];
          return (
            <DropdownMenuItem key={id} onSelect={() => props.onPick(id)}>
              <meta.Icon style={{ color: agentInk(meta.tint) }} /> {meta.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Composer un groupe", anchored to its trigger (spec habillage §11.2). */
export function ComposeGroup({
  trigger,
  side = "top",
  answersRequests = false,
}: {
  trigger: ReactElement;
  side?: "top" | "left" | "bottom";
  /** The agents panel's copy answers the palette's « Composer un groupe… ». */
  answersRequests?: boolean;
}) {
  const t = useMessages(fleetMessages).compose;
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<RoleId>("general");
  // What the user typed; until then the name is the role's, in the language of the moment.
  const [typedName, setTypedName] = useState<string | null>(null);
  const name = typedName ?? ROLES[role].label;
  const [slots, setSlots] = useState<Slot[]>(resizeSlots([], DEFAULT_GROUP_SIZE));
  useUiRequest(
    "composeGroup",
    () => {
      setOpen(true);
      return true;
    },
    answersRequests,
  );
  const agents = useAgents((s) => s.agents);
  const fallback = defaultAgent(agents);
  const choices = AGENTS_WITHOUT_OPTIONS.filter((id) => agents.some((a) => a.id === id && a.available));
  const color = ROLES[role].color;

  useEffect(() => {
    if (!open) return;
    setRole("general");
    setTypedName(null);
    setSlots(resizeSlots([], DEFAULT_GROUP_SIZE));
    void agentsStore.getState().load();
  }, [open]);

  const pickRole = (next: RoleId) => {
    // An emptied field follows the role again (spec §11.2).
    setTypedName((current) => (current === null || current.trim() === "" ? null : current));
    setRole(next);
  };

  const launch = () => {
    setOpen(false);
    returnKeyboardToCanvas();
    void launchGroup({ name, role, agents: agentsOf(slots, fallback) }).catch((error: unknown) =>
      toast.error(messages(fleetMessages).launchFailed(String(error))),
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side={side} sideOffset={10} className="flex w-[360px] flex-col gap-3 p-3">
        <p className="ov-label">{t.title}</p>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-ov-line bg-ov-card px-2.5">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <input
            autoFocus
            value={name}
            onChange={(e) => setTypedName(e.currentTarget.value)}
            onKeyDown={(e) => {
              // Enter launches the group, unless it ends an IME composition.
              if (e.key === "Enter" && !e.nativeEvent.isComposing) launch();
            }}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t.groupName}
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ov-text outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_ORDER.map((id) => {
            const active = id === role;
            return (
              <button
                key={id}
                type="button"
                onClick={() => pickRole(id)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-[9px] border px-2.5 text-xs",
                  active ? "font-semibold text-ov-on-role" : "border-ov-line text-ov-text-2 hover:text-ov-text",
                )}
                style={active ? { backgroundColor: ROLES[id].color, borderColor: ROLES[id].color } : undefined}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: active ? "var(--ov-on-role)" : ROLES[id].color }}
                />
                {ROLES[id].label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {slots.map((slot, i) => (
            <SlotButton
              key={i}
              agent={slot ?? fallback}
              choices={choices}
              onPick={(agent) => setSlots((current) => current.map((s, j) => (j === i ? agent : s)))}
            />
          ))}
        </div>
        {choices.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-ov-text-2">
            <span className="mr-1">{t.fillWith}</span>
            {choices.map((id) => (
              <button
                key={id}
                type="button"
                title={AGENTS[id].label}
                aria-label={t.fillAllWith(AGENTS[id].label)}
                onClick={() => setSlots((current) => current.map(() => id))}
                className="rounded-md hover:brightness-125"
              >
                <AgentLogo agent={id} className="size-6" />
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-ov-line pt-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t.fewer}
              disabled={slots.length <= 1}
              onClick={() => setSlots((current) => resizeSlots(current, current.length - 1))}
              className="grid size-7 place-items-center rounded-[9px] text-ov-text-2 hover:bg-ov-card hover:text-ov-text disabled:opacity-40"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-6 text-center font-mono text-[13px] text-ov-text">{slots.length}</span>
            <button
              type="button"
              aria-label={t.more}
              disabled={slots.length >= MAX_GROUP_SIZE}
              onClick={() => setSlots((current) => resizeSlots(current, current.length + 1))}
              className="grid size-7 place-items-center rounded-[9px] text-ov-text-2 hover:bg-ov-card hover:text-ov-text disabled:opacity-40"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={launch}
            className="h-8 rounded-[10px] px-4 text-[13px] font-semibold text-ov-on-role hover:brightness-110"
            style={{ backgroundColor: color }}
          >
            {t.launch(slots.length)}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
