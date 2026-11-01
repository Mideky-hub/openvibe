import { Check, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAgents } from "@/fleet/agentsStore";
import { useMessages } from "@/i18n";
import { keyLabel } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { homeMessages } from "./messages";
import { NoAgent } from "./NoAgent";

const GIT_DOWNLOAD = "https://git-scm.com/download/win";

/**
 * « Bien démarrer » (spec première version §7.2): while no project exists or
 * no coding agent is installed, three steps and their state.
 */
export function GettingStarted({ hasProject }: { hasProject: boolean }) {
  const t = useMessages(homeMessages).start;
  const loaded = useAgents((s) => s.loaded);
  const hasAgent = useAgents((s) => s.agents.some((a) => a.available && a.id !== "shell" && a.id !== "custom"));
  // Before the agents are known it would flash on every start.
  if (!loaded || (hasAgent && hasProject)) return null;
  const steps = [
    { id: "agent", title: t.installAgent, hint: t.installAgentHint, done: hasAgent },
    { id: "project", title: t.addProject, hint: t.addProjectHint, done: hasProject },
    { id: "launch", title: t.launch, hint: t.launchHint(keyLabel("Ctrl+K")), done: false },
  ];
  return (
    <section data-getting-started className="ov-glass-strong mb-6 rounded-[14px] p-5">
      <h2 className="mb-4 text-sm font-semibold text-ov-text">{t.title}</h2>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.id} data-step={step.id} data-done={String(step.done)} className="flex items-start gap-3">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold",
                step.done ? "bg-ov-ok/15 text-ov-ok" : "bg-ov-accent-soft text-ov-accent",
              )}
            >
              {step.done ? (
                <>
                  <Check className="size-3.5" aria-hidden />
                  <span className="sr-only">{t.done}</span>
                </>
              ) : (
                i + 1
              )}
            </span>
            <div className="min-w-0">
              <p className={cn("text-[13px] font-semibold", step.done ? "text-ov-text-2 line-through" : "text-ov-text")}>{step.title}</p>
              <p className="text-xs text-ov-text-2">{step.hint}</p>
              {step.id === "project" && !step.done && (
                <button type="button" data-link onClick={() => void openUrl(GIT_DOWNLOAD)} className="mt-1 flex items-center gap-1 text-xs text-ov-accent hover:underline">
                  {t.installGit} <ExternalLink className="size-3" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {!hasAgent && <NoAgent />}
    </section>
  );
}
