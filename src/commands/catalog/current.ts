import { showNode } from "@/canvas/arrive";
import { focusGroup } from "@/canvas/canvasFocus";
import { whenViewSettled } from "@/canvas/viewSettled";
import { canvasStore } from "@/canvas/canvasStore";
import { groupOf, isGroup, type SceneGroup } from "@/canvas/groups";
import { setAgentsFilter, setAgentsPanel } from "@/fleet/agentsPanelState";
import { canPause, canResume, pauseAgents, pauseAll, resumeAgent, resumeAll, type AgentFacts } from "@/fleet/broadcast";
import { AGENTS } from "@/fleet/catalog";
import { groupMembers, requestCloseGroup, setGroupFolded, ungroup } from "@/fleet/groups";
import { orchestrateGroup } from "@/fleet/orchestrators";
import { duplicateTerminal, requestClose } from "@/fleet/terminals";
import type { TerminalPayload } from "@/nodes/types";
import { pasteIntoTerminal, relaunchTerminal, stopTerminal, terminalSelection } from "@/nodes/terminal/registry";
import { readClipboardText } from "@/radial/bridges";
import { openReview } from "@/review/reviewStore";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore, terminalOf } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { uiStore } from "@/store/ui";
import type { Command, CommandContext } from "../command";
import { requestUi } from "../uiRequests";
import { command } from "./define";
import { catalog } from "./messages";

/** The terminal of the moment (spec fenêtre §7.3): the one that had the keyboard when the palette opened. */
function payloadOf(ctx: CommandContext): TerminalPayload | undefined {
  return ctx.project && ctx.terminalId ? terminalOf(nodesStore.getState().nodes[ctx.terminalId]) : undefined;
}

/** The group the radial menu points at, else the group of the terminal of the moment. */
function groupOfCurrent(ctx: CommandContext): SceneGroup | null {
  const frames = canvasStore.getState().frames;
  if (ctx.project && ctx.groupId) {
    const group = frames.find((f) => f.id === ctx.groupId);
    return group && isGroup(group) ? group : null;
  }
  return payloadOf(ctx) && ctx.terminalId ? groupOf(frames, ctx.terminalId) : null;
}

function factsOf(ctx: CommandContext): AgentFacts | null {
  const payload = payloadOf(ctx);
  if (!payload || !ctx.terminalId) return null;
  return { agent: payload.agent, running: isRunning(ctx.terminalId), activity: agentActivityStore.getState().activities[ctx.terminalId]?.activity };
}

const hasTerminal = (ctx: CommandContext) => payloadOf(ctx) !== undefined;
const hasGroup = (ctx: CommandContext) => groupOfCurrent(ctx) !== null;
/** `run` of a terminal command: nothing happens if the terminal went between the palette and Entrée. */
function forTerminal(run: (id: string, ctx: CommandContext, payload: TerminalPayload) => void | Promise<void>): Command["run"] {
  return (ctx) => {
    const payload = payloadOf(ctx);
    if (payload && ctx.terminalId) return run(ctx.terminalId, ctx, payload);
  };
}
// Only for `available`, which already needs a terminal.
const terminalId = (ctx: CommandContext) => ctx.terminalId as string;
/** `run` of a group command: nothing happens if the group went between the palette and Entrée. */
function forGroup(run: (id: string) => void | Promise<void>): Command["run"] {
  return (ctx) => {
    const group = groupOfCurrent(ctx);
    if (group) return run(group.id);
  };
}

function terminalSection(ctx: CommandContext): string {
  const payload = payloadOf(ctx);
  return catalog().sections.terminal(payload ? payload.name || AGENTS[payload.agent].label : "");
}

const groupSection = (ctx: CommandContext) => catalog().sections.group(groupOfCurrent(ctx)?.name ?? "");

