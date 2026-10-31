import { describe, expect, it } from "vitest";
import { langStore, messages } from "@/i18n";
import { fleetMessages } from "./messages";
import { disableRemote, enableRemote, remoteErrorText, remoteScreen, type RemoteIo } from "./remoteControl";

const URL = "https://claude.ai/code/session_014egvikPZf3oUfnmUBm3aoD";
const PROMPT = ["────────────────────────────── Claude · demo ─", "❯ ", "──────────────────────────────", "  demo ⌥ main | Opus 5.5"];

/** Screens copied from Claude Code 2.1.304 in OpenVibe. */
const ACTIVE = ["❯ /effort xhigh", "  ⎿  Set effort level to xhigh", "❯ /remote-control", "  /remote-control is active · Continue here, on your phone, or at", `  ${URL}`, ...PROMPT].join("\n");
const MENU = [
  "❯ /remote-control",
  "  /remote-control is active · Continue here, on your phone, or at",
  `  ${URL}`,
  "▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔",
  "   Remote Control",
  "   This session is available in the Claude mobile app and at",
  `   ${URL}.`,
  "     Disconnect this session",
  "     Show QR code   Scan with your phone to open this session",
  "   ❯ Continue",
  "   Enter to select · Esc to continue",
].join("\n");
const DISCONNECTED = ["❯ /remote-control", "❯ /remote-control", "  ⎿  Remote Control disconnected.", ...PROMPT].join("\n");
const EMPTY = ["  Claude Code v2.1.304", ...PROMPT].join("\n");

/** The consent Claude asks for the first Remote Control of an account (spec maj §2). */
const CONSENT = [
  "  Claude Code v2.1.304",
  "▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔",
  "   Remote Control",
  "   Continue this session from claude.ai or the Claude app.",
  "   ❯ Enable Remote Control",
  "     Never mind",
  "   Enter to select · Esc to cancel",
].join("\n");

describe("remoteScreen", () => {
  it("reads what the last /remote-control said", () => {
    expect(remoteScreen(ACTIVE)).toEqual({ kind: "active", url: URL });
    expect(remoteScreen(DISCONNECTED)).toEqual({ kind: "disconnected" });
    expect(remoteScreen(EMPTY)).toEqual({ kind: "none" });
    expect(remoteScreen(["❯ /remote-control", "  ⎿  Remote Control requires a claude.ai subscription", ...PROMPT].join("\n"))).toEqual({
      kind: "error",
      message: "Remote Control requires a claude.ai subscription",
    });
  });

  it("reads its menu and the highlighted choice", () => {
    expect(remoteScreen(MENU)).toEqual({ kind: "menu", url: URL, choice: "Continue" });
    expect(remoteScreen(MENU.replace("   ❯ Continue", "     Continue").replace("     Disconnect this session", "   ❯ Disconnect this session"))).toMatchObject({
      choice: "Disconnect this session",
    });
  });

  it("is not fooled by the same words printed elsewhere on the screen (final review maj §2)", () => {
    const printed = [
      "❯ /remote-control",
      "  /remote-control is active · Continue here, on your phone, or at",
      `  ${URL}`,
      "● Read(src/fleet/remoteControl.test.ts)",
      '  ⎿  const DISCONNECTED = ["❯ /remote-control", "  ⎿  Remote Control disconnected."];',
      "     Disconnect this session",
      "     Enter to select · Esc to continue",
      "● Lu.",
      ...PROMPT,
    ].join("\n");
    expect(remoteScreen(printed)).toEqual({ kind: "active", url: URL });
    expect(remoteScreen(["  Claude Code v2.1.304", "", "", "", "", "", "", "", "", "● Relu :", "  Remote Control disconnected.", ...PROMPT].join("\n"))).toEqual({ kind: "none" });
  });

  it("knows Claude's consent dialog, which is the user's to answer", () => {
    expect(remoteScreen(CONSENT)).toEqual({ kind: "consent" });
  });

  it("knows a session started with Remote Control by its link", () => {
    expect(remoteScreen(["  Claude Code v2.1.304", `  /remote-control is active · ${URL}`, ...PROMPT].join("\n"))).toEqual({ kind: "active", url: URL });
  });
});

/** A terminal whose screen changes as the keys arrive. */
function fakeTerminal(start: string, react: (typed: string, screen: string) => string) {
  let screen = start;
  const typed: string[] = [];
  const io: RemoteIo = {
    screen: () => screen,
    send: async (text) => {
      typed.push(text);
      screen = react(text, screen);
    },
    press: async (keys) => {
      typed.push(keys);
      screen = react(keys, screen);
    },
    sleep: async () => undefined,
  };
  return { io, typed };
}

