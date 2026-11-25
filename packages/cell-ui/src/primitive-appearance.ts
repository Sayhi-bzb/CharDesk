import type { CellTextStyle } from "./types.js";
import type { CellUiTheme } from "./theme.js";

type PrimitiveVisualState = Readonly<{
  disabled: boolean;
  highlighted: boolean;
  pressed: boolean;
  confirming: boolean;
  flash: boolean;
}>;

export const resolveThumbAppearance = (
  base: CellTextStyle,
  state: PrimitiveVisualState & Readonly<{ manipulating: boolean }>,
  theme: CellUiTheme,
) => ({
  style: { ...base, ...(state.disabled ? theme.disabledStyle : {}) },
  thumb: !state.disabled && (state.highlighted || state.manipulating)
    ? theme.sliderEmphasizedThumb : theme.sliderThumb,
});

export const resolvePrimitiveAppearance = (
  base: CellTextStyle,
  state: PrimitiveVisualState,
  theme: CellUiTheme,
  hoverStyle: CellTextStyle | null = null,
): CellTextStyle => {
  const style = {
    ...base,
    ...(state.disabled ? theme.disabledStyle : {}),
  };
  if (state.highlighted && hoverStyle && !state.flash && !state.confirming) {
    return { ...hoverStyle, ...(state.disabled ? theme.disabledStyle : {}) };
  }
  const inverted = !state.disabled && (state.confirming
    ? state.flash
    : state.highlighted || state.pressed || state.flash);
  return inverted ? {
    ...style,
    color: style.backgroundColor ?? theme.background,
    backgroundColor: style.color ?? theme.foreground,
  } : style;
};
