import { useEffect, useState } from "react";
import { tokenUsage, type TokenReport } from "@/ipc/tokens";

/** A scan this recent serves again: the usage detail and the Tokens view opened from it read the disk once. */
export const REPORT_FRESH_MS = 60_000;

let cached: { at: number; report: Promise<TokenReport> } | null = null;

/** Claude's logs over 30 days (spec Tokens), read again once a scan is older than `REPORT_FRESH_MS` or failed. */
export function loadTokenReport(now = Date.now()): Promise<TokenReport> {
  if (!cached || now - cached.at > REPORT_FRESH_MS) {
    const report = tokenUsage();
    const entry = { at: now, report };
    cached = entry;
    report.catch(() => {
      if (cached === entry) cached = null;
    });
  }
  return cached.report;
}

/** For tests. */
export function forgetTokenReport() {
  cached = null;
}

/** The report once read, or why it could not be. */
export function useTokenReport(): { report: TokenReport | null; error: string | null } {
  const [report, setReport] = useState<TokenReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadTokenReport().then(
      (next) => alive && setReport(next ?? null),
      (failure: unknown) => alive && setError(failure instanceof Error ? failure.message : String(failure)),
    );
    return () => {
      alive = false;
    };
  }, []);
  return { report, error };
}
