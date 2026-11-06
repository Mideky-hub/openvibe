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
 * The bar carries Tauri's "deep" drag attribute: a click on it or on anything
 * inside (the logo, the app's name, the gaps) moves the window, a double-click
 * maximizes it; a click on a button or a field inside does not.
 * The drag works only if nothing covers the bar: ProjectView and HomeScreen
 * must create no stacking context around it (no `isolate`, transform, opacity
 * or filter), so the bar (z-30) stays above the canvas's drag strip (z-20).
 */
export function TitleBar({ leading, center, trailing }: { leading: ReactNode; center?: ReactNode; trailing?: ReactNode }) {
  return (
    <div
      data-tauri-drag-region="deep"
      className="ov-glass-strong grid w-full shrink-0 items-center rounded-none border-x-0 border-t-0 pl-3"
      style={{ height: TITLE_BAR_HEIGHT, gridTemplateColumns: "minmax(max-content, 1fr) minmax(0, auto) minmax(max-content, 1fr)" }}
    >
      <div className="flex h-full items-center gap-2">
        <span className="flex h-full items-center">
          <Logo />
        </span>
        {leading}
        <div className="h-full flex-1" />
      </div>
      <div className="flex min-w-0 justify-center px-2">{center}</div>
      <div className="flex h-full items-center gap-2">
        <div className="h-full flex-1" />
        {trailing}
        <WindowControls />
      </div>
    </div>
  );
}
