import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMessages } from "@/i18n";
import { npmAvailable, refreshPath, type AgentId } from "@/ipc/pty";
import { SHELL_LABELS } from "@/nodes/terminal/launch";
import { AccentButton } from "@/shell/buttons";
import { AGENTS } from "./catalog";
import { AGENT_INSTALLS } from "./installCommands";
import { fleetMessages } from "./messages";

const NODE_DOWNLOAD = "https://nodejs.org/en/download";

/** The whole command, read before the click that runs it (spec installation §2). */
export function InstallPrompt({ agent, onBack, onRun }: { agent: AgentId; onBack: () => void; onRun: () => void }) {
  const t = useMessages(fleetMessages).install;
  const install = AGENT_INSTALLS[agent];
  const needsNode = install?.needsNode ?? false;
  const [npmMissing, setNpmMissing] = useState(false);

  // PATH is read again first: Node.js may just have been installed. A failed look proves nothing and blocks nothing.
  const lookForNpm = () =>
    refreshPath()
      .then(npmAvailable)
      .then(
        (found) => setNpmMissing(!found),
        () => setNpmMissing(false),
      );

  useEffect(() => {
    if (needsNode) void lookForNpm();
  }, [needsNode]);

  if (!install) return null;
  return (
    <div data-install-prompt={agent} className="grid gap-2 p-1">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-ov-text-2 hover:text-ov-text">
        <ArrowLeft className="size-3.5" /> {t.installAgent(AGENTS[agent].label)}
      </button>
      <p className="text-xs text-ov-text-2">{t.runsIn(SHELL_LABELS[install.shell])}</p>
      <code className="block break-all rounded-md bg-ov-hover px-2 py-1.5 font-mono text-xs text-ov-text">{install.command}</code>
      {needsNode && !npmMissing && <p className="text-xs text-ov-text-2">{t.needsNode}</p>}
      {npmMissing && (
        <div className="grid justify-items-start gap-1">
          <p className="text-xs text-ov-danger">{t.npmMissing}</p>
          <button type="button" data-link onClick={() => void openUrl(NODE_DOWNLOAD)} className="flex items-center gap-1 text-xs text-ov-accent hover:underline">
            {t.getNode} <ExternalLink className="size-3" />
          </button>
          <button type="button" onClick={() => void lookForNpm()} className="text-xs text-ov-accent hover:underline">
            {t.recheck}
          </button>
        </div>
      )}
      <button type="button" data-link onClick={() => void openUrl(install.docs)} className="flex items-center gap-1 text-xs text-ov-accent hover:underline">
        {t.officialPage} <ExternalLink className="size-3" />
      </button>
      <AccentButton onClick={onRun} disabled={npmMissing} className="justify-center text-xs">
        {t.run}
      </AccentButton>
    </div>
  );
}
