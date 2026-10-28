import type { NodeKind } from "@/canvas/nodeElement";
import { onFlushAll } from "@/lib/flush";
import { createQueue } from "@/lib/queue";
import { call } from "./invoke";

export interface Project {
  id: string;
  name: string;
  path: string;
  position: number;
  lastOpenedAt: number;
  workspaceCount: number;
  /** Its folder no longer exists. */
  missing: boolean;
  /** Terminals of its workspaces whose process runs. */
  liveAgents: number;
}

/** A workspace is a canvas, or the project's code workspace (an IDE). */
export type WorkspaceKind = "canvas" | "code";

export interface Workspace {
  id: string;
  projectId: string;
  name: string;
  position: number;
  /** Pantheon of the agents outside any group (spec habillage §9.2). */
  pantheon: string | null;
  kind: WorkspaceKind;
}

/** An Excalidraw image, stored as its data URL. */
export interface StoredFile {
  id: string;
  mimeType: string;
  dataUrl: string;
  created: number;
}

export interface StoredNode {
  id: string;
  kind: NodeKind;
  payloadJson: string;
}

export interface WorkspaceData {
  elementsJson: string | null;
  appStateJson: string | null;
  files: StoredFile[];
  nodes: StoredNode[];
}

// Writes go through one queue: a scene save that purges nodes must never overtake
// the save of a node created just before it.
const write = createQueue();

// Closing the window waits for writes already queued (a save fired just before the
// close may sit behind a large image save), not only for the ones still pending.
onFlushAll(() => write(() => Promise.resolve()));

export const loadWorkspace = (id: string) => call<WorkspaceData>("load_workspace", { id });
export const getSetting = <T>(key: string) => call<T | null>("get_setting", { key });

export const listProjects = () => call<Project[]>("list_projects");
export const createProject = (path: string) => write(() => call<Project>("create_project", { path }));
export const renameProject = (id: string, name: string) => write(() => call<void>("rename_project", { id, name }));
export const relocateProject = (id: string, path: string) =>
  write(() => call<void>("relocate_project", { id, path }));
export const openProject = (id: string) => write(() => call<void>("open_project", { id }));
/** Resolves with the ids of the deleted workspaces. */
export const deleteProject = (id: string) => write(() => call<string[]>("delete_project", { id }));

export const listWorkspaces = (projectId: string) => call<Workspace[]>("list_workspaces", { projectId });
export const createWorkspace = (projectId: string, name: string, kind: WorkspaceKind = "canvas") =>
  write(() => call<Workspace>("create_workspace", { projectId, name, kind }));
export const setWorkspacePantheon = (id: string, pantheon: string) =>
  write(() => call<void>("set_workspace_pantheon", { id, pantheon }));
export const renameWorkspace = (id: string, name: string) =>
  write(() => call<void>("rename_workspace", { id, name }));
export const deleteWorkspace = (id: string) => write(() => call<void>("delete_workspace", { id }));
export const saveScene = (workspaceId: string, elementsJson: string, appStateJson: string, nodeIds: string[]) =>
  write(() => call<void>("save_scene", { workspaceId, elementsJson, appStateJson, nodeIds }));
export const saveFiles = (workspaceId: string, files: StoredFile[]) =>
  write(() => call<void>("save_files", { workspaceId, files }));
export const saveNode = (id: string, workspaceId: string, kind: NodeKind, payloadJson: string) =>
  write(() => call<void>("save_node", { id, workspaceId, kind, payloadJson }));
export const setSetting = (key: string, value: unknown) => write(() => call<void>("set_setting", { key, value }));
