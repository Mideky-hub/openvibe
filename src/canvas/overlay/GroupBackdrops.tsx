import { screenRectOf } from "@/fleet/placement";
import { ROLES } from "@/fleet/roles";
import { useCanvas } from "../canvasStore";

/**
 * Frame outlines, painted under the transparent canvas (spec habillage §11.4):
 * tinted with the role's color for groups, sober grey for plain frames.
 */
export function GroupBackdrops() {
  const frames = useCanvas((s) => s.frames);
  const view = useCanvas((s) => s.view);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {frames.map((frame) => {
        // A folded group is only its label (spec replier un groupe).
        if (frame.group?.folded) return null;
        const rect = screenRectOf(frame, view);
        const color = frame.group ? ROLES[frame.group.role].color : null;
        return (
          <div
            key={frame.id}
            data-backdrop
            className="absolute border"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              borderRadius: 12 * view.zoom,
              borderColor: color
                ? `color-mix(in srgb, ${color} 60%, transparent)`
                : "color-mix(in srgb, var(--ov-text-2) 45%, transparent)",
              backgroundColor: color ? `color-mix(in srgb, ${color} 4%, transparent)` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
