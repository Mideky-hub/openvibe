// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { canvasStore } from "@/canvas/canvasStore";
import { nodesStore, terminalOf } from "@/store/nodes";
import { answer, handleCall, replyable } from "./router";
import type { McpCall } from "@/ipc/mcp";
import { pauseAgents } from "@/fleet/broadcast";
import { setRemoteControl } from "@/fleet/remoteControl";
import { ptySendText } from "@/ipc/pty";
import { terminalText } from "@/nodes/terminal/registry";
import { notify } from "@/mission/events";
import { endMission, reassignTask } from "@/mission/launch";
import { missionOf, setMission, setOrchestratorClosed, updateMember } from "@/mission/store";
import { workspacesStore } from "@/store/workspaces";
import { agentActivityStore } from "@/store/agentActivity";
import { terminalStatusStore } from "@/store/terminalStatus";
import { langStore } from "@/i18n";

vi.mock("@/ipc/pty", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/ipc/pty")>()), ptySendText: vi.fn(() => Promise.resolve()) }));
vi.mock("@/nodes/terminal/registry", () => ({ terminalText: vi.fn(() => "ligne 1\nligne 2") }));
vi.mock("@/mission/launch", () => ({
  mergeMission: vi.fn(() => Promise.resolve("Branche openvibe/auth :\nIsis : fusionné")),
  endMission: vi.fn(),
  reassignTask: vi.fn(() => Promise.resolve({ name: "Horus" })),
}));
vi.mock("@/mission/events", () => ({ notify: vi.fn() }));
vi.mock("@/fleet/broadcast", () => ({ pauseAgents: vi.fn(() => Promise.resolve(1)) }));
vi.mock("@/fleet/remoteControl", () => ({ setRemoteControl: vi.fn() }));
vi.mock("@/mission/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/mission/store")>()),
  linkedClaudeAgents: vi.fn(() => [{ nodeId: "isis", name: "Isis" }]),
}));

vi.mock("@excalidraw/excalidraw", () => ({}));

const call = (nodeId: string, name: string, args: Record<string, unknown>) =>
  answer({ callId: 1, nodeId, method: "tools/call", params: { name, arguments: args } });
const textOf = (result: unknown) => (result as { content: { text: string }[] }).content[0].text;

beforeAll(async () => {
  mockIPC(() => undefined);
  workspacesStore.setState({ activeId: "w1" });
  await nodesStore.getState().create("isis", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: "", name: "Isis", agent: "claude", cwd: "C:/code", shell: "default", command: "" },
  });
  await nodesStore.getState().create("chef", { workspaceId: "w1", kind: "orchestrator", payload: { name: "chef" } });
});

describe("the notes tool (spec notes §3)", () => {
  const notes = (node: string) => call(node, "notes", {});
  afterEach(() => void mockIPC(() => undefined));

  it("answers agents and orchestrators alike, with the same tool", async () => {
    mockIPC((command) => (command === "notes_agent_list" ? [{ name: "Auth", attached: true }] : undefined));
    expect(textOf(await notes("isis"))).toContain("Auth (attachée à ton groupe)");
    expect(textOf(await notes("chef"))).toContain("Auth");
  });

  it("answers an agent whose project is not on screen", async () => {
    mockIPC((command) => (command === "notes_agent_list" ? [] : undefined));
    expect(await notes("elsewhere")).not.toHaveProperty("isError");
  });
});

