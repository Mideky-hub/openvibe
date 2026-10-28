import { setAgentsPanel } from "@/fleet/agentsPanelState";
import { agentsStore } from "@/fleet/agentsStore";
import { pauseAll, resumeAll, workspaceTerminalIds } from "@/fleet/broadcast";
import { AGENTS } from "@/fleet/catalog";
import { launchAt, launchFour, newConsole, placeOrchestrator } from "@/fleet/quickActions";
import { placeKanban } from "@/kanban/place";
import type { AgentId } from "@/ipc/pty";
import type { Command } from "../command";
import { requestUi } from "../uiRequests";
import { command, derived, sectionNamed } from "./define";
import { catalog } from "./messages";
import { inProject } from "./navigation";

/** The agents of « Lancer … », in the spec's order (spec fenêtre §7.3). */
const LAUNCHED: readonly AgentId[] = ["claude", "codex", "gemini", "qwen", "cursor", "opencode", "aider", "ollama", "shell"];

const section = sectionNamed((s) => s.agents);

/** Like the Agent menu: an agent not found on this computer is listed greyed, with why. */
const notFound = (agent: AgentId) => () =>
  agentsStore.getState().agents.some((a) => a.id === agent && a.available) ? null : catalog().reasons.notFound(AGENTS[agent].binary);

export const AGENT_COMMANDS: readonly Command[] = [
  ...LAUNCHED.map(
    (agent): Command =>
      derived(
        {
          id: `agent.launch.${agent}`,
          section,
          available: inProject,
          disabled: notFound(agent),
          // Ollama starts on a model: its menu opens on them (plan F2, décision 1).
          run: (ctx) => (agent === "ollama" ? requestUi({ kind: "agentMenu", view: "ollama", at: ctx.at }) : launchAt(agent, ctx.at)),
        },
        () => (agent === "ollama" ? catalog().commands["agent.ollama"].label : catalog().launch(AGENTS[agent].label)),
        () => [AGENTS[agent].label, AGENTS[agent].vendor, ...catalog().launchKeywords],
      ),
  ),
  command("agent.custom", {
    section,
    available: inProject,
    run: (ctx) => requestUi({ kind: "agentMenu", view: "options", at: ctx.at }),
  }),
  command("agent.other", {
    section,
    available: inProject,
    // The ＋ menu's catalog; from the radial menu, the agent starts at its point (spec menu radial §4.1).
    run: (ctx) => requestUi({ kind: "agentMenu", view: "agents", at: ctx.at }),
  }),
  command("agent.console", { section, available: inProject, run: (ctx) => newConsole(ctx.at) }),
  command("agent.four", { section, available: inProject, run: (ctx) => launchFour(ctx.at) }),
  command("agent.orchestrator", { section, available: inProject, run: (ctx) => placeOrchestrator(ctx.at) }),
  command("studio.kanban", { section, available: inProject, run: (ctx) => placeKanban(ctx.at) }),
  command("group.compose", {
    section,
    available: inProject,
    // Its window is anchored in the agents panel (plan F2, décision 4).
    run: () => {
      setAgentsPanel(true);
      requestUi({ kind: "composeGroup" });
    },
  }),
  command("agents.pauseAll", {
    section,
    available: inProject,
    run: async () => {
      await pauseAll(workspaceTerminalIds());
    },
  }),
  command("agents.resumeAll", {
    section,
    available: inProject,
    run: async () => {
      await resumeAll(workspaceTerminalIds());
    },
  }),
];
