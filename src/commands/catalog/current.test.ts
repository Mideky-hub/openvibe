// @vitest-environment happy-dom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { showNode } from "@/canvas/arrive";
import { uiStore } from "@/store/ui";
import { focusGroup } from "@/canvas/canvasFocus";
import { canvasStore } from "@/canvas/canvasStore";
import { agentsPanelStore } from "@/fleet/agentsPanelState";
import { pauseAgents, pauseAll, resumeAgent } from "@/fleet/broadcast";
import { requestCloseGroup, setGroupFolded, ungroup } from "@/fleet/groups";
import { orchestrateGroup } from "@/fleet/orchestrators";
import { duplicateTerminal, requestClose } from "@/fleet/terminals";
import { pasteIntoTerminal, relaunchTerminal, stopTerminal, terminalSelection } from "@/nodes/terminal/registry";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { labelOf, sectionOf, type CommandContext } from "../command";
import { pendingUiRequest } from "../uiRequests";
import { reviewStore } from "@/review/reviewStore";
import { CURRENT } from "./current";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/canvas/arrive", () => ({ showNode: vi.fn(() => true), arrive: vi.fn(), arrivingNode: vi.fn(() => null) }));
vi.mock("@/canvas/viewSettled", () => ({ whenViewSettled: vi.fn(() => Promise.resolve()) }));
vi.mock("@/canvas/canvasFocus", () => ({ focusGroup: vi.fn(() => true), releaseToCanvas: vi.fn() }));
vi.mock("@/fleet/broadcast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/fleet/broadcast")>()),
  pauseAgents: vi.fn(() => Promise.resolve(1)),
  resumeAgent: vi.fn(() => Promise.resolve(true)),
  pauseAll: vi.fn(() => Promise.resolve()),
  resumeAll: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/fleet/groups", () => ({ requestCloseGroup: vi.fn(), ungroup: vi.fn(), setGroupFolded: vi.fn(), groupMembers: vi.fn(() => ["isis"]) }));
vi.mock("@/fleet/orchestrators", () => ({ orchestrateGroup: vi.fn(() => Promise.resolve()) }));
vi.mock("@/fleet/terminals", () => ({ duplicateTerminal: vi.fn(() => Promise.resolve()), requestClose: vi.fn() }));
vi.mock("@/nodes/terminal/registry", () => ({ relaunchTerminal: vi.fn(), stopTerminal: vi.fn(), terminalSelection: vi.fn(() => ""), pasteIntoTerminal: vi.fn() }));
vi.mock("@/radial/bridges", () => ({ readClipboardText: vi.fn(() => Promise.resolve("echo hi")) }));

const ctx = (terminalId: string | null): CommandContext => ({ project: true, workspaceId: "w1", terminalCount: 2, terminalId });
const find = (id: string) => CURRENT.find((c) => c.id === id)!;
const ids = (c: CommandContext) => CURRENT.filter((command) => command.available(c)).map((command) => command.id);

beforeAll(async () => {
  mockIPC(() => undefined);
  await nodesStore.getState().create("isis", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: "Isis", name: "Isis", agent: "claude", cwd: "C:/code", shell: "default", command: "", claudeSessionId: "s1" },
  });
  await nodesStore.getState().create("thot", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: "Thot", name: "Thot", agent: "codex", cwd: "C:/code", shell: "default", command: "" },
  });
});
beforeEach(() => {
  canvasStore.setState({
    frames: [{ id: "g1", name: "Serveurs", x: 0, y: 0, width: 10, height: 10, group: { role: "backend", pantheon: "egypt" }, memberIds: ["isis"] }],
  });
  terminalStatusStore.getState().set("isis", { state: "running" });
  terminalStatusStore.getState().set("thot", { state: "stopped" });
  agentActivityStore.getState().apply({ nodeId: "isis", activity: "working", since: 0 });
});
afterAll(() => clearMocks());

