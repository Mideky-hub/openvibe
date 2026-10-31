import { useState, type ReactElement } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useCanvas } from "@/canvas/canvasStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUiRequest } from "@/commands/uiRequests";
import { messages, useMessages } from "@/i18n";
import { uiStore } from "@/store/ui";
import { useAgents } from "./agentsStore";
import { pauseAll, resumeAll } from "./broadcast";
import { agentInk, AGENTS, AGENTS_WITHOUT_OPTIONS } from "./catalog";
import { fleetMessages } from "./messages";
import { addAgentToGroup, groupMembers, requestCloseGroup, ungroup } from "./groups";
import { orchestrateGroup } from "./orchestrators";
import { setRemoteControlAll } from "./remoteControl";
import { SpecialityMenu } from "./SpecialityMenu";

/**
 * The menu of a group: the `⌄` of its label on the canvas (spec habillage
 * §11.4), or `trigger`, the ⋯ of its header in the agents panel (spec identité §5.6).
 */
export function GroupMenu({ groupId, trigger, answersRequests = false }: { groupId: string; trigger?: ReactElement; answersRequests?: boolean }) {
  const t = useMessages(fleetMessages);
  const [open, setOpen] = useState(false);
  const agents = useAgents((s) => s.agents);
  const speciality = useCanvas((s) => s.frames.find((f) => f.id === groupId)?.group?.speciality);
  const available = (id: string) => agents.some((agent) => agent.id === id && agent.available);
  // « Ajouter un agent… » of the palette opens the panel's copy of this menu.
  useUiRequest(
    "groupMenu",
    (request) => {
      if (request.id !== groupId) return false;
      setOpen(true);
      return true;
    },
    answersRequests,
  );
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label={t.panel.groupMenu}
            className="pointer-events-auto ml-1 grid size-5 place-items-center rounded text-ov-text-2 hover:bg-ov-card hover:text-ov-text"
          >
            <ChevronDown className="size-3.5" />
          </button>
        )}
      </DropdownMenuTrigger>
      {/* Focus must not come back to the trigger: it would close Excalidraw's name editor. */}
      <DropdownMenuContent align="start" className="w-48" onCloseAutoFocus={(e) => e.preventDefault()}>
        {/* After the menu has closed, so its focus handling leaves the name field alone. */}
        <DropdownMenuItem onSelect={() => requestAnimationFrame(() => uiStore.getState().setRenamingGroup(groupId))}>
          {t.groupMenu.rename}
        </DropdownMenuItem>
        <SpecialityMenu groupId={groupId} speciality={speciality} onDone={() => setOpen(false)} />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t.groupMenu.addAgent}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {AGENTS_WITHOUT_OPTIONS.map((id) => {
              const meta = AGENTS[id];
              return (
                <DropdownMenuItem
                  key={id}
                  disabled={!available(id)}
                  onSelect={() =>
                    void addAgentToGroup(groupId, id).catch((error: unknown) =>
                      toast.error(messages(fleetMessages).launchFailed(String(error))),
                    )
                  }
                >
                  <meta.Icon style={{ color: agentInk(meta.tint) }} /> {meta.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          onSelect={() =>
            void orchestrateGroup(groupId).catch((error: unknown) => toast.error(messages(fleetMessages).orchestratorFailed(String(error))))
          }
        >
          {t.groupMenu.linkOrchestrator}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void pauseAll(groupMembers(groupId))}>{t.groupMenu.pauseAll}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void resumeAll(groupMembers(groupId))}>{t.groupMenu.resumeAll}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void setRemoteControlAll(groupMembers(groupId), true)}>{t.remote.turnOn}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void setRemoteControlAll(groupMembers(groupId), false)}>{t.remote.turnOff}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => ungroup(groupId)}>{t.groupMenu.ungroup}</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => requestCloseGroup(groupId)}>
          {t.groupMenu.close}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
