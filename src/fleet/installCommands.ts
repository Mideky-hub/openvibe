import type { AgentId, ShellKind } from "@/ipc/pty";

export interface AgentInstall {
  /** Typed as is into a visible terminal: it must stay the vendor's own command. */
  command: string;
  shell: Extract<ShellKind, "powershell" | "cmd">;
  /** The official page the command was checked against. */
  docs: string;
  needsNode?: boolean;
}

/**
 * Every install OpenVibe can run (spec installation §3). This table is fixed:
 * nothing here comes from the network, and a command only enters it once
 * checked on the vendor's documentation.
 */
export const AGENT_INSTALLS: Partial<Record<AgentId, AgentInstall>> = {
  claude: { command: "irm https://claude.ai/install.ps1 | iex", shell: "powershell", docs: "https://code.claude.com/docs/en/setup" },
  codex: {
    command: 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
    shell: "powershell",
    docs: "https://github.com/openai/codex",
  },
  // In PowerShell `npm` is npm.ps1, refused by a new Windows' execution policy.
  gemini: { command: "npm install -g @google/gemini-cli", shell: "cmd", docs: "https://github.com/google-gemini/gemini-cli", needsNode: true },
  qwen: {
    command: "irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex",
    shell: "powershell",
    docs: "https://github.com/QwenLM/qwen-code",
  },
  cursor: { command: "irm 'https://cursor.com/install?win32=true' | iex", shell: "powershell", docs: "https://cursor.com/docs/cli/installation" },
  opencode: { command: "npm install -g opencode-ai", shell: "cmd", docs: "https://opencode.ai/docs", needsNode: true },
  aider: {
    command: 'powershell -ExecutionPolicy ByPass -c "irm https://aider.chat/install.ps1 | iex"',
    shell: "powershell",
    docs: "https://aider.chat/docs/install.html",
  },
  ollama: { command: "irm https://ollama.com/install.ps1 | iex", shell: "powershell", docs: "https://ollama.com/download/windows" },
};

export type OllamaUse = "code" | "light" | "chat" | "reasoning" | "agent";

/** Names and sizes read on ollama.com/library (spec installation §5). */
export const OLLAMA_SUGGESTIONS: readonly { model: string; sizeGb: number; use: OllamaUse }[] = [
  { model: "qwen2.5-coder:7b", sizeGb: 4.7, use: "code" },
  { model: "gemma3:4b", sizeGb: 3.4, use: "light" },
  { model: "llama3.2:3b", sizeGb: 2, use: "chat" },
  { model: "deepseek-r1:8b", sizeGb: 5.2, use: "reasoning" },
  { model: "devstral:24b", sizeGb: 14, use: "agent" },
];

/** The name ends up in a shell: what `ollama run` accepts (shell.rs), and never something read as an option. */
export function validOllamaModel(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(name);
}

export function ollamaPullCommand(model: string): string {
  if (!validOllamaModel(model)) throw new Error(`invalid Ollama model: ${model}`);
  return `ollama pull ${model}`;
}

const withTag = (model: string) => (model.split("/").pop()!.includes(":") ? model : `${model}:latest`);

/** `ollama list` always shows a tag: a model pulled without one is listed as `:latest`. */
export function sameOllamaModel(a: string, b: string): boolean {
  return withTag(a) === withTag(b);
}
