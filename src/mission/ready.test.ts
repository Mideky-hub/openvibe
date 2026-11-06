import { describe, expect, it } from "vitest";
import { claudeUp, TRUST_QUIET_MS, trustKey, whenReady, type ReadyProbe } from "./ready";

const TRUST = "Accessing workspace:\n\nQuick safety check: Is this a project you created or one you trust?\n\n❯ No, exit\n  Yes, I trust this folder\n\nEnter to confirm · Esc to cancel";
const TRUST_YES = TRUST.replace("❯ No, exit\n  Yes", "  No, exit\n❯ Yes");
/** The question is drawn, its options not yet. */
const TRUST_QUESTION = "Accessing workspace:\n\nQuick safety check: Is this a project you created or one you trust? If not, take a\nmoment to review what's in this folder first.";
/** Claude's screen as seen in the app: its banner, then its input box between two rules. */
const CLAUDE = " ▐▛███▜▌   Claude Code v2.1.304\n▝▜█████▛▘  Opus 5.5\n\n──────────────────────── Claude · demo ─\n❯ \n────────────────────────────────────────\n  ⏵⏵ auto mode on (shift+tab to cycle)";
/** A resumed conversation: its history has pushed the banner off the screen. */
const RESUMED = "● J'ai clôturé la mission « linked ».\n\n──────────────────────── Orchestrateur ─\n❯ \n────────────────────────────────────────\n  ⏵⏵ auto mode on (shift+tab to cycle)";

/** An agent's terminal on a simulated clock: what it shows, when it last wrote, what was pressed. */
function agent(first: string, onPress: (keys: string, show: (screen: string) => void) => void = () => undefined) {
  let clock = 0;
  let wrote = 0;
  let screen = first;
  const pressed: string[] = [];
  const show = (next: string) => {
    screen = next;
    wrote = clock;
  };
  const probe: ReadyProbe = {
    running: () => true,
    quietMs: () => clock - wrote,
    screen: () => screen,
    press: async (keys) => {
      pressed.push(keys);
      onPress(keys, show);
    },
  };
  const wait = async (ms: number) => {
    clock += ms;
  };
  return { probe, wait, pressed, now: () => clock, wroteAt: () => wrote };
}

describe("trustKey (spec orchestrateur §7.3)", () => {
  it("moves down while « No » is selected and confirms only « Yes »", () => {
    expect(trustKey(TRUST)).toBe("\x1b[B");
    expect(trustKey(TRUST_YES)).toBe("\r");
    expect(trustKey(CLAUDE)).toBeNull();
  });

  it("waits for the options: the question drawn without its menu takes no key (README mission)", () => {
    expect(trustKey(TRUST_QUESTION)).toBeNull();
  });
});

describe("whenReady (spec orchestrateur §7.3)", () => {
  it("accepts the trust prompt once, then waits for Claude's prompt to stay quiet 2 s", async () => {
    const a = agent(TRUST, (keys, show) => {
      if (keys === "\x1b[B") show(TRUST_YES);
      if (keys === "\r") show(CLAUDE);
    });
    expect(await whenReady(a.probe, a.wait)).toBe(true);
    expect(a.pressed).toEqual(["\x1b[B", "\r"]);
    expect(a.now() - a.wroteAt()).toBeGreaterThanOrEqual(2000);
    expect(a.now() - a.wroteAt()).toBeLessThan(2500);
  });

  it("is ready at once when Claude is already quiet", async () => {
    const a = agent(CLAUDE);
    await a.wait(5000);
    expect(await whenReady(a.probe, a.wait)).toBe(true);
    expect(a.pressed).toEqual([]);
  });

  it("never confirms « No, exit »: a Down the menu missed is sent again, Enter waits for « Yes » (README mission)", async () => {
    let downs = 0;
    const a = agent(TRUST, (keys, show) => {
      // Claude's menu draws before it takes keys: the first Down is lost.
      if (keys === "\x1b[B" && ++downs === 2) show(TRUST_YES);
      if (keys === "\r") show(CLAUDE);
    });
    expect(await whenReady(a.probe, a.wait)).toBe(true);
    expect(a.pressed).toEqual(["\x1b[B", "\x1b[B", "\r"]);
  });

  it("lets the prompt settle before its first key", async () => {
    const quietAtPress: number[] = [];
    const a = agent(TRUST);
    a.probe.press = async (keys) => {
      quietAtPress.push(a.probe.quietMs());
      a.pressed.push(keys);
    };
    await whenReady(a.probe, a.wait);
    expect(quietAtPress[0]).toBeGreaterThanOrEqual(TRUST_QUIET_MS);
  });

  it("gives up after 60 s, never confirming a prompt that stays on « No »", async () => {
    const a = agent(TRUST);
    expect(await whenReady(a.probe, a.wait)).toBe(false);
    expect(a.now()).toBeGreaterThanOrEqual(60_000);
    expect(a.pressed).not.toContain("\r");
    expect(a.pressed.length).toBeLessThanOrEqual(5);
  });

  it("knows Claude is up by its input box, the banner gone from a resumed conversation (final review H2)", async () => {
    const a = agent(RESUMED);
    await a.wait(5000);
    expect(await whenReady(a.probe, a.wait, false)).toBe(true);
  });

  it("never takes a trust prompt it may not answer for Claude's prompt (final review H2)", async () => {
    const a = agent(TRUST);
    expect(await whenReady(a.probe, a.wait, false)).toBe(false);
    expect(a.pressed).toEqual([]);
  });
});

describe("claudeUp across Claude's layouts (backlog H2)", () => {
  const ASCII = "──────────────────────── Claude · demo ─\n> \n────────────────────────────────────────";
  const BOXED = "╭──────────────────────────────────────╮\n│ > Try \"fix lint errors\"               │\n╰──────────────────────────────────────╯\n  ? for shortcuts";
  const TRUST_GT = "Do you trust the files in this folder?\n\n> 1. Yes, proceed\n  2. No, exit";

  it("reads an input box drawn with > under a rule", () => {
    expect(claudeUp(ASCII)).toBe(true);
  });
  it("reads an input box inside a rounded frame", () => {
    expect(claudeUp(BOXED)).toBe(true);
  });
  it("does not take a trust menu drawn with > for the input box", () => {
    expect(claudeUp(TRUST_GT)).toBe(false);
  });
  it("answers a trust menu drawn with > and numbers", () => {
    expect(trustKey(TRUST_GT)).toBe("\r");
  });
});
