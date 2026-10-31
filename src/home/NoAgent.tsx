import { useState } from "react";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { agentsStore } from "@/fleet/agentsStore";
import { AGENTS, agentInk } from "@/fleet/catalog";
import { useMessages } from "@/i18n";
import type { AgentId } from "@/ipc/pty";
import { AccentButton } from "@/shell/buttons";
import { homeMessages } from "./messages";

/** Claude Code's official install command and page (checked for the plan, spec première version §7.2). */
export const CLAUDE_INSTALL = "irm https://claude.ai/install.ps1 | iex";
const CLAUDE_SETUP = "https://code.claude.com/docs/en/setup";

/** The other agents' official install pages. */
const OTHERS: { id: AgentId; url: string }[] = [
  { id: "codex", url: "https://github.com/openai/codex" },
  { id: "gemini", url: "https://github.com/google-gemini/gemini-cli" },
  { id: "qwen", url: "https://github.com/QwenLM/qwen-code" },
  { id: "cursor", url: "https://cursor.com/cli" },
  { id: "opencode", url: "https://opencode.ai/docs" },
  { id: "aider", url: "https://aider.chat/docs/install.html" },
  { id: "ollama", url: "https://ollama.com/download" },
];

const linkClass = "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ov-text hover:bg-ov-hover [&_svg]:size-3 [&_svg]:text-ov-text-2";

/** « Aucun agent de code trouvé »: Claude Code first, the others by their official page. */
export function NoAgent() {
  const t = useMessages(homeMessages).noAgent;
  const [checking, setChecking] = useState(false);
  const claude = AGENTS.claude;

  const copy = () =>
    void navigator.clipboard.writeText(CLAUDE_INSTALL).then(
      () => toast(t.copied),
      () => toast.error(t.copyFailed),
    );
  const recheck = async () => {
    setChecking(true);
    try {
      await agentsStore.getState().recheck();
    } catch (error) {
      toast.error(t.recheckFailed(String(error)));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div data-no-agent className="mt-5 border-t border-ov-line pt-5">
      <p className="font-semibold text-ov-text">{t.title}</p>
      <p className="mb-4 text-sm text-ov-text-2">{t.hint}</p>
      <div className="rounded-[10px] border border-ov-line bg-ov-card p-3">
        <div className="flex items-center gap-2">
          <claude.Icon className="size-4" style={{ color: agentInk(claude.tint) }} />
          <span className="text-[13px] font-semibold text-ov-text">Claude Code</span>
          <span className="rounded-full bg-ov-accent-soft px-2 py-0.5 text-[10px] font-semibold text-ov-accent">{t.recommended}</span>
        </div>
        <p className="mt-1 text-xs text-ov-text-2">{t.claudeWhy}</p>
        <p className="mt-3 text-xs text-ov-text-2">{t.claudeHow}</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-ov-hover px-2 py-1.5 font-mono text-xs text-ov-text">{CLAUDE_INSTALL}</code>
          <button type="button" onClick={copy} className={linkClass}>
            <Copy /> {t.copy}
          </button>
        </div>
        <button type="button" data-link onClick={() => void openUrl(CLAUDE_SETUP)} className={`${linkClass} mt-2 -ml-2 text-ov-accent`}>
          {t.guide} <ExternalLink />
        </button>
      </div>
      <p className="mt-4 mb-1 text-xs text-ov-text-2">{t.others}</p>
      <ul className="-ml-2 flex flex-wrap gap-1">
        {OTHERS.map(({ id, url }) => {
          const agent = AGENTS[id];
          return (
            <li key={id}>
              <button type="button" data-link onClick={() => void openUrl(url)} className={linkClass}>
                <agent.Icon style={{ color: agentInk(agent.tint) }} /> {agent.label} <ExternalLink />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <AccentButton onClick={() => void recheck()} disabled={checking}>
          <RefreshCw className={checking ? "animate-spin" : undefined} /> {t.recheck}
        </AccentButton>
        <p className="text-xs text-ov-text-2">{t.recheckHint}</p>
      </div>
    </div>
  );
}
