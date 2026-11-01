import { describe, expect, it } from "vitest";
import { morningReport, morningShown } from "./morning";
import { NEW_MISSION, type Member, type Mission } from "./mission";

const min = 60_000;
const member = (nodeId: string, name: string, extra: Partial<Member> = {}): Member => ({ nodeId, name, task: "Login", budgetMin: 20, linked: false, branch: `b-${name}`, worktree: "w", sentAt: 0, ...extra });
const night = (mission: Partial<Mission>): Mission => ({ ...NEW_MISSION, state: "terminee", overnight: true, budgetMin: 480, startedAt: 0, endedAt: 300 * min, ...mission });
const report = (status: "termine" | "bloque" | "echec", at = 30 * min) => ({ summary: `Résumé ${status}`, status, at });

describe("what the morning report gathers (spec mission de nuit §6.2)", () => {
  it("sorts the tasks: done, then failed or blocked, each with its agent, time and branch", () => {
    const result = morningReport(night({ members: [member("n1", "Isis", { report: report("termine"), merged: true }), member("n2", "Horus", { task: "API", report: report("echec", 25 * min) }), member("n3", "Thot", { task: "Docs", report: report("bloque") })] }), 400 * min);
    expect(result.done).toEqual([{ task: "Login", agent: "Isis", minutes: 30, budgetMin: 20, branch: "b-Isis", summary: "Résumé termine", merged: true, status: "termine" }]);
    expect(result.failed.map((r) => [r.task, r.status])).toEqual([["API", "echec"], ["Docs", "bloque"]]);
    expect(result.unfinished).toEqual([]);
  });

  it("counts every task an agent went through, abandoned ones too", () => {
    const past = [
      { task: "Login", status: "termine" as const, summary: "ok", merged: true, spentMin: 12.4, budgetMin: 20, branch: "b" },
      { task: "Vieux", status: "bloque" as const, summary: "coincé", merged: false, spentMin: 3, budgetMin: 20, branch: "b" },
    ];
    const result = morningReport(night({ members: [member("n1", "Isis", { task: "API", past, report: report("termine") })] }), 400 * min);
    expect(result.done.map((r) => [r.task, r.minutes])).toEqual([["Login", 12], ["API", 30]]);
    expect(result.failed.map((r) => r.task)).toEqual(["Vieux"]);
  });

  it("shows what was still running at the end, its time stopped there", () => {
    const result = morningReport(night({ members: [member("n1", "Isis")] }), 400 * min);
    expect(result.unfinished).toEqual([{ task: "Login", agent: "Isis", minutes: 300, budgetMin: 20, branch: "b-Isis", summary: "", merged: false }]);
  });

  it("leaves out a task handed to another agent: the next one tells it", () => {
    const result = morningReport(night({ members: [member("n1", "Isis", { handedTo: "Horus" }), member("n2", "Horus", { report: report("termine") })] }), 400 * min);
    expect(result.done.map((r) => r.agent)).toEqual(["Horus"]);
    expect(result.unfinished).toEqual([]);
  });

  it("lists the tasks left in the queue", () => {
    expect(morningReport(night({ members: [], queue: [{ title: "API", brief: "b", budgetMin: 5 }] }), 0).waiting.map((t) => t.title)).toEqual(["API"]);
  });

  it("gathers what to check by hand: the agents', named, and the orchestrator's", () => {
    const past = [{ task: "Login", status: "termine" as const, summary: "ok", merged: true, spentMin: 1, budgetMin: 2, branch: "b", check: "Le bouton sur Windows 10" }];
    const result = morningReport(night({ handChecks: ["Relire la migration"], members: [member("n1", "Isis", { task: "API", past, report: { ...report("termine"), check: "La vue en anglais" } })] }), 400 * min);
    expect(result.check).toEqual(["Relire la migration", "Isis · Login : Le bouton sur Windows 10", "Isis · API : La vue en anglais"]);
  });

  it("gives the time spent against the time away, and the end when the mission ended", () => {
    expect(morningReport(night({ members: [] }), 900 * min)).toMatchObject({ elapsedMin: 300, awayMin: 480 });
    expect(morningReport(night({ state: "en_cours", endedAt: undefined, members: [] }), 500 * min).elapsedMin).toBe(500);
  });
});

describe("when it shows", () => {
  it("shows for a finished night, and for one whose time ran out with nobody to finish it", () => {
    expect(morningShown(night({ members: [] }), 0)).toBe(true);
    expect(morningShown(night({ state: "en_cours", endedAt: undefined, members: [] }), 480 * min)).toBe(true);
    expect(morningShown(night({ state: "en_cours", endedAt: undefined, members: [] }), 100 * min)).toBe(false);
  });

  it("never shows outside a night", () => {
    expect(morningShown({ ...night({ members: [] }), overnight: undefined }, 0)).toBe(false);
  });
});
