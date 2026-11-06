import { describe, expect, it } from "vitest";
import { labelOf, sectionOf, type Command, type CommandContext } from "./command";
import { functionSections } from "./functions";
import { shortcutBindingsStore } from "./shortcuts";

const ctx: CommandContext = { project: true, workspaceId: "w1", terminalCount: 1, terminalId: null };
const command = (id: string, label: string, section: string, available = true): Command => ({
  id,
  label,
  section,
  keywords: [],
  available: () => available,
  run: () => undefined,
});

describe("functionSections (spec fenêtre §7.3)", () => {
  const commands = [
    command("terminal.next", "Terminal suivant", "Navigation"),
    command("workspace.new", "Nouveau workspace", "Workspaces"),
    command("terminal.pause", "Mettre en pause", "Terminal · Isis", false),
    command("canvas.overview", "Vue d'ensemble", "Navigation"),
    command("palette.functions", "Rechercher une fonction…", "Navigation"),
  ];

  it("lists the available functions by section, in the registry's order, without itself", () => {
    expect(functionSections(commands, ctx, "").map((s) => [s.label, s.items.map((c) => c.label)])).toEqual([
      ["Navigation", ["Terminal suivant", "Vue d'ensemble"]],
      ["Workspaces", ["Nouveau workspace"]],
    ]);
  });

  it("names a line and its section after the moment, shows its key, and why it is greyed", () => {
    const rename: Command = {
      id: "terminal.rename",
      label: (c) => `Renommer ${c.terminalId}`,
      section: (c) => `Terminal · ${c.terminalId}`,
      keywords: [],
      keys: "F2",
      available: () => true,
      run: () => undefined,
    };
    const codex: Command = {
      id: "agent.launch.codex",
      label: "Lancer Codex",
      section: "Agents",
      keywords: [],
      available: () => true,
      disabled: () => "codex introuvable dans le PATH",
      run: () => undefined,
    };
    const sections = functionSections([rename, codex], { ...ctx, terminalId: "Isis" }, "");
    expect(sections.map((s) => s.label)).toEqual(["Terminal · Isis", "Agents"]);
    expect(sections[0].items[0]).toMatchObject({ label: "Renommer Isis", hint: "F2", disabled: null });
    expect(sections[1].items[0]).toMatchObject({ label: "Lancer Codex", hint: null, disabled: "codex introuvable dans le PATH" });
    expect(labelOf(rename, { ...ctx, terminalId: "Thot" })).toBe("Renommer Thot");
    expect(sectionOf(codex, ctx)).toBe("Agents");
  });

  it("shows the keys the settings give a shortcut (issue #84)", () => {
    const goTo: Command = { ...command("palette.goTo", "Aller à…", "Navigation"), shortcut: "Ctrl+P" };
    expect(functionSections([goTo], ctx, "")[0].items[0].hint).toBe("Ctrl+P");
    shortcutBindingsStore.setState({ bindings: { "Ctrl+P": "Ctrl+Maj+K" } });
    expect(functionSections([goTo], ctx, "")[0].items[0].hint).toBe("Ctrl+Maj+K");
    shortcutBindingsStore.setState({ bindings: {} });
  });

  it("puts the recent functions first, most recent first, when nothing is typed, without repeating them below", () => {
    const sections = functionSections(commands, ctx, "", ["workspace.new", "canvas.overview", "gone"]);
    expect(sections.map((s) => [s.label, s.items.map((c) => c.label)])).toEqual([
      ["Récentes", ["Nouveau workspace", "Vue d'ensemble"]],
      ["Navigation", ["Terminal suivant"]],
    ]);
    expect(sections[0].items[0].section).toBe("Workspaces");
  });

  it("keeps a recent function first while searching when the words typed start its words, never for a loose match", () => {
    expect(functionSections(commands, ctx, "vue", ["canvas.overview"])[0].label).toBe("Récentes");
    expect(functionSections(commands, ctx, "nouv", ["canvas.overview"]).map((s) => s.label)).toEqual(["Workspaces"]);
    // « tsv » finds Terminal suivant by its letters only: no promotion.
    expect(functionSections(commands, ctx, "tsv", ["terminal.next"])[0].label).toBe("Navigation");
  });

  it("ranks each section by the search", () => {
    expect(functionSections(commands, ctx, "ens").map((s) => [s.label, s.items.map((c) => c.label)])).toEqual([["Navigation", ["Vue d'ensemble", "Terminal suivant"]]]);
  });
});
