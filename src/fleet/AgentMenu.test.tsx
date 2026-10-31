// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { openUrl } from "@tauri-apps/plugin-opener";
import { requestUi } from "@/commands/uiRequests";
import { langStore } from "@/i18n";
import { AGENT_IDS, type AgentInfo } from "@/ipc/pty";
import { agentsStore } from "./agentsStore";
import { AgentMenu } from "./AgentMenu";
import { installAgent, pullOllamaModel } from "./installAgent";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));
vi.mock("./quickActions", () => ({ newConsole: vi.fn(), launchFour: vi.fn(), placeOrchestrator: vi.fn() }));
vi.mock("./installAgent", () => ({ installAgent: vi.fn(() => Promise.resolve("node")), pullOllamaModel: vi.fn(() => Promise.resolve("node")) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const only = (...ids: string[]): AgentInfo[] => AGENT_IDS.map((id) => ({ id, available: id === "shell" || id === "custom" || ids.includes(id) }));

let agents: AgentInfo[];
let models: string[];
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  agents = only("claude");
  models = [];
  vi.mocked(installAgent).mockClear();
  vi.mocked(pullOllamaModel).mockClear();
  agentsStore.setState({ agents: [], shells: [], loaded: false });
  mockIPC((cmd) => {
    if (cmd === "list_agents") return agents;
    if (cmd === "list_shells") return ["powershell"];
    if (cmd === "list_ollama_models") return models;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  clearMocks();
  document.body.replaceChildren();
  langStore.setState({ lang: "fr" });
});

const openMenu = async () => {
  await act(async () => root.render(<AgentMenu answersRequests trigger={() => <button type="button">open</button>} />));
  await act(async () => host.querySelector("button")!.click());
};
const button = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
const installButtons = () => [...document.body.querySelectorAll<HTMLButtonElement>("[data-install]")];

it("offers to install the missing agents only (spec installation §4.1)", async () => {
  await openMenu();
  expect(installButtons().map((b) => b.dataset.install)).toEqual(["codex", "gemini", "qwen", "cursor", "opencode", "aider", "ollama"]);
  expect(installButtons()[0].getAttribute("aria-label")).toBe("Installer Codex");
  expect(installButtons()[0].disabled).toBe(false);
});

it("offers nothing before the agents are known", async () => {
  mockIPC((cmd) => (cmd === "list_agents" || cmd === "list_shells" ? new Promise(() => undefined) : undefined));
  await openMenu();
  expect(installButtons()).toEqual([]);
});

it("shows the whole command before running it, then installs from the menu", async () => {
  await openMenu();
  await act(async () => installButtons()[0].click());
  const prompt = document.body.querySelector("[data-install-prompt='codex']")!;
  expect(prompt.querySelector("code")!.textContent).toBe('powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"');
  expect(prompt.textContent).toContain("terminal PowerShell");
  expect(installAgent).not.toHaveBeenCalled();
  await act(async () => button("Lancer dans un terminal")!.click());
  expect(installAgent).toHaveBeenCalledWith("codex", undefined);
  expect(document.body.querySelector("[data-install-prompt]")).toBeNull();
});

it("says that Gemini CLI needs Node.js, in cmd, and links to its page", async () => {
  await openMenu();
  await act(async () => document.body.querySelector<HTMLButtonElement>("[data-install='gemini']")!.click());
  const prompt = document.body.querySelector("[data-install-prompt='gemini']")!;
  expect(prompt.textContent).toContain("Nécessite Node.js");
  expect(prompt.textContent).toContain("terminal Invite de commandes");
  await act(async () => button("Page officielle")!.click());
  expect(openUrl).toHaveBeenCalledWith("https://github.com/google-gemini/gemini-cli");
});

it("goes back to the agents without installing", async () => {
  await openMenu();
  await act(async () => installButtons()[0].click());
  await act(async () => button("Installer Codex")!.click());
  expect(document.body.querySelector("[data-install-prompt]")).toBeNull();
  expect(installButtons().length).toBeGreaterThan(0);
  expect(installAgent).not.toHaveBeenCalled();
});

it("installs where the radial menu was opened", async () => {
  await openMenu();
  await act(async () => requestUi({ kind: "agentMenu", view: "agents", at: { x: 5, y: 6 } }));
  await act(async () => installButtons()[0].click());
  await act(async () => button("Lancer dans un terminal")!.click());
  expect(installAgent).toHaveBeenCalledWith("codex", { x: 5, y: 6 });
});

it("speaks English", async () => {
  langStore.setState({ lang: "en" });
  await openMenu();
  expect(installButtons()[0].textContent).toBe("Install");
  await act(async () => installButtons()[0].click());
  const prompt = document.body.querySelector("[data-install-prompt]")!;
  expect(prompt.textContent).toContain("This official command will run in a PowerShell terminal on the canvas:");
  expect(button("Run in a terminal")).toBeTruthy();
});

it("pulls an Ollama model from its picker, the menu closing on the terminal (spec installation §5)", async () => {
  agents = only("ollama");
  models = ["llama3.2:3b"];
  await openMenu();
  await act(async () => button("Ollama")!.click());
  await act(async () => button("qwen2.5-coder:7b")!.click());
  expect(pullOllamaModel).toHaveBeenCalledWith("qwen2.5-coder:7b", undefined);
  expect(button("qwen2.5-coder:7b")).toBeUndefined();
});
