// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { sendCommand } from "./broadcast";
import { historyStore } from "./history";
import { CommandInput } from "./CommandInput";
import type { TargetAgent } from "./targets";

vi.mock("./broadcast", () => ({ sendCommand: vi.fn(() => Promise.resolve()) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const agents: TargetAgent[] = [
  { id: "b", name: "Thot", groupName: null },
  { id: "d", name: "Zeus", groupName: null },
  { id: "h", name: "Héra", groupName: null },
];

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  mockIPC(() => undefined);
  vi.mocked(sendCommand).mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<CommandInput agents={agents} groups={[]} fallback={[]} placeholder="Consigne" emptyHint="Tape @" />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  clearMocks();
  document.body.replaceChildren();
});

const field = () => host.querySelector("textarea")!;
const options = () => [...host.querySelectorAll('[role="option"]')].map((o) => o.textContent);
const chips = () => [...host.querySelectorAll("[data-mention]")].map((c) => c.textContent);

async function type(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(field(), value);
    field().setSelectionRange(value.length, value.length);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(key: string) {
  await act(async () => {
    field().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

it("suggests Claude Code's commands after the targets, and Tab completes one", async () => {
  await type("@thot /ef");
  expect(options()).toEqual([expect.stringContaining("/effort")]);
  await press("Tab");
  expect(field().value).toBe("@thot /effort ");
  expect(options()).toEqual([]);
});

it("completes the last name of @thot/ze, the names before it becoming targets too", async () => {
  await type("@thot/ze");
  expect(options()).toEqual([expect.stringContaining("@zeus")]);
  await press("Tab");
  expect(chips()).toEqual(["@thot", "@zeus"]);
  expect(field().value).toBe("");
});

it("sends a /command to every agent of @thot/zeus/héra", async () => {
  await type("@thot/zeus/héra /effort ultracode");
  await press("Enter");
  expect(sendCommand).toHaveBeenCalledWith(["b", "d", "h"], "/effort ultracode");
});

it("sends a command typed in full on Enter, instead of completing it (final review maj §1)", async () => {
  await type("@thot /clear");
  await press("Enter");
  expect(sendCommand).toHaveBeenCalledWith(["b"], "/clear");
});

it("goes on through the history past a command, its list closed (final review maj §1)", async () => {
  await act(async () => historyStore.setState({ entries: ["@zeus lance les tests", "@thot/zeus /compact"] }));
  await press("ArrowUp");
  expect(field().value).toBe("@thot/zeus /compact");
  expect(options()).toEqual([]);
  await press("ArrowUp");
  expect(field().value).toBe("@zeus lance les tests");
});

it("does not send a /command whose target is unknown to the selection instead (final review maj §1)", async () => {
  await act(async () => root.render(<CommandInput agents={agents} groups={[]} fallback={["d"]} placeholder="Consigne" emptyHint="Tape @" />));
  await type("/clear @thot/zues");
  await press("Enter");
  expect(sendCommand).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Cible inconnue : @thot/zues");
});


it("keeps an unknown name of @nobody/ze when Tab completes the last one (backlog 27 oct)", async () => {
  await type("@nobody/ze");
  await press("Tab");
  expect(field().value).toBe("@nobody/zeus");
  expect(chips()).toEqual([]);
});

it("keeps Escape for the kind of list it closed: @ does not close / (backlog 27 oct)", async () => {
  await type("@");
  await press("Escape");
  expect(options()).toEqual([]);
  await type("/");
  expect(options().length).toBeGreaterThan(0);
});

it("leaves one space when a command is completed before the text (backlog 27 oct)", async () => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field(), "/ef lance");
    field().setSelectionRange(3, 3);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
  await press("Tab");
  expect(field().value).toBe("/effort lance");
});

it("does not send a command after an unfinished mention (@thot/ /clear, backlog 27 oct)", async () => {
  await act(async () => root.render(<CommandInput agents={agents} groups={[]} fallback={["d"]} placeholder="Consigne" emptyHint="Tape @" />));
  await type("@thot/ /clear");
  await press("Enter");
  expect(sendCommand).not.toHaveBeenCalled();
});

it("starts the highlight again at the top when the caret moves (backlog 27 oct)", async () => {
  await type("/c");
  await press("ArrowDown");
  await press("ArrowDown");
  const selected = () => [...host.querySelectorAll('[role="option"]')].findIndex((o) => o.getAttribute("aria-selected") === "true");
  expect(selected()).toBe(2);
  await act(async () => {
    field().focus();
    field().setSelectionRange(1, 1);
    field().dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft", bubbles: true }));
  });
  expect(selected()).toBe(0);
});

it("does not send on the Enter that ends an IME composition (plan B3)", async () => {
  await type("@thot lance");
  await act(async () => {
    field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true }));
  });
  expect(sendCommand).not.toHaveBeenCalled();
  await press("Enter");
  expect(sendCommand).toHaveBeenCalledTimes(1);
});

it("says why Envoyer is grey when the chosen group has no agent, not « Écris une consigne » (plan B3)", async () => {
  const empty = { id: "g1", name: "Vide", x: 0, y: 0, width: 10, height: 10, group: { role: "general", pantheon: "egypt" }, memberIds: [] };
  await act(async () => root.render(<CommandInput agents={agents} groups={[empty] as never} fallback={[]} placeholder="Consigne" emptyHint="Tape @" />));
  await type("@vide lance les tests");
  const send = host.querySelector<HTMLButtonElement>('button[aria-label="Envoyer"]')!;
  expect(send.disabled).toBe(true);
  expect(send.title).toBe("Aucun agent dans cette cible");
  expect(host.textContent).toContain("Aucun agent dans cette cible");
});
