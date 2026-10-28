import { arrive } from "@/canvas/arrive";
import { overview, releaseToCanvas } from "@/canvas/canvasFocus";
import { canvasStore } from "@/canvas/canvasStore";
import { stepTerminal, terminalOrder } from "@/canvas/terminalOrder";
import { fitScene, zoomTo } from "@/canvas/viewActions";
import { agentsPanelStore, setAgentsPanel } from "@/fleet/agentsPanelState";
import { focusCommandBar } from "@/shell/commandBarFocus";
import { projectsStore } from "@/store/projects";
import { inCodeWorkspace, openGoToLine } from "@/studio/GoToLine";
import type { Command, CommandContext } from "../command";
import { command, sectionNamed } from "./define";
import { catalog } from "./messages";
import { openPalette } from "../paletteState";

export const inProject = (ctx: CommandContext) => ctx.project;
const withTerminals = (ctx: CommandContext) => ctx.project && ctx.terminalCount > 0;
const always = () => true;

/** Ctrl+Tab and Ctrl+Maj+Tab (spec fenêtre §6.3): the next terminal in reading order, then the arrival (§6.4). */
function step(direction: 1 | -1, ctx: CommandContext) {
  const api = canvasStore.getState().api;
  if (!api) return;
  const target = stepTerminal(terminalOrder(api.getSceneElements()), ctx.terminalId, direction);
  if (target) arrive(target);
}

const nav = sectionNamed((s) => s.navigation);

export const NAVIGATION: readonly Command[] = [
  command("terminal.next", { section: nav, shortcut: "Ctrl+Tab", available: withTerminals, run: (ctx) => step(1, ctx) }),
  command("terminal.previous", { section: nav, shortcut: "Ctrl+Maj+Tab", available: withTerminals, run: (ctx) => step(-1, ctx) }),
  command("palette.goTo", { section: nav, shortcut: "Ctrl+P", available: always, run: (ctx) => openPalette("goTo", ctx) }),
  command("canvas.overview", { section: nav, shortcut: "Ctrl+Maj+A", available: inProject, run: () => overview() }),
  command("canvas.release", { section: nav, shortcut: "Maj+Échap", available: inProject, run: () => releaseToCanvas() }),
  command("canvas.fit", { section: nav, available: inProject, run: () => fitScene() }),
  command("canvas.zoom100", { section: nav, available: inProject, run: () => zoomTo(1) }),
  command("commandBar.focus", { section: nav, available: inProject, run: () => void focusCommandBar() }),
  command("agentsPanel.toggle", {
    label: () => (agentsPanelStore.getState().open ? catalog().hideAgentsPanel : catalog().showAgentsPanel),
    section: nav,
    available: inProject,
    run: () => setAgentsPanel(!agentsPanelStore.getState().open),
  }),
  command("project.home", { section: nav, available: inProject, run: () => projectsStore.getState().goHome() }),
  command("project.close", { section: nav, available: inProject, run: () => projectsStore.getState().close() }),
  command("editor.goToLine", { section: nav, shortcut: "Ctrl+G", available: () => inCodeWorkspace(), run: () => openGoToLine() }),
  command("palette.functions", { section: nav, shortcut: "Ctrl+Maj+P", available: always, run: (ctx) => openPalette("functions", ctx) }),
];
