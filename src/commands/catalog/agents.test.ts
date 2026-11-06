// @vitest-environment happy-dom
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { agentsPanelStore } from "@/fleet/agentsPanelState";
import { agentsStore } from "@/fleet/agentsStore";
import { pauseAll, resumeAll } from "@/fleet/broadcast";
import { langStore } from "@/i18n";
import { launchAt, launchFour, newConsole, placeOrchestrator } from "@/fleet/quickActions";
import { labelOf, type Command, type CommandContext } from "../command";
import { pendingUiRequest } from "../uiRequests";
import { AGENT_COMMANDS } from "./agents";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/fleet/quickActions", () => ({ launchAt: vi.fn(), newConsole: vi.fn(), launchFour: vi.fn(), placeOrchestrator: vi.fn() }));
vi.mock("@/kanban/place", () => ({ placeKanban: vi.fn() }));
vi.mock("@/goals/place", () => ({ placeGoals: vi.fn() }));
vi.mock("@/calendar/place", () => ({ placeCalendar: vi.fn() }));
vi.mock("@/fleet/broadcast", () => ({ pauseAll: vi.fn(() => Promise.resolve()), resumeAll: vi.fn(() => Promise.resolve()), workspaceTerminalIds: () => ["isis"] }));

const busy: CommandContext = { project: true, workspaceId: "w1", terminalCount: 1, terminalId: "isis" };
const find = (id: string) => AGENT_COMMANDS.find((c) => c.id === id)!;

beforeEach(() => {
  mockIPC(() => undefined);
  agentsStore.setState({
    loaded: true,
    agents: [
      { id: "claude", available: true },
      { id: "codex", available: false },
      { id: "shell", available: true },
    ],
  } as never);
});
afterAll(() => clearMocks());

describe("Agents (spec fenêtre §7.3)", () => {
  it("lists the spec's functions, in its order", () => {
    expect(AGENT_COMMANDS.map((c) => labelOf(c, busy))).toEqual([
      "Lancer Claude",
      "Installer Codex…",
      "Installer Gemini…",
      "Installer Qwen Code…",
      "Installer Cursor…",
      "Installer OpenCode…",
      "Installer Aider…",
      "Installer Ollama…",
      "Lancer Shell",
      "Lancer un agent personnalisé…",
      "Autre agent…",
      "Comptes Claude…",
      "Nouvelle console",
      "Lancer 4 agents",
      "Orchestrateur",
      "Kanban",
      "Objectifs",
      "Calendrier",
      "Composer un groupe…",
      "Tout mettre en pause",
      "Tout reprendre",
    ]);
  });

  it("offers to install a missing agent, through the menu's confirmation (spec installation §4.1)", async () => {
    const codex = find("agent.launch.codex");
    expect(labelOf(codex, busy)).toBe("Installer Codex…");
    expect(codex.disabled!(busy)).toBeNull();
    expect(codex.keywords).toContain("installer");
    await codex.run(busy);
    expect(launchAt).not.toHaveBeenCalled();
    expect(pendingUiRequest()).toEqual({ kind: "agentMenu", view: { install: "codex" } });
    await codex.run({ ...busy, at: { x: 1, y: 2 } });
    expect(pendingUiRequest()).toEqual({ kind: "agentMenu", view: { install: "codex" }, at: { x: 1, y: 2 } });
  });

  it("speaks English when it offers an install", () => {
    langStore.setState({ lang: "en" });
    expect(labelOf(find("agent.launch.codex"), busy)).toBe("Install Codex…");
    expect(find("agent.launch.codex").keywords).toContain("install");
    langStore.setState({ lang: "fr" });
  });

  it("keeps launching before the first detection, when nothing is known to be missing", () => {
    agentsStore.setState({ loaded: false, agents: [] } as never);
    expect(labelOf(find("agent.launch.codex"), busy)).toBe("Lancer Codex");
    expect(find("agent.launch.codex").disabled!(busy)).toBeNull();
  });

  it("offers Ollama's install rather than its models when it is missing", async () => {
    await find("agent.launch.ollama").run(busy);
    expect(pendingUiRequest()).toEqual({ kind: "agentMenu", view: { install: "ollama" } });
  });

  it("launches an agent at the center of the view", async () => {
    expect(find("agent.launch.claude").disabled!(busy)).toBeNull();
    await find("agent.launch.claude").run(busy);
    expect(launchAt).toHaveBeenCalledWith("claude", undefined);
  });

  it("opens the Agent menu on Ollama's models and on the custom command", async () => {
    agentsStore.setState({ agents: [{ id: "ollama", available: true }] } as never);
    await find("agent.launch.ollama").run(busy);
    expect(pendingUiRequest()).toEqual({ kind: "agentMenu", view: "ollama" });
    await find("agent.custom").run(busy);
    expect(pendingUiRequest()).toEqual({ kind: "agentMenu", view: "options" });
  });

  it("does what the panel and the ＋ menu do", async () => {
    await find("agent.console").run(busy);
    await find("agent.four").run(busy);
    await find("agent.orchestrator").run(busy);
    await find("agents.pauseAll").run(busy);
    await find("agents.resumeAll").run(busy);
    expect([newConsole, launchFour, placeOrchestrator].every((f) => vi.mocked(f).mock.calls.length === 1)).toBe(true);
    expect(pauseAll).toHaveBeenCalledWith(["isis"]);
    expect(resumeAll).toHaveBeenCalledWith(["isis"]);
  });

  it("creates where the radial menu was opened, when it says where", async () => {
    const at = { x: 10, y: 20 };
    await find("agent.launch.claude").run({ ...busy, at });
    expect(launchAt).toHaveBeenLastCalledWith("claude", at);
    await find("agent.four").run({ ...busy, at });
    expect(launchFour).toHaveBeenLastCalledWith(at);
    await find("agent.orchestrator").run({ ...busy, at });
    expect(placeOrchestrator).toHaveBeenLastCalledWith(at);
    agentsStore.setState({ agents: [{ id: "claude", available: true }, { id: "ollama", available: true }] } as never);
    await find("agent.launch.ollama").run({ ...busy, at });
    expect(pendingUiRequest()).toEqual({ kind: "agentMenu", view: "ollama", at });
  });

  it("opens the Agent menu on its catalog, the chosen agent launched at the radial menu's point (« Autre agent… »)", async () => {
    await find("agent.other").run({ ...busy, at: { x: 1, y: 2 } });
    expect(pendingUiRequest()).toEqual({ kind: "agentMenu", view: "agents", at: { x: 1, y: 2 } });
  });

  it("composes a group from the agents panel, opened if needed", async () => {
    agentsPanelStore.setState({ open: false });
    await find("group.compose").run(busy);
    expect(agentsPanelStore.getState().open).toBe(true);
    expect(pendingUiRequest()).toEqual({ kind: "composeGroup" });
  });

  it("is offered in a project only", () => {
    const home: CommandContext = { project: false, workspaceId: null, terminalCount: 0, terminalId: null };
    expect(AGENT_COMMANDS.filter((c: Command) => c.available(home))).toEqual([]);
  });
});
