export type UiRuntimeTheme = {
  host: {
    background: string;
    foreground: string;
    overlay: string;
    previewText: string;
  };
  motion: {
    slowMs: number;
    reduced: boolean;
  };
  surface: {
    radiusPx: number;
  };
  canvas: {
    artifact: {
      foreground: string;
      background: string;
      grid: string;
    };
    selectionSurface: string;
    selectionBorder: string;
    textCursorSurface: string;
    textCursorForeground: string;
    pickerOuter: string;
    pickerInner: string;
    pickerAccent: string;
    eraserSurface: string;
    minimapSurface: string;
    minimapContent: string;
    minimapViewportSurface: string;
    minimapViewportBorder: string;
    workspaceSurface: string;
    pageShadow: string;
  };
};

const runtimeColorTokens = {
  background: "--background",
  foreground: "--foreground",
  overlay: "--dialog-overlay",
  previewText: "--canvas-preview-text",
  artifactForeground: "--canvas-artifact-foreground",
  artifactBackground: "--canvas-artifact-background",
  artifactGrid: "--canvas-artifact-grid",
  selectionSurface: "--canvas-selection-surface",
  selectionBorder: "--canvas-selection-border",
  textCursorSurface: "--canvas-text-cursor-surface",
  textCursorForeground: "--canvas-text-cursor-foreground",
  pickerOuter: "--canvas-picker-outer",
  pickerInner: "--canvas-picker-inner",
  pickerAccent: "--canvas-picker-accent",
  eraserSurface: "--canvas-eraser-surface",
  minimapSurface: "--canvas-minimap-surface",
  minimapContent: "--canvas-minimap-content",
  minimapViewportSurface: "--canvas-minimap-viewport-surface",
  minimapViewportBorder: "--canvas-minimap-viewport-border",
  workspaceSurface: "--canvas-workspace-surface",
  pageShadow: "--canvas-page-shadow",
} as const;

const requireComputedValue = (value: string, token: string) => {
  const resolved = value.trim();
  if (!resolved) {
    throw new Error(`CharDesk UI runtime theme is missing ${token}`);
  }
  return resolved;
};

const readColor = (
  probe: HTMLElement,
  token: (typeof runtimeColorTokens)[keyof typeof runtimeColorTokens]
) => {
  probe.style.color = `var(${token})`;
  return requireComputedValue(probe.ownerDocument.defaultView!.getComputedStyle(probe).color, token);
};

const readDurationMs = (probe: HTMLElement, token: string) => {
  probe.style.transitionDuration = `var(${token})`;
  const value = requireComputedValue(
    probe.ownerDocument.defaultView!.getComputedStyle(probe).transitionDuration,
    token
  );
  const duration = value.endsWith("ms")
    ? Number.parseFloat(value)
    : value.endsWith("s")
      ? Number.parseFloat(value) * 1000
      : Number.NaN;
  if (Number.isFinite(duration)) return duration;
  throw new Error(`CharDesk UI runtime theme has an invalid duration for ${token}: ${value}`);
};

const readRadiusPx = (probe: HTMLElement, token: string) => {
  probe.style.borderTopLeftRadius = `var(${token})`;
  const value = requireComputedValue(
    probe.ownerDocument.defaultView!.getComputedStyle(probe).borderTopLeftRadius,
    token
  );
  const radius = value.endsWith("px") ? Number.parseFloat(value) : Number.NaN;
  if (!Number.isFinite(radius)) {
    throw new Error(`CharDesk UI runtime theme has an invalid length for ${token}: ${value}`);
  }
  return radius;
};

export function readUiRuntimeTheme(element: HTMLElement): UiRuntimeTheme {
  const probe = element.ownerDocument.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;inset:0 auto auto 0;";
  element.append(probe);

  try {
    const colors = Object.fromEntries(
      Object.entries(runtimeColorTokens).map(([key, token]) => [key, readColor(probe, token)])
    ) as Record<keyof typeof runtimeColorTokens, string>;
    const view = element.ownerDocument.defaultView;

    return {
      host: {
        background: colors.background,
        foreground: colors.foreground,
        overlay: colors.overlay,
        previewText: colors.previewText,
      },
      motion: {
        slowMs: readDurationMs(probe, "--motion-slow"),
        reduced: view?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false,
      },
      surface: {
        radiusPx: readRadiusPx(probe, "--surface-radius"),
      },
      canvas: {
        artifact: {
          foreground: colors.artifactForeground,
          background: colors.artifactBackground,
          grid: colors.artifactGrid,
        },
        selectionSurface: colors.selectionSurface,
        selectionBorder: colors.selectionBorder,
        textCursorSurface: colors.textCursorSurface,
        textCursorForeground: colors.textCursorForeground,
        pickerOuter: colors.pickerOuter,
        pickerInner: colors.pickerInner,
        pickerAccent: colors.pickerAccent,
        eraserSurface: colors.eraserSurface,
        minimapSurface: colors.minimapSurface,
        minimapContent: colors.minimapContent,
        minimapViewportSurface: colors.minimapViewportSurface,
        minimapViewportBorder: colors.minimapViewportBorder,
        workspaceSurface: colors.workspaceSurface,
        pageShadow: colors.pageShadow,
      },
    };
  } finally {
    probe.remove();
  }
}
