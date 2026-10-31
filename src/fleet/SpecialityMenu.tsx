import type { KeyboardEvent } from "react";
import { MAX_SPECIALITY } from "@/canvas/groups";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useMessages } from "@/i18n";
import { setGroupSpeciality } from "./groups";
import { fleetMessages } from "./messages";
import { ROLE_ORDER } from "./roles";

/** These stay the menu's: the other keys are text, not its typeahead or its Left that closes the submenu. */
const MENU_KEYS = ["Escape", "Tab", "ArrowUp", "ArrowDown"];

/** « Spécialité » of the group menu: free text, or a role as a suggestion (spec groupes spécialisés §2). */
export function SpecialityMenu({ groupId, speciality, onDone }: { groupId: string; speciality?: string; onDone?: () => void }) {
  const t = useMessages(fleetMessages);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (MENU_KEYS.includes(e.key)) return;
    e.stopPropagation();
    if (e.key !== "Enter") return;
    e.preventDefault();
    setGroupSpeciality(groupId, e.currentTarget.value);
    onDone?.();
  };
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {t.groupMenu.speciality}
        {speciality && <span className="ml-1 max-w-20 truncate text-ov-text-3">{speciality}</span>}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-52">
        <input
          defaultValue={speciality}
          maxLength={MAX_SPECIALITY}
          aria-label={t.groupMenu.specialityLabel}
          placeholder={t.groupMenu.specialityCustom}
          onKeyDown={onKeyDown}
          className="m-1 w-[calc(100%-0.5rem)] rounded bg-ov-field px-2 py-1 text-xs text-ov-text outline-none"
        />
        <DropdownMenuSeparator />
        {ROLE_ORDER.filter((id) => id !== "general").map((id) => (
          <DropdownMenuItem key={id} onSelect={() => setGroupSpeciality(groupId, t.roles[id])}>
            {t.roles[id]}
          </DropdownMenuItem>
        ))}
        {speciality && <DropdownMenuItem onSelect={() => setGroupSpeciality(groupId, "")}>{t.groupMenu.specialityNone}</DropdownMenuItem>}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
