import { useState, type ReactNode } from "react";
import { BUDGET_COLOR } from "@/canvas/overlay/timeline";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AGENTS } from "@/fleet/catalog";
import { useMessages } from "@/i18n";
import { formatClock, formatDecimal } from "@/i18n/format";
import { formatDuration } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { sessionOf, useNodes } from "@/store/nodes";
import { currentLimit, formatUsd, limitTone, liveCacheSessions, totals, type Limit, type Limits } from "@/usage/usage";
import { useUsage } from "@/usage/usageStore";
import { shellMessages } from "./messages";
import { TokensView } from "./TokensView";

/** « 67,8 k », « 1,2 M » tokens. */
function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${formatDecimal(count / 1_000_000, 1)} M`;
  if (count >= 1_000) return `${formatDecimal(count / 1_000, 1)} k`;
  return String(count);
}

function Bar({ limit, wide = false }: { limit: Limit; wide?: boolean }) {
  const tone = limitTone(limit.usedPercent);
  return (
    <span data-tone={tone} className={wide ? "block h-1.5 w-full rounded-full bg-ov-line" : "block h-1 w-8 rounded-full bg-ov-line"}>
      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, limit.usedPercent)}%`, backgroundColor: BUDGET_COLOR[tone] }} />
    </span>
  );
}

/**
 * The title bar's usage (spec maj §6): the plan's session and week, from
 * Claude's status lines; the detail of this run's sessions on a click.
 */
/** The limits as of now: a window past its reset shows as reset (final review maj §6). */
function useCurrentLimits(): Limits | null {
  const limits = useUsage((s) => s.limits);
  const now = useNow(60_000);
  if (!limits) return null;
  return {
    ...limits,
    fiveHour: limits.fiveHour && currentLimit(limits.fiveHour, now),
    sevenDay: limits.sevenDay && currentLimit(limits.sevenDay, now),
    models: limits.models.map((m) => ({ ...m, limit: currentLimit(m.limit, now) })),
  };
}

export function UsageMeter() {
  const t = useMessages(shellMessages);
  const u = t.usage;
  const limits = useCurrentLimits();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-usage
          title={limits ? u.titleWithLimits : u.titleWithoutLimits}
          className="flex h-6 items-center gap-2 rounded-[6px] px-1.5 font-mono text-[11.5px] text-ov-text-2 hover:bg-ov-hover hover:text-ov-text"
        >
          {!limits?.fiveHour && !limits?.sevenDay && !limits?.models.length ? (
            u.title
          ) : (
            <>
              {limits.fiveHour && (
                <span className="flex items-center gap-1">
                  {u.session} {t.percent(Math.round(limits.fiveHour.usedPercent))}<Bar limit={limits.fiveHour} />
                </span>
              )}
              {limits.sevenDay && (
                <span className="flex items-center gap-1">
                  {u.week} {t.percent(Math.round(limits.sevenDay.usedPercent))}<Bar limit={limits.sevenDay} />
                </span>
              )}
              {limits.models.map((m) => (
                <span key={m.key} className="flex items-center gap-1">
                  {m.label} {t.percent(Math.round(m.limit.usedPercent))}<Bar limit={m.limit} />
                </span>
              ))}
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px]">
        <UsageContent />
      </PopoverContent>
    </Popover>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <p className="ov-label">{title}</p>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="text-ov-text-2">{label}</span>
      <span className="ml-auto text-right font-mono text-ov-text">{children}</span>
    </div>
  );
}

function LimitRow({ label, limit, now }: { label: string; limit: Limit; now: number }) {
  const t = useMessages(shellMessages);
  return (
    <div className="flex flex-col gap-1">
      <Row label={label}>
        {t.percent(Math.round(limit.usedPercent))}
        {limit.resetsAt ? t.usage.resumes(formatClock(limit.resetsAt, now)) : ""}
      </Row>
      <Bar limit={limit} wide />
    </div>
  );
}

