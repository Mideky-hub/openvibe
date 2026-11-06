/** What readiness reads of an agent's terminal, and how it answers it (spec orchestrateur §7.3). */
export interface ReadyProbe {
  running(): boolean;
  quietMs(): number;
  screen(): string;
  press(keys: string): Promise<void>;
}

export const READY_QUIET_MS = 2000;
export const READY_TIMEOUT_MS = 60_000;
/** How long the trust prompt stays still before a key: Claude draws its menu before it takes keys. */
export const TRUST_QUIET_MS = 500;
/** Between two keys to the trust prompt: a Down the menu missed is sent again after this. */
const TRUST_RETRY_MS = 1000;
const TRUST_MAX_DOWNS = 4;
const TICK_MS = 250;
/**
 * Claude's prompt is up: the last `❯` line on screen is its input box, under a
 * rule or the top of its frame (final review H2: a resumed conversation pushes
 * the welcome banner off the screen). A trust prompt's cursor sits under no rule.
 */
export function claudeUp(screen: string): boolean {
  const lines = screen.split("\n").map((line) => line.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    if (SELECTED.test(lines[i])) return i > 0 && /^[─╭]─/.test(lines[i - 1]);
  }
  return false;
}

/** A line with Claude's cursor: its input box or the selected option of a menu (`❯`, or `>` in a frame or on another layout). */
const SELECTED = /^(?:│\s*)?[❯>]/;

/**
 * The next key for Claude's « trust this folder » prompt, or null while it does
 * not show its options: Down while « No, exit » is selected, Enter only on
 * « Yes » (README mission: Claude Code lists « No, exit » first, and a Down
 * sent before its menu takes keys is lost, so Enter would quit Claude).
 */
export function trustKey(screen: string): string | null {
  if (!/trust/i.test(screen) || !/folder/i.test(screen)) return null;
  const selected = screen.split("\n").find((line) => SELECTED.test(line.trim()));
  if (!selected) return null;
  return /yes/i.test(selected) ? "\r" : "\x1b[B";
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * True once the agent can take its sub-task: it runs, its trust prompt was
 * accepted (once — only OpenVibe's fresh worktrees ask), Claude's prompt is up
 * and quiet for 2 s. False after 60 s. `acceptTrust`: false outside those
 * worktrees — the prompt then waits for the user.
 */
export async function whenReady(probe: ReadyProbe, wait: (ms: number) => Promise<void> = sleep, acceptTrust = true): Promise<boolean> {
  let trusted = !acceptTrust;
  let downs = 0;
  let keyAt = -Infinity;
  for (let waited = 0; waited < READY_TIMEOUT_MS; waited += TICK_MS) {
    if (probe.running()) {
      const screen = probe.screen();
      const key = trusted ? null : trustKey(screen);
      if (key) {
        // One key at a time, on a still menu; the screen tells whether it took.
        if (probe.quietMs() >= TRUST_QUIET_MS && waited - keyAt >= TRUST_RETRY_MS && (key === "\r" || downs < TRUST_MAX_DOWNS)) {
          keyAt = waited;
          if (key === "\r") trusted = true;
          else downs++;
          await probe.press(key);
        }
      } else if (claudeUp(screen) && probe.quietMs() >= READY_QUIET_MS) {
        return true;
      }
    }
    await wait(TICK_MS);
  }
  return false;
}
