import { useEffect } from "react";
import { Canvas } from "@/canvas/Canvas";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AgentsPanel } from "@/fleet/AgentsPanel";
import { useAgentsPanel } from "@/fleet/agentsPanelState";
import { useMessages } from "@/i18n";
import { agentsStore } from "@/fleet/agentsStore";
import { LinkMode } from "@/fleet/LinkMode";
import { RadialMenu } from "@/radial/RadialMenu";
import { ReviewPanel } from "@/review/ReviewPanel";
import { StudioModal } from "@/studio/StudioModal";
import { PlacementGhost } from "@/fleet/PlacementGhost";
import { useWorkspaces } from "@/store/workspaces";
import { ActivityRail } from "./ActivityRail";
import { AgentCounts } from "./AgentCounts";
import { CommandBar, CommandHint } from "./CommandBar";
import { CrashNotice } from "./CrashNotice";
import { GitChip } from "./GitChip";
import { ProjectDialogs } from "./ProjectDialogs";
import { ProjectPicker } from "./ProjectPicker";
import { SearchField } from "./SearchField";
import { TitleBar } from "./TitleBar";
import { ToolRail } from "./ToolRail";
import { UpdateChip } from "./UpdateDialog";
import { UsageMeter } from "./UsageMeter";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { shellMessages } from "./messages";
import { ZoomControl } from "./ZoomControl";

/** A floating panel's error, where the panels open. */
function panelCrash(error: Error, retry: () => void) {
  return (
    <div className="absolute right-3 top-[104px] z-40 w-80">
      <CrashNotice error={error} retry={retry} compact />
    </div>
  );
}

/**
 * The open project (spec identité §5): the canvas fills the window, under the
 * glass bars; everything else floats on it.
 */
export function ProjectView() {
  const t = useMessages(shellMessages);
  const status = useWorkspaces((s) => s.status);
  const error = useWorkspaces((s) => s.error);
  const activeId = useWorkspaces((s) => s.activeId);
  const panelOpen = useAgentsPanel((s) => s.open);

  useEffect(() => {
    void agentsStore.getState().load();
  }, []);

  return (
    <div className="ov-ambient relative h-screen w-screen overflow-hidden">
      {status === "ready" && activeId ? (
        <>
          <ErrorBoundary
            key={activeId}
            scope="canvas"
            fallback={(error, retry) => (
              <div className="absolute inset-0 px-6 pb-6 pt-[104px]">
                <CrashNotice error={error} retry={retry} />
              </div>
            )}
          >
            <Canvas workspaceId={activeId} />
          </ErrorBoundary>
          <ToolRail />
          <ActivityRail />
          {panelOpen && (
            <ErrorBoundary scope="agents panel" fallback={panelCrash}>
              <AgentsPanel />
            </ErrorBoundary>
          )}
          <div className="absolute bottom-[14px] left-3 z-30">
            <GitChip />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-[14px] z-30 flex flex-col items-center gap-2">
            <CommandHint />
            <CommandBar />
          </div>
          <div className="absolute bottom-[14px] right-3 z-30">
            <ZoomControl />
          </div>
          <PlacementGhost />
          <LinkMode />
          <RadialMenu />
          <ErrorBoundary scope="review" fallback={panelCrash}>
            <ReviewPanel />
          </ErrorBoundary>
          <ErrorBoundary scope="code studio" fallback={panelCrash}>
            <StudioModal />
          </ErrorBoundary>
        </>
      ) : (
        <div className="grid h-full place-items-center text-sm text-ov-text-2">
          {status === "error" ? t.projectView.loadFailed(String(error)) : t.loading}
        </div>
      )}
      <div className="absolute inset-x-0 top-0 z-30">
        <TitleBar
          leading={<ProjectPicker />}
          center={<SearchField />}
          trailing={
            <>
              <UpdateChip />
              <ErrorBoundary scope="usage" fallback={() => null}>
                <UsageMeter />
              </ErrorBoundary>
              <AgentCounts />
            </>
          }
        />
        <WorkspaceTabs />
      </div>
      <ProjectDialogs />
    </div>
  );
}
