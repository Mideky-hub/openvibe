import { useState } from "react";
import { Circle, Diamond, Frame, Minus, MoveUpRight, Shapes, Square, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMessages } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ShapeTool } from "./tools";
import { ToolButton } from "./buttons";
import { shellMessages } from "./messages";

const SHAPES: { tool: ShapeTool; Icon: LucideIcon }[] = [
  { tool: "rectangle", Icon: Square },
  { tool: "ellipse", Icon: Circle },
  { tool: "diamond", Icon: Diamond },
  { tool: "line", Icon: Minus },
  { tool: "arrow", Icon: MoveUpRight },
  { tool: "frame", Icon: Frame },
];

/** The SHAPES menu of the rail; `current` is Excalidraw's active tool. */
export function ShapesMenu(props: { active: boolean; current: string; onPick: (tool: ShapeTool) => void }) {
  const { active, current, onPick } = props;
  const t = useMessages(shellMessages).shapes;
  const [open, setOpen] = useState(false);
  // The button keeps the last shape: using it takes that shape as the tool, like the pen.
  const [last, setLast] = useState<ShapeTool>("rectangle");
  const shape = SHAPES.find(({ tool }) => tool === current);
  if (shape && shape.tool !== last) setLast(shape.tool);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onPick(last);
      }}
    >
      <PopoverTrigger asChild>
        <ToolButton label={t.title} active={active}>
          <Shapes />
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent side="right" className="w-60">
        <p className="ov-label mb-2">{t.title}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {SHAPES.map(({ tool, Icon }) => (
            <button
              key={tool}
              type="button"
              data-shape={tool}
              onClick={() => {
                setLast(tool);
                onPick(tool);
                setOpen(false);
              }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border border-transparent bg-ov-card py-2 text-[11px] text-ov-text-2 hover:text-ov-text",
                tool === current && "border-ov-accent bg-ov-accent-soft text-ov-text",
              )}
            >
              <Icon className="size-4" />
              {t[tool]}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
