// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { getScrollback, ptyInterrupt, ptySendText, ptyWrite, toBytes } from "./pty";

afterEach(() => clearMocks());

it("passes ArrayBuffer payloads through untouched", () => {
  const buffer = new Uint8Array([0x1b, 0x5b, 0x6d]).buffer;
  expect(Array.from(toBytes(buffer))).toEqual([0x1b, 0x5b, 0x6d]);
});

it("keeps a UTF-8 sequence split across chunks as raw bytes", () => {
  // "é" is 0xC3 0xA9; a PTY read can end between the two bytes.
  expect(Array.from(toBytes([0x61, 0xc3]))).toEqual([0x61, 0xc3]);
  expect(Array.from(toBytes(new Uint8Array([0xa9]).buffer))).toEqual([0xa9]);
});

it("sends camelCase arguments to Rust commands", async () => {
  let received: unknown;
  mockIPC((cmd, args) => {
    received = { cmd, args };
  });
  await ptyWrite("node-1", "ls\r");
  expect(received).toEqual({ cmd: "pty_write", args: { nodeId: "node-1", data: "ls\r" } });
});

it("sends writes to one terminal in order, one at a time", async () => {
  const started: string[] = [];
  let release!: () => void;
  mockIPC((cmd, args) => {
    if (cmd !== "pty_write") return;
    started.push((args as { data: string }).data);
    if (started.length === 1) return new Promise<void>((resolve) => (release = resolve));
  });
  const first = ptyWrite("node-1", "a");
  const second = ptyWrite("node-1", "b");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(started).toEqual(["a"]); // "b" waits until "a" has reached Rust
  release();
  await Promise.all([first, second]);
  expect(started).toEqual(["a", "b"]);
});

it("keeps writing after a failed write", async () => {
  const sent: string[] = [];
  mockIPC((_cmd, args) => {
    const { data } = args as { data: string };
    sent.push(data);
    if (data === "a") throw { kind: "notFound", message: "gone" };
  });
  await expect(ptyWrite("node-2", "a")).rejects.toMatchObject({ kind: "notFound" });
  await ptyWrite("node-2", "b");
  expect(sent).toEqual(["a", "b"]);
});

it("decodes scrollback returned as raw bytes", async () => {
  mockIPC(() => new Uint8Array([104, 105]).buffer);
  expect(new TextDecoder().decode(await getScrollback("node-1"))).toBe("hi");
});

it("types a command after the keystrokes already sent to the terminal", async () => {
  const calls: string[] = [];
  let release!: () => void;
  mockIPC((cmd) => {
    calls.push(cmd);
    if (cmd === "pty_write") return new Promise<void>((resolve) => (release = resolve));
    if (cmd === "pty_interrupt") return true;
  });
  const typed = ptyWrite("node-3", "a");
  const sent = ptySendText("node-3", "lance les tests");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(calls).toEqual(["pty_write"]); // the command waits for the keystroke
  release();
  await Promise.all([typed, sent]);
  expect(calls).toEqual(["pty_write", "pty_send_text"]);
  expect(await ptyInterrupt("node-3")).toBe(true);
});

it("ignores the late exit of an older process once the terminal runs under another pid", async () => {
  const { emit } = await import("@tauri-apps/api/event");
  const { ptySpawn, onPtyExit } = await import("./pty");
  let pid = 100;
  mockIPC((cmd) => (cmd === "pty_spawn" ? pid : undefined), { shouldMockEvents: true });
  const exits: unknown[] = [];
  await onPtyExit((event) => exits.push(event));
  const spec = {} as Parameters<typeof ptySpawn>[1];
  await ptySpawn("n1", spec, 80, 24, () => {});
  pid = 200;
  await ptySpawn("n1", spec, 80, 24, () => {});
  await emit("pty-exit", { nodeId: "n1", exitCode: 0, pid: 100 });
  await vi.waitFor(() => expect(exits).toEqual([]));
  await emit("pty-exit", { nodeId: "n1", exitCode: 0, pid: 200 });
  await vi.waitFor(() => expect(exits).toHaveLength(1));
  // A terminal re-attached after a reload has no known pid: its exit counts.
  await emit("pty-exit", { nodeId: "n2", exitCode: 1, pid: 300 });
  await vi.waitFor(() => expect(exits).toHaveLength(2));
});
