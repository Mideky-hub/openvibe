import { expect, it } from "vitest";
import { teamTree } from "./map";
import type { Member } from "./mission";
import type { AgentState } from "./store";

const member = (nodeId: string, name: string, task: string): Member => ({ nodeId, name, task, budgetMin: 20, linked: true, branch: "b", worktree: "w", sentAt: 0 });
const team = [member("isis", "Isis", "Login"), member("horus", "Horus", "API"), member("thot", "Thot", "Tests"), member("ra", "Râ", "Docs")];
const groups: Record<string, { id: string; name: string }> = { isis: { id: "g1", name: "Interface" }, thot: { id: "g1", name: "Interface" }, horus: { id: "g2", name: "Serveur" } };
const states: Record<string, AgentState> = { isis: "travaille", horus: "attend", thot: "inactif", ra: "arrêté" };
const tree = (state: AgentState | "tous", query = "") =>
  teamTree(team, { groupOf: (m) => groups[m.nodeId] ?? null, stateOf: (id) => states[id], state, query }).map((b) => [b.name, b.members.map((m) => m.name)]);

it("puts each console under its group, the ungrouped ones apart (#63)", () => {
  expect(tree("tous")).toEqual([
    ["Interface", ["Isis", "Thot"]],
    ["Serveur", ["Horus"]],
    [null, ["Râ"]],
  ]);
});

it("keeps the consoles in the state filtered on, and drops the groups left empty", () => {
  expect(tree("attend")).toEqual([["Serveur", ["Horus"]]]);
  expect(tree("arrêté")).toEqual([[null, ["Râ"]]]);
});

it("searches names, tasks and groups, case and accents aside", () => {
  expect(tree("tous", "ra")).toEqual([[null, ["Râ"]]]);
  expect(tree("tous", "LOGIN")).toEqual([["Interface", ["Isis"]]]);
  expect(tree("tous", "serv")).toEqual([["Serveur", ["Horus"]]]);
  expect(tree("travaille", "thot")).toEqual([]);
});
