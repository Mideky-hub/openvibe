import { expect, it } from "vitest";
import { readSource } from "@/theme/cssBlocks";

const lib = readSource("../src-tauri/src/lib.rs");

it("stops a second launch before anything else starts: two instances on one database lose data (spec notification §10)", () => {
  const guard = lib.indexOf(".plugin(tauri_plugin_single_instance::init(");
  expect(guard).toBeGreaterThan(-1);
  for (const later of [".plugin(logging::plugin())", ".plugin(tauri_plugin_dialog::init())", ".setup("]) {
    expect(lib.indexOf(later), later).toBeGreaterThan(guard);
  }
});

it("brings the running window back on a second launch", () => {
  expect(lib).toMatch(/fn focus_main_window[\s\S]*unminimize\(\)[\s\S]*set_focus\(\)/);
});

it("pins the official plugin, and never lets two versions share the database", () => {
  const cargo = readSource("../src-tauri/Cargo.toml");
  expect(cargo).toContain('tauri-plugin-single-instance = "=2.5.5"');
  // The `semver` feature would let two versions run side by side on one database.
  expect(cargo).not.toMatch(/tauri-plugin-single-instance.*semver/);
});
