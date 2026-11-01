import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUiRequest } from "@/commands/uiRequests";
import { messages, useMessages } from "@/i18n";
import { nodeNameOf, useNodes } from "@/store/nodes";
import { useLoops, loopsStore } from "./live";
import { loopsMessages } from "./messages";
import { LOOP_TEMPLATES, validateLoop, type LoopDef, type LoopError, type LoopTrigger } from "./model";

interface Form {
  /** The loop being edited; null for a new one. */
  id: string | null;
  name: string;
  instruction: string;
  targets: string[];
  trigger: LoopTrigger["kind"];
  minutes: string;
  text: string;
  maxRuns: string;
  maxMinutes: string;
}

const BLANK: Form = { id: null, name: "", instruction: "", targets: [], trigger: "interval", minutes: "30", text: "", maxRuns: "", maxMinutes: "" };

const number = (value: string) => (value.trim() === "" ? undefined : Number(value));

function formOf(loop: LoopDef): Form {
  const { trigger } = loop;
  return {
    id: loop.id,
    name: loop.name,
    instruction: loop.instruction,
    targets: loop.targets,
    trigger: trigger.kind,
    minutes: trigger.kind === "interval" ? String(trigger.minutes) : "30",
    text: trigger.kind === "output" ? trigger.text : "",
    maxRuns: loop.maxRuns === undefined ? "" : String(loop.maxRuns),
    maxMinutes: loop.maxMinutes === undefined ? "" : String(loop.maxMinutes),
  };
}

function triggerOf(form: Form): LoopTrigger {
  if (form.trigger === "idle") return { kind: "idle" };
  if (form.trigger === "output") return { kind: "output", text: form.text };
  return { kind: "interval", minutes: Number(form.minutes) };
}

const FIELD = "h-8 w-full rounded-lg border border-ov-line bg-ov-field px-2.5 text-[13px] text-ov-text outline-none focus-visible:border-ov-accent";