export const CURRENT: readonly Command[] = [
  command("terminal.rename", {
    section: terminalSection,
    available: hasTerminal,
    // The view moves if needed, without the keyboard: the name editor takes it.
    run: forTerminal((id) => {
      showNode(id);
      requestUi({ kind: "renameTerminal", id });
    }),
  }),
  command("terminal.duplicate", {
    section: terminalSection,
    available: hasTerminal,
    run: forTerminal(async (id, ctx) => {
      if (ctx.workspaceId) await duplicateTerminal(ctx.workspaceId, id);
    }),
  }),
  command("terminal.review", {
    section: terminalSection,
    available: hasTerminal,
    run: forTerminal((id) => openReview(id)),
  }),
  command("terminal.relaunch", {
    section: terminalSection,
    available: hasTerminal,
    // Claude resumes its session, other agents start anew (plan F2, décision 2).
    run: forTerminal((id, _ctx, payload) => {
      relaunchTerminal(id, payload, payload.agent === "claude" && payload.claudeSessionId ? "resume" : "new");
    }),
  }),
  command("terminal.stop", {
    section: terminalSection,
    available: (ctx) => hasTerminal(ctx) && isRunning(terminalId(ctx)),
    run: forTerminal((id) => stopTerminal(id)),
  }),
  command("terminal.pause", {
    section: terminalSection,
    available: (ctx) => {
      const facts = factsOf(ctx);
      return facts !== null && canPause(facts);
    },
    run: forTerminal(async (id) => {
      await pauseAgents([id]);
    }),
  }),
  command("terminal.resume", {
    section: terminalSection,
    available: (ctx) => {
      const facts = factsOf(ctx);
      return facts !== null && canResume(facts);
    },
    run: forTerminal(async (id) => {
      await resumeAgent(id);
    }),
  }),
  command("terminal.close", {
    section: terminalSection,
    available: hasTerminal,
    run: forTerminal((id) => requestClose(id)),
  }),
  command("terminal.copy", {
    section: terminalSection,
    available: hasTerminal,
    disabled: (ctx) => (terminalSelection(terminalId(ctx)) ? null : catalog().reasons.noSelection),
    run: forTerminal(async (id) => {
      await navigator.clipboard.writeText(terminalSelection(id));
    }),
  }),
  command("terminal.paste", {
    section: terminalSection,
    available: hasTerminal,
    run: forTerminal(async (id) => {
      const text = await readClipboardText();
      if (text !== null) pasteIntoTerminal(id, text);
    }),
  }),
  command("group.rename", {
    section: groupSection,
    available: hasGroup,
    // Its label edits the name: the group comes into view first, and the field waits for the scroll to end.
    run: forGroup((id) => {
      focusGroup(id);
      void whenViewSettled().then(() => uiStore.getState().setRenamingGroup(id));
    }),
  }),
  command("group.addAgent", {
    section: groupSection,
    available: hasGroup,
    // The group's menu, in the agents panel (plan F2, décision 4).
    run: forGroup((id) => {
      setAgentsFilter("all");
      setAgentsPanel(true);
      requestUi({ kind: "groupMenu", id });
    }),
  }),
  command("group.orchestrate", {
    section: groupSection,
    available: hasGroup,
    run: forGroup(async (id) => {
      await orchestrateGroup(id);
    }),
  }),
  command("group.fold", {
    section: groupSection,
    available: hasGroup,
    // Folds an unfolded group onto its label, unfolds a folded one (spec replier un groupe).
    run: forGroup((id) => setGroupFolded(id, !canvasStore.getState().frames.find((f) => f.id === id)?.group?.folded)),
  }),
  command("group.ungroup", { section: groupSection, available: hasGroup, run: forGroup((id) => ungroup(id)) }),
  command("group.close", { section: groupSection, available: hasGroup, run: forGroup((id) => requestCloseGroup(id)) }),
  command("group.pause", {
    section: groupSection,
    available: hasGroup,
    run: forGroup(async (id) => {
      await pauseAll(groupMembers(id));
    }),
  }),
  command("group.resume", {
    section: groupSection,
    available: hasGroup,
    run: forGroup(async (id) => {
      await resumeAll(groupMembers(id));
    }),
  }),
  command("group.frame", {
    section: groupSection,
    available: hasGroup,
    run: forGroup((id) => {
      focusGroup(id);
    }),
  }),
];
