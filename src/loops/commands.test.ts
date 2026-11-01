// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import type { CommandContext } from "@/commands/command";
import { labelOf, runCommand, sectionOf } from "@/commands/command";
import { pendingUiRequest } from "@/commands/uiRequests";
import { langStore } from "@/i18n";
import { loopCommands } from "./commands";
import { loopsStore } from "./live";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("./live", async () => {
  const { createLoopsStore } = await import("./store");
  const store = createLoopsStore(
    { now: () => 0, isLive: () => true, activityOf: () => undefined, screenOf: () => "", canReceive: () => true, send: async () => ({ sent: 0 }) },
    { read: async () => null, write: async () => undefined },
    { setInterval: () => 0 as never, clearInterval: () => undefined },
  );
  return { loopsStore: store };
});

const project: CommandContext = { project: true, workspaceId: "w1", terminalCount: 1, terminalId: null };
const home: CommandContext = { project: false, workspaceId: null, terminalCount: 0, terminalId: null };
const loop = { id: "1", name: "Point", instruction: "go", targets: ["a"], trigger: { kind: "interval", minutes: 5 } as const, maxRuns: 2 };

beforeEach(() => {
  langStore.setState({ lang: "fr" });
  loopsStore.setState({ loops: [loop], loaded: true, runtime: {} });
});

it("lists « Gérer les boucles… » in a project, and « tout arrêter » only while a loop runs, counting them", () => {
  const [manage, stopAll] = loopCommands();
  expect(labelOf(manage, project)).toBe("Gérer les boucles…");
  expect(sectionOf(manage, project)).toBe("Boucles");
  expect(manage.available(project)).toBe(true);
  expect(manage.available(home)).toBe(false);
  expect(stopAll.available(project)).toBe(false);
  loopsStore.getState().start("1");
  expect(stopAll.available(project)).toBe(true);
  expect(labelOf(stopAll, project)).toBe("Boucles : tout arrêter (1)");
  langStore.setState({ lang: "en" });
  expect(labelOf(stopAll, project)).toBe("Loops: stop all (1)");
});

it("stop all works from anywhere, home included: an emergency brake", () => {
  loopsStore.getState().start("1");
  const [, stopAll] = loopCommands();
  expect(stopAll.available(home)).toBe(true);
  runCommand(stopAll, home);
  expect(loopsStore.getState().runningCount()).toBe(0);
});

it("opens the window through a request to the interface", () => {
  runCommand(loopCommands()[0], project);
  expect(pendingUiRequest()).toEqual({ kind: "loops" });
});
