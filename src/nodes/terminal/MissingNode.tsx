import { useEffect, useState } from "react";

/** A copy's record arrives a moment after its element: the placeholder only speaks if the node stays missing. */
export const MISSING_GRACE_MS = 600;

export function MissingNode({ text }: { text: string }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), MISSING_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="grid h-full place-items-center rounded-xl border border-ov-line bg-ov-surface text-sm text-ov-text-2">
      {late ? text : null}
    </div>
  );
}
