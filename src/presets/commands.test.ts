// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { toast } from "sonner";
import { canvasStore, EMPTY_VIEW } from "@/canvas/canvasStore";
import { agentsStore } from "@/fleet/agentsStore";
import type { CommandContext } from "@/commands/command";
import { labelOf, runCommand, sectionOf } from "@/commands/command";
import { pendingUiRequest } from "@/commands/uiRequests";
import { langStore } from "@/i18n";
import type { TeamPreset } from "./model";
import { presetCommands } from "./commands";
import { presetsStore } from "./store";
import { deployPreset } from "./deploy";

vi.mock("@excalidraw/excalidraw", () => ({ CaptureUpdateAction: { NEVER: "n" }, newElementWith: (e: object, patch: object) => ({ ...e, ...patch }) }));
vi.mock("./deploy", () => ({ deployPreset: vi.fn(async () => ({ groups: 2, agents: 3, orchestrators: 1, substituted: 1, orchestratorsSkipped: 0 })) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }) }));

const preset = (name: string, id: string): TeamPreset => ({
  id,
  name,
  savedAt: 1,
  groups: [{ name: "G", role: "docs", agents: ["claude", "codex"], x: 0, y: 0 }, { name: "H", role: "backend", agents: ["claude"], x: 900, y: 0 }],
  orchestrators: [],
});
const project: CommandContext = { project: true, workspaceId: "w1", terminalCount: 1, terminalId: null };
const home: CommandContext = { project: false, workspaceId: null, terminalCount: 0, terminalId: null };

beforeEach(() => {
  mockIPC(() => null);
  langStore.setState({ lang: "fr" });
  vi.clearAllMocks();
  presetsStore.setState({ presets: [preset("Dev HQ", "1")], loaded: true });
  agentsStore.setState({ agents: [{ id: "claude", available: true }], shells: [], loaded: true });
  canvasStore.setState({
    api: { getSceneElements: () => [], getAppState: () => ({}) } as never,
    view: { ...EMPTY_VIEW, width: 1000, height: 800 },
    frames: [{ id: "g", name: "G", x: 0, y: 0, width: 10, height: 10, group: { role: "docs", pantheon: "egyptian" }, memberIds: ["t"] }],
  });
});
afterEach(() => clearMocks());

describe("the lines of the palette (spec presets §3)", () => {
  it("lists save, then deploy and delete for each preset, with the agents announced, in the language of the moment", () => {
    const commands = presetCommands([preset("Dev HQ", "1"), preset("Tests", "2")]);
    expect(commands.map((c) => c.id)).toEqual(["presets.save", "presets.deploy.1", "presets.remove.1", "presets.deploy.2", "presets.remove.2"]);
    expect(commands.map((c) => labelOf(c, project))).toEqual([
      "Enregistrer l'équipe comme preset…",
      "Déployer l'équipe : Dev HQ (3 agents)",
      "Supprimer le preset : Dev HQ",
      "Déployer l'équipe : Tests (3 agents)",
      "Supprimer le preset : Tests",
    ]);
    expect(sectionOf(commands[0], project)).toBe("Équipes");
    langStore.setState({ lang: "en" });
    expect(labelOf(commands[1], project)).toBe("Deploy team: Dev HQ (3 agents)");
    expect(sectionOf(commands[0], project)).toBe("Teams");
  });

  it("offers nothing at home, and no save without a group of agents on screen", () => {
    const commands = presetCommands([preset("Dev HQ", "1")]);
    expect(commands.filter((c) => c.available(home))).toEqual([]);
    canvasStore.setState({ frames: [] });
    expect(commands.filter((c) => c.available(project)).map((c) => c.id)).toEqual(["presets.deploy.1", "presets.remove.1"]);
  });

  it("asks for a name to save, through a request to the interface", () => {
    runCommand(presetCommands([])[0], project);
    expect(pendingUiRequest()).toEqual({ kind: "savePreset" });
  });

  it("deploys through deployPreset, and says what it did, the replaced agents too", async () => {
    const [, deploy] = presetCommands([preset("Dev HQ", "1")]);
    runCommand(deploy, project);
    await vi.waitFor(() => expect(deployPreset).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("Équipe « Dev HQ » déployée : 2 groupes, 3 agents, 1 orchestrateur"));
    expect(toast.warning).toHaveBeenCalledWith("1 agent absent de cet ordinateur remplacé par l'agent par défaut");
  });

  it("deletes a preset", async () => {
    const [, , remove] = presetCommands([preset("Dev HQ", "1")]);
    runCommand(remove, project);
    await vi.waitFor(() => expect(presetsStore.getState().presets).toEqual([]));
    // A search that ranks the delete line first must not cost a preset: the toast takes it back.
    const [, options] = vi.mocked(toast).mock.calls.find(([text]) => text === "Preset « Dev HQ » supprimé")! as [string, { action: { label: string; onClick: () => void } }];
    expect(options.action.label).toBe("Annuler");
    options.action.onClick();
    await vi.waitFor(() => expect(presetsStore.getState().presets.map((p) => p.name)).toEqual(["Dev HQ"]));
  });
});