describe("the agent's tools (spec orchestrateur §4.4)", () => {
  it("lists them for any Claude session", async () => {
    const list = (await answer({ callId: 1, nodeId: "isis", method: "tools/list", params: {} })) as { tools: { name: string; inputSchema: object }[] };
    expect(list.tools.map((t) => t.name)).toEqual(["declare_steps", "step", "report", "notes"]);
    expect(list.tools.every((t) => typeof t.inputSchema === "object")).toBe(true);
  });

  it("declares and marks the terminal's steps, saved in its payload", async () => {
    expect(textOf(await call("isis", "declare_steps", { steps: ["Plan", "Code"] }))).toBe("2 étapes déclarées.");
    expect(textOf(await call("isis", "step", { title: "Plan", state: "done" }))).toBe("Plan : fait.");
    expect(terminalOf(nodesStore.getState().nodes.isis)?.steps).toEqual([
      { title: "Plan", state: "fait" },
      { title: "Code", state: "a_venir" },
    ]);
  });

  it("answers mistakes with a readable error, the payload untouched", async () => {
    const before = terminalOf(nodesStore.getState().nodes.isis)?.steps;
    const wrong = (await call("isis", "step", { title: "Plan", state: "fini" })) as { isError?: boolean };
    expect(wrong.isError).toBe(true);
    expect((await call("isis", "declare_steps", {})) as { isError?: boolean }).toMatchObject({ isError: true });
    // Final review H1: a long title is refused before anything changes, not after.
    expect((await call("isis", "step", { title: "Implémentation du middleware d'authentification", state: "done" })) as { isError?: boolean }).toMatchObject({ isError: true });
    expect(textOf(await call("isis", "voler", {}))).toBe("Outil inconnu : voler");
    expect(textOf(await call("gone", "step", { title: "Plan", state: "done" }))).toBe("Ce terminal n'est plus sur le canvas.");
    expect(textOf(await call("chef", "step", { title: "Plan", state: "done" }))).toBe("Outil réservé aux agents.");
    expect(terminalOf(nodesStore.getState().nodes.isis)?.steps).toEqual(before);
  });

  it("says there is no mission to report to, outside one", async () => {
    expect(textOf(await call("isis", "report", { summary: "Fait", status: "done" }))).toBe("Pas de mission en cours : rien à transmettre.");
  });
});

