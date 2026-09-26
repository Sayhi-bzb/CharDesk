export type CanvasMode = "freeform" | "slide";

type StaticGridCanvasMode = CanvasMode;

export type CanvasModeCapabilities = Readonly<{
  navigate: boolean;
  select: boolean;
  copy: boolean;
  mutateCells: boolean;
  mutateScene: boolean;
  managePages: boolean;
  collaborate: boolean;
}>;

export type CanvasModeDefinition = Readonly<{
  surface: "cell-plane" | "slide-page";
  capabilities: CanvasModeCapabilities;
}>;

const NAVIGABLE = { navigate: true, select: true, copy: true } as const;

export const CANVAS_MODE_DEFINITIONS = {
  freeform: {
    surface: "cell-plane",
    capabilities: {
      ...NAVIGABLE,
      mutateCells: true,
      mutateScene: false,
      managePages: false,
      collaborate: true,
    },
  },
  slide: {
    surface: "slide-page",
    capabilities: {
      ...NAVIGABLE,
      mutateCells: true,
      mutateScene: false,
      managePages: true,
      collaborate: false,
    },
  },
} as const satisfies Record<CanvasMode, CanvasModeDefinition>;

export const getCanvasModeDefinition = (mode: CanvasMode): CanvasModeDefinition =>
  CANVAS_MODE_DEFINITIONS[mode];

export const isStaticGridMode = (
  mode: CanvasMode
): mode is StaticGridCanvasMode =>
  mode === "freeform" || mode === "slide";
