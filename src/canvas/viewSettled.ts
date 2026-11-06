import { canvasStore } from "./canvasStore";

/**
 * Resolves once the view has stopped moving for `quietMs`, or after `limitMs`
 * at the latest: an animated scroll changes it on every frame, and a field
 * focused on the first one lands before the label has reached its place.
 */
export function whenViewSettled(quietMs = 120, limitMs = 1000): Promise<void> {
  return new Promise((resolve) => {
    let quiet: ReturnType<typeof setTimeout>;
    const finish = () => {
      clearTimeout(quiet);
      clearTimeout(limit);
      unsubscribe();
      resolve();
    };
    const limit = setTimeout(finish, limitMs);
    const unsubscribe = canvasStore.subscribe((state, previous) => {
      if (state.view === previous.view) return;
      clearTimeout(quiet);
      quiet = setTimeout(finish, quietMs);
    });
    quiet = setTimeout(finish, quietMs);
  });
}
