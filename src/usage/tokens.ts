import { formatDecimal } from "@/i18n/format";
import type { TokenCounts, TokenReport } from "@/ipc/tokens";

/** « 67,8 k », « 1,2 M » tokens. */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${formatDecimal(count / 1_000_000, 1)} M`;
  if (count >= 1_000) return `${formatDecimal(count / 1_000, 1)} k`;
  return String(Math.round(count));
}

/** Agents listed before the rest is summed up (spec Tokens §4). */
export const MAX_AGENT_ROWS = 10;

/** Every token processed: what is read, written and kept in the cache. */
export const total = (counts: TokenCounts) => counts.input + counts.output + counts.cacheRead + counts.cacheWrite;

const add = (a: TokenCounts, b: TokenCounts): TokenCounts => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
});

const ZERO: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export interface Bar {
  date: string;
  total: number;
  /** 0 to 1, against the busiest day; a non-empty day never vanishes. */
  height: number;
  /** The part of the bar that is output, 0 to 1. */
  outputShare: number;
  counts: TokenCounts;
}

export function bars(days: TokenReport["days"]): Bar[] {
  const peak = Math.max(0, ...days.map((day) => total(day.counts)));
  return days.map(({ date, counts }) => {
    const sum = total(counts);
    return {
      date,
      total: sum,
      height: sum === 0 || peak === 0 ? 0 : Math.max(0.02, sum / peak),
      outputShare: sum === 0 ? 0 : counts.output / sum,
      counts,
    };
  });
}

export interface AgentRow {
  label: string;
  model: string | null;
  counts: TokenCounts;
  /** The sessions OpenVibe does not know, or the rows past the list. */
  other: boolean;
}

/**
 * The sessions of the last 30 days by OpenVibe agent: `names` maps the session
 * ids of its terminals to their names; an agent's sessions merge, the unknown
 * ones group under `otherLabel`. Biggest first, `MAX_AGENT_ROWS` rows, then "…".
 */
export function byAgent(sessions: TokenReport["sessions"], names: ReadonlyMap<string, string>, otherLabel: string): AgentRow[] {
  const known = new Map<string, { counts: TokenCounts; models: Map<string, number> }>();
  let other: TokenCounts = ZERO;
  for (const session of sessions) {
    const name = names.get(session.sessionId);
    if (!name) {
      other = add(other, session.counts);
      continue;
    }
    const entry = known.get(name) ?? { counts: ZERO, models: new Map() };
    entry.counts = add(entry.counts, session.counts);
    if (session.model) entry.models.set(session.model, (entry.models.get(session.model) ?? 0) + session.counts.output + 1);
    known.set(name, entry);
  }
  const rows: AgentRow[] = [...known].map(([label, { counts, models }]) => ({
    label,
    model: [...models].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    counts,
    other: false,
  }));
  if (total(other) > 0) rows.push({ label: otherLabel, model: null, counts: other, other: true });
  rows.sort((a, b) => total(b.counts) - total(a.counts));
  if (rows.length <= MAX_AGENT_ROWS) return rows;
  const rest = rows.slice(MAX_AGENT_ROWS).reduce((sum, row) => add(sum, row.counts), ZERO);
  return [...rows.slice(0, MAX_AGENT_ROWS), { label: "…", model: null, counts: rest, other: true }];
}
