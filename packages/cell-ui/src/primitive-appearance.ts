import type { CellTextStyle } from "./types.js";
import type { CellUiTheme } from "./theme.js";

export type PrimitiveVisualState = Readonly<{
  disabled: boolean;
  highlighted: boolean;
  pressed: boolean;
  confirming: boolean;
  flash: boolean;
}>;

/** Continuous controls emphasize the handle, never the whole track. */
export const resolveThumbAppearance = (
  base: CellTextStyle,
  state: PrimitiveVisualState & Readonly<{ manipulating: boolean }>,
  theme: CellUiTheme,
) => ({
  style: { ...base, ...(state.disabled ? theme.disabledStyle : {}) },
  thumb: !state.disabled && (state.highlighted || state.manipulating)
    ? theme.sliderEmphasizedThumb : theme.sliderThumb,
});

/** A feedback phase replaces highlight; inversion is never additive. */
export const resolvePrimitiveAppearance = (
  base: CellTextStyle,
  state: PrimitiveVisualState,
  theme: CellUiTheme,
): CellTextStyle => {
  const style = {
    ...base,
    ...(state.disabled ? theme.disabledStyle : {}),
  };
  const inverted = !state.disabled && (state.confirming
    ? state.flash
    : state.highlighted || state.pressed || state.flash);
  return inverted ? {
    ...style,
    color: style.backgroundColor ?? theme.background,
    backgroundColor: style.color ?? theme.foreground,
  } : style;
};
