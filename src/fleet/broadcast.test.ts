// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { Activity } from "@/ipc/activity";
import type { AgentId } from "@/ipc/pty";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import {
  canPause,
  canResume,
  pauseAgents,
  pausedStore,
  pausedText,
  RESUME_WINDOW_MS,
  resumeAgent,
  resumeAgents,
  resumedText,
  sendToAgents,
  skippedText,
  startingText,
  unsuitedText,
  waitingText,
} from "./broadcast";

let calls: { cmd: string; nodeId: string; text?: string }[];
let dead: Set<string>;

beforeEach(() => {
  calls = [];
  dead = new Set();
  mockIPC((cmd, args) => {
    if (cmd !== "pty_send_text" && cmd !== "pty_interrupt") return;
    const { nodeId, text } = args as { nodeId: string; text?: string };
    if (dead.has(nodeId)) throw { kind: "notFound", message: "aucun terminal actif" };
    calls.push({ cmd, nodeId, text });
    return cmd === "pty_interrupt" ? true : undefined;
  });
});
afterEach(() => clearMocks());

async function agent(id: string, agentId: AgentId, state: "running" | "stopped" | "starting", activity?: Activity) {
  await nodesStore.getState().create(id, {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: id, name: id[0].toUpperCase() + id.slice(1), agent: agentId, cwd: "C:/code", shell: "default", command: "" },
  });
  terminalStatusStore.getState().set(id, { state });
  if (activity) agentActivityStore.getState().apply({ nodeId: id, activity, since: 0 });
}

describe("sendToAgents", () => {
  it("types the command into the running agents and names the stopped ones", async () => {
    await agent("isis", "claude", "running", "idle");
    await agent("thot", "claude", "stopped");
    await agent("anubis", "codex", "stopped");
    expect(await sendToAgents(["isis", "thot", "anubis"], "lance les tests")).toEqual({ sent: 1, skipped: ["Thot", "Anubis"], waiting: [], unsuited: [], starting: [] });
    expect(calls).toEqual([{ cmd: "pty_send_text", nodeId: "isis", text: "lance les tests" }]);
  });

  it("names an agent still in its staggered start apart from the stopped ones (plan B3)", async () => {
    await agent("isis", "claude", "running", "idle");
    await agent("thot", "claude", "starting");
    expect(await sendToAgents(["isis", "thot"], "go")).toEqual({ sent: 1, skipped: [], waiting: [], unsuited: [], starting: ["Thot"] });
    expect(startingText(["Thot"])).toBe("1 agent en démarrage ignoré : Thot — réessaie dans un instant");
    expect(startingText([])).toBeNull();
  });

  it("counts an agent whose process just died as ignored", async () => {
    await agent("osiris", "claude", "running", "idle");
    dead.add("osiris");
    expect(await sendToAgents(["osiris"], "x")).toEqual({ sent: 0, skipped: ["Osiris"], waiting: [], unsuited: [], starting: [] });
  });

  it("leaves an agent waiting for an answer alone: Enter would approve its dialog", async () => {
    await agent("horus", "claude", "running", "waiting");
    await agent("seth2", "codex", "running", "working");
    expect(await sendToAgents(["horus", "seth2"], "lance les tests")).toEqual({ sent: 1, skipped: [], waiting: ["Horus"], unsuited: [], starting: [] });
    expect(calls.map((c) => c.nodeId)).toEqual(["seth2"]);
  });

  it("types a /command to the agents only: a shell would run it as a program", async () => {
    await agent("isis", "claude", "running", "idle");
    await agent("thot", "shell", "running");
    await agent("anubis", "codex", "running", "idle");
    expect(await sendToAgents(["isis", "thot", "anubis"], "/effort ultracode")).toEqual({ sent: 2, skipped: [], waiting: [], unsuited: ["Thot"], starting: [] });
    expect(calls.map((c) => c.nodeId)).toEqual(["isis", "anubis"]);
    calls = [];
    expect((await sendToAgents(["thot"], "npm test")).sent).toBe(1);
  });
});

describe("skippedText / pausedText / resumedText", () => {
  it("says who was ignored and how many were paused or resumed", () => {
    expect(skippedText([])).toBeNull();
    expect(skippedText(["Thot"])).toBe("1 agent arrêté ignoré : Thot");
    expect(skippedText(["Thot", "Anubis"])).toBe("2 agents arrêtés ignorés : Thot, Anubis");
    expect(unsuitedText([])).toBeNull();
    expect(unsuitedText(["Thot"])).toBe("1 terminal sans agent ignoré : Thot — une commande / ne va qu'aux agents");
    expect(unsuitedText(["Thot", "Rê"])).toBe("2 terminaux sans agent ignorés : Thot, Rê — une commande / ne va qu'aux agents");
    expect(waitingText([])).toBeNull();
    expect(waitingText(["Horus"])).toBe("1 agent en attente ignoré : Horus — réponds-lui dans son terminal");
    expect(waitingText(["Horus", "Isis"])).toBe("2 agents en attente ignorés : Horus, Isis — réponds-leur dans leur terminal");
    expect(pausedText(0)).toBe("Aucun agent en cours à mettre en pause");
    expect(pausedText(1)).toBe("1 agent mis en pause");
    expect(pausedText(5)).toBe("5 agents mis en pause");
    expect(resumedText(0)).toBe("Aucun agent mis en pause à reprendre");
    expect(resumedText(3)).toBe("3 agents repris");
  });
});

