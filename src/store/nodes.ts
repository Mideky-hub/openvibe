import { createStore, useStore } from "zustand";
import { saveNode, type StoredNode } from "@/ipc/db";
import { toast } from "sonner";
import { messages } from "@/i18n";
import { storeMessages } from "./messages";
import { debounce, type Debounced } from "@/lib/debounce";
import { onFlushAll } from "@/lib/flush";
import { rebasePath } from "@/lib/paths";
import { readOrchestratorPayload, readTerminalPayload, type OrchestratorPayload, type TerminalPayload } from "@/nodes/types";

export type NodeRecord =
  | { workspaceId: string; kind: "terminal"; payload: TerminalPayload }
  | { workspaceId: string; kind: "orchestrator"; payload: OrchestratorPayload };

export interface NodesState {
  nodes: Record<string, NodeRecord>;
  /** Adds the nodes of a workspace loaded from SQLite, keeping newer in-memory copies. */
  hydrate: (workspaceId: string, stored: StoredNode[]) => void;
  /** Adds a node and saves it at once (its row must exist before its scrollback). */
  create: (id: string, record: NodeRecord) => Promise<void>;
  /** Changes a node; the save waits 500 ms for further changes. */
  update: (id: string, patch: Partial<TerminalPayload> | Partial<OrchestratorPayload>) => void;
  /** Saves a node now, e.g. when an undo brings back a node purged from SQLite. */
  persist: (id: string) => Promise<void>;
  /** Drops the nodes of a deleted workspace and returns their ids. */
  forgetWorkspace: (workspaceId: string) => string[];
}

const SAVE_DELAY_MS = 500;

export function createNodesStore() {
  const pendingSaves = new Map<string, Debounced<[], Promise<void> | undefined>>();

  const store = createStore<NodesState>()((set, get) => {
    const write = (id: string) => {
      const record = get().nodes[id];
      if (!record) return undefined;
      return saveNode(id, record.workspaceId, record.kind, JSON.stringify(record.payload));
    };

    const saveLater = (id: string) => {
      let save = pendingSaves.get(id);
      if (!save) {
        // The timer drops the result: a refused save must reach the user, not the console as an unhandled rejection.
        save = debounce(() => {
          const written = write(id);
          written?.catch((error: unknown) => toast.error(messages(storeMessages).saveFailed(String(error))));
          return written;
        }, SAVE_DELAY_MS);
        pendingSaves.set(id, save);
      }
      save();
    };

    const saveNow = async (id: string) => {
      pendingSaves.get(id)?.cancel();
      await write(id);
    };

    return {
      nodes: {},

      hydrate: (workspaceId, stored) => {
        const loaded: Record<string, NodeRecord> = {};
        for (const node of stored) {
          const record = readRecord(workspaceId, node);
          if (record) loaded[node.id] = record;
          else console.warn(`node ${node.id}: unreadable payload, skipped`);
        }
        set((s) => ({ nodes: { ...loaded, ...s.nodes } }));
      },

      create: async (id, record) => {
        set((s) => ({ nodes: { ...s.nodes, [id]: record } }));
        await saveNow(id);
      },

      update: (id, patch) => {
        const record = get().nodes[id];
        if (!record) return;
        const next = { ...record, payload: { ...record.payload, ...patch } } as NodeRecord;
        set((s) => ({ nodes: { ...s.nodes, [id]: next } }));
        saveLater(id);
      },

      persist: saveNow,

      forgetWorkspace: (workspaceId) => {
        const ids = Object.keys(get().nodes).filter((id) => get().nodes[id].workspaceId === workspaceId);
        for (const id of ids) {
          pendingSaves.get(id)?.cancel();
          pendingSaves.delete(id);
        }
        set((s) => ({ nodes: Object.fromEntries(Object.entries(s.nodes).filter(([id]) => !ids.includes(id))) }));
        return ids;
      },
    };
  });

  const flushPending = () => Promise.all([...pendingSaves.values()].map((save) => save.flush()));
  return { store, flushPending };
}

function readRecord(workspaceId: string, node: StoredNode): NodeRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(node.payloadJson);
  } catch {
    return null;
  }
  if (node.kind === "orchestrator") return { workspaceId, kind: "orchestrator", payload: readOrchestratorPayload(raw) };
  if (node.kind !== "terminal") return null;
  const payload = readTerminalPayload(raw);
  return payload ? { workspaceId, kind: "terminal", payload } : null;
}

/** The terminal payload of a node; undefined for an orchestrator or a missing node. */
export function terminalOf(record: NodeRecord | undefined): TerminalPayload | undefined {
  return record?.kind === "terminal" ? record.payload : undefined;
}

const nodes = createNodesStore();
onFlushAll(nodes.flushPending);

export const nodesStore = nodes.store;

export function useNodes<T>(selector: (state: NodesState) => T): T {
  return useStore(nodesStore, selector);
}

/** After "Changer de dossier": terminals in memory follow the project's new folder. */
export function rebaseTerminalFolders(from: string, to: string) {
  for (const [id, node] of Object.entries(nodesStore.getState().nodes)) {
    if (node.kind === "orchestrator") {
      // Its Claude session and the paths of its mission follow the project too.
      const { session, mission } = node.payload;
      const cwd = session && rebasePath(session.cwd, from, to);
      const project = mission?.project && rebasePath(mission.project, from, to);
      const worktree = mission?.worktree && rebasePath(mission.worktree, from, to);
      const members = mission?.members.map((m) => ({ ...m, worktree: rebasePath(m.worktree, from, to) ?? m.worktree }));
      const patch: Partial<OrchestratorPayload> = {};
      if (session && cwd) patch.session = { ...session, cwd };
      if (mission && (project || worktree || members?.some((m, i) => m.worktree !== mission.members[i].worktree))) {
        patch.mission = { ...mission, project: project || mission.project, worktree: worktree || mission.worktree, members: members ?? mission.members };
      }
      if (Object.keys(patch).length > 0) nodesStore.getState().update(id, patch);
      continue;
    }
    const cwd = rebasePath(node.payload.cwd, from, to);
    if (cwd) nodesStore.getState().update(id, { cwd });
  }
}

/** The Claude session of a node: a terminal's own, or an orchestrator's (spec orchestrateur §6). */
export function sessionOf(record: NodeRecord | undefined): TerminalPayload | undefined {
  if (record?.kind === "terminal") return record.payload;
  return record?.kind === "orchestrator" ? record.payload.session : undefined;
}

/** Changes a node's session where it lives: the payload of a terminal, the `session` of an orchestrator. */
export function updateSession(nodeId: string, patch: Partial<TerminalPayload>) {
  const record = nodesStore.getState().nodes[nodeId];
  if (record?.kind === "terminal") nodesStore.getState().update(nodeId, patch);
  else if (record?.kind === "orchestrator" && record.payload.session) {
    nodesStore.getState().update(nodeId, { session: { ...record.payload.session, ...patch } });
  }
}
