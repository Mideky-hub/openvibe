import { describe, expect, it } from "vitest";
import { agentsText, countsText, groupsText, livingAgents, membersIn, waitingText } from "./groupSummary";

describe("countsText", () => {
  it("shows the members and those at work", () => {
    expect(countsText(4, 2)).toBe("4 · 2 en cours");
  });

  it("says inactif when nobody works", () => {
    expect(countsText(3, 0)).toBe("3 · inactif");
    expect(countsText(0, 0)).toBe("0 · inactif");
  });
});

describe("livingAgents", () => {
  it("names the members still running, in group order", () => {
    const names: Record<string, string> = { a: "Isis", b: "Osiris", c: "Horus" };
    expect(livingAgents(["a", "b", "c"], (id) => names[id], (id) => id !== "b")).toEqual(["Isis", "Horus"]);
  });
});

describe("waitingText", () => {
  it("adds the members waiting for an answer, in amber", () => {
    expect(waitingText(1)).toBe("· 1 attend");
    expect(waitingText(3)).toBe("· 3 attendent");
    expect(waitingText(0)).toBeNull();
  });
});

describe("agentsText / groupsText", () => {
  it("counts in French with the singular", () => {
    expect(agentsText(1)).toBe("1 agent");
    expect(agentsText(8)).toBe("8 agents");
    expect(groupsText(0)).toBe("0 groupe");
    expect(groupsText(2)).toBe("2 groupes");
  });
});

describe("membersIn", () => {
  it("counts only members whose process runs", () => {
    const activities: Record<string, string> = { a: "working", b: "working", c: "waiting" };
    const running = (id: string) => id !== "b";
    expect(membersIn(["a", "b", "c"], "working", (id) => activities[id], running)).toBe(1);
    expect(membersIn(["a", "b", "c"], "waiting", (id) => activities[id], running)).toBe(1);
  });
});
