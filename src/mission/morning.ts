import { memberTime, pastTask, remainingGlobal, type Member, type Mission, type PastTask, type QueuedTask, type ReportStatus } from "./mission";

const MINUTE = 60_000;

/** One task of the night; no status: still running at the end. */
export interface MorningRow {
  task: string;
  agent: string;
  minutes: number;
  budgetMin: number;
  branch: string;
  summary: string;
  merged: boolean;
  status?: ReportStatus;
}

export interface MorningReport {
  elapsedMin: number;
  awayMin: number | undefined;
  done: MorningRow[];
  failed: MorningRow[];
  unfinished: MorningRow[];
  waiting: QueuedTask[];
  check: string[];
}

const row = (agent: string, past: PastTask): MorningRow => ({
  task: past.task,
  agent,
  minutes: Math.round(past.spentMin),
  budgetMin: past.budgetMin,
  branch: past.branch,
  summary: past.summary,
  merged: past.merged,
  status: past.status,
});

/** Every task a member went through, the current one last; a handed-over one is told by the next agent. */
function tasksOf(member: Member): PastTask[] {
  const past = member.past ?? [];
  return member.report && !member.handedTo ? [...past, pastTask(member, member.report)] : past;
}

/** What the user reads when they come back (spec mission de nuit §6.2). */
export function morningReport(mission: Mission, now: number): MorningReport {
  const rows = mission.members.flatMap((m) => tasksOf(m).map((past) => row(m.name, past)));
  const running = mission.members.filter((m) => !m.report && !m.handedTo);
  const checks = mission.members.flatMap((m) => tasksOf(m).flatMap((past) => (past.check ? [`${m.name} · ${past.task} : ${past.check}`] : [])));
  const end = mission.endedAt ?? now;
  return {
    elapsedMin: mission.startedAt === undefined ? 0 : Math.round((end - mission.startedAt) / MINUTE),
    awayMin: mission.budgetMin,
    done: rows.filter((r) => r.status === "termine"),
    failed: rows.filter((r) => r.status !== "termine"),
    unfinished: running.map((m) => ({
      task: m.task,
      agent: m.name,
      minutes: Math.round(memberTime(mission, m, end) ?? 0),
      budgetMin: m.budgetMin,
      branch: m.branch,
      summary: "",
      merged: false,
    })),
    waiting: mission.queue ?? [],
    check: [...(mission.handChecks ?? []), ...checks],
  };
}

/** A night that ended, or whose time ran out: an orchestrator that died must not hide what happened. */
export function morningShown(mission: Mission, now: number): boolean {
  if (!mission.overnight) return false;
  return mission.state === "terminee" || (mission.state === "en_cours" && remainingGlobal(mission, now) === 0);
}
