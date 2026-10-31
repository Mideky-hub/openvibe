import type { ReactNode } from "react";
import { goToAgent } from "@/commands/goToRun";
import { useWaitingAgents, type WaitingAgent } from "@/fleet/waitingAgents";
import { useMessages } from "@/i18n";
import { useWorkspaces } from "@/store/workspaces";
import { shellMessages } from "./messages";

/** Beyond this, a line counts the others: a tall stack would hide more of the canvas. */
const MAX_ROWS = 3;

function Row({ agent, children }: { agent: WaitingAgent; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => goToAgent(agent)}
      className="flex min-h-8 w-full items-center gap-2 rounded-[10px] px-2 py-1 text-left text-[12.5px] text-ov-text hover:bg-ov-hover"
    >
      {children}
    </button>
  );
}

/**
 * Who has a question (spec notification §4): at the bottom left, for as long
 * as an agent waits. The top of the canvas stays to the bars, the bottom right
 * to the toasts; 70 px from the edge clears the tool rail in a short window.
 * The live region stays mounted: one that appears with its text is not announced.
 */
export function WaitingNotice() {
  const t = useMessages(shellMessages);
  const agents = useWaitingAgents();
  const workspaces = useWorkspaces((s) => s.workspaces);
  const activeId = useWorkspaces((s) => s.activeId);
  const hidden = agents.slice(MAX_ROWS);
  return (
    <div aria-live="polite">
      {agents.length > 0 && (
        <section
          data-waiting-notice
          aria-label={t.agentCounts.waiting}
          className="ov-glass-strong absolute bottom-[58px] left-[70px] z-30 flex w-[260px] flex-col rounded-[14px] p-1"
        >
          {agents.slice(0, MAX_ROWS).map((agent) => (
            <Row key={agent.id} agent={agent}>
              <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-ov-wait" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{t.waitingNotice.question(agent.name)}</span>
                {agent.message && (
                  <span title={agent.message} className="block truncate text-[11px] text-ov-text-2">
                    {agent.message}
                  </span>
                )}
              </span>
              {agent.workspaceId !== activeId && (
                <span className="max-w-[90px] shrink-0 truncate font-mono text-[11px] text-ov-text-3">
                  {workspaces.find((w) => w.id === agent.workspaceId)?.name}
                </span>
              )}
            </Row>
          ))}
          {hidden.length > 0 && (
            <Row agent={hidden[0]}>
              <span className="pl-[15px] font-mono text-[11.5px] text-ov-text-2">{t.waitingNotice.others(hidden.length)}</span>
            </Row>
          )}
        </section>
      )}
    </div>
  );
}
