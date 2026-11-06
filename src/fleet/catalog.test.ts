import { describe, expect, it } from "vitest";
import { AGENT_IDS } from "@/ipc/pty";
import { AGENT_ORDER, AGENTS, AGENTS_WITHOUT_OPTIONS, agentInk, defaultAgent } from "./catalog";
import { defaultAgentStore } from "./defaultAgentChoice";

describe("agent catalog", () => {
  it("describes every agent, in menu order", () => {
    expect(AGENT_ORDER).toEqual([...AGENT_IDS]);
    for (const id of AGENT_IDS) expect(AGENTS[id].label).not.toBe("");
  });

  it("picks Claude, then Codex, then Shell as the default agent", () => {
    const info = (...ids: string[]) =>
      AGENT_IDS.map((id) => ({ id, available: ids.includes(id) || id === "shell" || id === "custom" }));
    expect(defaultAgent(info("claude", "codex"))).toBe("claude");
    expect(defaultAgent(info("codex"))).toBe("codex");
    expect(defaultAgent(info())).toBe("shell");
    expect(defaultAgent([])).toBe("shell");
  });

  it("picks the default agent of the settings while it is on this computer", () => {
    const info = (...ids: string[]) => AGENT_IDS.map((id) => ({ id, available: ids.includes(id) }));
    expect(defaultAgent(info("claude", "gemini"), "gemini")).toBe("gemini");
    expect(defaultAgent(info("claude"), "shell")).toBe("shell");
    expect(defaultAgent(info("claude"), "gemini")).toBe("claude");
    expect(defaultAgent(info("claude"), "auto")).toBe("claude");
  });

  it("reads the default agent of the settings when none is given", () => {
    const info = (...ids: string[]) => AGENT_IDS.map((id) => ({ id, available: ids.includes(id) }));
    defaultAgentStore.setState({ choice: "codex" });
    expect(defaultAgent(info("claude", "codex"))).toBe("codex");
    defaultAgentStore.setState({ choice: "auto" });
  });
});

it("lists the agents that start without options, in catalog order", () => {
  expect(AGENTS_WITHOUT_OPTIONS).toEqual(["claude", "codex", "gemini", "qwen", "cursor", "opencode", "aider", "shell"]);
});

it("draws an agent's icon in its tint pulled toward the theme's text, readable on light and dark", () => {
  // Ollama's cream would vanish on Ivoire's white; Codex's indigo on Argile's dark.
  expect(agentInk(AGENTS.ollama.tint)).toBe(`color-mix(in srgb, ${AGENTS.ollama.tint} 65%, var(--ov-text))`);
});
