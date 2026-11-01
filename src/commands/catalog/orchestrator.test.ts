// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { arrive, showNode } from "@/canvas/arrive";
import { requestCloseOrchestrator } from "@/fleet/orchestrators";
import { pasteIntoTerminal } from "@/nodes/terminal/registry";
import { nodesStore } from "@/store/nodes";
import { uiStore } from "@/store/ui";
import { labelOf, sectionOf, type CommandContext } from "../command";
import { pendingUiRequest } from "../uiRequests";
import { ORCHESTRATOR } from "./orchestrator";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/canvas/arrive", () => ({ arrive: vi.fn(), showNode: vi.fn(), arrivingNode: vi.fn(() => null) }));
vi.mock("@/fleet/orchestrators", () => ({ requestCloseOrchestrator: vi.fn() }));
vi.mock("@/nodes/terminal/registry", () => ({ pasteIntoTerminal: vi.fn() }));
vi.mock("@/radial/bridges", () => ({ readClipboardText: vi.fn(() => Promise.resolve("texte")) }));

const palette: CommandContext = { project: true, workspaceId: "w1", terminalCount: 0, terminalId: null };
const ring: CommandContext = { ...palette, orchestratorId: "chef" };
const find = (id: string) => ORCHESTRATOR.find((c) => c.id === id)!;

beforeAll(async () => {
  mockIPC(() => undefined);
  await nodesStore.getState().create("chef", { workspaceId: "w1", kind: "orchestrator", payload: { name: "chef de backend" } });
});

describe("Orchestrateur · <nom> (spec menu radial §4.4, §6.2)", () => {
  it("is the radial menu's only: the palette never points at an orchestrator", () => {
    expect(ORCHESTRATOR.filter((c) => c.available(palette))).toEqual([]);
    expect(ORCHESTRATOR.map((c) => labelOf(c, ring))).toEqual(["Écrire une consigne", "Renommer", "Relier", "Coller", "Supprimer"]);
    expect(sectionOf(find("orchestrator.rename"), ring)).toBe("Orchestrateur · chef de backend");
  });

  it("does what the orchestrator's own controls do", async () => {
    await find("orchestrator.write").run(ring);
    expect(arrive).toHaveBeenCalledWith("chef");
    await find("orchestrator.rename").run(ring);
    expect(showNode).toHaveBeenCalledWith("chef");
    expect(pendingUiRequest()).toEqual({ kind: "renameOrchestrator", id: "chef" });
    await find("orchestrator.link").run(ring);
    expect(uiStore.getState().linking).toBe("chef");
    await find("orchestrator.paste").run(ring);
    expect(arrive).toHaveBeenCalledWith("chef");
    expect(pasteIntoTerminal).toHaveBeenCalledWith("chef", "texte");
    await find("orchestrator.remove").run(ring);
    expect(requestCloseOrchestrator).toHaveBeenCalledWith("chef");
  });
});