describe("enableRemote", () => {
  it("types /remote-control and reads the link", async () => {
    const { io, typed } = fakeTerminal(EMPTY, (text) => (text === "/remote-control" ? ACTIVE : EMPTY));
    expect(await enableRemote(io)).toEqual({ on: true, url: URL });
    expect(typed).toEqual(["/remote-control"]);
  });

  it("types nothing when the last /remote-control is still active", async () => {
    const { io, typed } = fakeTerminal(ACTIVE, () => ACTIVE);
    expect(await enableRemote(io)).toEqual({ on: true, url: URL });
    expect(typed).toEqual([]);
  });

  it("closes the menu with Escape when it was already on", async () => {
    const { io, typed } = fakeTerminal(EMPTY, (text) => (text === "/remote-control" ? MENU : EMPTY));
    expect(await enableRemote(io)).toEqual({ on: true, url: URL });
    expect(typed).toEqual(["/remote-control", "\x1b"]);
  });

  it("says what Claude answered, or that it did not answer", async () => {
    const refusal = ["❯ /remote-control", "  ⎿  Remote Control requires a claude.ai subscription", ...PROMPT].join("\n");
    expect(await enableRemote(fakeTerminal(EMPTY, () => refusal).io)).toEqual({ error: "Remote Control requires a claude.ai subscription" });
    expect(await enableRemote(fakeTerminal(EMPTY, () => EMPTY).io)).toEqual({ error: "Claude n'a pas confirmé Remote Control." });
  });
});

describe("the consent dialog (final review maj §2)", () => {
  it("is never answered: enable and disable stop and say so", async () => {
    const consent = { error: "Claude demande ton accord pour Remote Control : réponds dans son terminal." };
    const shown = fakeTerminal(CONSENT, () => CONSENT);
    expect(await enableRemote(shown.io)).toEqual(consent);
    expect(await disableRemote(shown.io)).toEqual(consent);
    expect(shown.typed).toEqual([]);
    const asked = fakeTerminal(EMPTY, () => CONSENT);
    expect(await enableRemote(asked.io)).toEqual(consent);
    expect(asked.typed).toEqual(["/remote-control"]);
  });
});

describe("disableRemote", () => {
  const menuAt = (choice: number) =>
    [
      ...MENU.split("\n").slice(0, 7),
      ...["Disconnect this session", "Show QR code   Scan with your phone to open this session", "Continue"].map((label, i) => (i === choice ? `   ❯ ${label}` : `     ${label}`)),
      "   Enter to select · Esc to continue",
    ].join("\n");

  it("opens the menu, goes up to « Disconnect this session » and confirms", async () => {
    let choice = 2;
    const { io, typed } = fakeTerminal(ACTIVE, (keys) => {
      if (keys === "/remote-control") return menuAt(choice);
      if (keys === "\x1b[A") choice = Math.max(0, choice - 1);
      if (keys === "\r") return choice === 0 ? DISCONNECTED : ACTIVE;
      return menuAt(choice);
    });
    expect(await disableRemote(io)).toEqual({ on: false });
    expect(typed).toEqual(["/remote-control", "\x1b[A", "\x1b[A", "\r"]);
  });

  it("turns it on then off when the screen did not say it was on", async () => {
    let on = false;
    let choice = 2;
    const { io, typed } = fakeTerminal(EMPTY, (keys) => {
      if (keys === "/remote-control" && !on) {
        on = true;
        return ACTIVE;
      }
      if (keys === "/remote-control") return menuAt(choice);
      if (keys === "\x1b[A") choice = Math.max(0, choice - 1);
      if (keys === "\r") return DISCONNECTED;
      return menuAt(choice);
    });
    expect(await disableRemote(io)).toEqual({ on: false });
    expect(typed).toEqual(["/remote-control", "/remote-control", "\x1b[A", "\x1b[A", "\r"]);
  });

  it("does nothing when the last /remote-control disconnected it", async () => {
    const { io, typed } = fakeTerminal(DISCONNECTED, () => ACTIVE);
    expect(await disableRemote(io)).toEqual({ on: false });
    expect(typed).toEqual([]);
  });

  it("leaves the menu with Escape when « Disconnect » cannot be reached", async () => {
    const { io, typed } = fakeTerminal(ACTIVE, (keys) => (keys === "\x1b" ? ACTIVE : MENU));
    expect(await disableRemote(io)).toEqual({ error: "Le menu Remote Control n'a pas pu être lu." });
    expect(typed[typed.length - 1]).toBe("\x1b");
  });
});

describe("remoteErrorText", () => {
  it("says a stored consent error in the current language", () => {
    langStore.setState({ lang: "fr" });
    const stored = messages(fleetMessages).remote.consent;
    langStore.setState({ lang: "en" });
    expect(remoteErrorText(stored)).toBe(fleetMessages.en.remote.consent);
    expect(remoteErrorText("raw output")).toBe("raw output");
    langStore.setState({ lang: "fr" });
  });
});
