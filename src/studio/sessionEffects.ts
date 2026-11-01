import { useEffect } from "react";
import { isDirty, type FileSession } from "./fileSession";
import { guardQuit } from "./studioStore";

/** Agents write by every means there is: the disk is compared this often (spec studio code §3). */
const POLL_MS = 2000;

/** What any dialog holding a file session needs while it is open: the disk watched, Ctrl+S, the window held. */
export function useFileSessionEffects(session: FileSession) {
  useEffect(() => {
    const poll = () => void session.getState().poll();
    const timer = setInterval(poll, POLL_MS);
    window.addEventListener("focus", poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [session]);

  useEffect(
    () =>
      guardQuit(
        () => session.getState().holdQuit(),
        () => isDirty(session.getState()),
      ),
    [session],
  );

  useEffect(() => {
    // In the capture phase, wherever the keyboard is (the tree, the search panel): else WebView2 offers to save the page.
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      event.stopPropagation();
      void session.getState().save();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [session]);
}
