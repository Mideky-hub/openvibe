// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { canvasStore } from "@/canvas/canvasStore";
import type { SceneFrame } from "@/canvas/groups";
import { langStore } from "@/i18n";
import { nodesStore } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { agentsPanelStore } from "./agentsPanelState";
import { AgentMenu } from "./AgentMenu";
import { AgentsPanel } from "./AgentsPanel";
import { pausedText, resumedText, sendCommand, skippedText, unsuitedText, waitingText } from "./broadcast";
import { AGENTS } from "./catalog";
import { CommandInput } from "./CommandInput";
import { FLEET_FILTERS, fleetSections } from "./fleetView";
import { agentsText, countsText, groupsText, waitingText as groupWaitingText } from "./groupSummary";
import { PANTHEONS } from "./names";
import { remoteLabel } from "./RemoteButton";
import { ROLES } from "./roles";
import { SLASH_COMMANDS } from "./slashCommands";
import { extractMentions, matchOptions, targetOptions, type TargetAgent } from "./targets";

// Excalidraw does not load under Vitest (roughjs); these components only reach it through menu actions.
vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("./quickActions", () => ({ newConsole: vi.fn(), launchFour: vi.fn(), placeOrchestrator: vi.fn() }));
vi.mock("./broadcast", async (importOriginal) => ({ ...(await importOriginal<typeof import("./broadcast")>()), sendCommand: vi.fn(() => Promise.resolve()) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => langStore.setState({ lang: "en" }));
afterEach(() => langStore.setState({ lang: "fr" }));

describe("catalogs in English", () => {
  it("words the vendors, the roles, the pantheons and the filters", () => {
    expect(AGENTS.ollama.vendor).toBe("local model");
    expect(AGENTS.shell.vendor).toBe("default");
    expect(AGENTS.custom.label).toBe("Custom");
    expect(AGENTS.custom.vendor).toBe("command");
    expect(ROLES.testers.label).toBe("Testers");
    expect(ROLES.security.label).toBe("Security");
    expect(ROLES.general.label).toBe("General");
    expect(PANTHEONS.find((p) => p.id === "egyptian")!.label).toBe("Egyptian");
    // The gods keep their names.
    expect(PANTHEONS.find((p) => p.id === "greek")!.names[0]).toBe("Athéna");
    expect(FLEET_FILTERS.map((f) => f.label)).toEqual(["All", "Working", "Waiting", "Active", "Ready", "Stopped"]);
    expect(fleetSections([{ id: "a", name: "Isis", agent: "claude", state: "idle" }], [], "all")[0].name).toBe("No group");
  });

  it("follows the language when it changes", () => {
    expect(ROLES.testers.label).toBe("Testers");
    langStore.setState({ lang: "fr" });
    expect(ROLES.testers.label).toBe("Testeurs");
    expect(AGENTS.custom.label).toBe("Personnalisé");
  });

  it("words the slash command hints", () => {
    expect(SLASH_COMMANDS.find((c) => c.name === "/compact")!.hint).toBe("Summarize the conversation to free up context");
    expect(SLASH_COMMANDS.find((c) => c.name === "/status")!.hint).toBe("Version, model, account");
  });

  it("words the group counters and the plurals", () => {
    expect(countsText(4, 2)).toBe("4 · 2 working");
    expect(countsText(4, 0)).toBe("4 · idle");
    expect(groupWaitingText(1)).toBe("· 1 waiting");
    expect(groupWaitingText(0)).toBeNull();
    expect(agentsText(0)).toBe("0 agents");
    expect(agentsText(1)).toBe("1 agent");
    expect(groupsText(2)).toBe("2 groups");
  });

  it("words the broadcast warnings and the pause toasts", () => {
    expect(skippedText(["Thot"])).toBe("1 stopped agent ignored: Thot");
    expect(skippedText(["Thot", "Anubis"])).toBe("2 stopped agents ignored: Thot, Anubis");
    expect(waitingText(["Horus"])).toBe("1 waiting agent ignored: Horus — answer it in its terminal");
    expect(unsuitedText(["Thot"])).toBe("1 terminal without an agent ignored: Thot — a / command only goes to agents");
    expect(skippedText([])).toBeNull();
    expect(pausedText(0)).toBe("No running agent to pause");
    expect(pausedText(3)).toBe("3 agents paused");
    expect(resumedText(1)).toBe("1 agent resumed");
  });

  it("words the Remote Control states", () => {
    expect(remoteLabel({ state: "on" }, true, true)).toBe("Remote Control on");
    expect(remoteLabel({ state: "error", error: "no" }, true, true)).toBe("Remote Control: no");
    expect(remoteLabel(undefined, true, false)).toBe("Remote Control at next start");
    expect(remoteLabel(undefined, false, false)).toBe("Remote Control");
  });
});

describe("targets in both languages", () => {
  const frames: SceneFrame[] = [];
  const agents: TargetAgent[] = [{ id: "a", name: "Isis", groupName: null }];

  it("shows @all in English and @tous in French", () => {
    expect(targetOptions(agents, frames)[0].label).toBe("@all");
    expect(targetOptions(agents, frames)[0].detail).toBe("1 agent");
    expect(targetOptions(agents, frames)[1].detail).toBe("No group");
    langStore.setState({ lang: "fr" });
    expect(targetOptions(agents, frames)[0].label).toBe("@tous");
    expect(targetOptions(agents, frames)[1].detail).toBe("Hors groupe");
  });

  it("understands both @all and @tous whatever the language", () => {
    for (const lang of ["en", "fr"] as const) {
      langStore.setState({ lang });
      const options = targetOptions(agents, frames);
      expect(extractMentions("@all run the tests", options)).toEqual({ targets: [{ kind: "all" }], text: "run the tests" });
      expect(extractMentions("@tous lance les tests", options)).toEqual({ targets: [{ kind: "all" }], text: "lance les tests" });
    }
  });

  it("completes @al and @to to the all option", () => {
    const options = targetOptions(agents, frames);
    expect(matchOptions(options, "al")[0].target).toEqual({ kind: "all" });
    expect(matchOptions(options, "to")[0].target).toEqual({ kind: "all" });
  });
});

describe("components in English", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    mockIPC((cmd) => (cmd.startsWith("list_") ? [] : undefined));
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    clearMocks();
    document.body.replaceChildren();
  });

  it("words the agents panel", async () => {
    agentsPanelStore.setState({ open: true, filter: "all" });
    await nodesStore.getState().create("ada", {
      workspaceId: "w1",
      kind: "terminal",
      payload: { title: "Ada", name: "Ada", agent: "claude", cwd: "C:/code", shell: "default", command: "" },
    });
    terminalStatusStore.getState().set("ada", { state: "stopped" });
    canvasStore.getState().setNodeIds(["ada"]);
    canvasStore.setState({ frames: [] });
    await act(async () => root.render(<AgentsPanel />));
    const byLabel = (label: string) => host.querySelector(`[aria-label="${label}"]`);
    for (const label of ["Launch an agent", "New console", "Compose a group", "Pause all", "Resume all", "More actions", "Close the panel"]) {
      expect(byLabel(label), label).not.toBeNull();
    }
    const filters = [...host.querySelectorAll<HTMLButtonElement>("[data-filter]")];
    expect(filters.map((f) => f.textContent?.replace(/\d+$/, ""))).toEqual(["All", "Working", "Waiting", "Active", "Ready", "Stopped"]);
    await act(async () => agentsPanelStore.setState({ filter: "working" }));
    expect(host.textContent).toContain("No agent in this filter");
    // Hovering buttons of the row.
    await act(async () => agentsPanelStore.setState({ filter: "all" }));
    expect(byLabel("Close Ada")).not.toBeNull();
    expect(byLabel("Review of Ada")).not.toBeNull();
  });

  it("words the agent menu and its vendors", async () => {
    await act(async () =>
      root.render(<AgentMenu trigger={() => <button type="button">open</button>} />),
    );
    await act(async () => host.querySelector("button")!.click());
    const text = document.body.textContent ?? "";
    expect(text).toContain("Launch an agent");
    expect(text).toContain("New console");
    expect(text).toContain("Launch 4 agents");
    expect(text).toContain("Orchestrator");
    expect(text).toContain("commands groups and agents");
    expect(text).toContain("then click on the canvas to place it");
    expect(text).toContain("local model");
  });

  it("switches the @ list's words when the language changes, the bar staying open (final review R5a)", async () => {
    const agents: TargetAgent[] = [{ id: "b", name: "Thot", groupName: null }];
    langStore.setState({ lang: "fr" });
    await act(async () =>
      root.render(<CommandInput agents={agents} groups={[]} fallback={[]} placeholder="Consigne" emptyHint="Tape @" />),
    );
    const field = host.querySelector("textarea")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(field, "@");
      field.setSelectionRange(1, 1);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const options = () => [...host.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(options()[0]).toContain("@tous");
    await act(async () => langStore.setState({ lang: "en" }));
    expect(options()).toEqual(["@all1 agent", "@thotNo group"]);
  });

  it("words the command bar and sends @all to every agent", async () => {
    const agents: TargetAgent[] = [{ id: "b", name: "Thot", groupName: null }];
    vi.mocked(sendCommand).mockClear();
    await act(async () =>
      root.render(<CommandInput agents={agents} groups={[]} fallback={[]} placeholder="Instruction" emptyHint="Type @" />),
    );
    const field = host.querySelector("textarea")!;
    const type = async (value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      await act(async () => {
        setter.call(field, value);
        field.setSelectionRange(value.length, value.length);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await type("@");
    expect([...host.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(["@all1 agent", "@thotNo group"]);
    await type("@tous /");
    expect(host.textContent).toContain("Summarize the conversation to free up context");
    await type("/effort @nobody");
    expect(host.textContent).toContain("Unknown target: @nobody");
    await type("@all run the tests");
    const send = host.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!;
    expect(send.textContent).toBe("Send");
    await act(async () => send.click());
    expect(sendCommand).toHaveBeenCalledWith(["b"], "run the tests");
  });
});
