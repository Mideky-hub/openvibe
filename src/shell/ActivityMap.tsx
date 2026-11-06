import type { ReactNode } from "react";
import { useLang, useMessages } from "@/i18n";
import type { TokenReport } from "@/ipc/tokens";
import { activityStats, activityWeeks, type ActivityCell } from "@/usage/activity";
import { formatTokens } from "@/usage/tokens";
import { shellMessages } from "./messages";

/** An idle day on the line color, then the accent in four steps. */
const LEVEL_COLOR: Record<ActivityCell["level"], string> = {
  0: "var(--ov-line)",
  1: "color-mix(in srgb, var(--ov-accent) 30%, transparent)",
  2: "color-mix(in srgb, var(--ov-accent) 55%, transparent)",
  3: "color-mix(in srgb, var(--ov-accent) 80%, transparent)",
  4: "var(--ov-accent)",
};

const MONDAY = Date.UTC(2026, 10, 2);

function Cell({ level, title, day }: { level: ActivityCell["level"]; title?: string; day?: string }) {
  return (
    <span
      data-activity-day={day}
      data-level={day ? level : undefined}
      title={title}
      className="block size-[11px] rounded-[2px]"
      style={{ backgroundColor: LEVEL_COLOR[level] }}
    />
  );
}

function Stat({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div data-activity-stat={id} className="flex items-center gap-2 text-[12px]">
      <span className="text-ov-text-2">{label}</span>
      <span className="ml-auto text-right font-mono text-ov-text">{children}</span>
    </div>
  );
}

/**
 * The activity map and the statistics across sessions (issue #74), from the
 * logs Claude Code and Codex keep on the disk: what a restart of OpenVibe never loses.
 */
export function ActivityMap({ report }: { report: TokenReport }) {
  const u = useMessages(shellMessages).usage;
  const lang = useLang();
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const dateLabel = (date: string) => day.format(new Date(`${date}T00:00:00Z`));
  const weekdays = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
  const weeks = activityWeeks(report.days);
  const stats = activityStats(report);
  return (
    <div data-activity className="flex gap-4">
      <div className="flex shrink-0 flex-col gap-1.5">
        <div role="img" aria-label={u.activityMap(stats.activeDays, stats.days)} className="flex gap-[2px]">
          <div className="flex flex-col gap-[2px] pr-0.5 font-mono text-[10px] leading-[11px] text-ov-text-3">
            {Array.from({ length: 7 }, (_, row) => (
              // Monday, Wednesday and Friday name their rows; more would crowd the column.
              <span key={row} className="h-[11px]">
                {row % 2 === 0 && row < 6 ? weekdays.format(MONDAY + row * 86_400_000) : ""}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week.find((cell) => cell)?.date} className="flex flex-col gap-[2px]">
              {week.map((cell, row) =>
                cell ? (
                  <Cell key={cell.date} day={cell.date} level={cell.level} title={u.activityDay(dateLabel(cell.date), formatTokens(cell.total))} />
                ) : (
                  <span key={row} className="block size-[11px]" />
                ),
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-[2px] font-mono text-[10px] text-ov-text-3">
          <span className="pr-1">{u.activityLess}</span>
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <Cell key={level} level={level} />
          ))}
          <span className="pl-1">{u.activityMore}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Stat id="active" label={u.activeDays}>
          {stats.activeDays} / {stats.days}
        </Stat>
        <Stat id="streak" label={u.currentStreak}>
          {u.streakDays(stats.currentStreak)}
        </Stat>
        <Stat id="longest" label={u.longestStreak}>
          {u.streakDays(stats.longestStreak)}
        </Stat>
        {stats.busiest && (
          <Stat id="busiest" label={u.busiestDay}>
            {dateLabel(stats.busiest.date)} · {formatTokens(stats.busiest.total)}
          </Stat>
        )}
        <Stat id="perDay" label={u.perActiveDay}>
          {formatTokens(stats.perActiveDay)}
        </Stat>
        <Stat id="sessions" label={u.sessionsCount}>
          {stats.sessionsCapped ? u.atLeast(stats.sessions) : stats.sessions}
        </Stat>
        {stats.perSession !== null && (
          <Stat id="perSession" label={u.perSession}>
            {formatTokens(stats.perSession)}
          </Stat>
        )}
      </div>
    </div>
  );
}