describe("the orchestrator's tools (spec orchestrateur §7.2)", () => {
  const plan = {
    name: "Auth",
    task: "Ajoute l'authentification",
    subtasks: [
      { title: "Login", brief: "Fais le login", agent: "isis", budget_min: 20 },
      { title: "API", brief: "Fais l'API", agent: "new", budget_min: 30 },
    ],
  };

  it("lists them for the orchestrator only, and each side refuses the other's", async () => {
    const list = (await answer({ callId: 1, nodeId: "chef", method: "tools/list", params: {} })) as { tools: { name: string }[] };
    expect(list.tools.map((t) => t.name)).toEqual(["mission", "propose_plan", "team", "read_output", "write", "extend", "interrupt", "reassign", "merge", "finish", "remote_control", "notes"]);
    expect(textOf(await call("isis", "propose_plan", plan))).toBe("Outil réservé à l'orchestrateur.");
    expect(textOf(await call("chef", "report", { summary: "x", status: "done" }))).toBe("Outil réservé aux agents.");
  });

  it("takes a plan that waits for the go-ahead, and describes it in mission()", async () => {
    const wrong = await call("chef", "propose_plan", { ...plan, subtasks: [{ ...plan.subtasks[0], agent: "Zeus" }] });
    expect(wrong).toMatchObject({ isError: true });
    expect(missionOf(nodesStore.getState().nodes.chef)?.state).toBe("redaction");
    expect(textOf(await call("chef", "propose_plan", plan))).toBe(
      "Plan proposé : 2 sous-tâches. Il attend le feu vert de l'utilisateur (« Lancer la mission » dans le panneau de l'orchestrateur).",
    );
    expect(JSON.parse(textOf(await call("chef", "mission", {})))).toMatchObject({
      state: "plan",
      name: "Auth",
      max_agents: 4,
      plan: [{ title: "Login", agent: "Isis" }, { title: "API", agent: "new" }],
      linked_agents: [{ name: "Isis" }],
    });
  });

  describe("the groups and their specialities (spec groupes spécialisés §3)", () => {
    const front = { id: "g1", name: "Interface", x: 0, y: 0, width: 10, height: 10, memberIds: ["isis"], group: { role: "frontend" as const, pantheon: "egyptian", speciality: "Frontend" } };
    const back = { ...front, id: "g2", name: "Serveur", memberIds: [], group: { role: "backend" as const, pantheon: "norse" } };

    afterAll(() => canvasStore.setState({ frames: [], links: {} }));

    it("says each linked agent's group and speciality, and every linked group", async () => {
      canvasStore.setState({ frames: [front, back], links: { chef: { groupIds: ["g1", "g2"], nodeIds: [] } } });
      const mission = JSON.parse(textOf(await call("chef", "mission", {})));
      expect(mission.linked_agents).toEqual([expect.objectContaining({ name: "Isis", group: "Interface", speciality: "Frontend" })]);
      expect(mission.linked_groups).toEqual([{ name: "Interface", speciality: "Frontend" }, { name: "Serveur", speciality: null }]);
    });

    it("sends a new agent to a linked group and says so in the plan, refusing an unknown one", async () => {
      canvasStore.setState({ frames: [front, back], links: { chef: { groupIds: ["g1", "g2"], nodeIds: [] } } });
      const sub = { title: "Style", brief: "Fais le style", agent: "new", budget_min: 10 };
      expect(await call("chef", "propose_plan", { ...plan, subtasks: [{ ...sub, group: "Zeus" }] })).toMatchObject({ isError: true });
      await call("chef", "propose_plan", { ...plan, subtasks: [{ ...sub, group: "interface" }, plan.subtasks[1]] });
      expect(missionOf(nodesStore.getState().nodes.chef)?.plan?.[0].group).toEqual({ id: "g1", name: "Interface" });
      expect(JSON.parse(textOf(await call("chef", "mission", {}))).plan.map((s: { group: unknown }) => s.group)).toEqual(["Interface", null]);
      await call("chef", "propose_plan", plan);
    });

    it("keeps today's answers for an agent outside any group, with nulls added", async () => {
      canvasStore.setState({ frames: [], links: {} });
      const mission = JSON.parse(textOf(await call("chef", "mission", {})));
      expect(mission.linked_agents).toEqual([expect.objectContaining({ name: "Isis", group: null, speciality: null })]);
      expect(mission.linked_groups).toEqual([]);
    });
  });

  it("takes each sub-task's level and says whether the router is on (spec maj §3)", async () => {
    setMission("chef", { router: true });
    expect(textOf(await call("chef", "propose_plan", plan))).toContain("niveau");
    const leveled = { ...plan, subtasks: plan.subtasks.map((s, i) => ({ ...s, level: i === 0 ? "low" : "extrême" })) };
    expect(textOf(await call("chef", "propose_plan", leveled))).toContain("Plan proposé");
    expect(JSON.parse(textOf(await call("chef", "mission", {})))).toMatchObject({
      router: true,
      plan: [
        { level: "low", model: "Haiku 5.5" },
        { level: "extreme", model: "Fable 5.1" },
      ],
    });
    setMission("chef", { router: undefined });
    expect(JSON.parse(textOf(await call("chef", "mission", {})))).toMatchObject({ router: false, plan: [{ level: "low", model: null }, {}] });
  });

  it("turns Remote Control on or off for its agents or itself, and gives the links (spec maj §2)", async () => {
    vi.mocked(setRemoteControl).mockImplementation(async (id, on) => (on ? { on: true, url: `https://claude.ai/code/session_${id}` } : { on: false }));
    terminalStatusStore.getState().set("isis", { state: "running" });
    terminalStatusStore.getState().set("chef", { state: "running" });
    expect(textOf(await call("chef", "remote_control", { on: true, agents: ["all", "me"] }))).toBe(
      "Isis : actif — https://claude.ai/code/session_isis\nToi : actif — https://claude.ai/code/session_chef",
    );
    expect(textOf(await call("chef", "remote_control", { on: false, agents: ["isis"] }))).toBe("Isis : coupé");
    vi.mocked(setRemoteControl).mockResolvedValueOnce({ error: "Remote Control requires a claude.ai subscription" });
    expect(textOf(await call("chef", "remote_control", { on: true, agents: ["Isis"] }))).toBe("Isis : échec — Remote Control requires a claude.ai subscription");
    // In a turn, it is typed at the end of it: « moi » is always in its own turn (final review maj §2).
    vi.mocked(setRemoteControl).mockResolvedValue({ later: true });
    expect(textOf(await call("chef", "remote_control", { on: true, agents: ["Isis", "moi"] }))).toBe(
      "Isis : à la fin de son tour\nToi : à la fin de ton tour — le lien s'affichera dans ton en-tête",
    );
    terminalStatusStore.getState().set("isis", { state: "stopped" });
    vi.mocked(setRemoteControl).mockResolvedValueOnce({ on: true });
    expect(textOf(await call("chef", "remote_control", { on: true, agents: ["Isis"] }))).toBe("Isis : actif à son prochain démarrage");
    vi.mocked(setRemoteControl).mockClear();
    expect(await call("chef", "remote_control", { on: true, agents: ["Zeus"] })).toMatchObject({ isError: true });
    expect(await call("chef", "remote_control", { agents: ["Isis"] })).toMatchObject({ isError: true });
    expect(setRemoteControl).not.toHaveBeenCalled();
  });

  it("says so when its workspace is not on screen, instead of finding no linked agent (final review H2)", async () => {
    await nodesStore.getState().create("loin", { workspaceId: "w9", kind: "orchestrator", payload: { name: "Loin" } });
    const hidden = JSON.parse(textOf(await call("loin", "mission", {})));
    expect(hidden.linked_agents).toBeNull();
    expect(hidden.linked_groups).toBeNull();
    expect(hidden.linked_agents_note).toBe("inconnus : l'espace de l'orchestrateur n'est pas affiché");
    expect(textOf(await call("loin", "propose_plan", plan))).toContain("n'est pas affiché");
    expect(textOf(await call("loin", "propose_plan", { ...plan, subtasks: [plan.subtasks[1]] }))).toContain("Plan proposé : 1 sous-tâche.");
    // Its groups are as unknown as its agents: refused, not told that the group does not exist.
    expect(textOf(await call("loin", "propose_plan", { ...plan, subtasks: [{ ...plan.subtasks[1], group: "Interface" }] }))).toContain("n'est pas affiché");
  });

  describe("once the team is formed", () => {
    beforeAll(() =>
      setMission("chef", {
        state: "en_cours",
        branch: "openvibe/auth",
        members: [{ nodeId: "isis", name: "Isis", task: "Login", budgetMin: 20, linked: true, branch: "openvibe/auth-isis", worktree: "C:/w/isis", sentAt: Date.now() }],
      }),
    );

    it("says each member's group and speciality, to choose who takes a sub-task over (spec groupes spécialisés §3)", async () => {
      const front = { id: "g1", name: "Interface", x: 0, y: 0, width: 10, height: 10, memberIds: ["isis"], group: { role: "frontend" as const, pantheon: "egyptian", speciality: "Frontend" } };
      canvasStore.setState({ frames: [front] });
      expect(JSON.parse(textOf(await call("chef", "team", {})))[0]).toMatchObject({ name: "Isis", group: "Interface", speciality: "Frontend" });
      canvasStore.setState({ frames: [] });
      expect(JSON.parse(textOf(await call("chef", "team", {})))[0]).toMatchObject({ group: null, speciality: null });
    });

    it("does not say an agent has no group when its canvas is out of sight (final review)", async () => {
      workspacesStore.setState({ activeId: "w2" });
      const [isis] = JSON.parse(textOf(await call("chef", "team", {})));
      workspacesStore.setState({ activeId: "w1" });
      expect(isis.name).toBe("Isis");
      expect(isis).not.toHaveProperty("group");
      expect(isis).not.toHaveProperty("speciality");
    });

    it("reports the team and reads an agent's terminal", async () => {
      expect(JSON.parse(textOf(await call("chef", "team", {})))).toEqual([
        expect.objectContaining({ name: "Isis", subtask: "Login", time: "0 / 20 min", report: null, merged: false, handed_to: null, overdue: 0, model: null }),
      ]);
      expect(textOf(await call("chef", "read_output", { agent: "ISIS", lines: 2 }))).toBe("ligne 1\nligne 2");
      expect(terminalText).toHaveBeenCalledWith("isis", 2);
      expect(await call("chef", "read_output", { agent: "Zeus" })).toMatchObject({ isError: true });
    });

    it("writes to an agent that runs, never into a dialog meant for the user", async () => {
      terminalStatusStore.getState().set("isis", { state: "stopped" });
      expect(textOf(await call("chef", "write", { agent: "Isis", text: "Relance" }))).toBe("Isis est arrêté.");
      terminalStatusStore.getState().set("isis", { state: "running" });
      agentActivityStore.getState().apply({ nodeId: "isis", activity: "waiting", since: 0 });
      expect(await call("chef", "write", { agent: "Isis", text: "Relance" })).toMatchObject({ isError: true });
      agentActivityStore.getState().apply({ nodeId: "isis", activity: "idle", since: 0 });
      expect(textOf(await call("chef", "write", { agent: "Isis", text: "Relance\nles tests" }))).toBe("Écrit à Isis.");
      expect(ptySendText).toHaveBeenCalledWith("isis", "Relance les tests");
    });

    it("takes an agent's report to its orchestrator", async () => {
      expect(await call("isis", "report", { summary: "Fait", status: "fini" })).toMatchObject({ isError: true });
      expect(textOf(await call("isis", "report", { summary: "Login fait", status: "done" }))).toBe("Compte rendu transmis à l'orchestrateur.");
      expect(missionOf(nodesStore.getState().nodes.chef)?.members[0].report).toMatchObject({ summary: "Login fait", status: "termine" });
      expect(notify).toHaveBeenCalledWith("chef", "Isis a rendu compte (done) : Login fait");
    });

    it("records a report no orchestrator hears, and says so (spec première version §5.4)", async () => {
      const unheard = "Compte rendu enregistré, mais l'orchestrateur est fermé : personne ne le lira pour l'instant.";
      vi.mocked(notify).mockClear();
      terminalStatusStore.getState().set("chef", { state: "stopped" });
      expect(textOf(await call("isis", "report", { summary: "Fini", status: "done" }))).toBe(unheard);
      expect(missionOf(nodesStore.getState().nodes.chef)?.members[0].report).toMatchObject({ summary: "Fini" });
      terminalStatusStore.getState().set("chef", { state: "running" });
      setOrchestratorClosed("chef", true);
      expect(textOf(await call("isis", "report", { summary: "Fini encore", status: "done" }))).toBe(unheard);
      setOrchestratorClosed("chef", false);
      // Queued all the same: it hears them when it runs again (final review R3).
      expect(notify).toHaveBeenCalledWith("chef", "Isis a rendu compte (done) : Fini");
      expect(notify).toHaveBeenCalledWith("chef", "Isis a rendu compte (done) : Fini encore");
    });

    it("keeps an agent's merged branch merged when it reports again (final review H2)", async () => {
      updateMember("chef", "isis", { merged: true });
      await call("isis", "report", { summary: "Vérifié", status: "done" });
      expect(missionOf(nodesStore.getState().nodes.chef)?.members[0]).toMatchObject({ merged: true, report: { summary: "Vérifié" } });
    });

    it("extends an agent's target only within the real time left (spec mission de nuit §3)", async () => {
      setMission("chef", { budgetMin: 30, startedAt: Date.now() });
      // Isis reported earlier in this file: still at work here, its whole budget counts.
      updateMember("chef", "isis", { report: undefined });
      expect(textOf(await call("chef", "extend", { agent: "Isis", minutes: 20 }))).toBe("Il reste 30 min sur le budget global.");
      updateMember("chef", "isis", { overdue: 1 });
      expect(textOf(await call("chef", "extend", { agent: "Isis", minutes: 10 }))).toBe("Isis : +10 min, budget 30 min.");
      expect(missionOf(nodesStore.getState().nodes.chef)?.members[0]).toMatchObject({ extraMin: 10 });
      expect(missionOf(nodesStore.getState().nodes.chef)?.members[0].overdue).toBeUndefined();
      // The orchestrator reads the time with its extensions, and what is left (final review H3).
      expect(JSON.parse(textOf(await call("chef", "team", {})))[0]).toMatchObject({ time: "0 / 30 min" });
      expect(JSON.parse(textOf(await call("chef", "mission", {})))).toMatchObject({ left_min: 30, elapsed_min: 0 });
      expect(await call("chef", "extend", { agent: "Isis", minutes: 0 })).toMatchObject({ isError: true });
      setMission("chef", { budgetMin: undefined, startedAt: undefined });
    });

    it("interrupts an agent's turn like « Pause » (spec §7.2)", async () => {
      expect(textOf(await call("chef", "interrupt", { agent: "Isis" }))).toBe("Tour d'Isis interrompu. write « continue » le reprend.");
      expect(pauseAgents).toHaveBeenCalledWith(["isis"]);
      vi.mocked(pauseAgents).mockResolvedValueOnce(0);
      expect(textOf(await call("chef", "interrupt", { agent: "Isis" }))).toBe("Isis n'est pas au travail : rien à interrompre.");
    });

    it("hands a sub-task over through OpenVibe (spec §7.2)", async () => {
      expect(textOf(await call("chef", "reassign", { subtask: "login", agent: "new" }))).toBe("« Login » passe à Horus.");
      expect(reassignTask).toHaveBeenCalledWith("chef", "isis", "nouveau");
      expect(await call("chef", "reassign", { subtask: "Paiement", agent: "new" })).toMatchObject({ isError: true });
    });

    it("merges and ends the mission through OpenVibe; no new plan meanwhile", async () => {
      expect(textOf(await call("chef", "merge", {}))).toBe("Branche openvibe/auth :\nIsis : fusionné");
      expect(await call("chef", "propose_plan", plan)).toMatchObject({ isError: true });
      expect(await call("chef", "finish", {})).toMatchObject({ isError: true });
      expect(textOf(await call("chef", "finish", { summary: "Fini" }))).toContain("Mission terminée");
      expect(endMission).toHaveBeenCalledWith("chef", "Fini");
    });
  });
});

