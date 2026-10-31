import { describe, expect, it } from "vitest";
import { languageNameFor } from "./language";

describe("the language of a file (spec studio code §3)", () => {
  it("goes by the file's name, wherever it is", () => {
    expect(languageNameFor("src/App.tsx")).toBe("TSX");
    expect(languageNameFor("src-tauri/src/lib.rs")).toBe("Rust");
    expect(languageNameFor("docs/README.md")).toBe("Markdown");
    expect(languageNameFor("package.json")).toBe("JSON");
    expect(languageNameFor("deploy/Dockerfile")).toBe("Dockerfile");
  });

  it("does not take a folder's extension for the file's", () => {
    expect(languageNameFor("lib.rs/notes")).toBeNull();
  });

  it("leaves an unknown file as plain text", () => {
    expect(languageNameFor("notes.unknownext")).toBeNull();
  });
});
