import { describe, expect, it } from "vitest";
import type { GoalsPayload } from "@/nodes/types";
import { addGoal, doneCount, editGoal, moveGoal, removeGoal, toggleGoal } from "./list";

const ids = () => {
  let n = 0;
  return () => `g${++n}`;
};

function list(): GoalsPayload {
  const newId = ids();
  let goals: GoalsPayload = { goals: [] };
  for (const text of ["a", "b", "c"]) goals = addGoal(goals, text, newId);
  return goals;
}

const texts = (goals: GoalsPayload) => goals.goals.map((g) => g.text);

describe("goals list (issue #36)", () => {
  it("adds a goal at the end, trimmed and not done", () => {
    const goals = addGoal({ goals: [] }, "  Ship the beta  ", () => "g1");
    expect(goals).toEqual({ goals: [{ id: "g1", text: "Ship the beta", done: false }] });
  });

  it("refuses a blank goal", () => {
    const empty: GoalsPayload = { goals: [] };
    expect(addGoal(empty, "   ")).toBe(empty);
  });

  it("ticks and unticks a goal, leaving its input untouched", () => {
    const before = list();
    const ticked = toggleGoal(before, "g2");
    expect(ticked.goals.map((g) => g.done)).toEqual([false, true, false]);
    expect(before.goals[1].done).toBe(false);
    expect(toggleGoal(ticked, "g2").goals[1].done).toBe(false);
  });

  it("edits a goal's text; a blank edit keeps the old text", () => {
    const goals = list();
    expect(texts(editGoal(goals, "g1", " A1 "))).toEqual(["A1", "b", "c"]);
    expect(editGoal(goals, "g1", "  ")).toBe(goals);
  });

  it("removes a goal", () => {
    expect(texts(removeGoal(list(), "g2"))).toEqual(["a", "c"]);
  });

  it("moves a goal to an index, clamped to the list", () => {
    expect(texts(moveGoal(list(), "g3", 0))).toEqual(["c", "a", "b"]);
    expect(texts(moveGoal(list(), "g1", 1))).toEqual(["b", "a", "c"]);
    expect(texts(moveGoal(list(), "g1", 99))).toEqual(["b", "c", "a"]);
    expect(texts(moveGoal(list(), "g2", -1))).toEqual(["b", "a", "c"]);
  });

  it("leaves the list as it is for an unknown goal or a move in place", () => {
    const goals = list();
    expect(toggleGoal(goals, "x")).toBe(goals);
    expect(editGoal(goals, "x", "y")).toBe(goals);
    expect(removeGoal(goals, "x")).toBe(goals);
    expect(moveGoal(goals, "x", 0)).toBe(goals);
    expect(moveGoal(goals, "g2", 1)).toBe(goals);
  });

  it("counts the goals reached", () => {
    expect(doneCount(toggleGoal(toggleGoal(list(), "g1"), "g3"))).toBe(2);
  });
});
