import { describe, expect, it } from "vitest";
import type { TerminalPayload } from "@/nodes/types";
import { cloneTerminalPayload } from "./clone";

const claude: TerminalPayload = {
  title: "Claude · api",
  name: "Isis",
  agent: "claude",
  cwd: "C:/api",
  shell: "cmd",
  command: "",
  claudeSessionId: "s1",
};

describe("cloneTerminalPayload", () => {
  it("keeps agent, folder and shell; gives a new name and a new conversation", () => {
    const copy = cloneTerminalPayload(claude, "Osiris");
    expect(copy).toMatchObject({ title: "Claude · api", agent: "claude", cwd: "C:/api", shell: "cmd", name: "Osiris" });
    expect(copy.claudeSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(copy.claudeSessionId).not.toBe("s1");
  });

  it("gives no conversation to other agents", () => {
    const copy = cloneTerminalPayload({ ...claude, agent: "codex", claudeSessionId: undefined }, "Horus");
    expect(copy.claudeSessionId).toBeUndefined();
  });
});

it("leaves the source's steps behind: they belong to its conversation (final review H1)", () => {
  const copy = cloneTerminalPayload({ ...claude, steps: [{ title: "Plan", state: "en_cours" }] }, "Osiris");
  expect(copy.steps).toBeUndefined();
});

it("leaves the router's model and Remote Control behind: they were the source's (final review maj §3)", () => {
  const copy = cloneTerminalPayload({ ...claude, model: "claude-haiku-5-5", remoteControl: true }, "Osiris");
  expect(copy.model).toBeUndefined();
  expect(copy.remoteControl).toBeUndefined();
});

it("copies a one-shot terminal as a plain shell: an install never runs again unasked (review)", () => {
  const install: TerminalPayload = { ...claude, agent: "custom", command: "irm https://x | iex", oneShot: true, claudeSessionId: undefined };
  const copy = cloneTerminalPayload(install, "Osiris");
  expect(copy).toMatchObject({ agent: "shell", command: "", cwd: "C:/api", shell: "cmd" });
  expect(copy.oneShot).toBeUndefined();
});
