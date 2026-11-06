import { describe, expect, it } from "vitest";
import { readTerminalPayload } from "@/nodes/types";
import { buildSpawnSpec, defaultTitle, newConversation, newTerminalPayload, orchestratorSession, switchedAgent } from "./launch";

const base = { title: "", cwd: "C:\\code\\openvibe", agent: "shell" as const, command: "", shell: "default" as const };

describe("defaultTitle", () => {
  it("names the terminal after the agent and the folder", () => {
    expect(defaultTitle("claude", "C:\\code\\openvibe\\")).toBe("Claude · openvibe");
    expect(defaultTitle("shell", "/home/me/api")).toBe("Shell · api");
    expect(defaultTitle("aider", "")).toBe("Aider");
  });
});

describe("newTerminalPayload", () => {
  it("fills a blank title, trims the custom command and keeps the given name", () => {
    const payload = newTerminalPayload({ ...base, agent: "custom", command: "  npm run dev " }, "Thot");
    expect(payload.title).toBe("Personnalisé · openvibe");
    expect(payload.command).toBe("npm run dev");
    expect(payload.name).toBe("Thot");
    expect(payload.claudeSessionId).toBeUndefined();
  });

  it("gives every Claude terminal its own session id", () => {
    const a = newTerminalPayload({ ...base, agent: "claude", title: "Agent" });
    const b = newTerminalPayload({ ...base, agent: "claude", title: "Agent" });
    expect(a.claudeSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.claudeSessionId).not.toBe(b.claudeSessionId);
    expect(a.title).toBe("Agent");
  });

  it("keeps the Ollama model and mode", () => {
    const payload = newTerminalPayload({ ...base, agent: "ollama", ollama: { model: "llama3", mode: "chat" } });
    expect(payload.ollama).toEqual({ model: "llama3", mode: "chat" });
  });
});

describe("a one-shot command (spec installation §7)", () => {
  const input = { title: "t", cwd: "C:/a", agent: "custom", command: "npm i", shell: "cmd" } as const;

  it("keeps the mark on the payload, only when asked", () => {
    expect(newTerminalPayload({ ...input, oneShot: true }).oneShot).toBe(true);
    expect("oneShot" in newTerminalPayload(input)).toBe(false);
  });

  it("survives a restart", () => {
    expect(readTerminalPayload({ ...input, name: "", oneShot: true })?.oneShot).toBe(true);
    expect(readTerminalPayload({ ...input, name: "" })?.oneShot).toBeUndefined();
  });

  it("is dropped when the terminal becomes another agent", () => {
    const change = switchedAgent(newTerminalPayload({ ...input, oneShot: true }), "codex");
    expect("oneShot" in change).toBe(true);
    expect(change.oneShot).toBeUndefined();
  });
});

describe("buildSpawnSpec", () => {
  it("passes Claude options with the requested mode", () => {
    const payload = newTerminalPayload({ ...base, agent: "claude", title: "Agent" });
    expect(buildSpawnSpec(payload, "resume")).toEqual({
      cwd: base.cwd,
      shell: "default",
      agent: "claude",
      command: "",
      claude: { mode: "resume", sessionId: payload.claudeSessionId, title: "Agent", role: "agent" },
    });
  });

  it("gives a Claude agent its group's brief, never an orchestrator nor another agent (issue #66)", () => {
    const payload = newTerminalPayload({ ...base, agent: "claude", title: "Agent" });
    expect(buildSpawnSpec(payload, "new", "Back").claude?.team).toBe("Back");
    expect(buildSpawnSpec(payload, "new").claude).not.toHaveProperty("team");
    expect(buildSpawnSpec({ ...payload, role: "orchestrator" }, "new", "Back").claude).not.toHaveProperty("team");
    expect(buildSpawnSpec(newTerminalPayload(base), "new", "Back")).not.toHaveProperty("team");
  });

  it("starts Claude with Remote Control, under the agent's name, when it is on (spec maj §2)", () => {
    const payload = { ...newTerminalPayload({ ...base, agent: "claude", title: "Agent" }, "Isis"), remoteControl: true };
    expect(buildSpawnSpec(payload, "new").claude?.remoteControl).toBe("Isis");
    expect(buildSpawnSpec({ ...payload, name: "" }, "new").claude?.remoteControl).toBe("Agent");
  });

  it("starts Claude on the model the router chose (spec maj §3)", () => {
    const payload = { ...newTerminalPayload({ ...base, agent: "claude", title: "Agent" }), model: "claude-haiku-5-5" };
    expect(buildSpawnSpec(payload, "new").claude?.model).toBe("claude-haiku-5-5");
    expect(buildSpawnSpec({ ...payload, model: undefined }, "new").claude).not.toHaveProperty("model");
  });

  it("passes Ollama options", () => {
    const payload = newTerminalPayload({ ...base, agent: "ollama", ollama: { model: "llama3", mode: "code" } });
    expect(buildSpawnSpec(payload, "new").ollama).toEqual({ model: "llama3", mode: "code" });
  });

  it("sends nothing agent-specific for a shell", () => {
    const spec = buildSpawnSpec(newTerminalPayload(base), "new");
    expect(spec.claude).toBeUndefined();
    expect(spec.ollama).toBeUndefined();
  });
});

describe("a new conversation (final review H1)", () => {
  it("gets its own id and drops the steps of the previous one", () => {
    const patch = newConversation();
    expect(patch.claudeSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect("steps" in patch && patch.steps === undefined).toBe(true);
  });

  it("drops the steps when the terminal switches agent, a conversation id given to Claude if it has none", () => {
    const base = { title: "", name: "Isis", agent: "codex" as const, cwd: "C:/code", shell: "default" as const, command: "", steps: [{ title: "Plan", state: "fait" as const }] };
    expect(switchedAgent(base, "shell")).toEqual({ agent: "shell", steps: undefined });
    const claude = switchedAgent(base, "claude");
    expect(claude).toMatchObject({ agent: "claude", steps: undefined });
    expect(claude.claudeSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(switchedAgent({ ...base, claudeSessionId: "s1" }, "claude")).toEqual({ agent: "claude", steps: undefined });
  });
});

describe("orchestratorSession (spec orchestrateur §6)", () => {
  it("is Claude in the project folder, launched with the orchestrator's role", () => {
    const session = orchestratorSession("Chef", { cwd: "C:/code", shell: "pwsh" });
    expect(session).toMatchObject({ title: "Chef", name: "Chef", agent: "claude", cwd: "C:/code", shell: "pwsh", role: "orchestrator" });
    expect(buildSpawnSpec(session, "new").claude).toEqual({ mode: "new", sessionId: session.claudeSessionId, title: "Chef", role: "orchestrator" });
    expect(buildSpawnSpec({ ...session, role: undefined }, "new").claude?.role).toBe("agent");
  });
});
