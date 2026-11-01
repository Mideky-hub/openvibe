// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { langStore } from "@/i18n";
import { nodesStore } from "@/store/nodes";
import { usageStore } from "@/usage/usageStore";
import { notify } from "./events";
import { NEW_MISSION, type Mission } from "./mission";
import { OvernightDialog } from "./OvernightDialog";
import { missionOf } from "./store";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("./events", () => ({ notify: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const session = { title: "Chef", name: "Chef", agent: "claude" as const, cwd: "C:/p", shell: "default" as const, command: "", role: "orchestrator" as const };

async function show(mission: Partial<Mission> = {}, withSession?: typeof session) {
  await nodesStore.getState().create("chef", { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef", ...(withSession ? { session: withSession } : {}), mission: { ...NEW_MISSION, ...mission } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<OvernightDialog nodeId="chef" open onOpenChange={() => undefined} />));
}

function type(field: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
const field = (label: string) => document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === label)!;
const missionNow = () => missionOf(nodesStore.getState().nodes.chef)!;

beforeEach(() => {
  mockIPC(() => undefined);
  vi.clearAllMocks();
});
afterEach(async () => {
  langStore.setState({ lang: "fr" });
  await act(async () => root.unmount());
  host.remove();
});

it("asks for the time away, the agents and the source; Kanban is not offered, it does not exist here", async () => {
  await show({ maxAgents: 3 });
  expect(field("Temps d'absence (heures)").value).toBe("8");
  expect(field("Nombre d'agents").value).toBe("3");
  expect(document.body.textContent).toContain("Issues GitHub");
  expect(document.body.textContent).toContain("BACKLOG.md");
  expect(document.body.textContent).not.toContain("Kanban");
});

it("sets up the mission and gives the orchestrator its orders", async () => {
  await show();
  await act(async () => type(field("Temps d'absence (heures)"), "6.5"));
  await act(async () => type(field("Nombre d'agents"), "5"));
  await act(async () => button("Préparer la nuit").click());
  expect(missionNow()).toMatchObject({ overnight: true, budgetMin: 390, maxAgents: 5, tickets: { kind: "github", label: "overnight" } });
  expect(vi.mocked(notify).mock.calls[0][1]).toBe(
    "Mission de nuit : l'utilisateur s'absente 390 min. Appelle tickets, garde ce qui tient dans ce temps avec 5 agents, mets le surplus dans la file avec add_tasks, puis appelle propose_plan : le plan attend son feu vert.",
  );
});

it("reads BACKLOG.md when chosen, without asking for a label", async () => {
  await show();
  expect(field("Label des issues")).not.toBeNull();
  await act(async () => field("BACKLOG.md").click());
  expect(field("Label des issues")).toBeNull();
  await act(async () => button("Préparer la nuit").click());
  expect(missionNow().tickets).toEqual({ kind: "backlog" });
});

it("waits for the user's go-ahead by default; starting alone is their explicit choice (review)", async () => {
  await show();
  expect(field("Lancer sans attendre mon feu vert").checked).toBe(false);
  await act(async () => button("Préparer la nuit").click());
  expect(missionNow().autoLaunch).toBeUndefined();
  expect(vi.mocked(notify).mock.calls[0][1]).toContain("le plan attend son feu vert");
});

it("starts alone when the user ticks it", async () => {
  await show();
  await act(async () => field("Lancer sans attendre mon feu vert").click());
  await act(async () => button("Préparer la nuit").click());
  expect(missionNow().autoLaunch).toBe(true);
  expect(vi.mocked(notify).mock.calls[0][1]).toContain("le plan se lance sans attendre de feu vert");
});

it("will not start without a time, too many agents, or a label: a repository's issues need one", async () => {
  await show();
  await act(async () => type(field("Temps d'absence (heures)"), "0"));
  expect(button("Préparer la nuit").disabled).toBe(true);
  await act(async () => type(field("Temps d'absence (heures)"), "8"));
  await act(async () => type(field("Nombre d'agents"), "9"));
  expect(button("Préparer la nuit").disabled).toBe(true);
  await act(async () => type(field("Nombre d'agents"), "4"));
  await act(async () => type(field("Label des issues"), "  "));
  expect(button("Préparer la nuit").disabled).toBe(true);
  await act(async () => type(field("Label des issues"), "nuit"));
  expect(button("Préparer la nuit").disabled).toBe(false);
});

it("defaults to files: commands stay an explicit choice (review)", async () => {
  await show();
  expect(field("Fichiers").checked).toBe(true);
  expect(field("Fichiers et commandes").checked).toBe(false);
  await act(async () => button("Préparer la nuit").click());
  expect(missionNow().permission).toBe("edits");
});

it("says plainly what files and commands opens to the agents", async () => {
  await show();
  expect(document.body.textContent).toContain("Les agents lancent n'importe quelle commande sans demander : le réseau et les comptes connectés sur ce PC leur sont ouverts.");
  expect(document.body.textContent).not.toContain("le reste est refusé");
  await act(async () => field("Fichiers et commandes").click());
  await act(async () => button("Préparer la nuit").click());
  expect(missionNow().permission).toBe("work");
});

it("says the push block is no security boundary, with how it was passed (review)", async () => {
  await show();
  const text = document.body.textContent;
  expect(text).toContain("Ce blocage n'est pas une frontière de sécurité");
  expect(text).toContain("-c remote.origin.pushurl");
  expect(text).toContain("GIT_CONFIG_COUNT=0");
  expect(text).not.toContain("git push reste interdit dans tous les cas");
  expect(text).toContain("Tes réglages ne sont pas modifiés.");
});

it("says what files costs a night: an agent stops at its first command", async () => {
  await show();
  expect(document.body.textContent).toContain("un agent s'arrête à sa première commande, jusqu'à ton retour.");
});

it("will not start outside a repository, and needs gh only for GitHub", async () => {
  mockIPC((cmd) => (cmd === "mission_checks" ? { git: true, gh: false } : undefined));
  await show({}, session);
  await vi.waitFor(() => expect(document.querySelector("[data-checks]")?.textContent).toContain("gh ne répond pas"));
  expect(button("Préparer la nuit").disabled).toBe(true);
  await act(async () => field("BACKLOG.md").click());
  expect(document.querySelector("[data-checks]")?.textContent).not.toContain("gh ne répond pas");
  expect(button("Préparer la nuit").disabled).toBe(false);
});

it("warns on the plan's usage without blocking, and says what can still put the PC to sleep", async () => {
  usageStore.setState({ limits: { fiveHour: { usedPercent: 85 }, models: [] } as never });
  await show();
  const checks = document.querySelector("[data-checks]")?.textContent;
  expect(checks).toContain("Usage du forfait à 85 %");
  expect(checks).toContain("Fermer le capot");
  expect(button("Préparer la nuit").disabled).toBe(false);
  usageStore.setState({ limits: null });
});

it("speaks English", async () => {
  langStore.setState({ lang: "en" });
  await show();
  expect(document.body.textContent).toContain("Overnight run");
  expect(document.body.textContent).toContain("Agents run any command unasked: the network and the accounts logged in on this PC are open to them.");
  expect(document.body.textContent).toContain("an agent stops at its first command, until you are back.");
  expect(document.body.textContent).toContain("This block is not a security boundary");
  expect(document.body.textContent).not.toContain("stays forbidden in every case");
  await act(async () => button("Prepare the night").click());
  expect(vi.mocked(notify).mock.calls[0][1]).toBe(
    "Overnight run: the user is away for 480 min. Call tickets, keep what fits in that time with 4 agents, put the rest in the queue with add_tasks, then call propose_plan: the plan waits for their go-ahead.",
  );
});
