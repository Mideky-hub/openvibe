import {
  Asterisk,
  Bot,
  Code,
  Cpu,
  Hexagon,
  MousePointer2,
  Sparkle,
  SquareCode,
  SquareTerminal,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { messages } from "@/i18n";
import { AGENT_IDS, type AgentId, type AgentInfo } from "@/ipc/pty";
import { defaultAgentStore, type DefaultAgentChoice } from "./defaultAgentChoice";
import { fleetMessages } from "./messages";

export interface AgentMeta {
  label: string;
  vendor: string;
  /** Border and logo color of the agent's terminals (spec habillage §8). */
  tint: string;
  /** The program looked for on the PATH ("" for shell and custom). */
  binary: string;
  Icon: LucideIcon;
}

/**
 * An agent's tint as an icon or text color: pulled toward the theme's text so
 * that light tints (Ollama, Cursor) stay visible on Ivoire and dark ones on
 * Argile (spec identité §3, "lisible dans les deux").
 */
export function agentInk(tint: string): string {
  return `color-mix(in srgb, ${tint} 65%, var(--ov-text))`;
}

/** `label` and `vendor` of the three agents with words of their own are read when used, so they follow the language. */
export const AGENTS: Record<AgentId, AgentMeta> = {
  claude: { label: "Claude", vendor: "Anthropic", tint: "#e8603a", binary: "claude", Icon: Asterisk },
  codex: { label: "Codex", vendor: "OpenAI", tint: "#707de3", binary: "codex", Icon: SquareTerminal },
  gemini: { label: "Gemini", vendor: "Google", tint: "#5c86e0", binary: "gemini", Icon: Sparkle },
  qwen: { label: "Qwen Code", vendor: "Alibaba", tint: "#a57be0", binary: "qwen", Icon: Hexagon },
  cursor: { label: "Cursor", vendor: "cursor-agent", tint: "#d4d4cc", binary: "cursor-agent", Icon: MousePointer2 },
  opencode: { label: "OpenCode", vendor: "sst", tint: "#77b7c0", binary: "opencode", Icon: Code },
  aider: { label: "Aider", vendor: "aider", tint: "#86a174", binary: "aider", Icon: Bot },
  ollama: {
    label: "Ollama",
    get vendor() {
      return messages(fleetMessages).catalog.ollamaVendor;
    },
    tint: "#ede8df",
    binary: "ollama",
    Icon: Cpu,
  },
  shell: {
    label: "Shell",
    get vendor() {
      return messages(fleetMessages).catalog.shellVendor;
    },
    tint: "#8a8a80",
    binary: "",
    Icon: Terminal,
  },
  custom: {
    get label() {
      return messages(fleetMessages).catalog.customLabel;
    },
    get vendor() {
      return messages(fleetMessages).catalog.customVendor;
    },
    tint: "#8a8a80",
    binary: "",
    Icon: SquareCode,
  },
};

export const AGENT_ORDER: AgentId[] = [...AGENT_IDS];

/** Agents of this tint work in indigo rather than orange (spec habillage §7.2). */
export const INDIGO = "#707de3";

/** Agents that start without options: Ollama needs a model, Personnalisé a command. */
export const AGENTS_WITHOUT_OPTIONS = AGENT_ORDER.filter((id) => id !== "ollama" && id !== "custom");

/**
 * The agent of "Nouvelle console": the one chosen in the settings while it is
 * on this computer (Shell always is), else the first available of Claude, Codex, Shell.
 */
export function defaultAgent(agents: readonly AgentInfo[], chosen: DefaultAgentChoice = defaultAgentStore.getState().choice): AgentId {
  if (chosen === "shell") return "shell";
  if (chosen !== "auto" && agents.some((agent) => agent.id === chosen && agent.available)) return chosen;
  for (const id of ["claude", "codex"] as const) {
    if (agents.some((agent) => agent.id === id && agent.available)) return id;
  }
  return "shell";
}
