import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMessages } from "@/i18n";
import { missionChecks, type ProjectChecks } from "@/ipc/mission";
import type { Permission } from "@/ipc/pty";
import { sessionOf, useNodes } from "@/store/nodes";
import { useUsage } from "@/usage/usageStore";
import { MAX_AGENTS } from "./mission";
import { missionMessages } from "./messages";
import { DEFAULT_AWAY_HOURS, DEFAULT_LABEL, MAX_AWAY_HOURS, startOvernight } from "./overnight";
import { blockers, usageWarning } from "./overnightChecks";
import { missionOf } from "./store";

const FIELD = "w-20 rounded bg-ov-field px-2 py-1 text-sm text-ov-text outline-none";
/** From the tightest to the most open: commands stay an explicit choice (review). */
const PERMISSIONS: readonly Permission[] = ["ask", "edits", "work"];

/** « Mission de nuit » (spec mission de nuit §5.1): how long the user is away, and what the team works from. */
export function OvernightDialog({ nodeId, open, onOpenChange }: { nodeId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useMessages(missionMessages).overnight;
  const maxAgents = useNodes((s) => missionOf(s.nodes[nodeId])?.maxAgents);
  const [hours, setHours] = useState(String(DEFAULT_AWAY_HOURS));
  const [agents, setAgents] = useState(String(maxAgents ?? 4));
  const [kind, setKind] = useState<"github" | "backlog">("github");
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [auto, setAuto] = useState(false);
  const [permission, setPermission] = useState<Permission>("edits");
  const project = useNodes((s) => sessionOf(s.nodes[nodeId])?.cwd);
  const [checks, setChecks] = useState<ProjectChecks | null>(null);
  useEffect(() => {
    if (!project) return;
    let current = true;
    void missionChecks(project).then((found) => current && setChecks(found), () => undefined);
    return () => {
      current = false;
    };
  }, [project]);
  const limits = useUsage((s) => s.limits);
  const usage = usageWarning(limits, Date.now());
  const blocked = checks ? blockers(checks, kind) : [];
  const away = Number(hours);
  const count = Number(agents);
  const valid = away > 0 && away <= MAX_AWAY_HOURS && Number.isInteger(count) && count >= 1 && count <= MAX_AGENTS && (kind === "backlog" || label.trim() !== "") && blocked.length === 0;
  const start = () => {
    startOvernight(nodeId, {
      awayMin: Math.round(away * 60),
      agents: count,
      source: kind === "backlog" ? { kind } : { kind, label: label.trim() },
      autoLaunch: auto,
      permission,
    });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm text-ov-text">
          <label className="flex items-center justify-between gap-3">
            {t.away}
            <input type="number" min={0.5} max={MAX_AWAY_HOURS} step={0.5} aria-label={t.awayLabel} value={hours} onChange={(e) => setHours(e.target.value)} className={FIELD} />
          </label>
          <label className="flex items-center justify-between gap-3">
            {t.agents}
            <input type="number" min={1} max={MAX_AGENTS} aria-label={t.agentsLabel} value={agents} onChange={(e) => setAgents(e.target.value)} className={FIELD} />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1">{t.source}</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="tickets" aria-label={t.github} checked={kind === "github"} onChange={() => setKind("github")} className="accent-[var(--ov-accent)]" />
              {t.github}
            </label>
            {kind === "github" && (
              <label className="ml-6 flex items-center gap-2 text-xs text-ov-text-2" title={t.labelTitle}>
                {t.label}
                <input aria-label={t.labelLabel} value={label} onChange={(e) => setLabel(e.target.value)} className="w-32 rounded bg-ov-field px-2 py-1 text-ov-text outline-none" />
              </label>
            )}
            <label className="flex items-center gap-2">
              <input type="radio" name="tickets" aria-label="BACKLOG.md" checked={kind === "backlog"} onChange={() => setKind("backlog")} className="accent-[var(--ov-accent)]" />
              BACKLOG.md
            </label>
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1">{t.permission}</legend>
            {PERMISSIONS.map((id) => (
              <label key={id} className="flex items-baseline gap-2">
                <input type="radio" name="permission" aria-label={t.permissions[id]} checked={permission === id} onChange={() => setPermission(id)} className="accent-[var(--ov-accent)]" />
                <span>
                  {t.permissions[id]}
                  <span className="ml-1 text-xs text-ov-text-2">{t.permissionHelp[id]}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-ov-text-2">{t.noPush}</p>
          </fieldset>
          <label className="flex items-center gap-2">
            <input type="checkbox" aria-label={t.auto} checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[var(--ov-accent)]" />
            {t.auto}
          </label>
          <ul data-checks className="flex flex-col gap-1 text-xs text-ov-text-2">
            {blocked.map((id) => (
              <li key={id} role="alert" className="text-ov-danger">
                {t.blocked[id]}
              </li>
            ))}
            {usage !== null && <li className="text-ov-waiting">{t.usage(usage)}</li>}
            <li>{t.awake}</li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button disabled={!valid} onClick={start}>
            {t.start}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
