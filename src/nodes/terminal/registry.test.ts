// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { fleetMessages } from "@/fleet/messages";
import { messages } from "@/i18n";
import { nodesStore } from "@/store/nodes";
import { relaunchSession } from "./session";
import { resumeTerminal } from "./registry";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }) }));
vi.mock("./session", () => ({ relaunchSession: vi.fn(() => Promise.resolve()), reattachSession: vi.fn(), restoreSession: vi.fn(), startSession: vi.fn(), acceptsInput: vi.fn(() => false) }));
vi.mock("@/ipc/pty", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ipc/pty")>()),
  ptyKill: vi.fn(() => Promise.resolve()),
  ptyResize: vi.fn(),
  ptyWrite: vi.fn(),
}));
vi.mock("@xterm/xterm", () => ({
  // Every xterm method is a no-op: the test only exercises the relaunch path.
  Terminal: class {
    buffer = { active: {} };
    unicode = { activeVersion: "" };
    constructor() {
      return new Proxy(this, { get: (target, key) => (key in target ? Reflect.get(target, key) : vi.fn()) });
    }
  },
}));
vi.mock("@xterm/addon-unicode11", () => ({ Unicode11Addon: vi.fn() }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: vi.fn() }));
vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  nodesStore.setState({
    nodes: {
      t1: { kind: "terminal", payload: { title: "Isis", name: "Isis", agent: "shell", cwd: "C:/code", shell: "default", command: "" } },
    } as never,
  });
});

it("reports a resume that fails to relaunch with the failure toast", async () => {
  vi.mocked(relaunchSession).mockRejectedValueOnce(new Error("spawn failed"));

  resumeTerminal("t1");

  await vi.waitFor(() => expect(toast.warning).toHaveBeenCalledWith(messages(fleetMessages).broadcast.resumeFailed("Isis")));
});
