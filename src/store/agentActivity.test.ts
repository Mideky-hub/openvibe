import { beforeEach, describe, expect, it } from "vitest";
import { agentActivityStore } from "./agentActivity";

const state = () => agentActivityStore.getState();

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

  it("drops an event older than the one it holds, and keeps a live event over an older snapshot", () => {
    state().apply({ nodeId: "a", activity: "waiting", since: 20 });
    state().apply({ nodeId: "a", activity: "working", since: 10 });
    expect(state().activities.a).toEqual({ activity: "waiting", since: 20 });
    state().load([{ nodeId: "a", activity: "working", since: 15 }]);
    expect(state().activities.a).toEqual({ activity: "waiting", since: 20 });
  });

  it("forgets a terminal whose process exited", () => {
    state().apply({ nodeId: "a", activity: "idle", since: 1 });
    state().remove("a");
    expect(state().activities).toEqual({});
  });
});
