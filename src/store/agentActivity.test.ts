import { beforeEach, describe, expect, it } from "vitest";
import { agentActivityStore } from "./agentActivity";

const state = () => agentActivityStore.getState();

it("keeps the message of a wait, from a change and from Rust's state", () => {
  state().apply({ nodeId: "m", activity: "waiting", since: 1, message: "May I?" });
  expect(state().activities.m.message).toBe("May I?");
  state().apply({ nodeId: "m", activity: "working", since: 2 });
  expect(state().activities.m.message).toBeUndefined();
  state().load([{ nodeId: "n", activity: "waiting", since: 1, message: "Still?" }]);
  expect(state().activities.n.message).toBe("Still?");
});

beforeEach(() => state().load([]));

describe("agent activity store", () => {
  it("applies each change from Rust", () => {
    state().apply({ nodeId: "a", activity: "working", since: 10 });
    state().apply({ nodeId: "a", activity: "waiting", since: 20 });
    expect(state().activities).toEqual({ a: { activity: "waiting", since: 20 } });
  });

  it("starts again from Rust's snapshot after a reload, dropping what it no longer runs", () => {
    state().apply({ nodeId: "gone", activity: "working", since: 1 });
    state().load([{ nodeId: "a", activity: "working", since: 5 }]);
    expect(state().activities).toEqual({ a: { activity: "working", since: 5 } });
  });

  it("forgets a terminal whose process exited", () => {
    state().apply({ nodeId: "a", activity: "idle", since: 1 });
    state().remove("a");
    expect(state().activities).toEqual({});
  });
});
