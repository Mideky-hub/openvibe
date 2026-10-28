// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { toast } from "sonner";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { arrive } from "@/canvas/arrive";
import { canvasStore } from "@/canvas/canvasStore";
import { lastTerminalOf, terminalWithKeyboard } from "@/canvas/keyboardFocus";
import { nodesStore } from "@/store/nodes";
import { projectsStore } from "@/store/projects";
import { workspacesStore } from "@/store/workspaces";
import { commandFor, runCommand, type Command, type CommandContext } from "./command";
import { paletteStore } from "./paletteState";
import { COMMANDS, commandContext } from "./registry";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/canvas/arrive", () => ({ arrive: vi.fn() }));
vi.mock("@/canvas/keyboardFocus", () => ({ terminalWithKeyboard: vi.fn(() => null), lastTerminalOf: vi.fn(() => null) }));

const home: CommandContext = { project: false, workspaceId: null, terminalCount: 0, terminalId: null };
const empty: CommandContext = { project: true, workspaceId: "w1", terminalCount: 0, terminalId: null };
const busy: CommandContext = { project: true, workspaceId: "w1", terminalCount: 3, terminalId: "thot" };
const command = (id: string) => COMMANDS.find((c) => c.id === id)!;
const terminal = (id: string, x: number) =>
  ({ id, type: "embeddable", customData: { kind: "terminal" }, x, y: 100, width: 300, height: 200, isDeleted: false, frameId: null }) as unknown as ExcalidrawElement;

beforeAll(async () => {
  mockIPC(() => undefined);
  for (const id of ["isis", "thot", "anubis"]) {
    await nodesStore.getState().create(id, {
      workspaceId: "w1",
      kind: "terminal",
      payload: { title: id, name: id, agent: "claude", cwd: "C:/code", shell: "default", command: "" },
    });
  }
});
beforeEach(() => {
  vi.mocked(arrive).mockClear();
  canvasStore.setState({
    api: {
      getSceneElements: () => [terminal("isis", 0), terminal("thot", 400), terminal("anubis", 800)],
      getAppState: () => ({ selectedElementIds: {} }),
    } as unknown as ExcalidrawImperativeAPI,
    nodeIds: ["isis", "thot", "anubis"],
  });
  projectsStore.setState({ view: "project" } as never);
  workspacesStore.setState({ status: "ready", activeId: "w1" } as never);
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => clearMocks());

describe("the registry (spec fenêtre §6.1, §8)", () => {
  it("names each command once and gives each shortcut to one command", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const shortcuts = COMMANDS.flatMap((c) => (c.shortcut ? [c.shortcut] : []));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect(new Set(shortcuts)).toEqual(new Set(["Ctrl+Tab", "Ctrl+Maj+Tab", "Ctrl+P", "Ctrl+Maj+P", "Maj+Échap", "Ctrl+Maj+A", "Ctrl+G"]));
  });

  it("offers the terminal steps only with terminals, the palette everywhere", () => {
    const ids = (ctx: CommandContext) => COMMANDS.filter((c) => c.available(ctx)).map((c) => c.id);
    expect(ids(home)).toEqual(expect.arrayContaining(["palette.goTo", "palette.functions"]));
    expect(ids(home)).not.toContain("terminal.next");
    expect(ids(empty)).not.toContain("terminal.next");
    expect(ids(busy)).toEqual(expect.arrayContaining(["terminal.next", "terminal.previous", "canvas.release", "canvas.overview"]));
  });

  it("opens the palette from anywhere, in either mode", async () => {
    await command("palette.functions").run(home);
    expect(paletteStore.getState()).toMatchObject({ open: true, query: "> ", context: home });
    await command("palette.goTo").run(home);
    expect(paletteStore.getState().query).toBe("");
    paletteStore.setState({ open: false });
  });

  it("goes to the next and the previous terminal in reading order, from the current one", async () => {
    await command("terminal.next").run(busy);
    expect(arrive).toHaveBeenLastCalledWith("anubis");
    await command("terminal.previous").run(busy);
    expect(arrive).toHaveBeenLastCalledWith("isis");
    await command("terminal.next").run({ ...busy, terminalId: null });
    expect(arrive).toHaveBeenLastCalledWith("isis");
    await command("terminal.previous").run({ ...busy, terminalId: null });
    expect(arrive).toHaveBeenLastCalledWith("anubis");
  });

  it("finds the command of a shortcut only where it is available", () => {
    expect(commandFor(COMMANDS, "Ctrl+Tab", busy)?.id).toBe("terminal.next");
    expect(commandFor(COMMANDS, "Ctrl+Tab", empty)).toBeNull();
    expect(commandFor(COMMANDS, "Ctrl+P", home)?.id).toBe("palette.goTo");
  });

  it("says when a command fails", async () => {
    const error = vi.spyOn(toast, "error").mockImplementation(() => "");
    const failing: Command = { ...command("canvas.overview"), run: () => Promise.reject(new Error("canvas absent")) };
    runCommand(failing, busy);
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringMatching(/^Vue d'ensemble impossible : .*canvas absent/)));
  });
});

describe("commandContext", () => {
  it("reads the open project, its workspace on screen and its terminals", () => {
    expect(commandContext()).toEqual({ project: true, workspaceId: "w1", terminalCount: 3, terminalId: null });
  });

  it("starts from the terminal that has the keyboard, else from the last one of the workspace", () => {
    vi.mocked(lastTerminalOf).mockReturnValue("anubis");
    expect(commandContext().terminalId).toBe("anubis");
    vi.mocked(terminalWithKeyboard).mockReturnValue("thot");
    expect(commandContext().terminalId).toBe("thot");
    vi.mocked(terminalWithKeyboard).mockReturnValue(null);
  });

  it("forgets a remembered terminal that left the canvas", () => {
    vi.mocked(lastTerminalOf).mockReturnValue("closed-meanwhile");
    expect(commandContext().terminalId).toBeNull();
  });

  it("knows the home screen", () => {
    projectsStore.setState({ view: "home" } as never);
    expect(commandContext()).toEqual({ project: false, workspaceId: null, terminalCount: 0, terminalId: null });
  });
});