it("answers a failed step with its accent in French (backlog R5c)", async () => {
  expect(textOf(await call("isis", "step", { title: "Plan", state: "failed" }))).toBe("Plan : échec.");
});

describe("the English protocol (spec première version §7.1)", () => {
  it("still takes French values, and tells a former name what it became", async () => {
    expect(textOf(await call("isis", "step", { title: "Plan", state: "en_cours" }))).toBe("Plan : en cours.");
    const old = await call("isis", "rendre_compte", { resume: "x", statut: "termine" });
    expect(old).toMatchObject({ isError: true });
    expect(textOf(old)).toBe("Outil renommé : utilise report.");
  });

  it("describes its tools and answers in English when the interface is in English", async () => {
    langStore.setState({ lang: "en" });
    try {
      const list = (await answer({ callId: 1, nodeId: "isis", method: "tools/list", params: {} })) as { tools: { name: string; description: string }[] };
      expect(list.tools[0].description).toContain("Declare your task's steps");
      expect(textOf(await call("isis", "declare_steps", { steps: ["Plan"] }))).toBe("1 step declared.");
      expect(textOf(await call("isis", "voler", {}))).toBe("Unknown tool: voler");
    } finally {
      langStore.setState({ lang: "fr" });
    }
  });
});

describe("every call gets its reply, even under load or a failing reply", () => {
  const stepCall = (callId: number, nodeId: string): McpCall => ({ callId, nodeId, method: "tools/call", params: { name: "step", arguments: { title: "Plan", state: "done" } } });

  it("answers 8 agents calling 25 times at once, each call once", async () => {
    const replies = new Map<number, unknown>();
    const calls = Array.from({ length: 200 }, (_, i) => stepCall(i, i % 2 ? "isis" : "chef"));
    // The reply path is slow and out of order, as under a busy page.
    const reply = async (callId: number, result: unknown) => {
      await new Promise((resolve) => setTimeout(resolve, (callId * 7) % 13));
      replies.set(callId, result);
    };
    await Promise.all(calls.map((c) => handleCall(c, reply)));
    expect(replies.size).toBe(200);
    expect([...replies.values()].every((r) => (r as { content: unknown[] }).content.length > 0)).toBe(true);
  });

  it("turns an answer JSON cannot carry into a readable error", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(replyable(cyclic)).toMatchObject({ isError: true });
    expect(replyable(undefined)).toMatchObject({ isError: true });
    expect(replyable({ content: [] })).toEqual({ content: [] });
  });

  it("replies with a readable error when a tool's answer cannot be sent as JSON", async () => {
    const replies: unknown[] = [];
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const reply = async (_id: number, result: unknown) => void replies.push(result);
    await handleCall({ callId: 1, nodeId: "isis", method: "tools/call", params: { name: "step", arguments: { title: "Plan", state: "done" } } }, reply);
    expect(replies).toHaveLength(1);
    const bad = vi.fn(async (_id: number, result: unknown) => {
      if (result === cyclic) throw new Error("not serializable");
      replies.push(result);
    });
    await handleCall({ callId: 2, nodeId: "isis", method: "tools/call", params: { name: "step", arguments: cyclic } }, bad);
    expect(replies).toHaveLength(2);
    expect(replies[1]).toMatchObject({ isError: true });
  });

  it("tries a reply that failed once more, in a form that cannot fail", async () => {
    const seen: unknown[] = [];
    let first = true;
    const reply = async (_id: number, result: unknown) => {
      if (first) {
        first = false;
        throw new Error("ipc hiccup");
      }
      seen.push(result);
    };
    await handleCall(stepCall(1, "isis"), reply);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ isError: true });
  });
});
