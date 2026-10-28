import { call } from "./invoke";

/** An entry of the project's tree (Code Studio); `path` from the project folder, with `/`. */
export type TreeEntry = { path: string; kind: "file" | "dir" };

/** The project folder's tree, `.gitignore` respected. */
export const studioTree = (project: string) => call<TreeEntry[]>("studio_tree", { project });
/** A text file of the project; refused when binary or too big. */
export const studioRead = (project: string, path: string) => call<string>("studio_read", { project, path });
/** Writes a file of the project, creating its folders; never outside the project. */
export const studioWrite = (project: string, path: string, content: string) => call<void>("studio_write", { project, path, content });
