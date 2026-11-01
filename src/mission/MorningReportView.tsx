import { useMessages } from "@/i18n";
import { useNow } from "@/lib/useNow";
import type { Mission } from "./mission";
import { missionMessages } from "./messages";
import { morningReport, type MorningRow } from "./morning";

function Rows({ title, rows }: { title: string; rows: MorningRow[] }) {
  const t = useMessages(missionMessages);
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-semibold text-ov-text">{t.morning.count(title, rows.length)}</span>
      <ul className="flex flex-col gap-0.5">
        {rows.map((row, i) => (
          <li key={`${row.agent}-${row.task}-${i}`} title={row.summary} className="rounded bg-ov-card px-2 py-1">
            <div className="flex items-center gap-2">
              <span className="min-w-0 truncate text-ov-text">{row.task}</span>
              {row.status && row.status !== "termine" && <span className="shrink-0 text-ov-danger">{t.report[row.status]}</span>}
              {row.merged && <span className="shrink-0">{t.merged}</span>}
              <span className="ml-auto shrink-0 font-mono text-[11px]">
                {row.agent} · {t.spent(row.minutes, row.budgetMin)}
              </span>
            </div>
            {row.summary && <p className="line-clamp-2">{row.summary}</p>}
            <p className="truncate font-mono text-[11px]">{row.branch}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the user reads on coming back: done, failed, what to check by hand, time spent (spec mission de nuit §6.2). */
export function MorningReportView({ mission }: { mission: Mission }) {
  const t = useMessages(missionMessages);
  const now = useNow(60_000);
  const report = morningReport(mission, now);
  return (
    <div data-morning className="flex flex-col gap-1.5">
      <header className="flex items-center gap-2">
        <span className="font-semibold uppercase tracking-[0.08em] text-ov-text">{t.morning.title}</span>
        <span className="ml-auto font-mono text-[11px]">{t.morning.time(report.elapsedMin, report.awayMin)}</span>
      </header>
      {report.check.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-ov-text">{t.morning.count(t.morning.check, report.check.length)}</span>
          <ul className="flex list-disc flex-col gap-0.5 pl-4">
            {report.check.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <Rows title={t.morning.done} rows={report.done} />
      <Rows title={t.morning.failed} rows={report.failed} />
      <Rows title={t.morning.unfinished} rows={report.unfinished} />
      {report.waiting.length > 0 && <p>{t.morning.waiting(report.waiting.map((task) => task.title).join(", "))}</p>}
    </div>
  );
}
