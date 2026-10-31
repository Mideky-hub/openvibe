import { call } from "./invoke";

/** A file an agent changed (spec maj §5); `added` and `removed` are null for a binary file. */
export interface ChangedFile {
  path: string;
  oldPath: string | null;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  added: number | null;
  removed: number | null;
}

export interface Changes {
  /** `HEAD`, or the commit where the base forked. */
  compared: string;
  files: ChangedFile[];
  /** More changes than the list holds: it is cut. */
  truncated: boolean;
}

/** A file of the repository; `text` null for a binary file. */
export interface FileText {
  text: string | null;
  size: number;
  truncated: boolean;
}

export const reviewChanges = (path: string, base: string | null) => call<Changes>("review_changes", { path, base });
export const reviewFileDiff = (path: string, file: ChangedFile, base: string | null) => call<string>("review_file_diff", { path, file, base });
/** Paths from the repository's root. */
export const reviewFiles = (path: string) => call<string[]>("review_files", { path });
export const reviewReadFile = (path: string, file: string) => call<FileText>("review_read_file", { path, file });
/** The remote's default branch, else `main` or `master`. */
export const reviewDefaultBase = (path: string) => call<string | null>("review_default_base", { path });
