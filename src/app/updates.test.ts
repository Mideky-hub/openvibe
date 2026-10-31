// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";
import { call } from "@/ipc/invoke";
import { flushAll } from "@/lib/flush";
import { checkForUpdate, CHECK_TIMEOUT_MS, FIRST_CHECK_MS, installUpdate, startUpdateChecks, updatesStore } from "./updates";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("@/ipc/invoke", () => ({ call: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/flush", () => ({ flushAll: vi.fn(() => Promise.resolve()), onFlushAll: vi.fn() }));

const steps: string[] = [];
function fakeUpdate(version = "1.0.0-beta.2") {
  return {
    version,
    body: "### Fixed\n- Things.",
    download: vi.fn(async (onEvent: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => {
      steps.push("download");
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 50 } });
      onEvent({ event: "Finished" });
    }),
    close: vi.fn(async () => undefined),
    install: vi.fn(async () => {
      steps.push("install");
    }),
  };
}

beforeEach(() => {
  steps.length = 0;
  updatesStore.setState({ auto: true, available: null, progress: null, dialogOpen: false });
  vi.mocked(check).mockReset();
  vi.mocked(toast).mockClear();
  vi.mocked(toast.error).mockClear();
});
afterEach(() => vi.useRealTimers());

it("offers a newer version it finds (spec première version §6.4)", async () => {
  vi.mocked(check).mockResolvedValue(fakeUpdate() as never);
  await checkForUpdate();
  expect(updatesStore.getState().available).toEqual({ version: "1.0.0-beta.2", notes: "### Fixed\n- Things." });
});

it("keeps a failed automatic check to the log, and tells a manual one", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.mocked(check).mockRejectedValue(new Error("offline"));
  await checkForUpdate();
  expect(toast.error).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalled();
  await checkForUpdate({ manual: true });
  expect(toast.error).toHaveBeenCalled();
  warn.mockRestore();
});

it("says so when a manual check finds nothing new", async () => {
  vi.mocked(check).mockResolvedValue(null);
  await checkForUpdate({ manual: true });
  expect(toast).toHaveBeenCalledWith("OpenVibe est à jour.");
});

it("downloads, saves everything, then installs", async () => {
  vi.mocked(check).mockResolvedValue(fakeUpdate() as never);
  await checkForUpdate();
  vi.mocked(flushAll).mockImplementation(async () => void steps.push("flush"));
  vi.mocked(call).mockImplementation(async (command: string) => void steps.push(command));
  await installUpdate();
  expect(steps).toEqual(["download", "flush", "prepare_for_update", "install"]);
  expect(updatesStore.getState().progress).toBe(1);
});

it("checks 10 s after the start, only when automatic checks are on", async () => {
  vi.useFakeTimers();
  vi.mocked(check).mockResolvedValue(null);
  updatesStore.setState({ auto: false });
  const stop = startUpdateChecks();
  await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS + 1);
  expect(check).not.toHaveBeenCalled();
  stop();
  updatesStore.setState({ auto: true });
  const stopAgain = startUpdateChecks();
  await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS + 1);
  expect(check).toHaveBeenCalledTimes(1);
  stopAgain();
});

it("does not close an open update dialog on an automatic check", async () => {
  updatesStore.setState({ dialogOpen: true });
  vi.mocked(check).mockResolvedValue(fakeUpdate() as never);
  await checkForUpdate();
  expect(updatesStore.getState().dialogOpen).toBe(true);
});

it("gives the request a timeout", async () => {
  vi.mocked(check).mockResolvedValue(null);
  await checkForUpdate();
  expect(check).toHaveBeenCalledWith({ timeout: CHECK_TIMEOUT_MS });
});

it("closes the previous Update when a new one is found", async () => {
  const first = fakeUpdate("1.0.0-beta.2");
  vi.mocked(check).mockResolvedValueOnce(first as never).mockResolvedValueOnce(fakeUpdate("1.0.0-beta.3") as never);
  await checkForUpdate();
  await checkForUpdate();
  expect(first.close).toHaveBeenCalledTimes(1);
});

it("blurs a field being edited before installing", async () => {
  vi.mocked(check).mockResolvedValue(fakeUpdate() as never);
  await checkForUpdate();
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  await installUpdate();
  expect(document.activeElement).not.toBe(input);
  input.remove();
});
