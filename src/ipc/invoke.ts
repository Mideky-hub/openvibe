import { invoke } from "@tauri-apps/api/core";

export type AppErrorKind = "invalidInput" | "notFound" | "pty" | "io" | "db" | "toolsUnavailable" | "github";

/** Error raised by a Tauri command; mirrors Rust's `AppError` (`{ kind, message }`). */
export class AppError extends Error {
  readonly kind: AppErrorKind;

  constructor(kind: AppErrorKind, message: string) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
  }
}

function isAppErrorPayload(value: unknown): value is { kind: AppErrorKind; message: string } {
  return typeof value === "object" && value !== null && "kind" in value && "message" in value;
}

/** `invoke` with Rust errors turned into `AppError` instances. */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (isAppErrorPayload(error)) throw new AppError(error.kind, error.message);
    throw new AppError("io", String(error));
  }
}
