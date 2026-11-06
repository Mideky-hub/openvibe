import type { TokenReport } from "@/ipc/tokens";
import { total } from "./tokens";

/** The sessions Rust lists at most, the biggest first: mirrors `tokens::MAX_SESSIONS`. */
export const SESSIONS_CAP = 200;

export interface ActivityCell {
  /** `YYYY-MM-DD`, UTC like the logs. */
  date: string;
  total: number;
  /** 0 for an idle day, then 1 to 4 against the busiest day. */
  level: 0 | 1 | 2 | 3 | 4;
}

/** Monday 0 … Sunday 6. */
const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/**
 * The activity map (issue #74): the window's days by week, a column per week
 * and a row per weekday, Monday first; the days before or after the window are null.
 */
export function activityWeeks(days: TokenReport["days"]): (ActivityCell | null)[][] {
  if (days.length === 0) return [];
  const peak = Math.max(0, ...days.map((day) => total(day.counts)));
  const cells: (ActivityCell | null)[] = Array.from({ length: weekday(days[0].date) }, () => null);
  for (const { date, counts } of days) {
    const sum = total(counts);
    const level = sum === 0 || peak === 0 ? 0 : (Math.min(4, Math.max(1, Math.ceil((sum / peak) * 4))) as ActivityCell["level"]);
    cells.push({ date, total: sum, level });
  }
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

export interface ActivityStats {
  days: number;
  activeDays: number;
  /** The active days in a row up to today, or to yesterday while today has nothing yet. */
  currentStreak: number;
  longestStreak: number;
  busiest: { date: string; total: number } | null;
  perActiveDay: number;
  sessions: number;
  /** The logs held more sessions than Rust lists: `sessions` is a floor. */
  sessionsCapped: boolean;
  /** Unknown once capped: the listed sessions are the biggest ones. */
  perSession: number | null;
}

/** The statistics across the window's sessions and days, from the same logs as the map. */
export function activityStats(report: TokenReport): ActivityStats {
  const totals = report.days.map((day) => total(day.counts));
  const active = totals.filter((n) => n > 0);
  let longestStreak = 0;
  let run = 0;
  for (const n of totals) {
    run = n > 0 ? run + 1 : 0;
    longestStreak = Math.max(longestStreak, run);
  }
  let end = totals.length - 1;
  if (end >= 0 && totals[end] === 0) end -= 1;
  let currentStreak = 0;
  while (end - currentStreak >= 0 && totals[end - currentStreak] > 0) currentStreak += 1;
  let busiest: ActivityStats["busiest"] = null;
  for (const [i, day] of report.days.entries()) {
    if (totals[i] > (busiest?.total ?? 0)) busiest = { date: day.date, total: totals[i] };
  }
  const sessionsCapped = report.sessions.length >= SESSIONS_CAP;
  const sessionSum = report.sessions.reduce((n, s) => n + total(s.counts), 0);
  return {
    days: totals.length,
    activeDays: active.length,
    currentStreak,
    longestStreak,
    busiest,
    perActiveDay: active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0,
    sessions: report.sessions.length,
    sessionsCapped,
    perSession: sessionsCapped || report.sessions.length === 0 ? null : sessionSum / report.sessions.length,
  };
}
