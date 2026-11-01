import { invoke } from "@tauri-apps/api/core";
import { LogLevel } from "@tauri-apps/plugin-log";

export interface LogTarget {
  warn: (message: string) => Promise<void>;
  error: (message: string) => Promise<void>;
}

/** The plugin names the log's target after the caller's stack (`webview::write@http://localhost:1420/src/app/log.ts:12:54`): a short one reads better. */
const send = (level: LogLevel) => (message: string) => invoke<void>("plugin:log|log", { level, message, location: "webview" });

/** One value as text; an object whose `toString` throws, or without prototype, never fails the caller. */
function show(value: unknown): string {
  try {
    return value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

/** `console.error("%o failed", x)`: React's format directives are not part of the line. */
const FORMAT = /^(?:%[oOdisfc]\s*)+/;

const text = (values: unknown[]) => {
  const [first, ...rest] = values;
  return (typeof first === "string" ? [first.replace(FORMAT, ""), ...rest] : values).map(show).join(" ").trim();
};

/**
 * Console warnings and errors, uncaught errors and unhandled rejections also go
 * to the log file a user can send (spec première version §3.6). Writing to the
 * file never fails the caller.
 */
export function installLogging(target: LogTarget = { warn: send(LogLevel.Warn), error: send(LogLevel.Error) }, cons: Console = console, win: Window = window) {
  const write = (level: keyof LogTarget, message: string) => void target[level](message).catch(() => undefined);
  for (const level of ["warn", "error"] as const) {
    const original = cons[level].bind(cons);
    cons[level] = (...values: unknown[]) => {
      original(...values);
      write(level, text(values));
    };
  }
  win.addEventListener("error", (event) => {
    const { error, message } = event as ErrorEvent;
    write("error", `uncaught: ${text([error ?? message])}`);
  });
  win.addEventListener("unhandledrejection", (event) => write("error", `unhandled rejection: ${text([(event as PromiseRejectionEvent).reason])}`));
}
