import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { defaultAgentStore } from "@/fleet/defaultAgentChoice";
import { setActivityThreshold as applyThreshold } from "@/ipc/activity";
import { getSetting, setSetting } from "@/ipc/db";
import {
  ACTIVITY_THRESHOLDS,
  activityThresholdStore,
  loadAgentSettings,
  setActivityThreshold,
  setDefaultAgent,
} from "./agentSettings";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/ipc/db", () => ({ getSetting: vi.fn(), setSetting: vi.fn(() => Promise.resolve()) }));
vi.mock("@/ipc/activity", () => ({ setActivityThreshold: vi.fn(() => Promise.resolve()) }));

const saved = (values: Record<string, unknown>) =>
  vi.mocked(getSetting).mockImplementation((key: string) => Promise.resolve(values[key] as never));

beforeEach(() => {
  vi.clearAllMocks();
  defaultAgentStore.setState({ choice: "auto" });
  activityThresholdStore.setState({ ms: 1500 });
});

describe("the default agent setting", () => {
  it("is automatic until one is chosen", async () => {
    saved({});
    await loadAgentSettings();
    expect(defaultAgentStore.getState().choice).toBe("auto");
  });

  it("stays chosen after a restart", async () => {
    saved({ "agents.default": "gemini" });
    await loadAgentSettings();
    expect(defaultAgentStore.getState().choice).toBe("gemini");
  });

  it("ignores an agent that cannot start without options, or an unknown one", async () => {
    saved({ "agents.default": "ollama" });
    await loadAgentSettings();
    expect(defaultAgentStore.getState().choice).toBe("auto");
    saved({ "agents.default": "nope" });
    await loadAgentSettings();
    expect(defaultAgentStore.getState().choice).toBe("auto");
  });

  it("saves the choice", async () => {
    await setDefaultAgent("codex");
    expect(defaultAgentStore.getState().choice).toBe("codex");
    expect(setSetting).toHaveBeenCalledWith("agents.default", "codex");
  });

  it("applies the choice for the session and says so when it cannot be saved", async () => {
    vi.mocked(setSetting).mockRejectedValueOnce(new Error("disk full"));
    await setDefaultAgent("shell");
    expect(defaultAgentStore.getState().choice).toBe("shell");
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("disk full"));
  });
});

describe("the activity threshold setting", () => {
  it("offers 1.5 s, the default, among its values", () => {
    expect(ACTIVITY_THRESHOLDS).toContain(1500);
    expect(activityThresholdStore.getState().ms).toBe(1500);
  });

  it("hands the saved threshold to the activity tracker at boot", async () => {
    saved({ "agents.activityThresholdMs": 3000 });
    await loadAgentSettings();
    expect(activityThresholdStore.getState().ms).toBe(3000);
    expect(applyThreshold).toHaveBeenCalledWith(3000);
  });

  it("leaves the tracker's default alone when nothing valid is saved", async () => {
    saved({ "agents.activityThresholdMs": "fast" });
    await loadAgentSettings();
    expect(activityThresholdStore.getState().ms).toBe(1500);
    expect(applyThreshold).not.toHaveBeenCalled();
  });

  it("saves the threshold and applies it at once", async () => {
    await setActivityThreshold(5000);
    expect(activityThresholdStore.getState().ms).toBe(5000);
    expect(setSetting).toHaveBeenCalledWith("agents.activityThresholdMs", 5000);
    expect(applyThreshold).toHaveBeenCalledWith(5000);
  });

  it("keeps both settings when one cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(getSetting).mockRejectedValue(new Error("locked"));
    await loadAgentSettings();
    expect(defaultAgentStore.getState().choice).toBe("auto");
    expect(activityThresholdStore.getState().ms).toBe(1500);
    warn.mockRestore();
  });
});
