import { describe, expect, it } from "vitest";
import { isTypingKey, pillOf, resumeOfferOf, startsNewConversation, startsOnKeystroke } from "./pill";

describe("pillOf", () => {
  it("labels each process state (spec habillage §7.2)", () => {
    expect(pillOf({ state: "running" })).toEqual({ label: "ACTIF", tone: "live" });
    expect(pillOf({ state: "stopped" })).toEqual({ label: "ARRÊTÉ", tone: "stopped" });
    expect(pillOf({ state: "exited", code: 0 })).toEqual({ label: "TERMINÉ · 0", tone: "done" });
    expect(pillOf({ state: "exited", code: 2 })).toEqual({ label: "TERMINÉ · 2", tone: "failed" });
    expect(pillOf({ state: "exited", code: null })).toEqual({ label: "TERMINÉ", tone: "done" });
    expect(pillOf({ state: "error", message: "x" })).toEqual({ label: "ERREUR", tone: "failed" });
  });
});

describe("resumeOfferOf", () => {
  it("offers to resume a Claude conversation, to relaunch anything else, never while running", () => {
    expect(resumeOfferOf({ state: "stopped" }, "claude", true)).toBe("resume");
    expect(resumeOfferOf({ state: "stopped" }, "claude", false)).toBe("relaunch");
    expect(resumeOfferOf({ state: "exited", code: 0 }, "codex", false)).toBe("relaunch");
    expect(resumeOfferOf({ state: "running" }, "claude", true)).toBeNull();
  });
});

describe("startsOnKeystroke", () => {
  it("leaves a one-shot command to the Relancer button: a stray key must not run an installer again", () => {
    expect(startsOnKeystroke({ state: "stopped" }, true)).toBe(false);
    expect(startsOnKeystroke({ state: "exited", code: 0 }, true)).toBe(false);
  });

  it("starts a terminal from the keyboard only when nothing runs in it", () => {
    expect(startsOnKeystroke({ state: "stopped" })).toBe(true);
    expect(startsOnKeystroke({ state: "exited", code: 1 })).toBe(true);
    expect(startsOnKeystroke({ state: "error", message: "x" })).toBe(true);
    expect(startsOnKeystroke({ state: "running" })).toBe(false);
  });
});

describe("isTypingKey", () => {
  const key = (k: string, mods: Partial<Record<"ctrlKey" | "altKey" | "metaKey", boolean>> = {}) => ({
    key: k,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...mods,
  });

  it("counts characters and Enter as typing", () => {
    expect(isTypingKey(key("a"))).toBe(true);
    expect(isTypingKey(key("É"))).toBe(true);
    expect(isTypingKey(key("Enter"))).toBe(true);
    expect(isTypingKey(key("@", { ctrlKey: true, altKey: true }))).toBe(true); // AltGr on AZERTY
  });

  it("ignores navigation, function keys and shortcuts", () => {
    for (const k of ["Escape", "ArrowUp", "Tab", "F5", "Shift", "Backspace"]) expect(isTypingKey(key(k))).toBe(false);
    expect(isTypingKey(key("c", { ctrlKey: true }))).toBe(false);
    expect(isTypingKey(key("z", { ctrlKey: true }))).toBe(false);
    expect(isTypingKey(key("x", { altKey: true }))).toBe(false);
    expect(isTypingKey(key("v", { metaKey: true }))).toBe(false);
  });
});

describe("startsNewConversation", () => {
  it("keeps the conversation id when the previous launch failed", () => {
    expect(startsNewConversation({ state: "stopped" })).toBe(true);
    expect(startsNewConversation({ state: "exited", code: 0 })).toBe(true);
    expect(startsNewConversation({ state: "error", message: "dossier introuvable" })).toBe(false);
  });
});

describe("a terminal waiting for its staggered start", () => {
  const starting = { state: "starting" } as const;

  it("reads DÉMARRAGE, not ARRÊTÉ", () => {
    expect(pillOf(starting)).toEqual({ label: "DÉMARRAGE", tone: "stopped" });
  });

  it("offers neither to resume nor to relaunch", () => {
    expect(resumeOfferOf(starting, "claude", true)).toBeNull();
  });

  it("is not started a second time by a keystroke", () => {
    expect(startsOnKeystroke(starting)).toBe(false);
  });
});

describe("a running agent's activity (spec habillage §7.2)", () => {
  const running = { state: "running" } as const;

  it("reads PRÊT, EN COURS or ATTEND", () => {
    expect(pillOf(running, "idle")).toEqual({ label: "PRÊT", tone: "ready" });
    expect(pillOf(running, "working")).toEqual({ label: "EN COURS", tone: "working" });
    expect(pillOf(running, "waiting")).toEqual({ label: "ATTEND", tone: "waiting" });
  });

  it("works in indigo for the indigo agents", () => {
    expect(pillOf(running, "working", true)).toEqual({ label: "EN COURS", tone: "workingIndigo" });
  });

  it("reads ACTIF while its activity is unknown, and ignores the activity of a stopped process", () => {
    expect(pillOf(running)).toEqual({ label: "ACTIF", tone: "live" });
    expect(pillOf({ state: "stopped" }, "working")).toEqual({ label: "ARRÊTÉ", tone: "stopped" });
  });
});

it("offers no resume to an orchestrator refused for lack of OpenVibe's tools: its node says why", () => {
  expect(resumeOfferOf({ state: "error", message: "m", kind: "toolsUnavailable" }, "claude", true)).toBeNull();
  expect(resumeOfferOf({ state: "error", message: "m" }, "claude", true)).toBe("resume");
});
