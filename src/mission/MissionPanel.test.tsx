// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { toast } from "sonner";
import { langStore } from "@/i18n";
import { nodesStore } from "@/store/nodes";
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
  expect(host.textContent).toContain("Total 20 min / 60");
  await act(async () => button("Lancer la mission").click());
  expect(launchMission).toHaveBeenCalledWith("chef");
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
