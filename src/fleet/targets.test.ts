import { describe, expect, it } from "vitest";
import type { SceneFrame } from "@/canvas/groups";
import {
  extractMentions,
  keptDismissal,
  matchOptions,
  mentionAt,
  mentionParts,
  partTargets,
  resolveTargets,
  selectionTargets,
  slug,
  targetAgents,
  targetOptions,
  withoutMention,
  type TargetAgent,
} from "./targets";

const group = (id: string, name: string, memberIds: string[]): SceneFrame => ({
  id,
  name,
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  group: { role: "backend", pantheon: "greek" },
  memberIds,
});
const plain: SceneFrame = { ...group("f", "Notes", ["c"]), group: null };
const backend = group("g1", "Équipe Back", ["a", "b"]);
const docs = group("g2", "Docs", ["d"]);
const agents: TargetAgent[] = [
  { id: "a", name: "Isis", groupName: "Équipe Back" },
  { id: "b", name: "Thot", groupName: "Équipe Back" },
  { id: "c", name: "Isis", groupName: null },
  { id: "d", name: "Zeus", groupName: "Docs" },
];
const options = targetOptions(agents, [backend, docs, plain]);

describe("slug", () => {
  it("drops spaces and accents and lowers the case", () => {
    expect(slug("Équipe Back")).toBe("equipeback");
    expect(slug("Hermès")).toBe("hermes");
  });
});

describe("targetOptions", () => {
  it("lists @tous, then the groups, then every agent with its group", () => {
    expect(options.map((o) => [o.label, o.detail])).toEqual([
      ["@tous", "4 agents"],
      ["@equipeback", "2 agents"],
      ["@docs", "1 agent"],
      ["@isis", "Équipe Back"],
      ["@thot", "Équipe Back"],
      ["@isis", "Hors groupe"],
      ["@zeus", "Docs"],
    ]);
  });
});

describe("targetAgents", () => {
  it("names the terminals and finds their group", () => {
    const names: Record<string, string> = { a: "Isis", c: "Isis" };
    expect(targetAgents(["a", "c", "o"], (id) => names[id], [backend, plain])).toEqual([
      { id: "a", name: "Isis", groupName: "Équipe Back" },
      { id: "c", name: "Isis", groupName: null },
    ]);
  });
});

describe("matchOptions", () => {
  it("ignores case and accents, and puts the names that start with the query first", () => {
    expect(matchOptions(options, "EQU").map((o) => o.label)).toEqual(["@equipeback"]);
    expect(matchOptions(options, "is").map((o) => o.label)).toEqual(["@isis", "@isis"]);
    expect(matchOptions(options, "o").map((o) => o.label)).toEqual(["@tous", "@docs", "@thot"]);
    expect(matchOptions(options, "").length).toBe(options.length);
  });
});

describe("mentionAt", () => {
  it("finds the @word being typed at the caret", () => {
    expect(mentionAt("lance @ba", 9)).toEqual({ start: 6, query: "ba" });
    expect(mentionAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionAt("lance @ba suite", 15)).toBeNull();
    expect(mentionAt("mail a@b", 8)).toBeNull();
  });
});

describe("mentionParts / partTargets", () => {
  it("completes the last name of a slashed mention, the others already typed", () => {
    expect(mentionParts("thot/ze")).toEqual({ typed: ["thot"], query: "ze" });
    expect(mentionParts("zeu")).toEqual({ typed: [], query: "zeu" });
    expect(mentionParts("thot//")).toEqual({ typed: ["thot"], query: "" });
  });

  it("turns the typed names that match one target into targets", () => {
    expect(partTargets(["thot", "nobody", "isis", "docs"], options)).toEqual([
      { kind: "agent", id: "b" },
      { kind: "group", id: "g2" },
    ]);
  });
});

describe("keptDismissal", () => {
  it("keeps the list closed only while the same mention is typed", () => {
    expect(keptDismissal(0, "@tou", 4)).toBe(0);
    expect(keptDismissal(0, "", 0)).toBeNull();
    expect(keptDismissal(0, "lance @t", 8)).toBeNull();
    expect(keptDismissal(null, "@", 1)).toBeNull();
  });
});

describe("withoutMention", () => {
  it("removes the mention and one space after it", () => {
    expect(withoutMention("@tous lance", 0, 5)).toEqual({ text: "lance", caret: 0 });
    expect(withoutMention("lance @ba", 6, 9)).toEqual({ text: "lance ", caret: 6 });
  });
});

