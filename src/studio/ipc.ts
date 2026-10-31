import { call } from "@/ipc/invoke";

export interface OpenedFile {
  text: string;
  /** What the file was when read: an opaque text, compared at each write (spec studio code §3). */
  version: string;
}

/** `disk`: the version found instead of the expected one; null when the file is gone. */
export type WriteOutcome = { status: "saved"; version: string } | { status: "conflict"; disk: string | null };

/** Paths from the project's root, tracked or not, without ignored files. */
export const studioFiles = (projectId: string) => call<string[]>("studio_files", { projectId });
export const studioRead = (projectId: string, file: string) => call<OpenedFile>("studio_read", { projectId, file });
/** Null when the file no longer exists. */
export const studioVersion = (projectId: string, file: string) => call<string | null>("studio_version", { projectId, file });
export const studioWrite = (projectId: string, file: string, text: string, expected: string | null) =>
  call<WriteOutcome>("studio_write", { projectId, file, text, expected });
