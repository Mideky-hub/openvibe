import { call } from "./invoke";

/** The four counters Claude Code logs for a message. */
export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** The agent whose logs a session comes from; mirrors `tokens::Agent`. */
export type TokenAgent = "claude" | "codex";

/** What Rust read from Claude's and Codex's local logs over the last 30 days (spec Tokens); mirrors `tokens::Report`. */
export interface TokenReport {
  days: { date: string; counts: TokenCounts }[];
  sessions: { sessionId: string; agent: TokenAgent; model: string | null; counts: TokenCounts }[];
  models: { model: string; counts: TokenCounts }[];
  filesScanned: number;
  truncated: boolean;
}

export const tokenUsage = () => call<TokenReport>("token_usage");
