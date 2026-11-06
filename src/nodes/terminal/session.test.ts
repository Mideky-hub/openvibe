// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { accountsStore, openAccounts } from "@/accounts/store";
import type { TerminalPayload } from "@/nodes/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { nodesStore } from "@/store/nodes";
import { workspacesStore } from "@/store/workspaces";
import { statusOf, terminalStatusStore } from "@/store/terminalStatus";
import { acceptsInput, attachSession, reattachSession, relaunchSession, restoreSession, startSession, type TermSink } from "./session";

const payload: TerminalPayload = { title: "A", name: "", cwd: "C:/code", agent: "shell", command: "", shell: "default" };

/** Records writes; runs write callbacks only when `drain` is called, like xterm's async parser. */
function fakeTerm() {
  const written: string[] = [];
  const callbacks: (() => void)[] = [];
  const term: TermSink & { written: string[]; drain: () => void } = {
    cols: 100,
    rows: 30,
    written,
    write(data, callback) {
      written.push(typeof data === "string" ? data : new TextDecoder().decode(data));
      if (callback) callbacks.push(callback);
    },
    drain: () => callbacks.splice(0).forEach((cb) => cb()),
  };
  return term;
}

let calls: { cmd: string; args: Record<string, unknown> }[];
beforeEach(() => {
  calls = [];
  terminalStatusStore.setState({ statuses: {} });
});
afterEach(() => clearMocks());

it("marks the terminal running before spawning, so ConPTY's cursor query can be answered", async () => {
  let statusDuringSpawn = "";
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: args as Record<string, unknown> });
    if (cmd === "pty_spawn") statusDuringSpawn = statusOf("t").state;
    return 1234;
  });
  await startSession("t", fakeTerm(), payload, "new");
  expect(statusDuringSpawn).toBe("running");
  expect(calls[0].args).toMatchObject({ nodeId: "t", cols: 100, rows: 30, spec: { agent: "shell" } });
});

it("starts a Claude agent of a group knowing its group's role and speciality (issue #66)", async () => {
  const claude: TerminalPayload = { ...payload, agent: "claude", claudeSessionId: "s1" };
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: args as Record<string, unknown> });
    return 1;
  });
  const frame = { id: "g", type: "frame", name: "Back", isDeleted: false, customData: { openvibe: { kind: "group", role: "backend", pantheon: "egyptian", speciality: "API" } } };
  const elements = [{ id: "c", type: "embeddable", isDeleted: false, frameId: "g" }, frame];
  canvasStore.setState({ api: { getSceneElementsIncludingDeleted: () => elements } as unknown as ExcalidrawImperativeAPI });
  workspacesStore.setState({ activeId: "w" });
  try {
    await nodesStore.getState().create("c", { workspaceId: "w", kind: "terminal", payload: claude });
    await startSession("c", fakeTerm(), claude, "new");
    const spec = calls.find((c) => c.cmd === "pty_spawn")!.args.spec as { claude: { team?: string } };
    expect(spec.claude.team).toContain("« Back » (rôle : Backend ; spécialité : API)");
  } finally {
    canvasStore.setState({ api: null });
  }
});

it("gives a Claude terminal without a conversation id one, and keeps it in its node", async () => {
  const claude: TerminalPayload = { ...payload, agent: "claude" };
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: args as Record<string, unknown> });
    return 1;
  });
  await nodesStore.getState().create("c", { workspaceId: "w", kind: "terminal", payload: claude });
  await startSession("c", fakeTerm(), claude, "resume");
  const spec = calls.find((c) => c.cmd === "pty_spawn")!.args.spec as { claude: { sessionId: string; mode: string } };
  expect(spec.claude.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  expect(spec.claude.mode).toBe("resume");
  expect(nodesStore.getState().nodes.c.payload).toMatchObject({ claudeSessionId: spec.claude.sessionId });
});

it("shows a failed launch in the terminal and as an error status", async () => {
  mockIPC(() => {
    throw { kind: "notFound", message: "dossier introuvable : C:/gone" };
  });
  const term = fakeTerm();
  await startSession("t", term, payload, "new");
  expect(statusOf("t")).toEqual({ state: "error", message: "dossier introuvable : C:/gone", kind: "notFound" });
  expect(term.written.join("")).toContain("dossier introuvable");
});

