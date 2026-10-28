/** Layout of a board's columns, in canvas pixels; keep in step with the classes of KanbanNode. */
const COLUMN = 240; // w-60
const GAP = 12; // gap-3
const ADD_BUTTON = 224; // w-56
const PADDING = 24; // p-3 on both sides
const BORDER = 2;
/** What an empty board keeps: its "add a column" call to action needs room. */
const EMPTY_WIDTH = 640;

/** The width that shows `columnCount` columns and the "add a column" button without a scroll. */
export function kanbanWidth(columnCount: number): number {
  if (columnCount <= 0) return EMPTY_WIDTH;
  return BORDER + PADDING + columnCount * (COLUMN + GAP) + ADD_BUTTON;
}
