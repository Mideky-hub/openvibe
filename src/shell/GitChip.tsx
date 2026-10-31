import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { gitStatus, type GitStatus } from "@/ipc/git";
import { useProjects } from "@/store/projects";

const POLL_MS = 5000;

/** "⑂ main 7": branch and changed files of the project folder (spec identité §5.8). */
export function GitChip() {
  const path = useProjects((s) => s.projects.find((p) => p.id === s.activeId)?.path);
  const [status, setStatus] = useState<GitStatus | null>(null);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The next read is scheduled once the previous one is done: on a large
    // repository, git can take longer than the polling period.
    const read = () =>
      gitStatus(path)
        .then(
          (next) => alive && setStatus(next),
          () => alive && setStatus(null),
        )
        .finally(() => {
          if (alive) timer = setTimeout(read, POLL_MS);
        });
    void read();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [path]);

  // Outside a git repository, no chip (spec identité §5.8).
  if (!status) return null;
  return (
    <div
      title={path}
      className="ov-glass-strong pointer-events-auto flex h-8 items-center gap-1.5 rounded-[14px] px-2.5 font-mono text-[11.5px] text-ov-text-2"
    >
      <GitBranch className="size-3.5" />
      <span title={status.branch} className="max-w-[150px] truncate">
        {status.branch}
      </span>
      {status.changed > 0 && <span className="text-ov-accent">{status.changed}</span>}
    </div>
  );
}
