import { useEffect, useState } from "react";

/** A copy's record arrives a moment after its element: the placeholder only speaks if the node stays missing. */
export const MISSING_GRACE_MS = 600;

/** `pending`: the node is known to be on its way (a copy marked as starting), however long it takes. */
export function MissingNode({ text, pending = false }: { text: string; pending?: boolean }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), MISSING_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="grid h-full place-items-center rounded-xl border border-ov-line bg-ov-surface text-sm text-ov-text-2">
      {late && !pending ? text : null}
    </div>
  );
}
