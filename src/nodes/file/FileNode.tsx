import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { studioRead } from "@/ipc/studio";
import { useMessages } from "@/i18n";
import { useNodes } from "@/store/nodes";
import { projectsStore } from "@/store/projects";
import { isMarkdown } from "@/studio/languages";
import { renderMarkdown } from "@/studio/markdown";
import { nodesMessages } from "../messages";

type Content = { state: "loading" } | { state: "ready"; text: string } | { state: "error"; message: string };

/** A file of the project on the canvas: read-only, Markdown rendered, code in mono (issue #49). */
export function FileNode({ nodeId }: { nodeId: string }) {
  const t = useMessages(nodesMessages);
  const record = useNodes((s) => s.nodes[nodeId]);
  const path = record?.kind === "file" ? record.payload.path : null;
  const [content, setContent] = useState<Content>({ state: "loading" });

  const load = useCallback(() => {
    // The backend wants the project folder, as Code Studio passes it.
    const { projects, activeId } = projectsStore.getState();
    const project = projects.find((p) => p.id === activeId)?.path;
    if (!project || !path) return;
    setContent({ state: "loading" });
    studioRead(project, path).then(
      (text) => setContent({ state: "ready", text }),
      (error: unknown) => setContent({ state: "error", message: String(error) }),
    );
  }, [path]);

  useEffect(load, [load]);

  if (!path) return <div className="grid h-full place-items-center rounded-md border bg-card text-muted-foreground">{t.file.notFound}</div>;
  const name = path.split(/[\\/]/).pop() ?? path;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md border bg-card text-card-foreground">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-muted-foreground" title={path}>{path}</div>
        </div>
        <button type="button" title={t.file.refresh} aria-label={t.file.refresh} onClick={load} className="rounded p-1 hover:bg-muted">
          <RefreshCw className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {content.state === "loading" && <p className="text-sm text-muted-foreground">{t.file.loading}</p>}
        {content.state === "error" && <p className="text-sm text-destructive">{t.file.readFailed(content.message)}</p>}
        {content.state === "ready" && content.text === "" && <p className="text-sm text-muted-foreground">{t.file.empty}</p>}
        {content.state === "ready" && content.text !== "" &&
          (isMarkdown(path) ? renderMarkdown(content.text) : <pre className="font-mono text-xs whitespace-pre">{content.text}</pre>)}
      </div>
    </div>
  );
}
