import { describe, expect, it } from "vitest";
import type { TokenCounts, TokenReport } from "@/ipc/tokens";
import { bars, byAgent, MAX_AGENT_ROWS, total } from "./tokens";

const c = (input: number, output: number, cacheRead = 0, cacheWrite = 0): TokenCounts => ({ input, output, cacheRead, cacheWrite });

describe("total", () => {
  it("adds the four counters", () => expect(total(c(1, 2, 3, 4))).toBe(10));
});

describe("bars", () => {
  it("scales each day to the busiest one, the output being a part of its bar", () => {
    const days = [
      { date: "2026-10-30", counts: c(0, 0) },
      { date: "2026-10-31", counts: c(50, 50) },
      { date: "2026-10-29", counts: c(10, 10) },
    ];
    expect(bars(days)).toEqual([
      { date: "2026-10-30", total: 0, height: 0, outputShare: 0, counts: c(0, 0) },
      { date: "2026-10-31", total: 100, height: 1, outputShare: 0.5, counts: c(50, 50) },
      { date: "2026-10-29", total: 20, height: 0.2, outputShare: 0.5, counts: c(10, 10) },
    ]);
  });

  it("keeps a non-empty day visible and an all-empty window flat", () => {
    expect(bars([{ date: "d", counts: c(1, 0) }, { date: "e", counts: c(100000, 0) }])[0].height).toBeGreaterThanOrEqual(0.02);
    expect(bars([{ date: "d", counts: c(0, 0) }])[0].height).toBe(0);
  });
});

describe("byAgent", () => {
  const sessions: TokenReport["sessions"] = [
    { sessionId: "s-isis", agent: "claude", model: "claude-opus-5-5", counts: c(1, 100) },
    { sessionId: "s-isis-old", agent: "claude", model: "claude-opus-5-5", counts: c(1, 50) },
    { sessionId: "s-thot", agent: "claude", model: "claude-haiku-5-5", counts: c(1, 30) },
    { sessionId: "s-other", agent: "claude", model: null, counts: c(1, 5) },
  ];
  const names = new Map([["s-isis", "Isis"], ["s-isis-old", "Isis"], ["s-thot", "Thot"]]);
  const others = { claude: "Autres sessions", codex: "Sessions Codex" };

  it("names the sessions of OpenVibe's agents, merges an agent's sessions, and groups the rest", () => {
    const rows = byAgent(sessions, names, others);
    expect(rows.map((r) => [r.label, r.counts.output])).toEqual([["Isis", 150], ["Thot", 30], ["Autres sessions", 5]]);
    expect(rows[0].model).toBe("claude-opus-5-5");
    expect(rows[2].other).toBe(true);
  });

  it("groups Codex's sessions apart from Claude's, with their main model", () => {
    const codex: TokenReport["sessions"] = [
      { sessionId: "c1", agent: "codex", model: "gpt-5-codex", counts: c(10, 40) },
      { sessionId: "c2", agent: "codex", model: "gpt-5", counts: c(1, 2) },
    ];
    const rows = byAgent([...sessions, ...codex], names, others);
    expect(rows.map((r) => [r.label, r.counts.output])).toEqual([
      ["Isis", 150],
      ["Sessions Codex", 42],
      ["Thot", 30],
      ["Autres sessions", 5],
    ]);
    expect(rows[1]).toMatchObject({ model: "gpt-5-codex", other: true });
  });

  it("shows the biggest rows only, and sums the rest", () => {
    const many = Array.from({ length: MAX_AGENT_ROWS + 3 }, (_, i) => ({ sessionId: `s${i}`, model: null, agent: "claude" as const, counts: c(0, 100 - i) }));
    const rows = byAgent(many, new Map(many.map((s, i) => [s.sessionId, `A${i}`])), { claude: "Autres", codex: "Codex" });
    expect(rows).toHaveLength(MAX_AGENT_ROWS + 1);
    expect(rows[rows.length - 1].label).toBe("…");
    expect(rows[rows.length - 1].counts.output).toBe(many.slice(MAX_AGENT_ROWS).reduce((n, s) => n + s.counts.output, 0));
  });
});
