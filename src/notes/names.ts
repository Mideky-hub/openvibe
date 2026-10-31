const MAX_CHARS = 120;
const FORBIDDEN = /[/\\:*?"<>|[\]#^\p{Cc}]/u;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Mirrors `notes.rs`, so the field can say it before the disk refuses (spec notes §3). */
export function isNoteName(name: string): boolean {
  if (name.trim() === "" || [...name].length > MAX_CHARS || FORBIDDEN.test(name)) return false;
  if (name.startsWith(".") || /[. ]$/.test(name)) return false;
  return !RESERVED.test(name.split(".")[0]);
}
