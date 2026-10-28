import { call } from "./invoke";

/** A path of the repository, from its root, with `/` separators. */
export type TreeEntry = { path: string; kind: "file" | "dir" };

/** Stub of the Code Studio contract (issue #49); the backend replaces it at merge. */
export const studioTree = (project: string): Promise<TreeEntry[]> => call<TreeEntry[]>("studio_tree", { project });
export const studioRead = (project: string, path: string): Promise<string> => call<string>("studio_read", { project, path });
export const studioWrite = (project: string, path: string, content: string): Promise<void> =>
  call<void>("studio_write", { project, path, content });
