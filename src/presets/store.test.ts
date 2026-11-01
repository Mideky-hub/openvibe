// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { TeamPreset } from "./model";
import { presetsStore } from "./store";

const preset = (name: string, id = name): TeamPreset => ({ id, name, savedAt: 1, groups: [{ name: "G", role: "docs", agents: ["claude"], x: 0, y: 0 }], orchestrators: [] });

let saved: { key: string; value: unknown }[];
let stored: unknown;

beforeEach(() => {
  saved = [];
  stored = { version: 1, presets: [preset("Dev HQ", "1")] };
  presetsStore.setState({ presets: [], loaded: false });
  mockIPC((cmd, args) => {
    if (cmd === "get_setting") return stored;
    if (cmd === "set_setting") saved.push(args as { key: string; value: unknown });
  });
});
afterEach(() => clearMocks());

it("loads the saved presets once, and reads nothing from a damaged setting", async () => {
  await presetsStore.getState().load();
  expect(presetsStore.getState().presets.map((p) => p.name)).toEqual(["Dev HQ"]);
  expect(presetsStore.getState().loaded).toBe(true);
  stored = "garbage";
  presetsStore.setState({ presets: [], loaded: false });
  await presetsStore.getState().load();
  expect(presetsStore.getState().presets).toEqual([]);
});

it("saves a preset under presets.teams, versioned, replacing one of the same name", async () => {
  await presetsStore.getState().load();
  expect(await presetsStore.getState().save(preset("Tests", "2"))).toBe(true);
  expect(await presetsStore.getState().save(preset("dev hq", "3"))).toBe(true);
  expect(saved[saved.length - 1]).toEqual({ key: "presets.teams", value: { version: 1, presets: [preset("dev hq", "3"), preset("Tests", "2")] } });
  expect(presetsStore.getState().presets.map((p) => p.id)).toEqual(["3", "2"]);
});

it("does not save over a list it has not read: a send before the load would overwrite the saved presets", async () => {
  let release: (value: unknown) => void = () => undefined;
  mockIPC((cmd, args) => {
    if (cmd === "get_setting") return new Promise((resolve) => (release = resolve));
    if (cmd === "set_setting") saved.push(args as { key: string; value: unknown });
  });
  const saving = presetsStore.getState().save(preset("Tests", "2"));
  release({ version: 1, presets: [preset("Dev HQ", "1")] });
  await saving;
  expect(saved[saved.length - 1]?.value).toEqual({ version: 1, presets: [preset("Dev HQ", "1"), preset("Tests", "2")] });
});

it("removes a preset and saves the rest", async () => {
  await presetsStore.getState().load();
  await presetsStore.getState().remove("1");
  expect(presetsStore.getState().presets).toEqual([]);
  expect(saved[saved.length - 1]?.value).toEqual({ version: 1, presets: [] });
});

it("saves nothing over a list it could not read: a busy database must not wipe the presets (review)", async () => {
  mockIPC((cmd, args) => {
    if (cmd === "get_setting") throw { kind: "db", message: "database is locked" };
    if (cmd === "set_setting") saved.push(args as { key: string; value: unknown });
  });
  await expect(presetsStore.getState().save(preset("Tests", "2"))).rejects.toThrow();
  await expect(presetsStore.getState().remove("1")).rejects.toThrow();
  expect(saved).toEqual([]);
  expect(presetsStore.getState().loaded).toBe(false);
});
