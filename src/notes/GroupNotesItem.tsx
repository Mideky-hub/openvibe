import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useMessages } from "@/i18n";
import { notesMessages } from "./messages";
import { openGroupNotes } from "./notesStore";

/** The one line of the group's menu: everything else lives here, in `src/notes/`. */
export function GroupNotesItem({ groupId }: { groupId: string }) {
  const t = useMessages(notesMessages).group;
  return <DropdownMenuItem onSelect={() => openGroupNotes(groupId)}>{t.entry}</DropdownMenuItem>;
}
