import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from "react";
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

/** « Spécialité » of the group menu: free text, or a role as a suggestion (spec groupes spécialisés §2). */
export function SpecialityMenu({ groupId, speciality, onDone }: { groupId: string; speciality?: string; onDone?: () => void }) {
  const t = useMessages(fleetMessages);
  const field = useRef<HTMLInputElement | null>(null);
  // Radix's arrows and Tab only know its items: the field takes the keyboard when the submenu opens, after Radix's own focus.
  const attachField = useCallback((input: HTMLInputElement | null) => {
    field.current = input;
    if (input) requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" || e.key === "Tab") return;
    // The rest is text, not the menu's typeahead or its Left that closes the submenu.
    e.stopPropagation();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.currentTarget.parentElement?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      setGroupSpeciality(groupId, e.currentTarget.value);
      onDone?.();
    }
  };
  // An item takes the focus from under the pointer: text being typed would go to the typeahead, and Enter would pick the item.
  const keepTyping = (e: PointerEvent) => {
    if (document.activeElement === field.current && field.current?.value !== (speciality ?? "")) e.preventDefault();
  };
  const item = (label: string, value: string) => (
    <DropdownMenuItem key={label} onPointerMove={keepTyping} onPointerLeave={keepTyping} onSelect={() => setGroupSpeciality(groupId, value)}>
      {label}
    </DropdownMenuItem>
  );
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {t.groupMenu.speciality}
        {speciality && <span className="ml-1 max-w-20 truncate text-ov-text-3">{speciality}</span>}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-52">
        <input
          ref={attachField}
          defaultValue={speciality}
          maxLength={MAX_SPECIALITY}
          aria-label={t.groupMenu.specialityLabel}
          placeholder={t.groupMenu.specialityCustom}
          onKeyDown={onKeyDown}
          className="m-1 w-[calc(100%-0.5rem)] rounded bg-ov-field px-2 py-1 text-xs text-ov-text outline-none"
        />
        <DropdownMenuSeparator />
        {ROLE_ORDER.filter((id) => id !== "general").map((id) => item(t.roles[id], t.roles[id]))}
        {speciality && item(t.groupMenu.specialityNone, "")}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
