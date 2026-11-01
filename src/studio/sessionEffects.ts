import { useEffect, useRef } from "react";
import { isDirty, type FileSession } from "./fileSession";
import { guardQuit } from "./studioStore";

/** Agents write by every means there is: the disk is compared this often (spec studio code §3). */
const POLL_MS = 2000;

/** The disk compared with the session's file, at once, then regularly and when the window comes back. */
export function useDiskWatch(session: FileSession | null) {
  useEffect(() => {
    if (!session) return;
    const poll = () => void session.getState().poll();
    poll();
    const timer = setInterval(poll, POLL_MS);
    window.addEventListener("focus", poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [session]);
}

/** Ctrl+S, in the capture phase, wherever the keyboard is (the tree, the search panel): else WebView2 offers to save the page. */
export function useSaveKey(save: () => void) {
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      event.stopPropagation();
      latest.current();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);
}

/** What any dialog holding a file session needs while it is open: the disk watched, Ctrl+S, the window held. */
export function useFileSessionEffects(session: FileSession) {
  useDiskWatch(session);

  useEffect(
    () =>
      guardQuit(
        () => session.getState().holdQuit(),
        () => isDirty(session.getState()),
      ),
    [session],
  );

  useSaveKey(() => void session.getState().save());
}
