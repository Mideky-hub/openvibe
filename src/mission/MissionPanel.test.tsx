// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { toast } from "sonner";
import { focusNode, frameNodes } from "@/canvas/focusNode";
import { pauseAgents } from "@/fleet/broadcast";
import { requestCloseOrchestrator } from "@/fleet/orchestrators";
import { langStore } from "@/i18n";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { uiStore } from "@/store/ui";
import { cleanMission, launchMission } from "./launch";
import { NEW_MISSION, type Mission } from "./mission";
import { MissionPanel } from "./MissionPanel";
import { missionOf } from "./store";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("./launch", () => ({
  launchMission: vi.fn(() => Promise.resolve()),
  cleanMission: vi.fn(() => Promise.resolve({ removed: ["auth-isis", "auth"], kept: [] })),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/canvas/focusNode", () => ({ focusNode: vi.fn(), frameNodes: vi.fn(() => true) }));
vi.mock("@/fleet/broadcast", async (original) => ({ ...(await original<typeof import("@/fleet/broadcast")>()), pauseAgents: vi.fn(() => Promise.resolve(1)) }));
vi.mock("@/fleet/orchestrators", async (original) => ({ ...(await original<typeof import("@/fleet/orchestrators")>()), requestCloseOrchestrator: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeAll(() => mockIPC(() => undefined));
afterEach(async () => {
  langStore.setState({ lang: "fr" });
  await act(async () => root.unmount());
  host.remove();
});

async function show(mission?: Partial<Mission>) {
  await nodesStore.getState().create("chef", {
    workspaceId: "w1",
    kind: "orchestrator",
    payload: mission ? { name: "Chef", mission: { ...NEW_MISSION, ...mission } } : { name: "Chef" },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<MissionPanel nodeId="chef" />));
}

/** Types in a React-controlled field as a person would. */
function type(field: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === label)!;

it("sets the mission's global budget and team size before the plan (spec §7.1)", async () => {
  await show();
  await act(async () => type(host.querySelector('[aria-label="Budget global (minutes)"]')!, "90"));
  await act(async () => type(host.querySelector(`[aria-label="Nombre maximal d'agents"]`)!, "12"));
  expect(missionOf(nodesStore.getState().nodes.chef)).toMatchObject({ state: "redaction", budgetMin: 90, maxAgents: 8 });
});

it("turns the model router on, and shows each sub-task's level and model (spec maj §3)", async () => {
  await show({ state: "plan", name: "Auth", plan: [{ title: "Login", brief: "Fais le login", agent: "Isis", budgetMin: 20, level: "faible" }] });
  expect(host.textContent).toContain("faible");
  expect(host.textContent).not.toContain("Haiku 5.5");
  await act(async () => (host.querySelector('[aria-label="Routeur de modèles"]') as HTMLInputElement).click());
  expect(missionOf(nodesStore.getState().nodes.chef)?.router).toBe(true);
  expect(host.textContent).toContain("faible · Haiku 5.5");
});

it("shows the plan and gives the go-ahead (spec §7.3)", async () => {
  await show({ state: "plan", name: "Auth", task: "Ajoute l'authentification", budgetMin: 60, plan: [{ title: "Login", brief: "Fais le login", agent: "Isis", budgetMin: 20 }] });
  expect(host.textContent).toContain("Fais le login");
  expect(host.textContent).toContain("20 min d'agents · 60 min de temps réel");
  await act(async () => button("Lancer la mission").click());
  expect(launchMission).toHaveBeenCalledWith("chef");
});

it("shows the group a new agent will join (spec groupes spécialisés §3)", async () => {
  await show({ state: "plan", name: "Auth", plan: [{ title: "Style", brief: "Fais le style", agent: "nouveau", budgetMin: 20, group: { id: "g1", name: "Interface" } }] });
  expect(host.textContent).toContain("nouveau → Interface · 20 min");
});

it("opens « Mission de nuit » from its settings, and marks a night (spec mission de nuit §5.1)", async () => {
  await show();
  expect(host.textContent).toContain("Mission de nuit…");
  await act(async () => button("Mission de nuit…").click());
  expect(document.body.textContent).toContain("Préparer la nuit");
  await act(async () => root.unmount());
  host.remove();
  await show({ overnight: true });
  expect(host.querySelector("header")?.textContent).toContain("de nuit");
});

it("shows the morning report of a night, what to check first (spec mission de nuit §6.2)", async () => {
  await show({
    state: "terminee", overnight: true, budgetMin: 480, startedAt: 0, endedAt: 60 * 60_000, summary: "Bilan", handChecks: ["Relire la migration"],
    queue: [{ title: "Docs", brief: "b", budgetMin: 10 }],
    members: [
      { nodeId: "a", name: "Isis", task: "Login", budgetMin: 20, linked: false, branch: "openvibe/nuit-isis", worktree: "w", sentAt: 0, merged: true, report: { summary: "Login fait", status: "termine", at: 10 * 60_000 } },
      { nodeId: "b", name: "Horus", task: "API", budgetMin: 20, linked: false, branch: "openvibe/nuit-horus", worktree: "w", sentAt: 0, report: { summary: "Coincé", status: "bloque", at: 5 * 60_000 } },
      { nodeId: "c", name: "Thot", task: "Tests", budgetMin: 20, linked: false, branch: "b", worktree: "w", sentAt: 0 },
    ],
  });
  const report = host.querySelector("[data-morning]")!.textContent;
  expect(report).toContain("Rapport du matin");
  expect(report).toContain("60 / 480 min");
  expect(report).toContain("À vérifier à la main (1)");
  expect(report).toContain("Relire la migration");
  expect(report).toContain("Fait (1)");
  expect(report).toContain("openvibe/nuit-isis");
  expect(report).toContain("Échoué ou bloqué (1)");
  expect(report).toContain("bloqué");
  expect(report).toContain("Pas fini (1)");
  expect(report).toContain("Restées dans la file : Docs");
});

it("shows it in English", async () => {
  langStore.setState({ lang: "en" });
  await show({ state: "terminee", overnight: true, budgetMin: 60, startedAt: 0, endedAt: 60_000, summary: "x", members: [{ nodeId: "a", name: "Isis", task: "Login", budgetMin: 20, linked: false, branch: "b", worktree: "w", sentAt: 0, report: { summary: "ok", status: "echec", at: 1 } }] });
  const report = host.querySelector("[data-morning]")!.textContent;
  expect(report).toContain("Morning report");
  expect(report).toContain("Failed or blocked (1)");
});

it("shows no morning report outside a night", async () => {
  await show({ state: "terminee", summary: "x", members: [] });
  expect(host.querySelector("[data-morning]")).toBeNull();
});

it("shows the tasks waiting in the queue (spec mission de nuit §4)", async () => {
  await show({ state: "plan", name: "Auth", plan: [{ title: "Login", brief: "Fais le login", agent: "Isis", budgetMin: 20 }], queue: [{ title: "API", brief: "b", budgetMin: 30 }, { title: "Docs", brief: "b", budgetMin: 10 }] });
  expect(host.querySelector("[data-queue]")?.textContent).toContain("En attente (2)");
  expect(host.querySelector("[data-queue]")?.textContent).toContain("API");
  expect(host.querySelector("[data-queue]")?.textContent).toContain("Docs");
});

it("shows no runaway time for a mission ended before end times were kept", async () => {
  await show({
    state: "terminee",
    name: "Auth",
    members: [{ nodeId: "isis", name: "Isis", task: "Login", budgetMin: 20, linked: true, branch: "b", worktree: "C:/w", sentAt: 0 }],
  });
  expect(host.querySelector('[data-member="Isis"]')?.textContent).not.toContain("/ 20 min");
});

it("shows the team's reports and the summary, and cleans the mission (spec §7.7)", async () => {
  await show({
    state: "terminee",
    name: "Auth",
    branch: "openvibe/auth",
    summary: "Tout est fait.",
    members: [{ nodeId: "isis", name: "Isis", task: "Login", budgetMin: 20, linked: true, branch: "openvibe/auth-isis", worktree: "C:/w", sentAt: 0, report: { summary: "ok", status: "termine", at: 6 * 60_000 }, merged: true }],
  });
  expect(host.querySelector('[data-member="Isis"]')?.textContent).toContain("terminé · fusionné");
  expect(host.querySelector('[data-member="Isis"]')?.textContent).toContain("6 / 20 min");
  expect(host.textContent).toContain("Tout est fait.");
  await act(async () => button("Nettoyer la mission").click());
  expect(cleanMission).toHaveBeenCalledWith("chef");
  expect(toast.success).toHaveBeenCalledWith("Worktrees retirés : auth-isis, auth");
});

it("shows the sub-tasks an agent finished before taking another (backlog H3)", async () => {
  await show({
    state: "en_cours",
    name: "Auth",
    members: [{ nodeId: "isis", name: "Isis", task: "Login", budgetMin: 20, linked: true, branch: "b", worktree: "C:/w", sentAt: 0, done: ["API", "Docs"] }],
  });
  const finished = host.querySelector('[data-member="Isis"] [data-finished]');
  expect(finished?.textContent).toContain("2");
  expect(finished?.getAttribute("title")).toBe("Déjà finies : API, Docs");
});

it("shows the mission panel in English", async () => {
  langStore.setState({ lang: "en" });
  await show({ state: "plan", name: "Auth", router: true, budgetMin: 60, plan: [{ title: "Login", brief: "Do the login", agent: "Isis", budgetMin: 20, level: "faible" }] });
  expect(host.textContent).toContain("Mission · Auth");
  expect(host.textContent).toContain("plan proposed");
  expect(host.textContent).toContain("Global budget");
  expect(host.textContent).toContain("low · Haiku 5.5");
  expect(host.textContent).toContain("0 Claude agents linked");
  expect(button("Launch the mission")).toBeDefined();
});

it("shows the team and the cleanup in English", async () => {
  langStore.setState({ lang: "en" });
  await show({
    state: "terminee",
    name: "Auth",
    summary: "All done.",
    members: [{ nodeId: "isis", name: "Isis", task: "Login", budgetMin: 20, linked: true, branch: "b", worktree: "C:/w", sentAt: 0, report: { summary: "ok", status: "termine", at: 6 * 60_000 }, merged: true }],
  });
  expect(host.querySelector('[data-member="Isis"]')?.textContent).toContain("done · merged");
  expect(host.querySelector('[data-member="Isis"]')?.textContent).toContain("6 / 20 min");
  await act(async () => button("Clean up the mission").click());
  expect(toast.success).toHaveBeenCalledWith("Worktrees removed: auth-isis, auth");
});

it("keeps the go-ahead and cleanup buttons outside the scrolling body", async () => {
  await show({ state: "plan", name: "Auth", plan: [{ title: "Login", brief: "Fais le login", agent: "Isis", budgetMin: 20 }] });
  const body = host.querySelector("[data-mission-body]")!;
  expect(body.className).toContain("overflow-y-auto");
  expect(body.className).toContain("min-h-0");
  const launch = button("Lancer la mission");
  expect(body.contains(launch)).toBe(false);
  expect(launch.closest("[data-mission-actions]")?.className).toContain("shrink-0");
  expect(host.querySelector("[data-mission]")?.className).not.toContain("overflow-y-auto");
});

it("keeps the cleanup button outside the scrolling body once the mission is over", async () => {
  await show({ state: "terminee", name: "Auth", summary: "Fini.", members: [] });
  const body = host.querySelector("[data-mission-body]")!;
  expect(body.textContent).toContain("Fini.");
  expect(body.contains(button("Nettoyer la mission"))).toBe(false);
});

const isis = { nodeId: "isis", name: "Isis", task: "Login", budgetMin: 20, linked: true, branch: "b", worktree: "C:/w", sentAt: 0 };
const horus = { nodeId: "horus", name: "Horus", task: "API", budgetMin: 20, linked: true, branch: "b", worktree: "C:/w", sentAt: 0 };

/** A running mission whose two agents run, Isis at work and Horus waiting. */
async function showTeam() {
  agentActivityStore.setState({ activities: {} });
  for (const { nodeId, name } of [isis, horus]) {
    await nodesStore.getState().create(nodeId, {
      workspaceId: "w1",
      kind: "terminal",
      payload: { title: name, name, agent: "claude", cwd: "C:/w", shell: "default", command: "" },
    });
    terminalStatusStore.getState().set(nodeId, { state: "running" });
  }
  agentActivityStore.getState().apply({ nodeId: "isis", activity: "working", since: 1 });
  agentActivityStore.getState().apply({ nodeId: "horus", activity: "waiting", since: 1 });
  await show({ state: "en_cours", name: "Auth", members: [isis, horus] });
}

const map = () => host.querySelector("[data-map]")!;
const inspector = () => host.querySelector("[data-inspector]")!;
const inInspector = (label: string) => [...inspector().querySelectorAll("button")].find((b) => b.textContent === label)!;

it("maps the mission as a tree: the orchestrator, then its team's consoles (#63)", async () => {
  await showTeam();
  const root = map().querySelector("[data-map-root]")!;
  expect(root.textContent).toContain("Chef");
  expect([...root.querySelectorAll("[data-member]")].map((m) => m.getAttribute("data-member"))).toEqual(["Isis", "Horus"]);
});

it("follows the agents' states live", async () => {
  await showTeam();
  expect(host.querySelector('[data-member="Horus"]')?.textContent).toContain("attend");
  await act(async () => agentActivityStore.getState().apply({ nodeId: "horus", activity: "working", since: 2 }));
  expect(host.querySelector('[data-member="Horus"]')?.textContent).toContain("travaille");
  await act(async () => terminalStatusStore.getState().set("horus", { state: "exited", code: 0 }));
  expect(host.querySelector('[data-member="Horus"]')?.textContent).toContain("arrêté");
});

it("filters the consoles by state, and searches them", async () => {
  await showTeam();
  await act(async () => [...map().querySelectorAll("button")].find((b) => b.textContent?.startsWith("attend"))!.click());
  expect(host.querySelector('[data-member="Isis"]')).toBeNull();
  expect(host.querySelector('[data-member="Horus"]')).not.toBeNull();
  await act(async () => [...map().querySelectorAll("button")].find((b) => b.textContent?.startsWith("tous"))!.click());
  await act(async () => type(host.querySelector('[aria-label="Chercher dans l\'équipe"]')!, "login"));
  expect(host.querySelector('[data-member="Isis"]')).not.toBeNull();
  expect(host.querySelector('[data-member="Horus"]')).toBeNull();
});

it("inspects a console: goes to it, pauses it, closes it through the confirmation", async () => {
  await showTeam();
  await act(async () => (host.querySelector('[data-member="Isis"] [aria-label="Inspecter Isis"]') as HTMLButtonElement).click());
  expect(inspector().textContent).toContain("Isis");
  await act(async () => inInspector("Aller à la console").click());
  expect(focusNode).toHaveBeenCalledWith("isis");
  await act(async () => inInspector("Pause").click());
  expect(pauseAgents).toHaveBeenCalledWith(["isis"]);
  await act(async () => inInspector("Fermer").click());
  expect(uiStore.getState().closing).toEqual({ agents: ["isis"], remove: ["isis"] });
  uiStore.getState().setClosing(null);
});

it("pauses no console that is not at work", async () => {
  await showTeam();
  await act(async () => (host.querySelector('[data-member="Horus"] [aria-label="Inspecter Horus"]') as HTMLButtonElement).click());
  expect(inInspector("Pause").disabled).toBe(true);
});

it("inspects the orchestrator: frames the team, pauses it, closes the orchestrator", async () => {
  await showTeam();
  expect(inspector().textContent).toContain("Chef");
  await act(async () => inInspector("Cadrer l'équipe").click());
  expect(frameNodes).toHaveBeenCalledWith(["chef", "isis", "horus"]);
  await act(async () => inInspector("Mettre l'équipe en pause").click());
  expect(pauseAgents).toHaveBeenCalledWith(["isis", "horus"]);
  await act(async () => inInspector("Fermer").click());
  expect(requestCloseOrchestrator).toHaveBeenCalledWith("chef");
});

it("shows the mission map in English", async () => {
  langStore.setState({ lang: "en" });
  await showTeam();
  expect(host.querySelector('[aria-label="Search the team"]')).not.toBeNull();
  expect(inInspector("Frame the team")).toBeDefined();
  expect(inInspector("Go to the console")).toBeDefined();
  expect(inInspector("Pause the team")).toBeDefined();
  expect(inInspector("Close")).toBeDefined();
});
