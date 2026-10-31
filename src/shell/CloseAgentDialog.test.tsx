// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { removeNodes } from "@/fleet/terminals";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore } from "@/store/nodes";
import { uiStore } from "@/store/ui";
import { CloseAgentDialog } from "./CloseAgentDialog";

vi.mock("@/fleet/terminals", () => ({ removeNodes: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  mockIPC(() => undefined);
  for (const [id, name] of [["isis", "Isis"], ["thot", "Thot"]]) {
    await nodesStore.getState().create(id, {
      workspaceId: "w1",
      kind: "terminal",
      payload: { title: name, name, agent: "claude", cwd: "C:/code", shell: "default", command: "" },
    });
  }
});
beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<CloseAgentDialog />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === text)!;

it("names the agent it would end, and closes it once confirmed (spec habillage §7.5)", async () => {
  await act(async () => uiStore.getState().setClosing({ agents: ["isis"], remove: ["isis"] }));
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Fermer Isis ?");
  await act(async () => button("Fermer l'agent").click());
  expect(removeNodes).toHaveBeenLastCalledWith(["isis"]);
  expect(uiStore.getState().closing).toBeNull();
});

it("lists the agents an undo or Suppr would end together, and removes all that left with them", async () => {
  await act(async () => uiStore.getState().setClosing({ agents: ["isis", "thot"], remove: ["isis", "thot", "g"] }));
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("Fermer 2 agents ?");
  expect(dialog.textContent).toContain("Isis, Thot");
  await act(async () => button("Fermer les agents").click());
  expect(removeNodes).toHaveBeenLastCalledWith(["isis", "thot", "g"]);
});

it("keeps them when cancelled", async () => {
  vi.mocked(removeNodes).mockClear();
  await act(async () => uiStore.getState().setClosing({ agents: ["isis"], remove: ["isis"] }));
  await act(async () => button("Annuler").click());
  expect(removeNodes).not.toHaveBeenCalled();
  expect(uiStore.getState().closing).toBeNull();
});

it("tells what closing an orchestrator in mission leaves behind (spec première version §5.4)", async () => {
  await nodesStore.getState().create("chef", {
    workspaceId: "w1",
    kind: "orchestrator",
    payload: { name: "Chef", mission: { state: "en_cours", maxAgents: 4, members: [] } },
  });
  await act(async () => uiStore.getState().setClosing({ agents: ["chef"], remove: ["chef", "fil"] }));
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("Chef mène une mission en cours. Le fermer arrête sa session ; ses agents continuent, mais personne ne lira leurs comptes rendus. Les worktrees et les branches de la mission restent sur le disque.");
  await act(async () => button("Fermer l'orchestrateur").click());
  expect(removeNodes).toHaveBeenLastCalledWith(["chef", "fil"]);
});

it("says whether the agent is at work or ready, as the spec asks (§7.5)", async () => {
  agentActivityStore.getState().apply({ nodeId: "isis", activity: "working", since: 1 });
  await act(async () => uiStore.getState().setClosing({ agents: ["isis"], remove: ["isis"] }));
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Isis est en cours.");
  await act(async () => agentActivityStore.getState().apply({ nodeId: "isis", activity: "idle", since: 2 }));
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Isis est prête.");
});
