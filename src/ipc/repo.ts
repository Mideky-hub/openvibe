import { call } from "./invoke";
import type { ChangedFile } from "./review";

/** Why a push cannot be offered (spec fenêtre git §3.5). */
export type NoPush = "noRemote" | "manyRemotes" | "detached" | "noCommit";

/** The repository of the project, as the git window shows it. */
export interface RepoState {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** What a push would reach; null when it cannot, `noPush` saying why. */
  pushTo: string | null;
  noPush: NoPush | null;
  files: ChangedFile[];
  /** The list stops at Rust's limit. */
  truncated: boolean;
}

export interface LogEntry {
  hash: string;
  shortHash: string;
  author: string;
  /** Seconds since the epoch. */
  date: number;
  subject: string;
}

export const repoState = (path: string) => call<RepoState>("repo_state", { path });
export const repoHistory = (path: string) => call<LogEntry[]>("repo_history", { path });
/** Commits exactly `files`; the new commit's short hash. */
export const repoCommit = (path: string, files: ChangedFile[], message: string) => call<string>("repo_commit", { path, files, message });
/** Only after the window's confirmation; refused if the file changed since it was listed. */
export const repoDiscard = (path: string, file: ChangedFile) => call<void>("repo_discard", { path, file });
/** Only ever the Push button's click (spec fenêtre git §2.3). */
export const repoPush = (path: string) => call<void>("repo_push", { path });
