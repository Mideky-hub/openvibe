import { call } from "./invoke";

/** The text of a file of the project; `path` is relative to the project's folder. */
export function studioRead(project: string, path: string): Promise<string> {
  return call<string>("studio_read", { project, path });
}
