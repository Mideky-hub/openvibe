// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { canvasStore } from "@/canvas/canvasStore";
import type { CommandContext } from "@/commands/command";
import { COMMANDS } from "@/commands/registry";
import { agentsStore } from "@/fleet/agentsStore";
import { AGENTS } from "@/fleet/catalog";
import { nodesStore } from "@/store/nodes";
import { lineOf, RINGS } from "./rings";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/nodes/terminal/registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/nodes/terminal/registry")>()),
  terminalSelection: vi.fn(() => ""),
}));

const ctx: CommandContext = { project: true, workspaceId: "w1", terminalCount: 1, terminalId: "isis", at: { x: 0, y: 0 }, groupId: "g1", orchestratorId: "chef" };
const labels = (kind: keyof typeof RINGS) => RINGS[kind].map((slot) => (slot ? lineOf(slot, ctx)!.label : null));

beforeAll(async () => {
  mockIPC(() => undefined);
  await nodesStore.getState().create("isis", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: "Isis", name: "Isis", agent: "claude", cwd: "C:/code", shell: "default", command: "" },
  });
  await nodesStore.getState().create("chef", { workspaceId: "w1", kind: "orchestrator", payload: { name: "chef" } });
  canvasStore.setState({ frames: [{ id: "g1", name: "Serveurs", x: 0, y: 0, width: 10, height: 10, group: { role: "backend", pantheon: "egypt" }, memberIds: ["isis"] }] });
  agentsStore.setState({ agents: [{ id: "claude", available: true }] } as never);
});

describe("the rings (spec menu radial §4)", () => {
  it("gives each ring 8 positions, each a function of the registry, never twice", () => {
    for (const [kind, slots] of Object.entries(RINGS)) {
      expect(slots, kind).toHaveLength(8);
      const ids = slots.flatMap((slot) => (slot ? [typeof slot.command === "function" ? slot.command(ctx) : slot.command] : []));
      expect(new Set(ids).size, kind).toBe(ids.length);
      for (const id of ids) expect(COMMANDS.some((c) => c.id === id), id).toBe(true);
    }
  });

  it("names each ring's positions as the spec does, clockwise from the top", () => {
    expect(labels("canvas")).toEqual(["Lancer Claude", "Lancer Shell", "Lancer 4 agents", "Orchestrateur", "Coller", "Texte", "Autre agent…", "Vue d'ensemble"]);
    expect(labels("terminal")).toEqual(["Copier", "Coller", "Renommer", "Relancer", "Fermer", "Dupliquer", "Mettre en pause", "Arrêter le processus"]);
    expect(labels("group")).toEqual(["Ajouter un agent…", "Renommer le groupe", "Relier un orchestrateur", "Mettre le groupe en pause", "Fermer le groupe", "Dégrouper", "Reprendre le groupe", "Cadrer le groupe"]);
    expect(labels("orchestrator")).toEqual(["Écrire une consigne", null, "Renommer", null, "Supprimer", null, "Relier", "Coller"]);
    expect(labels("selection")).toEqual(["Copier", "Coller", "Dupliquer", "Premier plan", "Supprimer", "Arrière-plan", "Verrouiller", "Plus…"]);
  });

  it("puts the default agent at the top of the canvas ring, with its icon", () => {
    agentsStore.setState({ agents: [{ id: "codex", available: true }] } as never);
    const top = lineOf(RINGS.canvas[0]!, ctx)!;
    expect([top.label, top.Icon]).toEqual(["Lancer Codex", AGENTS.codex.Icon]);
    agentsStore.setState({ agents: [{ id: "claude", available: true }] } as never);
  });

  it("greys what cannot run, with its reason, and marks what ends something", () => {
    const copy = lineOf(RINGS.terminal[0]!, ctx)!;
    expect([copy.enabled, copy.reason]).toEqual([false, "aucune sélection"]);
    const stop = lineOf(RINGS.terminal[7]!, ctx)!;
    expect([stop.enabled, stop.reason]).toEqual([false, null]);
    expect(lineOf(RINGS.terminal[4]!, ctx)!.danger).toBe(true);
  });
});

describe("the canvas ring when the default agent is the Shell (plan G1)", () => {
  it("does not offer « Lancer Shell » twice: its second place goes to another agent, else to the custom one", () => {
    const canvas = () => RINGS.canvas.map((slot) => (slot ? lineOf(slot, ctx)!.label : null));
    agentsStore.setState({ agents: [{ id: "shell", available: true }, { id: "gemini", available: true }] } as never);
    expect(canvas().filter((label) => label === "Lancer Shell")).toHaveLength(1);
    expect(canvas()[1]).toBe("Lancer Gemini");
    agentsStore.setState({ agents: [{ id: "shell", available: true }] } as never);
    expect(canvas().filter((label) => label === "Lancer Shell")).toHaveLength(1);
    expect(canvas()[1]).not.toBe("Lancer Shell");
    agentsStore.setState({ agents: [{ id: "claude", available: true }] } as never);
    expect(canvas()[1]).toBe("Lancer Shell");
  });
});
