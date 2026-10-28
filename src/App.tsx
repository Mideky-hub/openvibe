import { useEffect } from "react";
import { boot } from "@/app/boot";
import { GoToLine } from "@/studio/GoToLine";
import { Palette } from "@/commands/Palette";
import { appMessages } from "@/app/messages";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HomeScreen } from "@/home/HomeScreen";
import { AppToaster } from "@/shell/AppToaster";
import { ProjectView } from "@/shell/ProjectView";
import { StatusScreen } from "@/shell/StatusScreen";
import { TroubleshootingDialog } from "@/shell/TroubleshootingDialog";
import { UpdateDialog } from "@/shell/UpdateDialog";
import { messages, useMessages } from "@/i18n";
import { projectsStore, useProjects } from "@/store/projects";

export default function App() {
  const t = useMessages(appMessages);
  const view = useProjects((s) => s.view);
  const error = useProjects((s) => s.error);

  useEffect(() => {
    boot().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("start failed", error);
      projectsStore.setState({ view: "error", error: messages(appMessages).startInterrupted(message) });
    });
  }, []);

  return (
    <>
      {view === "home" && <HomeScreen />}
      {view === "project" && <ProjectView />}
      {view === "loading" && <StatusScreen message={t.loading} />}
      {view === "error" && <StatusScreen message={t.projectsLoadFailed(String(error))} />}
      <ErrorBoundary scope="palette" fallback={() => null}>
        <Palette />
      </ErrorBoundary>
      <ErrorBoundary scope="go to line" fallback={() => null}>
        <GoToLine />
      </ErrorBoundary>
      <ErrorBoundary scope="update dialog" fallback={() => null}>
        <UpdateDialog />
      </ErrorBoundary>
      <ErrorBoundary scope="troubleshooting dialog" fallback={() => null}>
        <TroubleshootingDialog />
      </ErrorBoundary>
      <AppToaster />
    </>
  );
}
