import { call } from "./invoke";
import type { ChangedFile } from "./review";

/** Why a push cannot be offered (spec fenêtre git §3.5). */
export type NoPush = "noRemote" | "manyRemotes" | "detached" | "noCommit" | "mirror";

/** The repository of the project, as the git window shows it. */
export interface RepoState {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** What a push would reach; null when it cannot, `noPush` saying why. */
  pushTo: string | null;
  /** The commit a push would send, as read here; empty without a commit. */
  head: string;
  noPush: NoPush | null;
  files: ChangedFile[];
  /** Each file as it is now, by path: what a discard must still find. */
  stamps: Record<string, string>;
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
export const repoDiscard = (path: string, file: ChangedFile, stamp: string) => call<void>("repo_discard", { path, file, stamp });
/** Only ever the Push button's click (spec fenêtre git §2.3), for the branch, target and commits it showed: refused if they changed. */
export const repoPush = (path: string, branch: string, target: string, head: string) => call<void>("repo_push", { path, branch, target, head });
