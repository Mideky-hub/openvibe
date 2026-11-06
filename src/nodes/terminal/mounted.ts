const listeners = new Set<(nodeId: string) => void>();

/** Called each time a terminal is shown in its node: an arrival that came before its mount waits for it (plan E1, J8). */
export function onTerminalMounted(listener: (nodeId: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyTerminalMounted(nodeId: string) {
  for (const listener of [...listeners]) listener(nodeId);
}
