import { toast } from "sonner";
import { useStore } from "zustand";
import { useCanvas } from "@/canvas/canvasStore";
import { BUDGET_COLOR } from "@/canvas/overlay/timeline";
import { linkedAgents, NO_LINKS } from "@/fleet/wires";
import { messages, useMessages } from "@/i18n";
import { useNow } from "@/lib/useNow";
import { useActivities } from "@/store/agentActivity";
import { terminalOf, useNodes } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { openReview } from "@/review/reviewStore";
import { uiStore, useUi } from "@/store/ui";
import { cleanMission, launchMission } from "./launch";
import { budgetBar, budgetOf, MAX_AGENTS, memberTime, type Mission } from "./mission";
import { missionMessages } from "./messages";
import { LEVELS, modelLabel } from "./router";
import { agentState, missionOf, setMission } from "./store";

/** Under the orchestrator's terminal: settings, plan and go-ahead, team, summary (spec orchestrateur §6, §7). */
export function MissionPanel({ nodeId }: { nodeId: string }) {
  const t = useMessages(missionMessages);
  const mission = useNodes((s) => missionOf(s.nodes[nodeId]));
  if (!mission) return null;
  return (
    <section data-mission={nodeId} className="flex max-h-[55%] shrink-0 flex-col border-t border-ov-line text-xs text-ov-text-2">
      <div data-mission-body className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2">
        <header className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-[0.08em] text-ov-text">{t.title(mission.name ?? "")}</span>
          <span>{t.state[mission.state]}</span>
          {mission.branch && <span className="ml-auto truncate font-mono text-[11px]">{mission.branch}</span>}
        </header>
        {(mission.state === "redaction" || mission.state === "plan") && <Settings nodeId={nodeId} mission={mission} />}
        {mission.state === "redaction" && <p>{t.writeTask}</p>}
        {mission.plan && (mission.state === "plan" || mission.state === "lancement") && <Plan mission={mission} />}
        {mission.error && (
          <p role="alert" className="text-ov-danger">
            {mission.error}
          </p>
        )}
        {(mission.state === "en_cours" || mission.state === "terminee") && <Team mission={mission} />}
        {mission.state === "terminee" && <p className="whitespace-pre-wrap text-ov-text">{mission.summary ?? ""}</p>}
      </div>
      {/* Actions stay out of the scrolling body, so they are always visible. */}
      {mission.plan && (mission.state === "plan" || mission.state === "lancement") && <PlanActions nodeId={nodeId} mission={mission} />}
      {mission.state === "terminee" && <SummaryActions nodeId={nodeId} />}
    </section>
  );
}

function Settings({ nodeId, mission }: { nodeId: string; mission: Mission }) {
  const t = useMessages(missionMessages);
  const linking = useUi((s) => s.linking === nodeId);
  const links = useCanvas((s) => s.links[nodeId] ?? NO_LINKS);
  const frames = useCanvas((s) => s.frames);
  const nodes = useNodes((s) => s.nodes);
  const claude = linkedAgents(links, frames).agentIds.filter((id) => terminalOf(nodes[id])?.agent === "claude").length;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-1">
        {t.globalBudget}
        <input
          type="number"
          min={1}
          aria-label={t.globalBudgetLabel}
          placeholder={t.none}
          value={mission.budgetMin ?? ""}
          onChange={(e) => setMission(nodeId, { budgetMin: e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : undefined })}
          className="w-16 rounded bg-ov-field px-1 py-0.5 text-ov-text outline-none"
        />
        {t.min}
      </label>
      <label className="flex items-center gap-1">
        {t.maxAgents}
        <input
          type="number"
          min={1}
          max={MAX_AGENTS}
          aria-label={t.maxAgentsLabel}
          value={mission.maxAgents}
          onChange={(e) => {
            const count = Math.round(Number(e.target.value));
            if (count >= 1) setMission(nodeId, { maxAgents: Math.min(MAX_AGENTS, count) });
          }}
          className="w-12 rounded bg-ov-field px-1 py-0.5 text-ov-text outline-none"
        />
      </label>
      <label
        className="flex items-center gap-1"
        title={t.routerTitle}
      >
        <input
          type="checkbox"
          aria-label={t.routerLabel}
          checked={mission.router === true}
          onChange={(e) => setMission(nodeId, { router: e.target.checked || undefined })}
          className="accent-[var(--ov-accent)]"
        />
        {t.routerLabel}
      </label>
      <span className="ml-auto">
        {t.linked(claude)}
      </span>
      <button
        type="button"
        onClick={() => uiStore.getState().setLinking(linking ? null : nodeId)}
        className="rounded-full bg-ov-accent px-2.5 py-0.5 text-[11px] font-semibold text-white hover:brightness-110"
      >
        {linking ? t.done : t.link}
      </button>
    </div>
  );
}

