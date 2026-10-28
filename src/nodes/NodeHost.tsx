import { memo } from "react";
import type { NonDeleted, ExcalidrawEmbeddableElement } from "@excalidraw/excalidraw/element/types";
import { nodeKindOf } from "@/canvas/nodeElement";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CrashNotice } from "@/shell/CrashNotice";
import { KanbanNode } from "./kanban/KanbanNode";
import { OrchestratorNode } from "./orchestrator/OrchestratorNode";
import { TerminalNode } from "./terminal/TerminalNode";
import { useMessages } from "@/i18n";
import { nodesMessages } from "./messages";

/**
 * Renders the OpenVibe node behind an Excalidraw embeddable, chosen by its kind.
 * A render error stays in the node's frame; its process keeps running.
 */
export const NodeHost = memo(function NodeHost({ element }: { element: NonDeleted<ExcalidrawEmbeddableElement> }) {
  return (
    <ErrorBoundary scope="node" fallback={(error, retry) => <CrashNotice error={error} retry={retry} compact />}>
      <NodeOfKind element={element} />
    </ErrorBoundary>
  );
}, (prev, next) => prev.element.id === next.element.id);

function NodeOfKind({ element }: { element: NonDeleted<ExcalidrawEmbeddableElement> }) {
  const t = useMessages(nodesMessages);
  switch (nodeKindOf(element)) {
    case "terminal":
      return <TerminalNode nodeId={element.id} />;
    case "kanban":
      return <KanbanNode nodeId={element.id} />;
    case "orchestrator":
      return <OrchestratorNode nodeId={element.id} />;
    default:
      return <div className="grid h-full place-items-center rounded-md border bg-card text-muted-foreground">{t.unknownNode}</div>;
  }
}
