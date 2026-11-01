import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMessages } from "@/i18n";
import { useProjects } from "@/store/projects";
import { groupNotesOf, setGroupNotes } from "./groupNotes";
import { notesAll } from "./ipc";
import { noteNamed } from "./links";
import { notesMessages } from "./messages";
import { closeGroupNotes, useNotesUi } from "./notesStore";

/** Which of the project's notes a group carries (spec notes §3). */
export function GroupNotesDialog() {
  const groupId = useNotesUi((s) => s.attaching);
  return groupId ? <Chooser key={groupId} groupId={groupId} /> : null;
}

function Chooser({ groupId }: { groupId: string }) {
  const t = useMessages(notesMessages).group;
  const projectId = useProjects((s) => s.activeId);
  const [names, setNames] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState(() => groupNotesOf(groupId));
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    notesAll(projectId).then(
      (list) => alive && setNames(list.notes.map((note) => note.name)),
      (error: unknown) => alive && setFailure(String(error)),
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  const known = names ?? [];
  const gone = chosen.filter((name) => noteNamed(known.map((n) => ({ name: n })), name) === null);
  const toggle = (name: string) => setChosen((list) => (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]));
  const rows = [...known, ...gone];

  return (
    <Dialog open onOpenChange={(open) => !open && closeGroupNotes()}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        {failure ? (
          <p className="text-xs text-ov-danger">{failure}</p>
        ) : names === null ? (
          <p className="text-xs text-ov-text-2">{t.reading}</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-ov-text-2">{t.empty}</p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {rows.map((name) => (
              <li key={name}>
                <label className="flex items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12.5px] text-ov-text hover:bg-ov-hover">
                  <input
                    type="checkbox"
                    data-attach={name}
                    checked={chosen.some((n) => n.toLowerCase() === name.toLowerCase())}
                    onChange={() => toggle(chosen.find((n) => n.toLowerCase() === name.toLowerCase()) ?? name)}
                    className="accent-ov-accent"
                  />
                  <span className="min-w-0 truncate">{name}</span>
                  {gone.includes(name) && <span className="shrink-0 text-[11px] text-ov-text-3">{t.missing}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={closeGroupNotes}>
            {t.cancel}
          </Button>
          <Button
            disabled={names === null}
            onClick={() => {
              setGroupNotes(groupId, chosen);
              closeGroupNotes();
            }}
          >
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
