import { afterEach, beforeEach, expect, it } from "vitest";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { forgetScene, rememberScene } from "@/canvas/sceneCache";
import { langStore } from "@/i18n";
import { nodesStore } from "@/store/nodes";
import { workspacesStore } from "@/store/workspaces";
import { teamBrief } from "./teamBrief";

const frame = (speciality?: string) => ({
  id: "g",
  type: "frame",
  name: "Back",
  isDeleted: false,
  customData: { openvibe: { kind: "group", role: "backend", pantheon: "egyptian", ...(speciality ? { speciality } : {}) } },
});
const terminal = (frameId: string | null) => ({ id: "t", type: "embeddable", isDeleted: false, frameId, customData: { kind: "terminal" } });

function onScreen(elements: object[]) {
  canvasStore.setState({ api: { getSceneElementsIncludingDeleted: () => elements } as unknown as ExcalidrawImperativeAPI });
}

beforeEach(() => {
  workspacesStore.setState({ activeId: "w1" });
  nodesStore.setState({
    nodes: { t: { workspaceId: "w1", kind: "terminal", payload: { title: "A", name: "Isis", cwd: "C:/code", agent: "claude", command: "", shell: "default" } } },
  });
});
afterEach(() => {
  canvasStore.setState({ api: null });
  forgetScene("w2");
  langStore.setState({ lang: "fr" });
});

it("tells an agent its group, the group's role and its speciality", () => {
  onScreen([terminal("g"), frame("API")]);
  expect(teamBrief("t")).toBe("Ton groupe sur le canvas OpenVibe : « Back » (rôle : Backend ; spécialité : API). Travaille dans ce rôle.");
});

it("says it in English", () => {
  langStore.setState({ lang: "en" });
  onScreen([terminal("g"), frame()]);
  expect(teamBrief("t")).toBe('Your group on the OpenVibe canvas: "Back" (role: Backend). Work in that role.');
});

it("reads a workspace not on screen: a mission's group starts there (spec mission de nuit §6.1)", () => {
  nodesStore.setState({ nodes: { t: { ...nodesStore.getState().nodes.t, workspaceId: "w2" } } });
  rememberScene("w2", [terminal("g"), frame("API")] as never, {} as never, {}, []);
  expect(teamBrief("t")).toContain("spécialité : API");
});

it("tells nothing to an agent outside a group, in a plain frame, in a mission's group or in a group being closed", () => {
  onScreen([terminal(null), frame()]);
  expect(teamBrief("t")).toBeUndefined();
  onScreen([terminal("g"), { ...frame(), customData: {} }]);
  expect(teamBrief("t")).toBeUndefined();
  // A mission's group: general, with no speciality, says nothing worth telling.
  onScreen([terminal("g"), { ...frame(), customData: { openvibe: { kind: "group", role: "general", pantheon: "egyptian" } } }]);
  expect(teamBrief("t")).toBeUndefined();
  onScreen([terminal("g"), { ...frame(), isDeleted: true }]);
  expect(teamBrief("t")).toBeUndefined();
  expect(teamBrief("unknown")).toBeUndefined();
});
