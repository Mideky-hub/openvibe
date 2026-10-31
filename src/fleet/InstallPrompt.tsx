import { ArrowLeft, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMessages } from "@/i18n";
import type { AgentId } from "@/ipc/pty";
import { SHELL_LABELS } from "@/nodes/terminal/launch";
import { AccentButton } from "@/shell/buttons";
import { AGENTS } from "./catalog";
import { AGENT_INSTALLS } from "./installCommands";
import { fleetMessages } from "./messages";

/** The whole command, read before the click that runs it (spec installation §2). */
export function InstallPrompt({ agent, onBack, onRun }: { agent: AgentId; onBack: () => void; onRun: () => void }) {
  const t = useMessages(fleetMessages).install;
  const install = AGENT_INSTALLS[agent];
  if (!install) return null;
  return (
    <div data-install-prompt={agent} className="grid gap-2 p-1">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-ov-text-2 hover:text-ov-text">
        <ArrowLeft className="size-3.5" /> {t.installAgent(AGENTS[agent].label)}
      </button>
      <p className="text-xs text-ov-text-2">{t.runsIn(SHELL_LABELS[install.shell])}</p>
      <code className="block break-all rounded-md bg-ov-hover px-2 py-1.5 font-mono text-xs text-ov-text">{install.command}</code>
      {install.needsNode && <p className="text-xs text-ov-text-2">{t.needsNode}</p>}
      <button type="button" data-link onClick={() => void openUrl(install.docs)} className="flex items-center gap-1 text-xs text-ov-accent hover:underline">
        {t.officialPage} <ExternalLink className="size-3" />
      </button>
      <AccentButton onClick={onRun} className="justify-center text-xs">
        {t.run}
      </AccentButton>
    </div>
  );
}
