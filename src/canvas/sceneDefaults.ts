import type { ExcalidrawInitialDataState, UIOptions } from "@excalidraw/excalidraw/types";
import { PEN_COLORS } from "@/theme/penColors";

/** Excalidraw 0.18.1's FONT_FAMILY["Comic Shanns"], its "code" font (a constant: tests cannot load Excalidraw). */
export const COMIC_SHANNS = 8;

/**
 * New elements get the pen's first ink (the theme turns it light on dark) and Comic Shanns text; the canvas itself is
 * transparent so the dot grid shows through (spec habillage §4.2, §5.7).
 */
export const SCENE_DEFAULTS = {
  viewBackgroundColor: "transparent",
  currentItemStrokeColor: PEN_COLORS[0].scene,
  currentItemFontFamily: COMIC_SHANNS,
  gridModeEnabled: false,
  // Our layers draw frame outlines and group labels (spec habillage §5.7, §11.4).
  frameRendering: { enabled: true, name: true, outline: false, clip: true },
};

export function withSceneDefaults(initial: ExcalidrawInitialDataState): ExcalidrawInitialDataState {
  return { ...initial, appState: { ...SCENE_DEFAULTS, ...initial.appState } };
}

/** Excalidraw's canvas actions all move to the shell's menus. */
export const EXCALIDRAW_UI_OPTIONS: UIOptions = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    toggleTheme: false,
    saveAsImage: false,
  },
  tools: { image: true },
};
