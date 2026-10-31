import { useEffect } from "react";
import { FolderPlus, LifeBuoy } from "lucide-react";
import { agentsStore } from "@/fleet/agentsStore";
import { toast } from "sonner";
import { messages, useMessages } from "@/i18n";
import { AccentButton } from "@/shell/buttons";
import { SearchField } from "@/shell/SearchField";
import { TitleBar } from "@/shell/TitleBar";
import { showTroubleshooting } from "@/shell/troubleshoot";
import { UpdateChip } from "@/shell/UpdateDialog";
import { projectsStore, useProjects } from "@/store/projects";
import { addProject } from "./addProject";
import { GettingStarted } from "./GettingStarted";
import { homeMessages } from "./messages";
import { ProjectCard } from "./ProjectCard";

/** Projects as glass cards under the title bar; a click opens one on its last workspace (spec identité §5.9). */
export function HomeScreen() {
  const t = useMessages(homeMessages);
  const projects = useProjects((s) => s.projects);

  useEffect(() => {
    void projectsStore.getState().refresh();
    agentsStore
      .getState()
      .load()
      .catch((error: unknown) => toast.error(messages(homeMessages).start.agentsFailed(error instanceof Error ? error.message : String(error))));
  }, []);

  return (
    <div className="ov-ambient flex h-screen w-screen flex-col">
      <TitleBar leading={<span data-tauri-drag-region="" className="text-[13px] font-semibold text-ov-text">OpenVibe</span>} center={<SearchField />} trailing={<UpdateChip />} />
      {/* The scroller starts below the title bar: scrolled cards never slide under it. */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="relative mx-auto max-w-5xl px-8 pb-12 pt-8">
          <header className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-ov-text">{t.title}</h1>
            <AccentButton onClick={() => void addProject()}>
              <FolderPlus /> {t.add}
            </AccentButton>
          </header>
          <GettingStarted hasProject={projects.length > 0} />
          {projects.length === 0 ? (
            <div className="mt-24 grid place-items-center gap-3 text-center">
              <p className="text-lg font-semibold text-ov-text">{t.none}</p>
              <p className="max-w-sm text-sm text-ov-text-2">
                {t.noneHint}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => void showTroubleshooting()}
            className="mx-auto mt-10 flex items-center gap-1.5 text-xs text-ov-text-2 hover:text-ov-text [&_svg]:size-3.5"
          >
            <LifeBuoy /> {t.troubleshoot}
          </button>
        </div>
      </div>
    </div>
  );
}
