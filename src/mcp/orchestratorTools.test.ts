// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { canvasStore } from "@/canvas/canvasStore";
import { nodesStore } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { workspacesStore } from "@/store/workspaces";
import type { Member } from "@/mission/mission";
import { remoteBusy, setRemoteControl } from "@/fleet/remoteControl";
import { orchestratorTool } from "./orchestratorTools";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/mission/launch", () => ({ endMission: vi.fn(), mergeMission: vi.fn(), reassignTask: vi.fn() }));
vi.mock("@/fleet/broadcast", () => ({ pauseAgents: vi.fn(() => Promise.resolve(1)) }));
vi.mock("@/fleet/remoteControl", () => ({ setRemoteControl: vi.fn(), remoteBusy: vi.fn(() => false) }));
vi.mock("@/nodes/terminal/registry", () => ({ terminalText: vi.fn(() => ""), quietFor: vi.fn(() => 0), typedAgo: vi.fn(() => Infinity), freshText: vi.fn(() => "") }));

const session = { title: "Chef", name: "Chef", agent: "claude" as const, cwd: "C:/p", shell: "default" as const, command: "", role: "orchestrator" as const };
const member = (nodeId: string, name: string, extra: Partial<Member> = {}): Member => ({ nodeId, name, task: "t", budgetMin: 10, linked: false, branch: "b", worktree: "w", sentAt: 1, ...extra });

async function setup(members: Member[]) {
  await nodesStore.getState().create("chef", {
    workspaceId: "w1",
    kind: "orchestrator",
    payload: { name: "Chef", session, mission: { state: "en_cours", maxAgents: 4, budgetMin: 120, startedAt: Date.now(), members } },
  });
}

beforeEach(() => {
  mockIPC(() => undefined);
  terminalStatusStore.getState().set("chef", { state: "running" });
});

it("refuses to extend an agent that handed its sub-task over or has already reported (backlog H3)", async () => {
  await setup([member("a", "Isis", { handedTo: "Horus" }), member("b", "Horus", { report: { summary: "ok", status: "termine", at: 1 } }), member("c", "Seth")]);
  const handed = await orchestratorTool("chef", "prolonger", { agent: "Isis", minutes: 5 });
  const reported = await orchestratorTool("chef", "prolonger", { agent: "Horus", minutes: 5 });
  const fine = await orchestratorTool("chef", "prolonger", { agent: "Seth", minutes: 5 });
  expect(handed.isError).toBe(true);
  expect(reported.isError).toBe(true);
  expect(fine.isError).not.toBe(true);
});

it("mission() gives the model of the agent that holds a sub-task, not the planned one, after a reassign (backlog Routeur)", async () => {
  await nodesStore.getState().create("chef2", {
    workspaceId: "w1",
    kind: "orchestrator",
    payload: {
      name: "Chef",
      mission: {
        state: "en_cours",
        maxAgents: 4,
        router: true,
        plan: [{ title: "Login", brief: "b", agent: "Horus", budgetMin: 10, level: "faible" }],
        members: [member("a", "Isis", { task: "Login", handedTo: "Horus" }), member("b", "Horus", { task: "Login", model: "claude-opus-5-5" })],
      },
    },
  });
  const result = await orchestratorTool("chef2", "mission", {});
  expect(JSON.parse(result.content[0].text).plan[0].model).toBe("Opus 5.5");
});

it("remote_control refuses a first name two agents share instead of taking the first (backlog 27 oct)", async () => {
  await setup([member("a", "Isis"), member("b", "Isis")]);
  const result = await orchestratorTool("chef", "remote_control", { actif: true, agents: ["Isis"] });
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("Plusieurs agents");
});

it("remote_control refuses \"tous\" when the workspace is not displayed rather than leaving linked agents out (#79)", async () => {
  await setup([member("a", "Isis")]);
  const result = await orchestratorTool("chef", "remote_control", { actif: true, agents: ["tous"] });
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("pas affiché");
  expect(setRemoteControl).not.toHaveBeenCalled();
});

it("ecrire refuses while a Remote Control flow is typing in that agent (#79)", async () => {
  await setup([member("a", "Isis")]);
  terminalStatusStore.getState().set("a", { state: "running" });
  vi.mocked(remoteBusy).mockReturnValueOnce(true);
  const result = await orchestratorTool("chef", "ecrire", { agent: "Isis", texte: "salut" });
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("Remote Control");
});

it("propose_plan says an agent is held by another running mission, rather than not linked (#64)", async () => {
  await setup([member("isis", "Isis", { linked: true, sentAt: undefined })]);
  await nodesStore.getState().create("isis", { workspaceId: "w1", kind: "terminal", payload: { ...session, role: undefined, name: "Isis" } });
  await nodesStore.getState().create("libre", { workspaceId: "w1", kind: "orchestrator", payload: { name: "Libre", session } });
  workspacesStore.setState({ activeId: "w1" });
  canvasStore.setState({ api: {} as never, frames: [], links: { chef: { nodeIds: ["isis"], groupIds: [] }, libre: { nodeIds: ["isis"], groupIds: [] } } });
  const plan = { nom: "Auth", tache: "Ajoute l'authentification", sous_taches: [{ titre: "Login", consigne: "Fais le login", agent: "Isis", budget_min: 10 }] };
  const result = await orchestratorTool("libre", "proposer_plan", plan);
  canvasStore.setState({ api: null, links: {} });
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("Isis travaille déjà pour une autre mission en cours");
});
