// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { langStore } from "@/i18n";
import { setGroupSpeciality } from "./groups";
import { SpecialityMenu } from "./SpecialityMenu";

vi.mock("./groups", () => ({ setGroupSpeciality: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

async function open(speciality?: string) {
  await act(async () =>
    root.render(
      <DropdownMenu open>
        <DropdownMenuTrigger />
        <DropdownMenuContent>
          <SpecialityMenu groupId="g1" speciality={speciality} />
        </DropdownMenuContent>
      </DropdownMenu>,
    ),
  );
  const trigger = document.querySelector('[data-slot="dropdown-menu-sub-trigger"]')!;
  await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
}

const items = () => [...document.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-sub-content"] [role="menuitem"]')];
const field = () => document.querySelector<HTMLInputElement>('[data-slot="dropdown-menu-sub-content"] input')!;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  langStore.setState({ lang: "fr" });
});

it("suggests the group roles, the general one aside, and offers no clearing without a speciality", async () => {
  await open();
  expect(items().map((i) => i.textContent)).toEqual(["Frontend", "Backend", "Testeurs", "Relecteurs", "Design", "Docs", "Sécurité"]);
});

it("suggests in English too", async () => {
  langStore.setState({ lang: "en" });
  await open("API");
  expect(items().map((i) => i.textContent)).toEqual(["Frontend", "Backend", "Testers", "Reviewers", "Design", "Docs", "Security", "None"]);
  expect(field().placeholder).toBe("Your own, then Enter");
});

it("sets a suggestion, and clears with « Aucune »", async () => {
  await open("API");
  await act(async () => items()[0].click());
  expect(setGroupSpeciality).toHaveBeenLastCalledWith("g1", "Frontend");
  await act(async () => items()[items().length - 1].click());
  expect(setGroupSpeciality).toHaveBeenLastCalledWith("g1", "");
});

it("gives the field the keyboard as it opens, and ArrowDown goes on to the suggestions: Radix's arrows and Tab only know its items", async () => {
  await open();
  await vi.waitFor(() => expect(document.activeElement).toBe(field()));
  await act(async () => field().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  expect(document.activeElement).toBe(items()[0]);
});

it("keeps the keyboard in the field under a hovered suggestion once something is typed: Enter would pick the suggestion", async () => {
  await open("API");
  await vi.waitFor(() => expect(document.activeElement).toBe(field()));
  const hover = (type: string) => items()[0].dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "mouse" }));
  field().value = "Base";
  await act(async () => hover("pointermove"));
  expect(document.activeElement).toBe(field());
  await act(async () => hover("pointerleave"));
  expect(document.activeElement).toBe(field());
  field().value = "API";
  await act(async () => hover("pointermove"));
  expect(document.activeElement).toBe(items()[0]);
});

it("keeps free text on Enter; the menu does not take the keys typed in it", async () => {
  await open("API");
  expect(field().defaultValue).toBe("API");
  const typed = new KeyboardEvent("keydown", { key: "b", bubbles: true, cancelable: true });
  const stopped = vi.spyOn(typed, "stopPropagation");
  await act(async () => field().dispatchEvent(typed));
  expect(stopped).toHaveBeenCalled();
  field().value = "Base de données";
  await act(async () => field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(setGroupSpeciality).toHaveBeenCalledWith("g1", "Base de données");
});
