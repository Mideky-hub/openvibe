import { missionBacklog, missionIssues } from "@/ipc/mission";

/** Where an overnight mission takes its tasks (spec mission de nuit §5.1). There is no Kanban source: no Kanban exists yet. */
export type TicketSource = { kind: "github"; label: string } | { kind: "backlog" };

export interface Ticket {
  id: string;
  title: string;
  body: string;
  section?: string;
  url?: string;
}

export const MAX_TICKETS = 200;
export const MAX_BODY = 2000;
const MAX_TITLE = 100;

const BULLET = /^- (?:\[( |x|X)\] )?(.+)$/;
const HEADING = /^#{1,6}\s+(.+)$/;

/** The top-level bullets of a backlog, with their section; what is ticked off is done. */
export function parseBacklog(text: string): Ticket[] {
  const tickets: Ticket[] = [];
  let section: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) section = heading[1].trim();
    const bullet = BULLET.exec(line);
    if (!bullet || bullet[1]?.toLowerCase() === "x") continue;
    if (tickets.length === MAX_TICKETS) break;
    const body = bullet[2].trim();
    tickets.push({ id: `B${tickets.length + 1}`, title: body.slice(0, MAX_TITLE), body: body.slice(0, MAX_BODY), ...(section ? { section } : {}) });
  }
  return tickets;
}

/** What `gh issue list --json` gave; nothing readable is no ticket. */
export function parseIssues(json: string): Ticket[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((issue: unknown): Ticket[] => {
    const r = (typeof issue === "object" && issue !== null ? issue : {}) as Record<string, unknown>;
    if (typeof r.number !== "number" || typeof r.title !== "string") return [];
    const body = typeof r.body === "string" ? r.body.slice(0, MAX_BODY) : "";
    return [{ id: `#${r.number}`, title: r.title.slice(0, MAX_TITLE), body, ...(typeof r.url === "string" ? { url: r.url } : {}) }];
  });
}

export async function readTickets(project: string, source: TicketSource): Promise<Ticket[]> {
  return source.kind === "backlog" ? parseBacklog(await missionBacklog(project)) : parseIssues(await missionIssues(project, source.label));
}
