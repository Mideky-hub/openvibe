import { expect, it, vi } from "vitest";

// Slow under the load of the full suite: this file's tests get their own timeout.
vi.setConfig({ testTimeout: 30_000 });
import { TABS_HEIGHT, TITLE_BAR_HEIGHT, TOP_ROW_HEIGHT } from "@/shell/layout";
import { readSource, sourceFiles } from "./cssBlocks";

const index = readSource("index.css");

it("binds Tailwind's dark variant to the dark theme, not to a fixed class (spec identité §4.5)", () => {
  expect(readSource("../index.html")).not.toMatch(/class="dark"/);
  expect(index).toContain('@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));');
});

it("puts menus, popovers, lists, dialogs and toasts in dense glass (spec identité §5.10)", () => {
  for (const slot of ["dropdown-menu-content", "dropdown-menu-sub-content", "popover-content", "select-content", "dialog-content"]) {
    expect(index).toContain(`[data-slot="${slot}"]`);
  }
  expect(index).toMatch(/\[data-slot="select-content"\] \{[^}]*var\(--ov-glass-strong\)[^}]*var\(--ov-blur\)[^}]*border-radius: 12px/);
  expect(index).toMatch(/\[data-slot="dialog-content"\] \{[^}]*var\(--ov-glass-strong\)[^}]*border-radius: 16px/);
  expect(index).toMatch(/\[data-slot="dialog-overlay"\] \{[^}]*rgb\(0 0 0 \/ 0\.25\)[^}]*blur\(3px\)/);
  expect(index).toMatch(/:root\[data-transparency="off"\] \[data-slot="dialog-overlay"\] \{[^}]*backdrop-filter: none/);
  expect(index).toMatch(/\[data-sonner-toast\]\[data-styled="true"\] \{[^}]*var\(--ov-glass-strong\)[^}]*border-radius: 14px/);
});

it("docks Excalidraw's properties panel in glass, right of the tool rail (spec identité §5.7)", () => {
  const excalidraw = readSource("theme/excalidraw.css");
  expect(excalidraw).toMatch(/\.excalidraw \.App-menu__left \{[^}]*left: 70px;[^}]*var\(--ov-glass-strong\)[^}]*var\(--ov-blur\)[^}]*border-radius: 14px/);
});

it("leaves nothing at the top of the canvas but the bars: no top toast, no banner under the tabs", () => {
  const sources = sourceFiles();
  for (const [file, text] of Object.entries(sources)) {
    expect(/position: "top-right"/.test(text), `${file} : toast en haut`).toBe(false);
    expect(/\btop-16\b/.test(text), `${file} : bandeau à 64 px, sous les onglets`).toBe(false);
  }
});

it("draws the bottom row and its command bar in dense glass: they carry text over dark terminals (spec identité §4.2, §5.8)", () => {
  for (const file of ["shell/CommandBar.tsx", "shell/GitChip.tsx", "shell/ZoomControl.tsx"]) {
    expect(readSource(file), file).toMatch(/ov-glass-strong/);
    expect(readSource(file), `${file} : verre léger sous du texte`).not.toMatch(/ov-glass(?!-strong)\b/);
  }
  expect(readSource("shell/CommandBar.tsx")).toContain("w-[680px]");
  expect(readSource("shell/messages.ts")).toContain("Consigne aux agents · @ pour cibler · / commande · ↑ historique");
  expect(readSource("fleet/CommandInput.tsx")).toContain("rounded-[10px]");
});

it("keeps nothing of the habillage shell (spec identité §5.11)", () => {
  const files = sourceFiles();
  for (const gone of ["shell/TopBar.tsx", "shell/DragStrip.tsx", "shell/LeftRail.tsx", "shell/RightRail.tsx", "shell/ActionChips.tsx", "shell/LiveCount.tsx", "shell/ui.tsx", "fleet/FleetPanel.tsx"]) {
    expect(files[gone], gone).toBeUndefined();
  }
  for (const [file, text] of Object.entries(files)) {
    expect(/\bov-chip\b|PillButton|ChipButton|RoundButton|fleetOpen|WindowCorner/.test(text), file).toBe(false);
  }
});

it("stacks the title bar and the tabs: 72 px of canvas under them (spec identité §7)", () => {
  expect([TITLE_BAR_HEIGHT, TABS_HEIGHT, TOP_ROW_HEIGHT]).toEqual([38, 34, 72]);
});
