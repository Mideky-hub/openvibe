import type { ExcalidrawElement, ExcalidrawFrameElement } from "@excalidraw/excalidraw/element/types";
import { isRoleId, type RoleId } from "@/fleet/roles";
import { nodeKindOf } from "./nodeElement";
import { messages } from "@/i18n";
import { canvasMessages } from "./messages";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a group frame carries in `customData.openvibe` (spec habillage §11.1). */
export interface GroupInfo {
  role: RoleId;
  pantheon: string;
  /** What the group is for, told to its orchestrator (spec groupes spécialisés §2). */
  speciality?: string;
}

export const MAX_SPECIALITY = 40;

const readSpeciality = (raw: unknown) => (typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_SPECIALITY).trim() : "");

/** A frame of the scene: a group, or a plain frame drawn by hand (`group` null). */
export interface SceneFrame extends Rect {
  id: string;
  name: string;
  group: GroupInfo | null;
  /** Terminal nodes whose frameId is this frame, in scene order. */
  memberIds: string[];
}

export type SceneGroup = SceneFrame & { group: GroupInfo };

export function groupInfoOf(element: ExcalidrawElement): GroupInfo | null {
  const data = element.customData?.openvibe as Record<string, unknown> | undefined;
  if (element.type !== "frame" || data?.kind !== "group") return null;
  if (!isRoleId(data.role) || typeof data.pantheon !== "string") return null;
  const speciality = readSpeciality(data.speciality);
  return { role: data.role, pantheon: data.pantheon, ...(speciality ? { speciality } : {}) };
}

/** A group frame's `customData` with `speciality`, or without one when it is blank. */
export function withGroupSpeciality(customData: ExcalidrawElement["customData"], speciality: string): Record<string, unknown> {
  const { speciality: _previous, ...openvibe } = (customData?.openvibe ?? {}) as Record<string, unknown>;
  const next = readSpeciality(speciality);
  return { ...customData, openvibe: next ? { ...openvibe, speciality: next } : openvibe };
}

/** The frames of the scene and their terminals, derived on every change (spec §11.1). */
export function framesFromScene(elements: readonly ExcalidrawElement[]): SceneFrame[] {
  const frames = new Map<string, SceneFrame>();
  for (const element of elements) {
    if (element.isDeleted || element.type !== "frame") continue;
    const { id, x, y, width, height } = element;
    frames.set(id, { id, name: element.name ?? "", x, y, width, height, group: groupInfoOf(element), memberIds: [] });
  }
  for (const element of elements) {
    if (element.isDeleted || !element.frameId || nodeKindOf(element) !== "terminal") continue;
    frames.get(element.frameId)?.memberIds.push(element.id);
  }
  return [...frames.values()];
}

export function isGroup(frame: SceneFrame): frame is SceneGroup {
  return frame.group !== null;
}

/** The group whose frame contains `point`, the topmost when frames overlap. */
export function groupAt(frames: readonly SceneFrame[], point: { x: number; y: number }): SceneGroup | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (isGroup(f) && point.x >= f.x && point.x <= f.x + f.width && point.y >= f.y && point.y <= f.y + f.height) return f;
  }
  return null;
}

export function groupOf(frames: readonly SceneFrame[], nodeId: string): SceneGroup | null {
  return frames.find((f): f is SceneGroup => isGroup(f) && f.memberIds.includes(nodeId)) ?? null;
}

/**
 * The group whose name Excalidraw's own editor just opened on. That editor
 * changes the name outside Excalidraw's undo store, after which an undo of
 * Dégrouper or Fermer le groupe no longer brings the frame back: groups are
 * renamed in their label instead (plain frames keep the native editor).
 */
export function groupBeingRenamed(editingFrame: string | null, frames: readonly SceneFrame[]): string | null {
  return frames.some((f) => f.id === editingFrame && isGroup(f)) ? editingFrame : null;
}

/** "Groupe N" with the smallest N no frame of the scene is named (spec §11.3, "Lancer 4"). */
export function nextGroupName(frames: readonly SceneFrame[]): string {
  const taken = new Set(frames.map((f) => f.name));
  let n = 1;
  // Either language's name counts: the language may have changed since.
  while (taken.has(canvasMessages.fr.groupName(n)) || taken.has(canvasMessages.en.groupName(n))) n++;
  return messages(canvasMessages).groupName(n);
}

/** The pantheons the groups of the scene draw their names from (spec §9.2). */
export function groupPantheons(frames: readonly SceneFrame[]): string[] {
  return frames.filter(isGroup).map((f) => f.group.pantheon);
}

export function sameFrames(a: readonly SceneFrame[], b: readonly SceneFrame[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * A group frame element. Every base field is set by hand, like the nodes:
 * tests cannot load Excalidraw's element factories. `index: null` lets
 * Excalidraw order it.
 */
export function createGroupFrame(rect: Rect, name: string, info: GroupInfo): ExcalidrawFrameElement {
  const random = () => Math.floor(Math.random() * 2 ** 31);
  return {
    id: crypto.randomUUID(),
    type: "frame",
    name,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    angle: 0 as ExcalidrawFrameElement["angle"],
    strokeColor: "#bbb",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 0,
    opacity: 100,
    seed: random(),
    version: 1,
    versionNonce: random(),
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    customData: withGroupSpeciality({ openvibe: { kind: "group", role: info.role, pantheon: info.pantheon } }, info.speciality ?? ""),
  };
}

/**
 * `elements` with `element` (a new child) right under its frame — Excalidraw
 * keeps a frame above its children — and the frame replaced by `frame`, its
 * possibly grown copy. Without the frame in the scene, both are appended.
 */
export function insertIntoFrame<T extends { id: string }>(elements: readonly T[], element: T, frame: T): T[] {
  const index = elements.findIndex((e) => e.id === frame.id);
  if (index === -1) return [...elements, element, frame];
  return [...elements.slice(0, index), element, frame, ...elements.slice(index + 1)];
}
