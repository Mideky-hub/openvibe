import { describe, expect, it } from "vitest";
import type { NodeRecord } from "@/store/nodes";
import type { TerminalStatus } from "@/store/terminalStatus";
import { resumableTerminals } from "./resumable";

const node = (workspaceId: string) => ({ workspaceId, kind: "terminal", payload: {} }) as unknown as NodeRecord;

describe("resumableTerminals", () => {
  it("lists the stopped terminals of a workspace, unknown status counting as stopped", () => {
    const nodes = { a: node("w1"), b: node("w1"), c: node("w1"), d: node("w1"), e: node("w2"), f: node("w1") };
    const statuses: Record<string, TerminalStatus> = {
      a: { state: "stopped" },
      b: { state: "running" },
      c: { state: "exited", code: 0 },
      d: { state: "error", message: "x" },
      e: { state: "stopped" },
    };
    const onScene = new Set(Object.keys(nodes));
    expect(resumableTerminals(nodes, statuses, "w1", new Set(), onScene)).toEqual(["a", "f"]);
  });

  it("never counts a one-shot command: resuming would run the installer again (spec installation §7)", () => {
    const nodes = { install: { ...node("w1"), payload: { oneShot: true } } as unknown as NodeRecord, agent: node("w1") };
    expect(resumableTerminals(nodes, {}, "w1", new Set(), new Set(["install", "agent"]))).toEqual(["agent"]);
  });

  it("skips terminals still running in Rust after a webview reload", () => {
    const nodes = { a: node("w1") };
    expect(resumableTerminals(nodes, {}, "w1", new Set(["a"]), new Set(["a"]))).toEqual([]);
  });

  it("skips terminals closed from the canvas, whose record stays in memory for undo", () => {
    const nodes = { kept: node("w1"), closed: node("w1") };
    expect(resumableTerminals(nodes, {}, "w1", new Set(), new Set(["kept"]))).toEqual(["kept"]);
  });
});
