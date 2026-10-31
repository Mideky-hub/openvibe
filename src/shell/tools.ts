/** Buttons of the tool rail (spec identité §5.4). */
export type RailTool = "selection" | "hand" | "shapes" | "text" | "pen" | "eraser" | "image";

/** Excalidraw tools of the SHAPES menu. */
export type ShapeTool = "rectangle" | "ellipse" | "diamond" | "line" | "arrow" | "frame";

/** The rail button that shows Excalidraw's active tool, if any. */
export function railToolOf(tool: string): RailTool | null {
  switch (tool) {
    case "selection":
    case "lasso":
      return "selection";
    case "hand":
      return "hand";
    case "rectangle":
    case "ellipse":
    case "diamond":
    case "line":
    case "arrow":
    case "frame":
      return "shapes";
    case "text":
      return "text";
    case "freedraw":
      return "pen";
    case "eraser":
      return "eraser";
    case "image":
      return "image";
    default:
      return null;
  }
}

export const PEN_WIDTHS = [1, 2, 4, 6, 8];
