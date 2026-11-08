import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { getSetting, setSetting } from "@/ipc/db";
import { bindShortcut, loadShortcuts, resetShortcuts } from "./shortcutSettings";
import { shortcutBindingsStore } from "./shortcuts";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/ipc/db", () => ({ getSetting: vi.fn(), setSetting: vi.fn(() => Promise.resolve()) }));
// The canvas's own keys, as the registry lists them.
vi.mock("./registry", () => ({ COMMANDS: [{ id: "drawing.duplicate", keys: "Ctrl+D" }, { id: "edit.undo", keys: "Ctrl+Z" }] }));

const bindings = () => shortcutBindingsStore.getState().bindings;

beforeEach(() => {
  vi.clearAllMocks();
  shortcutBindingsStore.setState({ bindings: {} });
});

describe("the keyboard shortcuts setting (issue #84)", () => {
  it("keeps the shortcuts of the application until one is changed", async () => {
    vi.mocked(getSetting).mockResolvedValue(null as never);
    await loadShortcuts();
    expect(bindings()).toEqual({});
  });

  it("keeps the keys given after a restart, without what would clash", async () => {
    vi.mocked(getSetting).mockResolvedValue({ "Ctrl+P": "Ctrl+K", "Ctrl+G": "Ctrl+D" } as never);
    await loadShortcuts();
    expect(bindings()).toEqual({ "Ctrl+P": "Ctrl+K" });
  });

  it("saves new keys", async () => {
    expect(await bindShortcut("Ctrl+P", "Ctrl+K")).toEqual({ ok: true });
    expect(bindings()).toEqual({ "Ctrl+P": "Ctrl+K" });
    expect(setSetting).toHaveBeenCalledWith("ui.shortcuts", { "Ctrl+P": "Ctrl+K" });
  });

  it("refuses keys another function has, and saves nothing", async () => {
    expect(await bindShortcut("Ctrl+P", "Ctrl+G")).toEqual({ ok: false, reason: "conflict", with: "Ctrl+G" });
    expect(await bindShortcut("Ctrl+P", "Ctrl+D")).toEqual({ ok: false, reason: "reserved" });
    expect(bindings()).toEqual({});
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("forgets a binding given back its own keys", async () => {
    shortcutBindingsStore.setState({ bindings: { "Ctrl+P": "Ctrl+K" } });
    await bindShortcut("Ctrl+P", "Ctrl+P");
    expect(bindings()).toEqual({});
    expect(setSetting).toHaveBeenCalledWith("ui.shortcuts", {});
  });

  it("gives every function its own keys back", async () => {
    shortcutBindingsStore.setState({ bindings: { "Ctrl+P": "Ctrl+K", "Ctrl+G": "F2" } });
    await resetShortcuts();
    expect(bindings()).toEqual({});
    expect(setSetting).toHaveBeenCalledWith("ui.shortcuts", {});
  });

  it("applies new keys for the session and says so when they cannot be saved", async () => {
    vi.mocked(setSetting).mockRejectedValueOnce(new Error("disk full"));
    await bindShortcut("Ctrl+P", "Ctrl+K");
    expect(bindings()).toEqual({ "Ctrl+P": "Ctrl+K" });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("disk full"));
  });
});
