import { langStore, messages, type Lang } from "@/i18n";
import { usageMessages } from "./messages";
import { formatDecimal } from "@/i18n/format";
import type { BudgetTone } from "@/mission/mission";

/**
 * Claude's usage (spec maj §6), as each session's status line hands it to
 * OpenVibe: the plan's limits, and the cost, time, code and tokens of the
 * sessions of this run of the app.
 */
export interface Limit {
  usedPercent: number;
  /** Epoch milliseconds. */
  resetsAt: number | null;
}

export interface Limits {
  /** The 5-hour window: « Session ». */
  fiveHour?: Limit;
  /** The 7-day window, all models: « Semaine ». */
  sevenDay?: Limit;
  /** A model's own weekly window (`seven_day_fable`…), when Claude Code sends one. */
  models: { key: string; label: string; limit: Limit }[];
  at: number;
}

export interface SessionUsage {
  sessionId: string;
  nodeId: string;
  model: { id: string; name: string } | null;
  costUsd: number;
  apiMs: number;
  wallMs: number;
  linesAdded: number;
  linesRemoved: number;
  inputTokens: number;
  outputTokens: number;
  contextPercent: number | null;
  /** The prompt cache: warm while it holds, until `expiresAt`. */
  cache: { warm: boolean; hitRatio: number | null; expiresAt: number | null; ttl: string | null } | null;
  at: number;
}

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw | null => (typeof value === "object" && value !== null ? (value as Raw) : null);
const number = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
/** Claude Code gives instants in epoch seconds. */
const millis = (seconds: unknown) => {
  const value = number(seconds);
  return value === null ? null : value * 1000;
};

function readLimit(raw: unknown): Limit | null {
  const r = object(raw);
  const used = number(r?.used_percentage);
  return r && used !== null ? { usedPercent: used, resetsAt: millis(r.resets_at) } : null;
}

