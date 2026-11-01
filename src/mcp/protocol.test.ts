import { expect, it } from "vitest";
import { internalCall, outMission, outReport, outStep, outAgentState, outLevel, RENAMED } from "./protocol";

it("maps the English tool names and arguments to the internal ones (spec première version §7.1)", () => {
  expect(internalCall("declare_steps", { steps: ["Plan"] })).toEqual({ name: "declarer_etapes", args: { etapes: ["Plan"] } });
  expect(internalCall("step", { title: "Plan", state: "done" })).toEqual({ name: "etape", args: { titre: "Plan", etat: "fait" } });
  expect(internalCall("report", { summary: "Fait", status: "blocked" })).toEqual({ name: "rendre_compte", args: { resume: "Fait", statut: "bloque" } });
  expect(internalCall("finish", { summary: "Fini" })).toEqual({ name: "terminer", args: { bilan: "Fini" } });
  expect(internalCall("remote_control", { on: true, agents: ["all", "me", "Isis"] })).toEqual({ name: "remote_control", args: { actif: true, agents: ["tous", "moi", "Isis"] } });
  expect(internalCall("propose_plan", { name: "Auth", task: "T", subtasks: [{ title: "Login", brief: "B", agent: "new", budget_min: 20, level: "high" }] })).toEqual({
    name: "proposer_plan",
    args: { nom: "Auth", tache: "T", sous_taches: [{ titre: "Login", consigne: "B", agent: "nouveau", budget_min: 20, niveau: "eleve" }] },
  });
  expect(internalCall("propose_plan", { name: "A", task: "T", subtasks: [{ title: "L", brief: "B", agent: "new", budget_min: 1, group: "Front" }] }).args).toMatchObject({
    sous_taches: [{ agent: "nouveau", groupe: "Front" }],
  });
  expect(internalCall("add_tasks", { tasks: [{ title: "T", brief: "B", budget_min: 5, level: "high", group: "Front" }] })).toEqual({
    name: "add_tasks",
    args: { tasks: [{ titre: "T", consigne: "B", budget_min: 5, niveau: "eleve", groupe: "Front" }] },
  });
  expect(internalCall("queue", {}).name).toBe("queue");
  expect(internalCall("next_task", { agent: "Isis" })).toEqual({ name: "next_task", args: { agent: "Isis" } });
  expect(internalCall("reassign", { subtask: "Login", agent: "new" })).toEqual({ name: "reattribuer", args: { sous_tache: "Login", agent: "nouveau" } });
  expect(internalCall("read_output", { agent: "Isis", lines: 5 })).toEqual({ name: "lire_sortie", args: { agent: "Isis", lignes: 5 } });
  expect(internalCall("write", { agent: "Isis", text: "go" })).toEqual({ name: "ecrire", args: { agent: "Isis", texte: "go" } });
});

it("still accepts French values, as a resumed conversation may send them", () => {
  expect(internalCall("step", { title: "Plan", state: "fait" })).toEqual({ name: "etape", args: { titre: "Plan", etat: "fait" } });
  expect(internalCall("report", { summary: "x", status: "termine" }).args).toEqual({ resume: "x", statut: "termine" });
  expect(internalCall("propose_plan", { name: "A", task: "T", subtasks: [{ title: "L", brief: "B", agent: "nouveau", budget_min: 1, level: "faible" }] }).args).toMatchObject({
    sous_taches: [{ agent: "nouveau", niveau: "faible" }],
  });
});

it("knows the old French names, to say what they became", () => {
  expect(RENAMED.rendre_compte).toBe("report");
  expect(RENAMED.proposer_plan).toBe("propose_plan");
  expect(internalCall("rendre_compte", {}).name).toBe("");
});

it("gives states and levels out in English", () => {
  expect(outMission("en_cours")).toBe("running");
  expect(outMission("redaction")).toBe("drafting");
  expect(outStep("a_venir")).toBe("pending");
  expect(outReport("bloque")).toBe("blocked");
  expect(outAgentState("arrêté")).toBe("stopped");
  expect(outLevel("eleve")).toBe("high");
});