function Plan({ mission }: { mission: Mission }) {
  const t = useMessages(missionMessages);
  const plan = mission.plan ?? [];
  return (
    <div className="flex flex-col gap-1.5">
      {mission.task && <p className="text-ov-text">{mission.task}</p>}
      <ol className="flex flex-col gap-1">
        {plan.map((task, i) => (
          <li key={i} className="rounded bg-ov-card px-2 py-1">
            <div className="flex items-center gap-2 text-ov-text">
              <span className="font-medium">{task.title}</span>
              {task.level && (
                <span className="shrink-0 rounded-full bg-ov-field px-1.5 text-[11px] text-ov-text-2">
                  {t.level[task.level]}
                  {mission.router ? ` · ${LEVELS[task.level].modelLabel}` : ""}
                </span>
              )}
              <span className="ml-auto shrink-0 font-mono text-[11px] text-ov-text-2">
                {task.agent} · {task.budgetMin} {t.min}
              </span>
            </div>
            <p className="line-clamp-2">{task.brief}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PlanActions({ nodeId, mission }: { nodeId: string; mission: Mission }) {
  const t = useMessages(missionMessages);
  const total = (mission.plan ?? []).reduce((sum, s) => sum + s.budgetMin, 0);
  const launching = mission.state === "lancement";
  return (
    <footer data-mission-actions className="flex shrink-0 items-center gap-2 border-t border-ov-line px-3 py-2">
      <span className="font-mono text-[11px]">{t.total(total, mission.budgetMin)}</span>
      <button
        type="button"
        disabled={launching}
        onClick={() => void launchMission(nodeId)}
        className="ml-auto rounded-full bg-ov-accent px-3 py-1 text-[11px] font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {launching ? t.launching : t.launch}
      </button>
    </footer>
  );
}

function Team({ mission }: { mission: Mission }) {
  const t = useMessages(missionMessages);
  const members = mission.members;
  // The agents' states follow their activity and their processes; their times, the clock.
  useActivities();
  const now = useNow(15_000);
  useStore(terminalStatusStore, (s) => s.statuses);
  const nodes = useNodes((s) => s.nodes);
  return (
    <ul className="flex flex-col gap-1">
      {members.map((member) => {
        const steps = terminalOf(nodes[member.nodeId])?.steps ?? [];
        const done = steps.filter((s) => s.state === "fait").length;
        return (
          <li key={member.nodeId || member.name} data-member={member.name} className="flex items-center gap-2 rounded bg-ov-card px-2 py-1">
            <span className="font-medium text-ov-text">{member.name}</span>
            <span className="min-w-0 truncate">{member.task}</span>
            {member.model && <span className="shrink-0 font-mono text-[11px]">{modelLabel(member.model)}</span>}
            <span className="ml-auto shrink-0">{t.agent[agentState(member.nodeId)]}</span>
            {steps.length > 0 && (
              <span className="shrink-0 font-mono text-[11px]">
                {done}/{steps.length}
              </span>
            )}
            {member.handedTo ? (
              <span className="shrink-0">→ {member.handedTo}</span>
            ) : member.sentAt !== undefined ? (
              <MemberTime spent={memberTime(mission, member, now)} budget={budgetOf(member)} />
            ) : null}
            <button
              type="button"
              title={t.reviewTitle(member.name)}
              aria-label={t.reviewLabel(member.name)}
              onClick={() => openReview(member.nodeId)}
              className="shrink-0 rounded px-1 text-[11px] text-ov-text-2 hover:bg-ov-field hover:text-ov-text"
            >
              {t.diff}
            </button>
            {member.report && (
              <span title={member.report.summary} className="shrink-0 rounded-full bg-ov-field px-1.5 text-[11px] text-ov-text">
                {t.report[member.report.status]}
                {member.merged ? t.merged : ""}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** « 6 / 20 min », coloured like its bar (spec §8.3). */
/** A member's time, unless it cannot be told (a mission ended before end times were kept). */
function MemberTime({ spent, budget }: { spent: number | undefined; budget: number }) {
  return spent === undefined ? null : <BudgetTime spent={spent} budget={budget} />;
}

function BudgetTime({ spent, budget }: { spent: number; budget: number }) {
  const t = useMessages(missionMessages);
  return (
    <span className="shrink-0 font-mono text-[11px]" style={{ color: BUDGET_COLOR[budgetBar(spent, budget).tone] }}>
      {t.spent(Math.floor(spent), budget)}
    </span>
  );
}

function SummaryActions({ nodeId }: { nodeId: string }) {
  const t = useMessages(missionMessages);
  const clean = async () => {
    const result = await cleanMission(nodeId);
    if (typeof result === "string") toast.error(messages(missionMessages).cleanFailed(result));
    else toast.success(messages(missionMessages).cleaned(result.removed, result.kept));
  };
  return (
    <footer data-mission-actions className="flex shrink-0 justify-end border-t border-ov-line px-3 py-2">
      <button type="button" onClick={() => void clean()} className="rounded-full border border-ov-line px-3 py-1 text-[11px] text-ov-text hover:bg-ov-card">
        {t.clean}
      </button>
    </footer>
  );
}
