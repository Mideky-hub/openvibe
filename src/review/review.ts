import { messages } from "@/i18n";
import { agentMessages } from "@/mcp/messages";
import { missionOf } from "@/mission/store";
import { nodesStore } from "@/store/nodes";

/** One line of a file's diff, numbered on its side (spec maj §5). */
export interface DiffLine {
  kind: "add" | "del" | "ctx" | "hunk" | "meta";
  text: string;
  old?: number;
  new?: number;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** A unified diff as lines to show: hunks, added, removed and kept lines; the headers before the first hunk are left out. */
export function parseDiff(diff: string): { lines: DiffLine[]; binary: boolean } {
  const lines: DiffLine[] = [];
  let binary = false;
  let old = 0;
  let next = 0;
  let inHunk = false;
  for (const raw of diff.split("\n")) {
    const text = raw.replace(/\r$/, "");
    const hunk = HUNK.exec(text);
    if (hunk) {
      inHunk = true;
      old = Number(hunk[1]);
      next = Number(hunk[2]);
      lines.push({ kind: "hunk", text });
    } else if (text === "[diff tronqué]") {
      lines.push({ kind: "meta", text });
    } else if (!inHunk) {
      if (/^Binary files .* differ$/.test(text)) binary = true;
    } else if (text.startsWith("+")) {
      lines.push({ kind: "add", text: text.slice(1), new: next++ });
    } else if (text.startsWith("-")) {
      lines.push({ kind: "del", text: text.slice(1), old: old++ });
    } else if (text.startsWith(" ")) {
      lines.push({ kind: "ctx", text: text.slice(1), old: old++, new: next++ });
    } else if (text.startsWith("\\")) {
      lines.push({ kind: "meta", text });
    } else if (text.startsWith("diff --git")) {
      // The next file of a diff of several: its headers come before its hunks.
      inHunk = false;
    }
  }
  return { lines, binary };
}

/** A remark of the review, on a file or one of its lines. */
export interface Remark {
  file: string;
  line?: number;
  /** `old`: a removed line, numbered in the file before the changes. */
  side?: "old";
  /** The text of the line when the remark was written: the number alone drifts after a refresh. */
  lineText?: string;
  text: string;
}

/**
 * The row of `lines` a remark belongs to: the line of that number whose text is
 * still the same, else the first line of the same side with that text, else the
 * number alone when the remark has no text. -1 when the line is gone.
 */
export function remarkRow(lines: readonly DiffLine[], remark: Remark): number {
  const removed = remark.side === "old";
  const numberOf = (l: DiffLine) => (removed ? l.old : l.new);
  const onSide = (l: DiffLine) => (removed ? l.kind === "del" : l.kind !== "del" && l.kind !== "hunk" && l.kind !== "meta");
  const same = (l: DiffLine) => remark.lineText === undefined || l.text === remark.lineText;
  const exact = lines.findIndex((l) => onSide(l) && numberOf(l) === remark.line && same(l));
  if (exact >= 0 || remark.lineText === undefined) return exact;
  return lines.findIndex((l) => onSide(l) && l.text === remark.lineText);
}

/** What the agent reads: every remark, then what to do with them. */
export function reviewMessage(remarks: readonly Remark[]): string {
  const said = messages(agentMessages).review;
  const items = remarks.map((r) => {
    const where = r.line === undefined ? r.file : r.side === "old" ? said.removedLine(r.file, r.line) : `${r.file}:${r.line}`;
    const quoted = r.lineText?.trim() ? ` \`${r.lineText.trim().slice(0, 80)}\`` : "";
    return `- ${where}${quoted} — ${r.text.replace(/\s*\n\s*/g, " ").trim()}`;
  });
  return [said.intro, ...items, said.outro].join("\n");
}

/** A mission agent's work is compared with the mission's branch, where its own forked. */
export function missionBranchFor(nodeId: string): string | null {
  for (const record of Object.values(nodesStore.getState().nodes)) {
    const mission = missionOf(record);
    if (!mission?.branch || (mission.state !== "en_cours" && mission.state !== "terminee")) continue;
    if (mission.members.some((m) => m.nodeId === nodeId)) return mission.branch;
  }
  return null;
}
