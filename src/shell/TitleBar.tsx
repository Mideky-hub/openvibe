import type { ReactNode } from "react";
import { TITLE_BAR_HEIGHT } from "./layout";
import { Logo } from "./Logo";
import { WindowControls } from "./WindowControls";

/**
 * The title bar (spec identité §5.1): the logo, `leading` (the project picker,
 * or the app's name), `center` (the search field), `trailing` (the usage and
 * agent counts), the window buttons in the corner. Three columns: the sides
 * take at least their content's width and share the rest equally, so the
 * middle sits on the window's center whenever the sides allow it, and shrinks
 * rather than slide under the usage meter on a narrow window.
 * The bar and its two spacers carry Tauri's bare drag attribute: a click aimed
 * at them moves the window, a double-click maximizes it; a click on any button
 * inside does not.
 */
export function TitleBar({ leading, center, trailing }: { leading: ReactNode; center?: ReactNode; trailing?: ReactNode }) {
  return (
    <div
      data-tauri-drag-region=""
      className="ov-glass-strong grid w-full shrink-0 items-center rounded-none border-x-0 border-t-0 pl-3"
      style={{ height: TITLE_BAR_HEIGHT, gridTemplateColumns: "minmax(max-content, 1fr) minmax(0, auto) minmax(max-content, 1fr)" }}
    >
      <div className="flex h-full items-center gap-2">
        <span data-tauri-drag-region="" className="flex h-full items-center">
          <Logo />
        </span>
        {leading}
        <div data-tauri-drag-region="" className="h-full flex-1" />
      </div>
      <div className="flex min-w-0 justify-center px-2">{center}</div>
      <div className="flex h-full items-center gap-2">
        <div data-tauri-drag-region="" className="h-full flex-1" />
        {trailing}
        <WindowControls />
      </div>
    </div>
  );
}
