import { Code2, Settings, Users } from "lucide-react";
import { useWorkspaceAgentCounts } from "@/fleet/agentCounts";
import { setAgentsPanel, useAgentsPanel } from "@/fleet/agentsPanelState";
import { useMessages } from "@/i18n";
import { useProjects } from "@/store/projects";
import { studioMessages } from "@/studio/messages";
import { closeStudio, openStudio, useStudio } from "@/studio/studioStore";
import { ToolButton } from "./buttons";
import { shellMessages } from "./messages";
import { SettingsMenu } from "./SettingsMenu";

/** The rail on the right: the activities (spec identité §5.5). "Fonctions" comes with J8. */
export function ActivityRail() {
  const t = useMessages(shellMessages).activityRail;
  const open = useAgentsPanel((s) => s.open);
  const { waiting } = useWorkspaceAgentCounts();
  const studioLabel = useMessages(studioMessages).open;
  const projectPath = useProjects((s) => s.projects.find((p) => p.id === s.activeId)?.path ?? null);
  const studioOpen = useStudio((s) => s.project !== null);
  return (
    <nav className="ov-glass absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-0.5 rounded-[14px] p-[5px]">
      <ToolButton label={t.agents} active={open} onClick={() => setAgentsPanel(!open)}>
        <Users />
        {waiting > 0 && (
          <span
            data-pip
            className="absolute right-0.5 top-0.5 min-w-3.5 rounded-full bg-ov-wait px-1 font-mono text-[9.5px] font-semibold leading-3.5 text-ov-on-role"
          >
            {waiting}
          </span>
        )}
      </ToolButton>
      <ToolButton
        label={studioLabel}
        active={studioOpen}
        disabled={!projectPath}
        onClick={() => (studioOpen ? closeStudio() : projectPath && openStudio(projectPath))}
      >
        <Code2 />
      </ToolButton>
      <span aria-hidden className="my-1 h-px w-6 bg-ov-line" />
      <SettingsMenu
        side="left"
        align="start"
        trigger={
          <ToolButton label={t.settings}>
            <Settings />
          </ToolButton>
        }
      />
    </nav>
  );
}
