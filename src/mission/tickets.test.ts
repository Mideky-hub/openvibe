import { describe, expect, it, vi } from "vitest";
import { missionBacklog, missionIssues } from "@/ipc/mission";
import { MAX_BODY, MAX_TICKETS, parseBacklog, parseIssues, readTickets } from "./tickets";

vi.mock("@/ipc/mission", () => ({ missionBacklog: vi.fn(), missionIssues: vi.fn() }));

describe("BACKLOG.md (spec mission de nuit §5.1)", () => {
  it("takes the top-level bullets, with their section", () => {
    const text = "# Backlog\n\nIntro.\n\n## Interface\n\n- Le menu clignote.\n  détail\n  - sous-point\n\n### Panneau\n- Le panneau déborde\n\n## Fait\n- [x] Déjà fait\n- [ ] Encore à faire\n";
    expect(parseBacklog(text)).toEqual([
      { id: "B1", title: "Le menu clignote.", body: "Le menu clignote.", section: "Interface" },
      { id: "B2", title: "Le panneau déborde", body: "Le panneau déborde", section: "Panneau" },
      { id: "B3", title: "Encore à faire", body: "Encore à faire", section: "Fait" },
    ]);
  });

  it("keeps a long title short, and the whole text in the body", () => {
    const long = "x".repeat(150);
    const [ticket] = parseBacklog(`- ${long}`);
    expect(ticket.title).toHaveLength(100);
    expect(ticket.body).toBe(long);
  });

  it("reads Windows line ends, and stops at a bound", () => {
    expect(parseBacklog("- Un\r\n- Deux\r\n").map((t) => t.title)).toEqual(["Un", "Deux"]);
    expect(parseBacklog(Array.from({ length: MAX_TICKETS + 5 }, (_, i) => `- T${i}`).join("\n"))).toHaveLength(MAX_TICKETS);
  });
});

describe("GitHub issues", () => {
  it("reads what gh gives, with its number, cutting long bodies", () => {
    const json = JSON.stringify([{ number: 7, title: "Bug", body: "y".repeat(MAX_BODY + 10), url: "https://github.com/o/r/issues/7" }]);
    const [ticket] = parseIssues(json);
    expect(ticket).toMatchObject({ id: "#7", title: "Bug", url: "https://github.com/o/r/issues/7" });
    expect(ticket.body).toHaveLength(MAX_BODY);
  });

  it("ignores what is not an issue, and unreadable output", () => {
    expect(parseIssues(JSON.stringify([{ title: "Sans numéro" }, 3, { number: 1, title: "Ok" }])).map((t) => t.id)).toEqual(["#1"]);
    expect(parseIssues("pas du json")).toEqual([]);
    expect(parseIssues("{}")).toEqual([]);
  });
});

describe("readTickets", () => {
  it("reads the chosen source in the project", async () => {
    vi.mocked(missionBacklog).mockResolvedValueOnce("- Un");
    vi.mocked(missionIssues).mockResolvedValueOnce('[{"number":2,"title":"Deux"}]');
    expect((await readTickets("C:/p", { kind: "backlog" })).map((t) => t.id)).toEqual(["B1"]);
    expect(missionBacklog).toHaveBeenCalledWith("C:/p");
    expect((await readTickets("C:/p", { kind: "github", label: "overnight" })).map((t) => t.id)).toEqual(["#2"]);
    expect(missionIssues).toHaveBeenCalledWith("C:/p", "overnight");
  });
});
