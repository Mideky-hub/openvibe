import { describe, expect, it } from "vitest";
import { detectEol, smallestChange, toLf, withEol } from "./text";

describe("line endings (spec studio code §3)", () => {
  it("keeps the dominant ending of the file", () => {
    expect(detectEol("a\nb\n")).toBe("\n");
    expect(detectEol("a\r\nb\r\n")).toBe("\r\n");
    expect(detectEol("a\r\nb\r\nc\n")).toBe("\r\n");
    expect(detectEol("a\nb\nc\r\n")).toBe("\n");
    expect(detectEol("one line")).toBe("\n");
  });

  it("gives back a CRLF file byte for byte", () => {
    const disk = "﻿a\r\n\r\nb\r\n";
    expect(withEol(toLf(disk), detectEol(disk))).toBe(disk);
  });

  it("works in LF, as the editor does", () => {
    expect(toLf("a\r\nb\rc\n")).toBe("a\nb\nc\n");
  });
});

describe("the smallest change", () => {
  it("replaces only what differs, so that a reload keeps the cursor", () => {
    expect(smallestChange("hello world", "hello brave world")).toEqual({ from: 6, to: 6, insert: "brave " });
    expect(smallestChange("abcdef", "abXdef")).toEqual({ from: 2, to: 3, insert: "X" });
    expect(smallestChange("abc", "a")).toEqual({ from: 1, to: 3, insert: "" });
  });

  it("does not count a shared letter twice", () => {
    expect(smallestChange("aa", "aaa")).toEqual({ from: 2, to: 2, insert: "a" });
  });

  it("is null when nothing differs", () => {
    expect(smallestChange("same", "same")).toBeNull();
  });
});
