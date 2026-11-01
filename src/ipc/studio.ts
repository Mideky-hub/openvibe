import { call } from "./invoke";

/** An entry of the project's tree (Code Studio); `path` from the project folder, with `/`. */
export type TreeEntry = { path: string; kind: "file" | "dir" };

export interface OpenedFile {
  text: string;
  /** What the file was when read: an opaque text, compared at each write (spec studio code §3). */
  version: string;
}

/** `disk`: the version found instead of the expected one; null when the file is gone. */
export type WriteOutcome = { status: "saved"; version: string } | { status: "conflict"; disk: string | null };

/** The project folder's tree, `.gitignore` respected. */
export const studioTree = (projectId: string) => call<TreeEntry[]>("studio_tree", { projectId });
/** A text file of the project; refused when binary or too big. */
export const studioRead = (projectId: string, path: string) => call<OpenedFile>("studio_read", { projectId, path });
/** Null when the file no longer exists. */
export const studioVersion = (projectId: string, path: string) => call<string | null>("studio_version", { projectId, path });
/** Saves a file of the project if the disk still holds `expected`, creating its folders; never outside the project. */
export const studioWrite = (projectId: string, path: string, content: string, expected: string | null) =>
  call<WriteOutcome>("studio_write", { projectId, path, content, expected });
