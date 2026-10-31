// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { arrive } from "@/canvas/arrive";
import { canvasStore } from "@/canvas/canvasStore";
import { langStore } from "@/i18n";
import type { AgentId, AgentInfo } from "@/ipc/pty";
import { terminalStatusStore } from "@/store/terminalStatus";
import { agentsStore } from "./agentsStore";
import { installAgent, pullOllamaModel, watchTerminal } from "./installAgent";
import { launchAgent } from "./launchAgent";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/canvas/arrive", () => ({ arrive: vi.fn(() => true) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("./launchAgent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./launchAgent")>()),
  launchAgent: vi.fn(() => Promise.resolve("node-1")),
}));

const listOllamaModels = vi.hoisted(() => vi.fn(() => Promise.resolve([] as string[])));
vi.mock("@/ipc/pty", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/ipc/pty")>()), listOllamaModels }));

const launch = vi.mocked(launchAgent);
const available = (id: AgentId, yes: boolean): AgentInfo[] => [{ id, available: yes }];
const tick = () => vi.advanceTimersByTimeAsync(4000);

beforeEach(() => {
  vi.useFakeTimers();
  launch.mockClear();
  launch.mockResolvedValue("node-1");
  vi.mocked(toast).mockClear();
  vi.mocked(toast.error).mockClear();
  listOllamaModels.mockReset();
  listOllamaModels.mockResolvedValue([]);
  agentsStore.setState({ agents: [], shells: ["powershell", "cmd"], recheck: vi.fn(() => Promise.resolve()) });
  terminalStatusStore.setState({ statuses: { "node-1": { state: "running" } } });
});

afterEach(() => {
  vi.useRealTimers();
  langStore.setState({ lang: "fr" });
});

describe("installAgent", () => {
  it("runs the table's command in a titled terminal, at the given point", async () => {
    await installAgent("codex", { x: 10, y: 20 });
    expect(launch).toHaveBeenCalledTimes(1);
    const [agent, options, center] = launch.mock.calls[0];
    expect(agent).toBe("custom");
    expect(options).toMatchObject({
      command: 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
      shell: "powershell",
      title: "Installation · Codex",
    });
    expect(center).toEqual({ x: 10, y: 20 });
  });

  it("brings the terminal into view with the keyboard: an installer may ask something", async () => {
    vi.mocked(arrive).mockClear();
    await installAgent("codex");
    expect(arrive).toHaveBeenCalledWith("node-1");
  });

  it("runs npm commands in cmd", async () => {
    await installAgent("gemini");
    expect(launch.mock.calls[0][1]).toMatchObject({ command: "npm install -g @google/gemini-cli", shell: "cmd" });
  });

  it("lands at the center of the view without a point", async () => {
    canvasStore.setState({ view: { ...canvasStore.getState().view, scrollX: 0, scrollY: 0, zoom: 1, offsetLeft: 0, offsetTop: 0, width: 800, height: 600 } });
    await installAgent("aider");
    expect(launch.mock.calls[0][2]).toEqual({ x: 400, y: 300 });
  });

  it("starts nothing for an agent outside the table", async () => {
    expect(await installAgent("shell")).toBeNull();
    expect(launch).not.toHaveBeenCalled();
  });

  it("refreshes the detection until the agent shows up, then says so (spec installation §4.3)", async () => {
    const recheck = vi.fn(() => Promise.resolve());
    agentsStore.setState({ recheck, agents: available("codex", false) });
    await installAgent("codex");
    await tick();
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
    agentsStore.setState({ agents: available("codex", true) });
    await tick();
    expect(recheck).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenCalledWith("Codex est installé");
    await tick();
    expect(recheck).toHaveBeenCalledTimes(2);
  });

  it("says so when the terminal cannot be started", async () => {
    launch.mockRejectedValue(new Error("no shell"));
    expect(await installAgent("codex")).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("Lancement impossible : Error: no shell");
  });

  it("says so when there is no canvas to put the terminal on", async () => {
    launch.mockResolvedValue(null);
    expect(await installAgent("codex")).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("Ouvre un projet : l'installation se fait dans un terminal de son canvas.");
  });

  it("speaks English", async () => {
    langStore.setState({ lang: "en" });
    await installAgent("codex");
    expect(launch.mock.calls[0][1].title).toBe("Install · Codex");
    agentsStore.setState({ agents: available("codex", true) });
    await tick();
    expect(toast).toHaveBeenCalledWith("Codex is installed");
  });
});

describe("watchTerminal", () => {
  it("makes one last check when the terminal stops, then gives up", async () => {
    const found = vi.fn(() => Promise.resolve(false));
    watchTerminal("node-1", found, vi.fn());
    await tick();
    terminalStatusStore.getState().set("node-1", { state: "exited", code: 0 });
    await tick();
    expect(found).toHaveBeenCalledTimes(2);
    await tick();
    expect(found).toHaveBeenCalledTimes(2);
  });

  it("gives up when the terminal was closed", async () => {
    const found = vi.fn(() => Promise.resolve(false));
    watchTerminal("node-1", found, vi.fn());
    await tick();
    terminalStatusStore.getState().remove("node-1");
    await tick();
    await tick();
    expect(found).toHaveBeenCalledTimes(2);
  });

  it("waits for a terminal that has not started yet", async () => {
    terminalStatusStore.setState({ statuses: {} });
    const found = vi.fn(() => Promise.resolve(false));
    watchTerminal("node-1", found, vi.fn());
    await tick();
    await tick();
    expect(found).toHaveBeenCalledTimes(2);
  });

  it("stops after 30 minutes", async () => {
    const found = vi.fn(() => Promise.resolve(false));
    watchTerminal("node-1", found, vi.fn());
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    const calls = found.mock.calls.length;
    await tick();
    await tick();
    expect(found.mock.calls.length).toBe(calls);
  });

  it("survives a check that fails", async () => {
    const found = vi.fn<() => Promise<boolean>>().mockRejectedValueOnce(new Error("busy")).mockResolvedValueOnce(true);
    const onFound = vi.fn();
    watchTerminal("node-1", found, onFound);
    await tick();
    await tick();
    expect(onFound).toHaveBeenCalledTimes(1);
  });
});

describe("pullOllamaModel", () => {
  it("runs ollama pull in a visible PowerShell terminal", async () => {
    await pullOllamaModel("llama3.2:3b", { x: 1, y: 2 });
    const [agent, options, center] = launch.mock.calls[0];
    expect(agent).toBe("custom");
    expect(options).toMatchObject({ command: "ollama pull llama3.2:3b", shell: "powershell", title: "Ollama · llama3.2:3b" });
    expect(center).toEqual({ x: 1, y: 2 });
  });

  it("never launches an unsafe name", async () => {
    expect(await pullOllamaModel("a;calc")).toBeNull();
    expect(launch).not.toHaveBeenCalled();
  });

  it("says so once `ollama list` shows the model, tagged or not", async () => {
    await pullOllamaModel("llama3.2");
    await tick();
    expect(toast).not.toHaveBeenCalled();
    listOllamaModels.mockResolvedValue(["llama3.2:latest"]);
    await tick();
    expect(toast).toHaveBeenCalledWith("Modèle prêt : llama3.2");
  });
});