describe("extractMentions", () => {
  it("turns typed mentions of exactly one target into targets", () => {
    expect(extractMentions("@tous lance les tests", options)).toEqual({ targets: [{ kind: "all" }], text: "lance les tests" });
    expect(extractMentions("relis @Docs puis @zeus", options)).toEqual({
      targets: [
        { kind: "group", id: "g2" },
        { kind: "agent", id: "d" },
      ],
      text: "relis puis",
    });
  });

  it("leaves ambiguous, unknown mentions and e-mail addresses as typed", () => {
    expect(extractMentions("@isis @nobody écris à a@b.fr", options)).toEqual({ targets: [], text: "@isis @nobody écris à a@b.fr" });
  });

  it("keeps the line breaks of the command", () => {
    expect(extractMentions("@tous un\ndeux", options).text).toBe("un\ndeux");
  });

  it("keeps the indentation, tabs and inner spaces of the command", () => {
    expect(extractMentions("@tous corrige :\n    if x:\n\treturn 1", options).text).toBe("corrige :\n    if x:\n\treturn 1");
    expect(extractMentions("  garde  ces  espaces  ", options).text).toBe("garde  ces  espaces");
  });

  it("reads several targets joined by slashes: @athena/zeus/héra", () => {
    expect(extractMentions("@thot/zeus /effort high", options)).toEqual({
      targets: [
        { kind: "agent", id: "b" },
        { kind: "agent", id: "d" },
      ],
      text: "/effort high",
    });
    expect(extractMentions("@Docs/thot, relisez", options).targets).toEqual([
      { kind: "group", id: "g2" },
      { kind: "agent", id: "b" },
    ]);
  });

  it("leaves a slashed mention as typed when one of its names is unknown or ambiguous", () => {
    expect(extractMentions("@thot/nobody lance", options)).toEqual({ targets: [], text: "@thot/nobody lance" });
    expect(extractMentions("@isis/zeus lance", options)).toEqual({ targets: [], text: "@isis/zeus lance" });
  });

  it("reads a mention followed by punctuation", () => {
    expect(extractMentions("@tous, lancez les tests", options)).toEqual({ targets: [{ kind: "all" }], text: "lancez les tests" });
    expect(extractMentions("dis à @zeus: bonjour", options)).toEqual({ targets: [{ kind: "agent", id: "d" }], text: "dis à bonjour" });
    expect(extractMentions("voir @a.b", options).text).toBe("voir @a.b");
  });
});

describe("resolveTargets", () => {
  const scope = { all: ["a", "b", "c", "d"], groups: [backend, docs] };

  it("gives each terminal once, in the order of the targets", () => {
    expect(
      resolveTargets(
        [
          { kind: "agent", id: "d" },
          { kind: "group", id: "g1" },
          { kind: "agent", id: "a" },
        ],
        scope,
        [],
      ),
    ).toEqual(["d", "a", "b"]);
    expect(resolveTargets([{ kind: "all" }], scope, [])).toEqual(["a", "b", "c", "d"]);
  });

  it("falls back on the selection, and keeps to the scope", () => {
    expect(resolveTargets([], scope, ["c", "c"])).toEqual(["c"]);
    expect(resolveTargets([{ kind: "agent", id: "gone" }], scope, ["c"])).toEqual([]);
  });
});

describe("selectionTargets", () => {
  it("takes the selected terminals and the members of the selected groups", () => {
    expect(selectionTargets(["c", "g1", "f", "x"], [backend, plain], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });
});

import { matchOptions as matchOptionsFront, mentionParts as mentionPartsFront, targetOptions as targetOptionsFront } from "./targets";

it("tries a name containing a slash whole before splitting it (backlog 27 oct)", () => {
  const frames = [{ id: "g", name: "Front/Back", group: {}, memberIds: ["a", "b"] }] as never;
  const opts = targetOptionsFront([{ id: "a", name: "Front", groupName: null }], frames);
  expect(mentionPartsFront("front/ba", opts)).toEqual({ typed: [], query: "front/ba" });
  expect(matchOptionsFront(opts, "front/ba")[0].label).toBe("@front/back");
  expect(mentionPartsFront("athena/ze", opts)).toEqual({ typed: ["athena"], query: "ze" });
});
