import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";
import { createStore, useStore } from "zustand";
import { messages } from "@/i18n";
import { getSetting, setSetting } from "@/ipc/db";
import { call } from "@/ipc/invoke";
import { appMessages } from "./messages";
import { saveBeforeClose } from "./close";

/** The first look, once the app has settled; then a look every 6 h (spec première version §6.4). */
export const FIRST_CHECK_MS = 10_000;
export const CHECK_EVERY_MS = 6 * 60 * 60_000;
/** A blocked connection must not leave « Rechercher les mises à jour » without an answer. */
export const CHECK_TIMEOUT_MS = 30_000;
const AUTO_KEY = "updates.auto";

export interface UpdatesState {
  /** « Rechercher les mises à jour automatiquement »: the only request OpenVibe makes on its own. */
  auto: boolean;
  available: { version: string; notes: string } | null;
  /** 0 to 1 while the new version downloads. */
  progress: number | null;
  dialogOpen: boolean;
}

export const updatesStore = createStore<UpdatesState>()(() => ({ auto: true, available: null, progress: null, dialogOpen: false }));
export const useUpdates = <T>(selector: (state: UpdatesState) => T) => useStore(updatesStore, selector);

/** The update found by the last check, downloaded and installed by `installUpdate`. */
let found: Update | null = null;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** At boot. Unreadable settings keep checks on. */
export async function loadUpdateSettings() {
  try {
    updatesStore.setState({ auto: (await getSetting<unknown>(AUTO_KEY)) !== false });
  } catch (error) {
    console.warn(`update settings: ${message(error)}`);
  }
}

export async function setAutoUpdates(auto: boolean) {
  updatesStore.setState({ auto });
  await setSetting(AUTO_KEY, auto).catch((error: unknown) => toast.error(messages(appMessages).settingNotSaved(message(error))));
}

/** Asks GitHub for the latest release. An automatic check that fails only writes to the log. */
export async function checkForUpdate({ manual = false } = {}) {
  try {
    const update = await check({ timeout: CHECK_TIMEOUT_MS });
    if (!update) {
      if (manual) toast(messages(appMessages).upToDate);
      return;
    }
    const previous = found;
    found = update;
    if (previous) void previous.close().catch(() => undefined);
    // An automatic check never closes a dialog the user has open.
    updatesStore.setState((s) => ({ available: { version: update.version, notes: update.body ?? "" }, dialogOpen: manual || s.dialogOpen }));
  } catch (error) {
    if (manual) toast.error(messages(appMessages).updateCheckFailed, { description: message(error) });
    else console.warn(`update check failed: ${message(error)}`);
  }
}

/**
 * Downloads the new version, saves everything (scene, nodes, terminal histories),
 * then installs: Windows closes OpenVibe for the installer, which starts it again.
 */
export async function installUpdate() {
  const update = found;
  if (!update) return;
  let total = 0;
  let received = 0;
  updatesStore.setState({ progress: 0 });
  await update.download((event: DownloadEvent) => {
    if (event.event === "Started") total = event.data.contentLength ?? 0;
    if (event.event === "Progress") received += event.data.chunkLength;
    updatesStore.setState({ progress: event.event === "Finished" ? 1 : total > 0 ? Math.min(1, received / total) : 0 });
  });
  await saveBeforeClose();
  await call<void>("prepare_for_update");
  await update.install();
}

/** For the app's whole life: 10 s after the start, then every 6 h, while automatic checks are on. */
export function startUpdateChecks(): () => void {
  const run = () => {
    if (updatesStore.getState().auto) void checkForUpdate();
  };
  const first = setTimeout(run, FIRST_CHECK_MS);
  const every = setInterval(run, CHECK_EVERY_MS);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
