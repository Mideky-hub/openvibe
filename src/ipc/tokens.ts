import { call } from "./invoke";

/** The four counters Claude Code logs for a message. */
export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** What Rust read from Claude's local logs over the last 30 days (spec Tokens); mirrors `tokens::Report`. */
export interface TokenReport {
  days: { date: string; counts: TokenCounts }[];
  sessions: { sessionId: string; model: string | null; counts: TokenCounts }[];
  models: { model: string; counts: TokenCounts }[];
  filesScanned: number;
  truncated: boolean;
}

export const tokenUsage = () => call<TokenReport>("token_usage");
