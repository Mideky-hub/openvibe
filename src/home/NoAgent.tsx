import { useState } from "react";
import { Copy, Download, ExternalLink, RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { agentsStore } from "@/fleet/agentsStore";
import { AGENTS, agentInk } from "@/fleet/catalog";
import { AGENT_INSTALLS } from "@/fleet/installCommands";
import { InstallPrompt } from "@/fleet/InstallPrompt";
import { useMessages } from "@/i18n";
import type { AgentId } from "@/ipc/pty";
import { AccentButton } from "@/shell/buttons";
import { recentProject, useProjects } from "@/store/projects";
import { installFromHome } from "./installFromHome";
import { homeMessages } from "./messages";

const CLAUDE = AGENT_INSTALLS.claude!;
const OTHERS = (Object.keys(AGENT_INSTALLS) as AgentId[]).filter((id) => id !== "claude");

const linkClass = "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ov-text hover:bg-ov-hover [&_svg]:size-3 [&_svg]:text-ov-text-2";

/** « Aucun agent de code trouvé »: Claude Code first, then the others (spec installation §4.2). */
export function NoAgent() {
  const t = useMessages(homeMessages).noAgent;
  const [checking, setChecking] = useState(false);
  const [asked, setAsked] = useState<AgentId | null>(null);
  const project = useProjects((s) => recentProject(s.projects));
  const claude = AGENTS.claude;

  const copy = () =>
    void navigator.clipboard.writeText(CLAUDE.command).then(
      () => toast(t.copied),
      () => toast.error(t.copyFailed),
    );
  const install = (agent: AgentId) => {
    setAsked(null);
    void installFromHome(agent);
  };
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
          <span className="rounded-md bg-ov-accent-soft px-2 py-0.5 text-[10px] font-semibold text-ov-accent">{t.recommended}</span>
        </div>
        <p className="mt-1 text-xs text-ov-text-2">{t.claudeWhy}</p>
        <p className="mt-3 text-xs text-ov-text-2">{t.claudeHow}</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-ov-hover px-2 py-1.5 font-mono text-xs text-ov-text">{CLAUDE.command}</code>
          <button type="button" onClick={copy} className={linkClass}>
            <Copy /> {t.copy}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <AccentButton onClick={() => install("claude")}>
            <Download /> {t.installAgent("Claude Code")}
          </AccentButton>
          <button type="button" data-link onClick={() => void openUrl(CLAUDE.docs)} className={`${linkClass} text-ov-accent`}>
            {t.guide} <ExternalLink />
          </button>
        </div>
      </div>
      <p className="mt-4 mb-1 text-xs text-ov-text-2">{t.others}</p>
      <ul className="-ml-2 flex flex-wrap gap-1">
        {OTHERS.map((id) => {
          const agent = AGENTS[id];
          return (
            <li key={id} className="flex items-center">
              <button type="button" data-link onClick={() => void openUrl(AGENT_INSTALLS[id]!.docs)} className={linkClass}>
                <agent.Icon style={{ color: agentInk(agent.tint) }} /> {agent.label} <ExternalLink />
              </button>
              <button
                type="button"
                data-install={id}
                aria-label={t.installAgent(agent.label)}
                onClick={() => setAsked(id)}
                className="rounded-[9px] bg-ov-accent-soft px-2 py-0.5 text-[11px] font-semibold text-ov-accent hover:underline"
              >
                {t.install}
              </button>
            </li>
          );
        })}
      </ul>
      {asked && (
        <div className="mt-2 max-w-md rounded-[10px] border border-ov-line bg-ov-card p-2">
          <InstallPrompt key={asked} agent={asked} onBack={() => setAsked(null)} onRun={() => install(asked)} />
        </div>
      )}
      <p className="mt-3 text-xs text-ov-text-2">{project ? t.opensIn(project.name) : t.asksFolder}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <AccentButton onClick={() => void recheck()} disabled={checking}>
          <RefreshCw className={checking ? "animate-spin" : undefined} /> {t.recheck}
        </AccentButton>
        <p className="text-xs text-ov-text-2">{t.recheckHint}</p>
      </div>
    </div>
  );
}