describe("Terminal · <prénom> and Groupe · <nom> (spec fenêtre §7.3)", () => {
  it("names its sections after the terminal of the moment and its group", () => {
    expect(sectionOf(find("terminal.rename"), ctx("isis"))).toBe("Terminal · Isis");
    expect(sectionOf(find("group.rename"), ctx("isis"))).toBe("Groupe · Serveurs");
    expect(CURRENT.map((c) => labelOf(c, ctx("isis")))).toEqual([
      "Renommer",
      "Dupliquer",
      "Revue des changements",
      "Relancer",
      "Arrêter le processus",
      "Mettre en pause",
      "Reprendre",
      "Fermer",
      "Copier",
      "Coller",
      "Renommer le groupe",
      "Ajouter un agent…",
      "Relier un orchestrateur",
      "Replier ou déplier le groupe",
      "Dégrouper",
      "Fermer le groupe",
      "Mettre le groupe en pause",
      "Reprendre le groupe",
      "Cadrer le groupe",
    ]);
  });

  it("offers each function under the rules of its button", () => {
    expect(ids(ctx(null))).toEqual([]);
    // Isis runs and works: no Reprendre; in a group.
    expect(ids(ctx("isis"))).toEqual([
      "terminal.rename",
      "terminal.duplicate",
      "terminal.review",
      "terminal.relaunch",
      "terminal.stop",
      "terminal.pause",
      "terminal.close",
      "terminal.copy",
      "terminal.paste",
      "group.rename",
      "group.addAgent",
      "group.orchestrate",
      "group.fold",
      "group.ungroup",
      "group.close",
      "group.pause",
      "group.resume",
      "group.frame",
    ]);
    // Thot is stopped and outside any group.
    expect(ids(ctx("thot"))).toEqual(["terminal.rename", "terminal.duplicate", "terminal.review", "terminal.relaunch", "terminal.close", "terminal.copy", "terminal.paste"]);
  });

  it("acts on the terminal of the moment, as its header and the panel's row do", async () => {
    await find("terminal.duplicate").run(ctx("isis"));
    expect(duplicateTerminal).toHaveBeenCalledWith("w1", "isis");
    await find("terminal.relaunch").run(ctx("isis"));
    expect(vi.mocked(relaunchTerminal).mock.calls[0][0]).toBe("isis");
    expect(vi.mocked(relaunchTerminal).mock.calls[0][2]).toBe("resume");
    await find("terminal.relaunch").run(ctx("thot"));
    expect(vi.mocked(relaunchTerminal).mock.calls[1][2]).toBe("new");
    await find("terminal.stop").run(ctx("isis"));
    expect(stopTerminal).toHaveBeenCalledWith("isis");
    await find("terminal.pause").run(ctx("isis"));
    expect(pauseAgents).toHaveBeenCalledWith(["isis"]);
    agentActivityStore.getState().apply({ nodeId: "isis", activity: "idle", since: 0 });
    await find("terminal.resume").run(ctx("isis"));
    expect(resumeAgent).toHaveBeenCalledWith("isis");
    await find("terminal.close").run(ctx("thot"));
    expect(requestClose).toHaveBeenCalledWith("thot");
  });

  it("shows the terminal without taking the keyboard, then opens its name editor", async () => {
    await find("terminal.rename").run(ctx("thot"));
    expect(showNode).toHaveBeenCalledWith("thot");
    expect(pendingUiRequest()).toEqual({ kind: "renameTerminal", id: "thot" });
  });

  it("acts on the group of the moment, as its menu does", async () => {
    await find("group.orchestrate").run(ctx("isis"));
    expect(orchestrateGroup).toHaveBeenCalledWith("g1");
    await find("group.fold").run(ctx("isis"));
    expect(setGroupFolded).toHaveBeenLastCalledWith("g1", true);
    canvasStore.setState({ frames: [{ ...canvasStore.getState().frames[0], group: { role: "backend", pantheon: "egypt", folded: true } }] as never });
    await find("group.fold").run(ctx("isis"));
    expect(setGroupFolded).toHaveBeenLastCalledWith("g1", false);
    canvasStore.setState({ frames: [{ ...canvasStore.getState().frames[0], group: { role: "backend", pantheon: "egypt" } }] as never });
    await find("group.ungroup").run(ctx("isis"));
    expect(ungroup).toHaveBeenCalledWith("g1");
    await find("group.close").run(ctx("isis"));
    expect(requestCloseGroup).toHaveBeenCalledWith("g1");
    agentsPanelStore.setState({ open: false, filter: "waiting" });
    await find("group.addAgent").run(ctx("isis"));
    expect(agentsPanelStore.getState()).toMatchObject({ open: true, filter: "all" });
    expect(pendingUiRequest()).toEqual({ kind: "groupMenu", id: "g1" });
    await find("group.rename").run(ctx("isis"));
    expect(focusGroup).toHaveBeenCalledWith("g1");
    // The name field opens once the view has settled, not on the scroll's first frame.
    await vi.waitFor(() => expect(uiStore.getState().renamingGroup).toBe("g1"));
  });

  it("copies the terminal's selection, greyed without one, and pastes the clipboard into it", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(() => Promise.resolve()) }, configurable: true });
    expect(find("terminal.copy").disabled!(ctx("isis"))).toBe("aucune sélection");
    vi.mocked(terminalSelection).mockReturnValue("ls -la");
    expect(find("terminal.copy").disabled!(ctx("isis"))).toBeNull();
    await find("terminal.copy").run(ctx("isis"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ls -la");
    await find("terminal.paste").run(ctx("isis"));
    expect(pasteIntoTerminal).toHaveBeenCalledWith("isis", "echo hi");
  });

  it("acts on the group the radial menu points at, not the terminal's", async () => {
    const pointed = { ...ctx("thot"), groupId: "g1" };
    expect(sectionOf(find("group.rename"), pointed)).toBe("Groupe · Serveurs");
    await find("group.pause").run(pointed);
    expect(pauseAll).toHaveBeenCalledWith(["isis"]);
    await find("group.frame").run(pointed);
    expect(focusGroup).toHaveBeenLastCalledWith("g1");
    expect(find("group.pause").available({ ...ctx("thot"), groupId: "gone" })).toBe(false);
  });
});

it("opens the review of the terminal of the moment (spec maj §5)", async () => {
  await find("terminal.review").run(ctx("thot"));
  expect(reviewStore.getState().nodeId).toBe("thot");
});


describe("a target that went between the palette and Entrée (plan F2)", () => {
  it("does nothing, without a TypeError: the group is gone", async () => {
    canvasStore.setState({ frames: [] });
    for (const id of ["group.rename", "group.addAgent", "group.orchestrate", "group.fold", "group.ungroup", "group.close", "group.pause", "group.resume", "group.frame"]) {
      await expect(Promise.resolve(find(id).run(ctx("isis")))).resolves.toBeUndefined();
    }
    expect(ungroup).not.toHaveBeenCalled();
    expect(requestCloseGroup).not.toHaveBeenCalled();
  });

  it("does nothing for Relancer when the terminal is gone", async () => {
    vi.mocked(relaunchTerminal).mockClear();
    await expect(Promise.resolve(find("terminal.relaunch").run(ctx("closed")))).resolves.toBeUndefined();
    expect(relaunchTerminal).not.toHaveBeenCalled();
  });
});
