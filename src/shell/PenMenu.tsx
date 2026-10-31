import { useState } from "react";
import { PenLine } from "lucide-react";
import { canvasStore } from "@/canvas/canvasStore";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMessages } from "@/i18n";
import { cn } from "@/lib/utils";
import { useTheme } from "@/app/theme";
import { displayColorFor, sceneColorFor } from "@/theme/sceneColors";
import { PEN_COLORS, PEN_WIDTHS } from "./tools";
import { ToolButton } from "./buttons";
import { shellMessages } from "./messages";

/** Pen tool with its COLOR and WIDTH menu (spec habillage §5.3). */
export function PenMenu({ active }: { active: boolean }) {
  const t = useMessages(shellMessages).pen;
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const [color, setColor] = useState(PEN_COLORS[0].scene);
  const [width, setWidth] = useState(2);

  const choose = (next: { color?: string; width?: number }) => {
    const api = canvasStore.getState().api;
    if (!api) return;
    const nextColor = next.color ?? color;
    const nextWidth = next.width ?? width;
    setColor(nextColor);
    setWidth(nextWidth);
    api.updateScene({
      appState: { currentItemStrokeColor: nextColor, currentItemStrokeWidth: nextWidth },
    });
    api.setActiveTool({ type: "freedraw" });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) return;
        // Opening picks the pen with the colour and width in force (shared with the shapes): it writes nothing.
        const api = canvasStore.getState().api;
        if (!api) return;
        const app = api.getAppState();
        setColor(app.currentItemStrokeColor);
        setWidth(app.currentItemStrokeWidth);
        api.setActiveTool({ type: "freedraw" });
      }}
    >
      <PopoverTrigger asChild>
        <ToolButton label={t.button} active={active}>
          <PenLine />
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent side="right" className="w-60">
        <p className="ov-label mb-2">{t.color}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {PEN_COLORS.map(({ scene }, index) => (
            // The label is the French one stored with the color; the interface shows its own language's.
            <button
              key={scene}
              type="button"
              title={t.colors[index]}
              aria-label={t.colors[index]}
              onClick={() => choose({ color: scene })}
              className={cn(
                "size-6 rounded-full ring-offset-2 ring-offset-ov-surface-2",
                scene === color && "ring-2 ring-ov-accent",
              )}
              style={{ backgroundColor: displayColorFor(scene, theme) }}
            />
          ))}
          <label
            title={t.custom}
            className="relative size-6 cursor-pointer overflow-hidden rounded-full border border-ov-line bg-[conic-gradient(#ef4444,#d9b35a,#5e9a55,#5cc8f0,#a47cf0,#ef4444)]"
          >
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => choose({ color: sceneColorFor(e.target.value, theme) })}
            />
          </label>
        </div>
        <p className="ov-label mb-2">{t.width}</p>
        <div className="flex gap-1.5">
          {PEN_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              aria-label={t.widthN(w)}
              onClick={() => choose({ width: w })}
              className={cn(
                "grid size-8 place-items-center rounded-lg border border-transparent bg-ov-card",
                w === width && "border-ov-accent bg-ov-accent-soft",
              )}
            >
              <span className="rounded-full bg-ov-text" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