/** The usage detail, or the 30-day tokens it links to (spec Tokens §4). */
function UsageContent() {
  const [tokens, setTokens] = useState(false);
  return tokens ? <TokensView onBack={() => setTokens(false)} /> : <UsageDetail onTokens={() => setTokens(true)} />;
}

function UsageDetail({ onTokens }: { onTokens: () => void }) {
  const t = useMessages(shellMessages);
  const u = t.usage;
  const limits = useCurrentLimits();
  const sessions = useUsage((s) => s.sessions);
  const nodes = useNodes((s) => s.nodes);
  const now = useNow(30_000);
  const list = Object.values(sessions);
  const warm = liveCacheSessions(list, new Set(Object.keys(nodes)));
  const sum = totals(list);
  const fable = limits?.models.find((m) => m.label === "Fable");
  const nameOf = (nodeId: string) => {
    const session = sessionOf(nodes[nodeId]);
    return session ? session.name || AGENTS[session.agent].label : u.closedSession;
  };
  return (
    <div data-usage-detail className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
      <Section title={u.limitsTitle}>
        {limits?.fiveHour ? <LimitRow label={u.session5h} limit={limits.fiveHour} now={now} /> : <Row label={u.session5h}>—</Row>}
        {limits?.sevenDay ? <LimitRow label={u.weekAll} limit={limits.sevenDay} now={now} /> : <Row label={u.weekAll}>—</Row>}
        {fable ? (
          <LimitRow label={u.weekFable} limit={fable.limit} now={now} />
        ) : (
          <Row label={u.weekFable}>
            <span className="font-sans text-ov-text-3" title={u.notSentHint}>
              {u.notSent}
            </span>
          </Row>
        )}
        {limits?.models
          .filter((m) => m.label !== "Fable")
          .map((m) => (
            <LimitRow key={m.key} label={u.weekModel(m.label)} limit={m.limit} now={now} />
          ))}
      </Section>
      <Section title={u.sessionsTitle(sum.sessions)}>
        <Row label={u.totalCost}>{formatUsd(sum.costUsd)}</Row>
        <Row label={u.apiTime}>{formatDuration(sum.apiMs)}</Row>
        <Row label={u.wallTime}>{formatDuration(sum.wallMs)}</Row>
        <Row label={u.code}>
          <span style={{ color: "var(--ov-ok)" }}>+{sum.linesAdded}</span> <span style={{ color: "var(--ov-danger)" }}>−{sum.linesRemoved}</span>
        </Row>
        <Row label={<span title={u.co2Hint}>{u.co2}</span>}>
          {sum.co2Grams < 10 ? formatDecimal(sum.co2Grams, 1) : Math.round(sum.co2Grams)} g
        </Row>
      </Section>
      {sum.byModel.length > 0 && (
        <Section title={u.byModel}>
          {sum.byModel.map((m) => (
            <Row key={m.name} label={m.name}>
              {formatUsd(m.costUsd)} · {u.tokens(formatTokens(m.inputTokens), formatTokens(m.outputTokens))}
            </Row>
          ))}
        </Section>
      )}
      {warm.length > 0 && (
        <Section title={u.cache}>
          {warm
            .map((s) => (
              <Row key={s.sessionId} label={`${nameOf(s.nodeId)} · ${s.model?.name ?? ""}`}>
                {s.cache!.warm && (s.cache!.expiresAt === null || s.cache!.expiresAt > now)
                  ? u.warm(s.cache!.hitRatio !== null ? Math.round(s.cache!.hitRatio * 100) : null, s.cache!.expiresAt ? formatClock(s.cache!.expiresAt, now) : null)
                  : u.cold}
              </Row>
            ))}
        </Section>
      )}
      <button
        type="button"
        onClick={onTokens}
        className="self-start rounded-[6px] px-2 py-1 text-[12px] text-ov-accent hover:bg-ov-hover"
      >
        {u.tokensLink} →
      </button>
      <p className="text-[10.5px] text-ov-text-3">{u.footnote}</p>
    </div>
  );
}
