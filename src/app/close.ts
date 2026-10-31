import { flushAll } from "@/lib/flush";
import { holdQuit } from "@/studio/studioStore";

/**
 * Runs when the window is asked to close, before it is destroyed. A field being
 * edited (a terminal or workspace title) saves on blur, but WebView2 does not
 * blur it when the window closes, so it is blurred here first. The code
 * studio's unsaved changes are the user's to decide on: the window waits.
 */
export async function saveBeforeClose(event?: { preventDefault: () => void }): Promise<void> {
  if (holdQuit()) {
    event?.preventDefault();
    return;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
  await flushAll();
}
