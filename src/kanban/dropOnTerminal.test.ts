import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => vi.fn<(nodeId: string, text: string) => Promise<void>>(() => Promise.resolve()));
vi.mock("@/ipc/pty", () => ({ ptySendText: sent }));
vi.mock("@/ipc/db", () => ({ saveNode: vi.fn(() => Promise.resolve()) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { canvasStore } from "@/canvas/canvasStore";
import { nodesStore } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { dropCardOutside, sendCardToTerminal } from "./dropOnTerminal";

const terminal = { cwd: "C:/", agent: "claude" as const, title: "Claude", name: "Isis", shell: "default" as const, command: "" };
const board = {
  columns: [{ id: "c1", title: "To do", cardIds: ["k1"] }],
  cards: { k1: { id: "k1", title: "Fix login", notes: "On Safari", priority: "high" as const } },
};

beforeEach(async () => {
  sent.mockClear();
  await nodesStore.getState().create("t1", { workspaceId: "w1", kind: "terminal", payload: terminal });
  await nodesStore.getState().create("b1", { workspaceId: "w1", kind: "kanban", payload: board });
  terminalStatusStore.getState().set("t1", { state: "running" });
});

describe("sendCardToTerminal", () => {
  it("types the card's title and notes into a running terminal", async () => {
    expect(await sendCardToTerminal("b1", "k1", "t1")).toBe(true);
    expect(sent).toHaveBeenCalledWith("t1", "Fix login\n\nOn Safari");
  });

  it("sends nothing to a stopped terminal or for an unknown card", async () => {
    expect(await sendCardToTerminal("b1", "nope", "t1")).toBe(false);
    terminalStatusStore.getState().set("t1", { state: "stopped" });
    expect(await sendCardToTerminal("b1", "k1", "t1")).toBe(false);
    expect(sent).not.toHaveBeenCalled();
  });
});

describe("dropCardOutside", () => {
  it("sends the card to the terminal under the drop point", async () => {
    const element = { id: "t1", type: "embeddable", x: 0, y: 0, width: 720, height: 440, isDeleted: false, customData: { kind: "terminal" } };
    canvasStore.setState({
      api: { getSceneElements: () => [element] } as never,
      view: { ...canvasStore.getState().view, scrollX: 0, scrollY: 0, zoom: 1, offsetLeft: 0, offsetTop: 0 },
    });
    dropCardOutside("b1", "k1", 100, 100);
    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith("t1", "Fix login\n\nOn Safari"));
    sent.mockClear();
    dropCardOutside("b1", "k1", 2000, 2000);
    await Promise.resolve();
    expect(sent).not.toHaveBeenCalled();
  });
});
