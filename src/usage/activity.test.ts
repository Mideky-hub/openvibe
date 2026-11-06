import { describe, expect, it } from "vitest";
import type { TokenCounts, TokenReport } from "@/ipc/tokens";
import { activityStats, activityWeeks, SESSIONS_CAP } from "./activity";

const c = (input: number, output = 0): TokenCounts => ({ input, output, cacheRead: 0, cacheWrite: 0 });
const days = (...totals: number[]): TokenReport["days"] =>
  // From Sunday 2026-11-01 on.
  totals.map((n, i) => ({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, counts: c(n) }));
const report = (d: TokenReport["days"], sessions: TokenReport["sessions"] = []): TokenReport => ({
  days: d,
  sessions,
  models: [],
  filesScanned: 1,
  truncated: false,
});

describe("activityWeeks", () => {
  it("lays the days out by week, Monday first, the days outside the window left blank", () => {
    const weeks = activityWeeks(days(100, 0, 50, 25));
    expect(weeks).toHaveLength(2);
    expect(weeks[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(weeks[0][6]).toEqual({ date: "2026-11-01", total: 100, level: 4 });
    expect(weeks[1].map((cell) => cell?.date ?? null)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", null, null, null, null]);
  });

  it("shades each day in four steps against the busiest, an active day never blank", () => {
    const levels = activityWeeks(days(100, 0, 50, 26, 1)).flat().filter((cell) => cell !== null).map((cell) => cell.level);
    expect(levels).toEqual([4, 0, 2, 2, 1]);
  });

  it("keeps an empty window blank", () => {
    expect(activityWeeks(days(0, 0)).flat().every((cell) => cell === null || cell.level === 0)).toBe(true);
    expect(activityWeeks([])).toEqual([]);
  });
});

describe("activityStats", () => {
  it("counts the active days, the busiest one and the average of an active day", () => {
    const stats = activityStats(report(days(10, 0, 30, 20, 5, 0)));
    expect(stats.activeDays).toBe(4);
    expect(stats.days).toBe(6);
    expect(stats.busiest).toEqual({ date: "2026-11-03", total: 30 });
    expect(stats.perActiveDay).toBe(16.25);
  });

  it("counts the streak up to today, or to yesterday while today has nothing yet", () => {
    expect(activityStats(report(days(10, 0, 30, 20, 5, 0))).currentStreak).toBe(3);
    expect(activityStats(report(days(10, 0, 30, 20, 5, 7))).currentStreak).toBe(4);
    expect(activityStats(report(days(10, 0, 30, 0, 0))).currentStreak).toBe(0);
  });

  it("keeps the longest streak of the window", () => {
    expect(activityStats(report(days(1, 1, 1, 0, 1, 0))).longestStreak).toBe(3);
  });

  it("averages the sessions, and only says « at least » once the logs list too many", () => {
    const two = activityStats(report(days(60), [
      { sessionId: "a", model: null, counts: c(30, 10) },
      { sessionId: "b", model: null, counts: c(20) },
    ]));
    expect(two.sessions).toBe(2);
    expect(two.sessionsCapped).toBe(false);
    expect(two.perSession).toBe(30);
    const many = Array.from({ length: SESSIONS_CAP }, (_, i) => ({ sessionId: `s${i}`, model: null, counts: c(1) }));
    const capped = activityStats(report(days(60), many));
    expect(capped.sessionsCapped).toBe(true);
    // The biggest sessions only: their average would be too high.
    expect(capped.perSession).toBeNull();
  });

  it("says nothing of an empty window", () => {
    const stats = activityStats(report(days(0, 0)));
    expect(stats.activeDays).toBe(0);
    expect(stats.busiest).toBeNull();
    expect(stats.perActiveDay).toBe(0);
    expect(stats.perSession).toBeNull();
  });
});
