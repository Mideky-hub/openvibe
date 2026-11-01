// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { toast } from "sonner";
import { agentsPanelStore, loadAgentsPanel, readAgentsPanel, setAgentsPanel, showAgents } from "./agentsPanelState";

let saved: unknown[];

beforeEach(() => {
  saved = [];
  agentsPanelStore.setState({ open: false, filter: "all" });
});
afterEach(() => {
  clearMocks();
  vi.restoreAllMocks();
});

describe("the agents panel's state (spec identité §5.6)", () => {
  it("is open unless it was closed", () => {
    expect(readAgentsPanel("closed")).toBe(false);
    for (const raw of ["open", null, undefined, 3]) expect(readAgentsPanel(raw)).toBe(true);
  });

  it("comes back as it was left, open when nothing is saved", async () => {
    mockIPC((cmd) => (cmd === "get_setting" ? "closed" : undefined));
    await loadAgentsPanel();
    expect(agentsPanelStore.getState().open).toBe(false);
    mockIPC((cmd) => (cmd === "get_setting" ? null : undefined));
    await loadAgentsPanel();
    expect(agentsPanelStore.getState().open).toBe(true);
  });

  it("remembers each opening and closing", async () => {
    mockIPC((cmd, args) => {
      if (cmd === "set_setting") saved.push(args);
    });
    setAgentsPanel(true);
    setAgentsPanel(false);
    await vi.waitFor(() => expect(saved).toHaveLength(2));
    expect(saved).toEqual([
      { key: "ui.agentsPanel", value: "open" },
      { key: "ui.agentsPanel", value: "closed" },
    ]);
  });

  it("opens on what a counter of the title bar counts", () => {
    mockIPC(() => undefined);
    showAgents("waiting");
    expect(agentsPanelStore.getState()).toEqual({ open: true, filter: "waiting" });
  });

  it("says so when the choice cannot be saved, and keeps it", async () => {
    const error = vi.spyOn(toast, "error").mockImplementation(() => "");
    mockIPC(() => {
      throw new Error("disque plein");
    });
    setAgentsPanel(true);
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringMatching(/^Réglage non enregistré : .*disque plein/)));
    expect(agentsPanelStore.getState().open).toBe(true);
  });
});

it("forgets a counter's filter when the panel is reopened from the rail", () => {
  mockIPC(() => undefined);
  showAgents("working");
  expect(agentsPanelStore.getState().filter).toBe("working");
  setAgentsPanel(false);
  setAgentsPanel(true);
  expect(agentsPanelStore.getState().filter).toBe("all");
});
