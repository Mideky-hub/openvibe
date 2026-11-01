import { describe, expect, it } from "vitest";
import { readFilePayload, readOrchestratorPayload, readTerminalPayload } from "./types";

describe("readTerminalPayload", () => {
  it("reads a payload saved before agents and names existed", () => {
    expect(readTerminalPayload({ title: "Claude Code · api", cwd: "C:/api", preset: "claude", command: "", shell: "cmd", claudeSessionId: "s1" })).toEqual({
      title: "Claude Code · api",
      name: "",
      agent: "claude",
      cwd: "C:/api",
      shell: "cmd",
      command: "",
      claudeSessionId: "s1",
    });
  });

  it("keeps a current payload as it is", () => {
    const payload = {
      title: "Ollama · api",
      name: "Isis",
      agent: "ollama",
      cwd: "C:/api",
      shell: "powershell",
      command: "",
      ollama: { model: "llama3", mode: "code" },
    };
    expect(readTerminalPayload(payload)).toEqual(payload);
  });

  it("rejects what cannot be launched", () => {
    expect(readTerminalPayload(null)).toBeNull();
    expect(readTerminalPayload({ agent: "vim", cwd: "C:/" })).toBeNull();
    expect(readTerminalPayload({ agent: "shell" })).toBeNull();
    expect(readTerminalPayload({ agent: "shell", cwd: "C:/", shell: "zsh" })?.shell).toBe("default");
  });
});

describe("readOrchestratorPayload", () => {
  it("keeps the given name and names the others Orchestrateur", () => {
    expect(readOrchestratorPayload({ name: "Chef" })).toEqual({ name: "Chef" });
    expect(readOrchestratorPayload({ name: "  " })).toEqual({ name: "Orchestrateur" });
    expect(readOrchestratorPayload({})).toEqual({ name: "Orchestrateur" });
    expect(readOrchestratorPayload(null)).toEqual({ name: "Orchestrateur" });
  });
});

describe("an orchestrator's session (spec orchestrateur §6)", () => {
  const session = { title: "Chef", name: "Chef", agent: "claude", cwd: "C:/code", shell: "default", command: "", claudeSessionId: "s1", role: "orchestrator" };

  it("reads it back as the orchestrator's Claude session", () => {
    expect(readOrchestratorPayload({ name: "Chef", session })).toEqual({ name: "Chef", session });
    expect(readTerminalPayload(session)?.role).toBe("orchestrator");
  });

  it("keeps the model the router chose (spec maj §3)", () => {
    expect(readTerminalPayload({ ...session, model: "claude-haiku-5-5" })?.model).toBe("claude-haiku-5-5");
    expect(readTerminalPayload({ ...session, model: 4 })?.model).toBeUndefined();
  });

  it("keeps Remote Control on (spec maj §2)", () => {
    expect(readTerminalPayload({ ...session, remoteControl: true })?.remoteControl).toBe(true);
    expect(readTerminalPayload({ ...session, remoteControl: "oui" })?.remoteControl).toBeUndefined();
  });

  it("drops a session that is not Claude's or cannot launch", () => {
    expect(readOrchestratorPayload({ name: "Chef", session: { ...session, agent: "shell" } })).toEqual({ name: "Chef" });
    expect(readOrchestratorPayload({ name: "Chef", session: 3 })).toEqual({ name: "Chef" });
  });
});

it("reads an orchestrator's mission with it (spec orchestrateur §7)", () => {
  const mission = { state: "plan", maxAgents: 4, name: "Auth", members: [] };
  expect(readOrchestratorPayload({ name: "Chef", mission })).toEqual({ name: "Chef", mission });
  expect(readOrchestratorPayload({ name: "Chef", mission: { state: "?" } })).toEqual({ name: "Chef" });
});

describe("readFilePayload", () => {
  it("keeps a usable path", () => {
    expect(readFilePayload({ path: "docs/a.md", extra: 1 })).toEqual({ path: "docs/a.md" });
  });

  it("refuses a missing, blank or non-text path", () => {
    expect(readFilePayload(null)).toBeNull();
    expect(readFilePayload({})).toBeNull();
    expect(readFilePayload({ path: "  " })).toBeNull();
    expect(readFilePayload({ path: 3 })).toBeNull();
  });
});