describe("canPause / canResume", () => {
  it("pauses a running agent at work, never a shell", () => {
    expect(canPause({ agent: "claude", running: true, activity: "working" })).toBe(true);
    expect(canPause({ agent: "claude", running: true, activity: "idle" })).toBe(false);
    expect(canPause({ agent: "claude", running: false, activity: "working" })).toBe(false);
    expect(canPause({ agent: "shell", running: true, activity: "working" })).toBe(false);
  });

  it("resumes a running agent that is idle, never a shell", () => {
    expect(canResume({ agent: "codex", running: true, activity: "idle" })).toBe(true);
    expect(canResume({ agent: "codex", running: true, activity: undefined })).toBe(true);
    expect(canResume({ agent: "codex", running: true, activity: "working" })).toBe(false);
    expect(canResume({ agent: "codex", running: true, activity: "waiting" })).toBe(false);
    expect(canResume({ agent: "shell", running: true, activity: "idle" })).toBe(false);
  });
});

describe("pauseAgents / resumeAgents", () => {
  it("forgets a pause once the agent works or waits again, or its process stops", async () => {
    await agent("min", "claude", "running", "idle");
    await agent("amon", "claude", "running", "idle");
    await agent("mout", "claude", "running", "idle");
    await agent("khonsu", "claude", "running", "idle");
    pausedStore.getState().mark(["min", "amon", "mout", "khonsu"], 1000);
    // Restarted by hand, or sent a command from the bar.
    agentActivityStore.getState().apply({ nodeId: "min", activity: "working", since: 2000 });
    agentActivityStore.getState().apply({ nodeId: "mout", activity: "waiting", since: 2000 });
    terminalStatusStore.getState().set("amon", { state: "exited", code: 0 });
    const { pausedAt } = pausedStore.getState();
    expect([pausedAt.min, pausedAt.amon, pausedAt.mout]).toEqual([undefined, undefined, undefined]);
    expect(pausedAt.khonsu).toBe(1000);
  });

  it("pauses the agents at work and remembers when", async () => {
    await agent("hera", "claude", "running", "working");
    await agent("zeus", "claude", "running", "idle");
    await agent("ares", "shell", "running", "working");
    expect(await pauseAgents(["hera", "zeus", "ares"], 1000)).toBe(1);
    expect(calls).toEqual([{ cmd: "pty_interrupt", nodeId: "hera", text: undefined }]);
    expect(pausedStore.getState().pausedAt.hera).toBe(1000);
  });

  it("resumes only the agents it paused less than a day ago, once idle", async () => {
    const now = 10 * RESUME_WINDOW_MS;
    await agent("ra", "claude", "running", "idle");
    await agent("ptah", "claude", "running", "idle");
    await agent("seth", "claude", "running", "idle");
    await agent("bastet", "claude", "running", "working");
    pausedStore.getState().mark(["ra", "bastet"], now - 3_600_000);
    pausedStore.getState().mark(["seth"], now - RESUME_WINDOW_MS - 1);
    expect(await resumeAgents(["ra", "ptah", "seth", "bastet"], now)).toBe(1);
    // On its own line: Claude Code puts a prompt interrupted before any answer back in its input.
    expect(calls).toEqual([{ cmd: "pty_send_text", nodeId: "ra", text: "\ncontinue" }]);
    expect(pausedStore.getState().pausedAt.ra).toBeUndefined();
    expect(pausedStore.getState().pausedAt.bastet).toBeDefined();
  });
});

describe("resumeAgent when the process just died (plan B3)", () => {
  it("says so instead of leaving the rejection unhandled, and stays paused", async () => {
    const warning = vi.spyOn(toast, "warning").mockImplementation(() => "");
    await agent("anubis2", "claude", "running", "idle");
    pausedStore.getState().mark(["anubis2"], 1);
    dead.add("anubis2");
    await expect(resumeAgent("anubis2")).resolves.toBe(false);
    expect(warning).toHaveBeenCalledWith("Anubis2 n'a pas pu reprendre : le processus vient de s'arrêter");
    expect(pausedStore.getState().pausedAt.anubis2).toBe(1);
    warning.mockRestore();
  });
});
