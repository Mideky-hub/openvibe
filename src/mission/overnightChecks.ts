import type { ProjectChecks } from "@/ipc/mission";
import { currentLimit, type Limit, type Limits } from "@/usage/usage";
import type { TicketSource } from "./tickets";

/** Past this, the night may run out of plan: a warning, not a refusal (spec mission de nuit §5.2). */
export const USAGE_WARNING_PERCENT = 80;

export type CheckId = "git" | "gh";

/** What stands in the way of the night: empty when nothing does. */
export function blockers(checks: ProjectChecks, source: TicketSource["kind"]): CheckId[] {
  return [...(checks.git ? [] : ["git" as const]), ...(source === "github" && !checks.gh ? ["gh" as const] : [])];
}

/** The fullest window of the plan past the warning, as of now; null when usage is fine or unknown. */
export function usageWarning(limits: Limits | null, now: number): number | null {
  const windows = [limits?.fiveHour, limits?.sevenDay].filter((limit): limit is Limit => limit !== undefined);
  const fullest = Math.max(0, ...windows.map((limit) => currentLimit(limit, now).usedPercent));
  return fullest >= USAGE_WARNING_PERCENT ? Math.round(fullest) : null;
}
