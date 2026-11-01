// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { langStore } from "@/i18n";
import { buildSpawnSpec, newTerminalPayload } from "@/nodes/terminal/launch";
import { readTerminalPayload } from "@/nodes/types";
import { AccountChip } from "@/nodes/terminal/TerminalHeader";
import { AccountsDialog } from "./AccountsDialog";
import { accountsStore, loadAccounts } from "./store";

vi.mock("@/nodes/terminal/registry", () => ({ relaunchTerminal: vi.fn(), stopTerminal: vi.fn(), terminalText: vi.fn(() => "") }));
vi.mock("@/fleet/quickActions", () => ({ launchLogin: vi.fn(() => Promise.resolve(true)) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WORK = { id: "p1", name: "Travail", configDir: "C:/tmp/openvibe-test/work" };
let state: { profiles: (typeof WORK)[]; active: string | null };
let calls: { cmd: string; args: Record<string, unknown> }[];

beforeEach(() => {
  state = { profiles: [WORK], active: null };
  calls = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: args as Record<string, unknown> });
    if (cmd === "accounts_list") return state;
    if (cmd === "account_use") state.active = (args as { id: string | null }).id;
    if (cmd === "account_remove") state.profiles = [];
    return undefined;
  });
  accountsStore.setState({ profiles: [WORK], active: null, loaded: true, open: false });
});
afterEach(() => {
  clearMocks();
  langStore.setState({ lang: "fr" });
});

it("starts a Claude terminal in its profile's folder, and in the default one when the profile is gone", () => {
  const payload = newTerminalPayload({ title: "", cwd: "C:/code", agent: "claude", command: "", shell: "default", accountId: "p1" });
  expect(payload.accountId).toBe("p1");
  expect(buildSpawnSpec(payload, "resume").claude?.configDir).toBe(WORK.configDir);
  expect(buildSpawnSpec({ ...payload, accountId: "gone" }, "resume").claude?.configDir).toBeUndefined();
  expect(buildSpawnSpec({ ...payload, accountId: undefined }, "new").claude?.configDir).toBeUndefined();
  // Other agents have no profile.
  expect(newTerminalPayload({ title: "", cwd: "C:/code", agent: "shell", command: "", shell: "default", accountId: "p1" }).accountId).toBeUndefined();
});

it("keeps the profile of a terminal across a save and a reload", () => {
  const payload = newTerminalPayload({ title: "", cwd: "C:/code", agent: "claude", command: "", shell: "default", accountId: "p1" });
  expect(readTerminalPayload(JSON.parse(JSON.stringify(payload)))?.accountId).toBe("p1");
});

it("shows the account chip only once there is a profile to choose from", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  accountsStore.setState({ profiles: [] });
  await act(async () => root.render(<AccountChip accountId={undefined} />));
  expect(host.querySelector("[data-account]")).toBeNull();
  accountsStore.setState({ profiles: [WORK] });
  await act(async () => root.render(<AccountChip accountId="p1" />));
  expect(host.querySelector("[data-account]")?.textContent).toBe("Travail");
  expect(host.querySelector("[data-account]")?.getAttribute("title")).toContain(WORK.configDir);
  await act(async () => root.render(<AccountChip accountId={undefined} />));
  expect(host.querySelector("[data-account]")?.textContent).toBe("Par défaut");
  await act(async () => root.unmount());
  host.remove();
});

it("lists the profiles and uses, logs in and removes them (spec comptes §6), in both languages", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<AccountsDialog />));
  await act(async () => {
    accountsStore.setState({ open: true });
    await loadAccounts();
  });
  const text = () => document.body.textContent ?? "";
  expect(text()).toContain("Comptes Claude");
  expect(text()).toContain("Travail");
  const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;
  await act(async () => button("Utiliser").click());
  await vi.waitFor(() => expect(calls.some((c) => c.cmd === "account_use" && c.args.id === "p1")).toBe(true));
  await act(async () => button("Se connecter").click());
  const { launchLogin } = await import("@/fleet/quickActions");
  expect(launchLogin).toHaveBeenCalledWith("p1");
  await act(async () => langStore.setState({ lang: "en" }));
  expect(text()).toContain("Claude accounts");
  expect(button("Remove")).toBeTruthy();
  await act(async () => button("Remove").click());
  await vi.waitFor(() => expect(calls.some((c) => c.cmd === "account_remove" && c.args.id === "p1")).toBe(true));
  await act(async () => root.unmount());
  host.remove();
});
