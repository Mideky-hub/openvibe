// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { ask } from "@tauri-apps/plugin-dialog";
import { mockIPC } from "@tauri-apps/api/mocks";
import { nodesStore } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import type { Workspace } from "@/store/workspaces";
import { removeWorkspace } from "./workspaceActions";

vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(() => Promise.resolve(false)) }));

const workspace: Workspace = { id: "w1", projectId: "p", name: "API", position: 0, pantheon: null } as Workspace;
const terminal = (name: string) => ({ title: name, name, agent: "claude" as const, cwd: "C:/code", shell: "default" as const, command: "" });

beforeEach(async () => {
  mockIPC(() => undefined);
  for (const name of ["Isis", "Thot"]) await nodesStore.getState().create(name, { workspaceId: "w1", kind: "terminal", payload: terminal(name) });
  await nodesStore.getState().create("Ra", { workspaceId: "w1", kind: "terminal", payload: terminal("Ra") });
  await nodesStore.getState().create("Autre", { workspaceId: "w2", kind: "terminal", payload: terminal("Autre") });
  for (const id of ["Isis", "Thot", "Autre"]) terminalStatusStore.getState().set(id, { state: "running" });
});

it("names the agents that deleting the workspace would stop, not only how many", async () => {
  await removeWorkspace(workspace, 2);
  const message = vi.mocked(ask).mock.calls[0][0];
  expect(message).toContain("Isis");
  expect(message).toContain("Thot");
  expect(message).not.toContain("Ra,");
  expect(message).not.toContain("Autre");
});
