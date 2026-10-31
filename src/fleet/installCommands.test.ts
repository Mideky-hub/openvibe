import { describe, expect, it } from "vitest";
import { AGENT_IDS } from "@/ipc/pty";
import { AGENT_INSTALLS, OLLAMA_SUGGESTIONS, ollamaPullCommand, sameOllamaModel, validOllamaModel } from "./installCommands";

describe("the install table", () => {
  it("holds the vendors' exact commands (spec installation §3)", () => {
    expect(Object.fromEntries(Object.entries(AGENT_INSTALLS).map(([id, install]) => [id, install.command]))).toEqual({
      claude: "irm https://claude.ai/install.ps1 | iex",
      codex: 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
      gemini: "npm install -g @google/gemini-cli",
      qwen: "irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex",
      cursor: "irm 'https://cursor.com/install?win32=true' | iex",
      opencode: "npm install -g opencode-ai",
      aider: 'powershell -ExecutionPolicy ByPass -c "irm https://aider.chat/install.ps1 | iex"',
      ollama: "irm https://ollama.com/install.ps1 | iex",
    });
  });

  it("runs each command in the shell it was written for", () => {
    for (const install of Object.values(AGENT_INSTALLS)) {
      // npm.ps1 is refused by a new Windows' execution policy: npm goes through cmd.
      const npm = install.command.startsWith("npm ");
      expect(install.shell).toBe(npm ? "cmd" : "powershell");
      expect(install.needsNode ?? false).toBe(npm);
    }
  });

  it("links every command to an official https page", () => {
    for (const install of Object.values(AGENT_INSTALLS)) expect(install.docs).toMatch(/^https:\/\//);
  });

  it("only knows real agents, never Shell or Personnalisé", () => {
    const ids = Object.keys(AGENT_INSTALLS);
    expect(ids.every((id) => (AGENT_IDS as readonly string[]).includes(id))).toBe(true);
    expect(ids).not.toContain("shell");
    expect(ids).not.toContain("custom");
  });
});

describe("Ollama models", () => {
  it("pulls a model with the official command", () => {
    expect(ollamaPullCommand("qwen2.5-coder:7b")).toBe("ollama pull qwen2.5-coder:7b");
  });

  it("accepts the names Ollama uses", () => {
    for (const name of ["llama3.2", "qwen2.5-coder:7b", "hf.co/user/model:tag"]) expect(validOllamaModel(name)).toBe(true);
  });

  it("refuses what a shell would read as something else", () => {
    for (const name of ["", " ", "a b", "a;calc", "a|b", "a&b", "$(x)", "`x`", "a\nb", "--insecure", "-x", ":tag", "/x"]) {
      expect(validOllamaModel(name)).toBe(false);
    }
  });

  it("refuses to build a command for an unsafe name", () => {
    expect(() => ollamaPullCommand("a;calc")).toThrow();
  });

  it("suggests only valid, distinct models", () => {
    const names = OLLAMA_SUGGESTIONS.map((s) => s.model);
    expect(names.every(validOllamaModel)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("recognizes a model without tag in `ollama list`, which adds :latest", () => {
    expect(sameOllamaModel("llama3.2", "llama3.2:latest")).toBe(true);
    expect(sameOllamaModel("llama3.2:3b", "llama3.2:3b")).toBe(true);
    expect(sameOllamaModel("llama3.2:3b", "llama3.2:latest")).toBe(false);
    expect(sameOllamaModel("hf.co/user/model", "hf.co/user/model:latest")).toBe(true);
  });
});