const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The later of two readings of a window: the later reset, else the higher use (a window's use only grows). */
function later(a: Limit | undefined, b: Limit | undefined): Limit | undefined {
  if (!a || !b) return a ?? b;
  if ((a.resetsAt ?? 0) !== (b.resetsAt ?? 0)) return (a.resetsAt ?? 0) > (b.resetsAt ?? 0) ? a : b;
  return a.usedPercent >= b.usedPercent ? a : b;
}

/**
 * Each session's status line carries the limits of its own last answer
 * (final review maj §6): an older session's must not take the meter back,
 * and a window missing from a reading stays as it was.
 */
export function mergeLimits(known: Limits | null, read: Limits): Limits {
  if (!known) return read;
  const merged: Limits = { models: [], at: Math.max(known.at, read.at) };
  const fiveHour = later(known.fiveHour, read.fiveHour);
  const sevenDay = later(known.sevenDay, read.sevenDay);
  if (fiveHour) merged.fiveHour = fiveHour;
  if (sevenDay) merged.sevenDay = sevenDay;
  const keys = [...new Set([...known.models, ...read.models].map((m) => m.key))];
  for (const key of keys) {
    const a = known.models.find((m) => m.key === key);
    const b = read.models.find((m) => m.key === key);
    const limit = later(a?.limit, b?.limit)!;
    merged.models.push({ key, label: (b ?? a)!.label, limit });
  }
  return merged;
}

/** A window past its reset starts again from zero, until the next answer says more. */
export function currentLimit(limit: Limit, now: number): Limit {
  return limit.resetsAt !== null && limit.resetsAt <= now ? { usedPercent: 0, resetsAt: null } : limit;
}

/** One status line's JSON: the session's usage, and the limits once the first answer came (null before). */
export function readStatus(raw: unknown, nodeId: string, now: number): { session: SessionUsage | null; limits: Limits | null } {
  const r = object(raw);
  const sessionId = text(r?.session_id);
  if (!r || !sessionId) return { session: null, limits: null };
  const cost = object(r.cost) ?? {};
  const context = object(r.context_window) ?? {};
  const model = object(r.model);
  const cache = object(r.prompt_cache);
  const session: SessionUsage = {
    sessionId,
    nodeId,
    model: model && text(model.id) ? { id: text(model.id)!, name: text(model.display_name) ?? text(model.id)! } : null,
    costUsd: number(cost.total_cost_usd) ?? 0,
    apiMs: number(cost.total_api_duration_ms) ?? 0,
    wallMs: number(cost.total_duration_ms) ?? 0,
    linesAdded: number(cost.total_lines_added) ?? 0,
    linesRemoved: number(cost.total_lines_removed) ?? 0,
    inputTokens: number(context.total_input_tokens) ?? 0,
    outputTokens: number(context.total_output_tokens) ?? 0,
    contextPercent: number(context.used_percentage),
    cache: cache ? { warm: cache.warm === true, hitRatio: number(cache.hit_ratio), expiresAt: millis(cache.expires_at), ttl: text(cache.ttl) } : null,
    at: now,
  };
  const rates = object(r.rate_limits);
  if (!rates) return { session, limits: null };
  const limits: Limits = { models: [], at: now };
  const fiveHour = readLimit(rates.five_hour);
  const sevenDay = readLimit(rates.seven_day);
  if (fiveHour) limits.fiveHour = fiveHour;
  if (sevenDay) limits.sevenDay = sevenDay;
  for (const [key, value] of Object.entries(rates)) {
    const model = /^seven_day_([a-z]+)$/.exec(key)?.[1];
    const limit = readLimit(value);
    if (model && limit) limits.models.push({ key, label: capitalized(model), limit });
  }
  return { session, limits };
}

/**
 * gCO₂e per million tokens, input and output, by model family: claude-carbon's
 * factors (MIT, Gaetan Wittebolle; Jegham et al. 2025, AWS grid 0.287 kgCO₂e/kWh).
 * Order-of-magnitude estimates.
 */
const CO2_FACTORS: Record<string, { input: number; output: number }> = {
  fable: { input: 156, output: 3304 },
  opus: { input: 78, output: 1652 },
  sonnet: { input: 39, output: 826 },
  haiku: { input: 10, output: 207 },
};

export function co2Grams(modelId: string, inputTokens: number, outputTokens: number): number {
  const family = Object.keys(CO2_FACTORS).find((name) => modelId.toLowerCase().includes(name)) ?? "sonnet";
  const factor = CO2_FACTORS[family];
  return (inputTokens * factor.input + outputTokens * factor.output) / 1_000_000;
}

export interface ModelTotal {
  name: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  sessions: number;
  co2Grams: number;
}

/** The sessions added up, and by model, the costliest first. */
export function totals(sessions: readonly SessionUsage[]) {
  const byModel = new Map<string, ModelTotal>();
  for (const s of sessions) {
    const name = s.model?.name ?? messages(usageMessages).unknownModel;
    const row = byModel.get(name) ?? { name, costUsd: 0, inputTokens: 0, outputTokens: 0, sessions: 0, co2Grams: 0 };
    row.costUsd += s.costUsd;
    row.inputTokens += s.inputTokens;
    row.outputTokens += s.outputTokens;
    row.sessions += 1;
    row.co2Grams += co2Grams(s.model?.id ?? "", s.inputTokens, s.outputTokens);
    byModel.set(name, row);
  }
  const sum = (pick: (s: SessionUsage) => number) => sessions.reduce((total, s) => total + pick(s), 0);
  const models = [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd);
  return {
    sessions: sessions.length,
    costUsd: sum((s) => s.costUsd),
    apiMs: sum((s) => s.apiMs),
    wallMs: sum((s) => s.wallMs),
    linesAdded: sum((s) => s.linesAdded),
    linesRemoved: sum((s) => s.linesRemoved),
    co2Grams: models.reduce((total, m) => total + m.co2Grams, 0),
    byModel: models,
  };
}

/** The prompt cache lists the sessions that can still be warm: a node still on the canvas, its latest session only. */
export function liveCacheSessions(sessions: readonly SessionUsage[], nodeIds: ReadonlySet<string>): SessionUsage[] {
  const latest = new Map<string, SessionUsage>();
  for (const s of sessions) {
    if (!s.cache || !nodeIds.has(s.nodeId)) continue;
    const known = latest.get(s.nodeId);
    if (!known || s.at >= known.at) latest.set(s.nodeId, s);
  }
  return [...latest.values()];
}

/** « 0,0074 $ », « 12,50 $ »; "$0.0074", "$12.50" in English. */
export function formatUsd(usd: number, lang: Lang = langStore.getState().lang): string {
  const amount = formatDecimal(usd, usd < 0.1 ? 4 : 2, lang);
  return lang === "fr" ? `${amount} $` : `$${amount}`;
}

/** A limit's colour: like a budget, orange from 70 %, red from 90 %. */
export function limitTone(usedPercent: number): BudgetTone {
  return usedPercent >= 90 ? "over" : usedPercent >= 70 ? "late" : "ok";
}