it("keeps the kind of a refused orchestrator, which its node shows instead of a red line", async () => {
  const message = "Outils OpenVibe indisponibles : le serveur local d'OpenVibe n'a pas démarré.";
  mockIPC(() => {
    throw { kind: "toolsUnavailable", message };
  });
  const term = fakeTerm();
  await startSession("t", term, payload, "new");
  expect(statusOf("t")).toEqual({ state: "error", message, kind: "toolsUnavailable" });
  expect(term.written.join("")).not.toContain("Outils OpenVibe");
});

it("ignores input until the replay sent on re-attach has been written", async () => {
  mockIPC((cmd, args) => {
    if (cmd !== "pty_attach") return;
    const channel = (args as { onData: { onmessage: (m: ArrayBuffer) => void } }).onData;
    channel.onmessage(new TextEncoder().encode("old output\x1b[6n").buffer as ArrayBuffer);
    return true;
  });
  const term = fakeTerm();
  const state = { replaying: false };
  await attachSession("t", term, state);
  expect(statusOf("t").state).toBe("running");
  expect(acceptsInput("t", state)).toBe(false);
  term.drain();
  expect(acceptsInput("t", state)).toBe(true);
});

it("falls back to a stopped terminal when there is nothing to re-attach to", async () => {
  mockIPC(() => false);
  const state = { replaying: false };
  expect(await attachSession("t", fakeTerm(), state)).toBe(false);
  expect(statusOf("t").state).toBe("stopped");
  expect(state.replaying).toBe(false);
});

it("restores a stopped terminal with its saved output and no input", async () => {
  mockIPC(() => new TextEncoder().encode("saved screen").buffer);
  const term = fakeTerm();
  await restoreSession("t", term);
  expect(term.written).toEqual(["saved screen"]);
  expect(acceptsInput("t", { replaying: false })).toBe(false);
});

it("relaunch waits for the old process to exit before spawning", async () => {
  terminalStatusStore.getState().set("t", { state: "running" });
  mockIPC((cmd) => {
    calls.push({ cmd, args: {} });
    if (cmd === "pty_kill") setTimeout(() => terminalStatusStore.getState().set("t", { state: "exited", code: 1 }), 5);
    return null;
  });
  await relaunchSession("t", fakeTerm(), payload, "resume");
  expect(calls.map((c) => c.cmd)).toEqual(["pty_kill", "pty_spawn"]);
  expect(statusOf("t").state).toBe("running");
});

it("ignores keystrokes while a terminal restarts from one", () => {
  terminalStatusStore.getState().set("t", { state: "running" });
  expect(acceptsInput("t", { replaying: false, restarting: true })).toBe(false);
  expect(acceptsInput("t", { replaying: false, restarting: false })).toBe(true);
});

it("marks the screen after the old process exited, before the new one starts (final review H2)", async () => {
  terminalStatusStore.getState().set("t", { state: "running" });
  const order: string[] = [];
  mockIPC((cmd) => {
    order.push(cmd);
    if (cmd === "pty_kill") setTimeout(() => terminalStatusStore.getState().set("t", { state: "exited", code: 1 }), 5);
    return null;
  });
  await relaunchSession("t", fakeTerm(), payload, "new", () => {
    order.push(`marked while ${statusOf("t").state}`);
  });
  expect(order).toEqual(["pty_kill", "marked while exited", "pty_spawn"]);
});

it("shows the saved screen when a re-attach finds nothing, and holds input until it is written", async () => {
  mockIPC((cmd) => (cmd === "pty_attach" ? false : new TextEncoder().encode("saved screen").buffer));
  const term = fakeTerm();
  const state = { replaying: false };
  await reattachSession("t", term, state);
  expect(term.written).toEqual(["saved screen"]);
  expect(statusOf("t").state).toBe("stopped");
  expect(state.replaying).toBe(true);
  term.drain();
  expect(state.replaying).toBe(false);
});

it("starts no terminal of a profile it could not read: never on another account (review)", async () => {
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: args as Record<string, unknown> });
    if (cmd === "accounts_list") throw { kind: "db", message: "database is locked" };
    return 1234;
  });
  accountsStore.setState({ profiles: [], active: null, loaded: false });
  openAccounts();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const bound: TerminalPayload = { ...payload, agent: "claude", claudeSessionId: "s1", accountId: "work" };
  await startSession("bound", fakeTerm(), bound, "resume");
  expect(calls.filter((c) => c.cmd === "pty_spawn")).toEqual([]);
  expect(statusOf("bound").state).toBe("error");
});
