import { Check, ChevronDown, Folder } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useMessages } from "@/i18n";
import { projectsStore, useProjects } from "@/store/projects";
import { shellMessages } from "./messages";

/** "mk-webapp ⌄" in the title bar: recent projects, the home screen, closing the project (spec identité §5.1). */
export function ProjectPicker() {
  const t = useMessages(shellMessages).projectPicker;
  const projects = useProjects((s) => s.projects);
  const activeId = useProjects((s) => s.activeId);
  const active = projects.find((p) => p.id === activeId);
  const recent = [...projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 8);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-[26px] items-center gap-1 rounded-[6px] px-2 text-[13px] font-semibold text-ov-text hover:bg-ov-hover"
        >
          <span className="max-w-48 truncate">{active?.name ?? t.project}</span>
          <ChevronDown className="size-3.5 text-ov-text-2" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {recent.map((project) => (
          <DropdownMenuItem
            key={project.id}
            disabled={project.missing}
            onSelect={() => {
              if (project.id === activeId) return;
              void projectsStore.getState().open(project.id).catch((error: unknown) => toast.error(t.openFailed(String(error))));
            }}
          >
            <Folder />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{project.name}</span>
              <span data-path className="truncate font-mono text-[10.5px] text-ov-text-3">
                {project.path}
              </span>
            </span>
            {project.id === activeId && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => projectsStore.getState().goHome()}>{t.allProjects}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void projectsStore.getState().close()}>{t.closeProject}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