/** The loops: the list and the form (spec boucles §4), opened by the palette or the indicator. */
export function LoopsDialog() {
  const t = useMessages(loopsMessages).dialog;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<LoopError | null>(null);
  const loops = useLoops((s) => s.loops);
  const runtime = useLoops((s) => s.runtime);
  const nodes = useNodes((s) => s.nodes);
  const terminals = Object.entries(nodes).filter(([, node]) => node.kind === "terminal");
  useUiRequest("loops", () => {
    setForm(null);
    setOpen(true);
    void loopsStore.getState().load();
    return true;
  });

  const change = (patch: Partial<Form>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
    setError(null);
  };

  const fromTemplate = (id: (typeof LOOP_TEMPLATES)[number]["id"]) => {
    const template = LOOP_TEMPLATES.find((tpl) => tpl.id === id)!;
    const { trigger } = template.draft;
    change({
      name: t.template[id],
      instruction: t.templateInstruction[id],
      trigger: trigger.kind,
      minutes: trigger.kind === "interval" ? String(trigger.minutes) : "30",
      text: trigger.kind === "output" ? trigger.text : "",
      maxRuns: template.draft.maxRuns === undefined ? "" : String(template.draft.maxRuns),
      maxMinutes: template.draft.maxMinutes === undefined ? "" : String(template.draft.maxMinutes),
    });
  };

  const save = async () => {
    if (!form) return;
    const checked = validateLoop({
      name: form.name,
      instruction: form.instruction,
      targets: form.targets,
      trigger: triggerOf(form),
      maxRuns: number(form.maxRuns),
      maxMinutes: number(form.maxMinutes),
    });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    try {
      const result = await loopsStore.getState().save({ ...checked.loop, id: form.id ?? crypto.randomUUID() });
      if (result === "full") toast.error(messages(loopsMessages).dialog.full);
      else setForm(null);
    } catch (e) {
      toast.error(messages(loopsMessages).dialog.failed(String(e)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        {form === null ? (
          <div className="flex flex-col gap-2">
            {loops.length === 0 && <p className="text-sm text-ov-text-2">{t.empty}</p>}
            {loops.map((loop) => {
              const state = runtime[loop.id];
              const running = state?.running === true;
              const left =
                running && loop.maxMinutes !== undefined && state.startedAt !== null
                  ? Math.max(0, Math.ceil(loop.maxMinutes - (Date.now() - state.startedAt) / 60_000))
                  : null;
              return (
                <div key={loop.id} className="flex items-center gap-2 rounded-lg border border-ov-line px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ov-text">{loop.name}</p>
                    <p className="truncate text-[11.5px] text-ov-text-2">
                      {t.triggerSummary(loop.trigger)} · {t.cost(loop)}
                    </p>
                    <p className="text-[11.5px] text-ov-text-2">
                      {running
                        ? `${t.round(state.runs, loop.maxRuns)}${left === null ? "" : ` · ${t.untilEnd(left)}`}`
                        : state?.stoppedBecause
                          ? `${t.stopped[state.stoppedBecause]} · ${t.round(state.runs, loop.maxRuns)}`
                          : t.off}
                    </p>
                  </div>
                  <Button size="sm" variant={running ? "destructive" : "default"} onClick={() => (running ? loopsStore.getState().stop(loop.id) : loopsStore.getState().start(loop.id))}>
                    {running ? t.turnOff : t.turnOn}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setForm(formOf(loop))}>
                    {t.edit}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void loopsStore.getState().remove(loop.id)}>
                    {t.remove}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px] text-ov-text-2">{t.templates}</span>
              {LOOP_TEMPLATES.map((tpl) => (
                <Button key={tpl.id} size="sm" variant="outline" onClick={() => fromTemplate(tpl.id)}>
                  {t.template[tpl.id]}
                </Button>
              ))}
            </div>
            <Input aria-label={t.name} placeholder={t.name} value={form.name} onChange={(e) => change({ name: e.currentTarget.value })} />
            <textarea
              aria-label={t.instruction}
              placeholder={t.instruction}
              value={form.instruction}
              onChange={(e) => change({ instruction: e.currentTarget.value })}
              rows={3}
              className="w-full resize-none rounded-lg border border-ov-line bg-ov-field px-2.5 py-1.5 text-[13px] text-ov-text outline-none focus-visible:border-ov-accent"
            />
            <fieldset className="flex flex-col gap-1">
              <legend className="text-[11.5px] text-ov-text-2">{t.targets}</legend>
              {terminals.length === 0 && <p className="text-[12px] text-ov-text-3">{t.noTargets}</p>}
              {terminals.map(([id, node]) => (
                <label key={id} className="flex items-center gap-2 text-[13px] text-ov-text">
                  <input
                    type="checkbox"
                    data-target={id}
                    checked={form.targets.includes(id)}
                    onChange={(e) => change({ targets: e.currentTarget.checked ? [...form.targets, id] : form.targets.filter((x) => x !== id) })}
                  />
                  {nodeNameOf(node) || id}
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-[11.5px] text-ov-text-2">{t.trigger}</legend>
              {(["interval", "idle", "output"] as const).map((kind) => (
                <label key={kind} className="flex items-center gap-2 text-[13px] text-ov-text">
                  <input type="radio" name="loop-trigger" checked={form.trigger === kind} onChange={() => change({ trigger: kind })} />
                  {t.triggers[kind]}
                </label>
              ))}
              {form.trigger === "interval" && (
                <input aria-label={t.minutes} type="number" min={1} max={1440} value={form.minutes} onChange={(e) => change({ minutes: e.currentTarget.value })} className={FIELD} />
              )}
              {form.trigger === "output" && (
                <input aria-label={t.text} placeholder={t.text} value={form.text} onChange={(e) => change({ text: e.currentTarget.value })} className={FIELD} />
              )}
            </fieldset>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-[11.5px] text-ov-text-2">{t.stop}</legend>
              <input aria-label={t.maxRuns} placeholder={t.maxRuns} type="number" min={1} max={1000} value={form.maxRuns} onChange={(e) => change({ maxRuns: e.currentTarget.value })} className={FIELD} />
              <input aria-label={t.maxMinutes} placeholder={t.maxMinutes} type="number" min={1} max={1440} value={form.maxMinutes} onChange={(e) => change({ maxMinutes: e.currentTarget.value })} className={FIELD} />
            </fieldset>
            {error && (
              <p role="alert" className="text-xs text-ov-danger">
                {t.errors[error]}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          {form === null ? (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t.close}
              </Button>
              <Button
                onClick={() => {
                  setForm({ ...BLANK });
                  setError(null);
                }}
              >
                {t.new}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setForm(null)}>
                {t.cancel}
              </Button>
              <Button onClick={() => void save()}>{t.save}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
