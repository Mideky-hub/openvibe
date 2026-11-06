import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { loadAccounts, useAccounts } from "@/accounts/store";
import { AGENTS } from "@/fleet/catalog";
import { useMessages } from "@/i18n";
import { sessionOf, useNodes } from "@/store/nodes";
import { useTokenReport } from "@/usage/tokenReport";
import { bars, byAgent, formatTokens, total } from "@/usage/tokens";
import { shellMessages } from "./messages";

/**
 * The tokens Claude Code logged over 30 days (spec Tokens): a column per day
 * and the part of each agent. Read from the logs on the disk when opened;
 * nothing leaves the machine.
 */
export function TokensView({ onBack }: { onBack: () => void }) {
  const u = useMessages(shellMessages).usage;
  const nodes = useNodes((s) => s.nodes);
  const hasProfiles = useAccounts((s) => s.profiles.length > 0);
  const { report, error } = useTokenReport();

  useEffect(() => {
    void loadAccounts();
  }, []);

  // The Claude conversations of OpenVibe's own agents, by the id it gave them.
  const names = new Map<string, string>();
  for (const record of Object.values(nodes)) {
    const session = sessionOf(record);
    if (session?.claudeSessionId) names.set(session.claudeSessionId, session.name || AGENTS[session.agent].label);
  }

  const columns = report ? bars(report.days) : [];
  const sum = report ? report.days.reduce((n, day) => n + total(day.counts), 0) : 0;
  const peak = Math.max(0, ...columns.map((column) => column.total));
  return (
    <div data-tokens className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={u.tokensBack}
          title={u.tokensBack}
          className="grid size-6 place-items-center rounded-[6px] text-ov-text-2 hover:bg-ov-hover hover:text-ov-text"
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <p className="ov-label">{u.tokensTitle}</p>
      </div>
      {hasProfiles && (
        <p data-tokens-scope className="text-[11px] text-ov-text-3">
          {u.tokensDefaultOnly}
        </p>
      )}
      {error ? (
        <p className="text-[12px] text-ov-danger">{u.tokensFailed(error)}</p>
      ) : !report ? (
        <p className="text-[12px] text-ov-text-2">{u.tokensLoading}</p>
      ) : sum === 0 ? (
        <p className="text-[12px] text-ov-text-2">{u.tokensEmpty}</p>
      ) : (
        <>
          <section className="flex flex-col gap-1.5">
            <div role="img" aria-label={u.tokensChart(formatTokens(peak))} className="flex h-24 items-end gap-[2px]">
              {columns.map((column) => (
                <div
                  key={column.date}
                  data-day={column.date}
                  title={u.tokensDay(column.date, formatTokens(column.total), formatTokens(column.counts.output))}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                >
                  <div className="flex flex-col justify-end overflow-hidden rounded-[2px] bg-ov-line" style={{ height: `${column.height * 100}%` }}>
                    <div className="bg-ov-accent" style={{ height: `${column.outputShare * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between font-mono text-[10px] text-ov-text-3">
              <span>{columns[0]?.date.slice(5)}</span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-sm bg-ov-accent" />
                {u.tokensLegend}
              </span>
              <span>{columns[columns.length - 1]?.date.slice(5)}</span>
            </div>
          </section>
          <section className="flex flex-col gap-1.5">
            <p className="ov-label">{u.tokensByAgent}</p>
            {byAgent(report.sessions, names, u.tokensOtherSessions).map((row) => (
              <div key={row.label} data-agent-row className="flex flex-col text-[12px]">
                <div className="flex items-center gap-2">
                  <span className={row.other ? "text-ov-text-2" : "text-ov-text"}>{row.label}</span>
                  {row.model && <span className="truncate font-mono text-[10.5px] text-ov-text-3">{row.model}</span>}
                  <span className="ml-auto font-mono text-ov-text">{formatTokens(total(row.counts))}</span>
                </div>
                <span className="font-mono text-[10.5px] text-ov-text-3">
                  {u.tokensDetail(formatTokens(row.counts.input), formatTokens(row.counts.output), formatTokens(row.counts.cacheRead + row.counts.cacheWrite))}
                </span>
              </div>
            ))}
          </section>
          {report.models.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <p className="ov-label">{u.tokensByModel}</p>
              {report.models.map((model) => (
                <div key={model.model} className="flex items-center gap-2 text-[12px]">
                  <span className="truncate font-mono text-ov-text-2">{model.model}</span>
                  <span className="ml-auto font-mono text-ov-text">{formatTokens(total(model.counts))}</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}
      <p className="text-[10.5px] text-ov-text-3">
        {report ? `${u.tokensFiles(report.filesScanned)}${report.truncated ? ` · ${u.tokensTruncated}` : ""} · ` : ""}
        {u.tokensLocal}
      </p>
    </div>
  );
}
