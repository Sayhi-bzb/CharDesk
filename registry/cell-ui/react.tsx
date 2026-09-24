import {
  Fragment,
  isValidElement,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import type {
  CellCheckboxState,
  CellLayoutStyle,
  CellPoint,
  CellSingleLineInputStyle,
  CellTextStyle,
  WidgetKind,
} from "./types.js";
import type { CellTextSnapshot } from "./text.js";
import { normalizeCellSliderValue, resolveCellSliderRange } from "./slider.js";
import {
  resolveButtonVariant,
  type ButtonVariant,
} from "./button.js";
import { resolveSurfaceVariant, type SurfaceVariant } from "./surface-variant.js";
import type { CellUiRecipe } from "./recipe.js";
import { resolveBadgeTone, type BadgeTone } from "./badge.js";
import { resolveAlertTone, type AlertTone } from "./alert.js";
import { resolveSeparatorVariant, type SeparatorVariant } from "./separator.js";
import { resolveProgressVariant, type ProgressVariant } from "./progress.js";
import { resolveSpinnerVariant, type SpinnerVariant } from "./spinner.js";
import { tooltipText, tooltipTextWidth } from "./tooltip.js";
import { resolveTabsVariant, type TabsVariant } from "./tabs.js";
import {
  resolveCellFrame,
  type CellBorderShape,
  type CellFrame,
} from "./border.js";

type IdentityProps = Readonly<{
  id?: string;
}>;
type NamedProps = Readonly<{
  label?: string;
}>;
type DisableableProps = Readonly<{
  disabled?: boolean;
}>;
type ChildrenProps = Readonly<{
  children?: ReactNode;
}>;
type ContainerProps = IdentityProps & DisableableProps & ChildrenProps;
type NamedContainerProps = ContainerProps & NamedProps;
type NamedLeafProps = IdentityProps & DisableableProps & NamedProps;

const normalizeSingleLineInputStyle = (
  style: CellLayoutStyle | undefined,
): CellSingleLineInputStyle => ({
  ...(style?.width !== undefined ? { width: style.width } : {}),
  ...(style?.minWidth !== undefined ? { minWidth: style.minWidth } : {}),
  ...(style?.maxWidth !== undefined ? { maxWidth: style.maxWidth } : {}),
  ...(style?.flexGrow !== undefined ? { flexGrow: style.flexGrow } : {}),
  ...(style?.flexShrink !== undefined ? { flexShrink: style.flexShrink } : {}),
});

type SurfaceAppearanceProps = Readonly<{
  variant?: SurfaceVariant;
  frame?: CellFrame;
  borderShape?: CellBorderShape;
}>;
type FloatingSurfaceAppearanceProps = Readonly<{
  variant?: SurfaceVariant;
  border?: "none" | CellBorderShape;
}>;

export type RootProps = ContainerProps & Readonly<{ style?: CellLayoutStyle }>;
export type BoxProps = ContainerProps & SurfaceAppearanceProps & Readonly<{ style?: CellLayoutStyle }>;
export type AlertProps = IdentityProps & ChildrenProps & Readonly<{
  tone?: AlertTone;
  variant?: SurfaceVariant;
  border?: "none" | CellBorderShape;
  style?: CellLayoutStyle;
}>;
export type AlertTitleProps = TextProps;
export type AlertDescriptionProps = TextProps;
export type AccordionProps = ContainerProps & Readonly<{ style?: CellLayoutStyle }>;
export type AccordionItemProps = Omit<AccordionProps, "id"> & Readonly<{ id: string; expanded?: boolean }>;
export type AccordionTriggerProps = NamedContainerProps & Readonly<{ focused?: boolean; style?: CellLayoutStyle; textStyle?: CellTextStyle }>;
export type AccordionContentProps = NamedContainerProps & Readonly<{ style?: CellLayoutStyle }>;
export type OverlayProps = NamedContainerProps & SurfaceAppearanceProps & Readonly<{
  position: CellPoint;
  modal?: boolean;
  closeOnOutsideClick?: boolean;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type DialogProps = Omit<OverlayProps, "id" | "position" | "variant" | "frame" | "borderShape"> & FloatingSurfaceAppearanceProps & Readonly<{
  id: string;
  initialFocusId?: string;
}>;
export type DialogTitleProps = TextProps;
export type DialogDescriptionProps = TextProps;
export type DialogFooterProps = ContainerProps & Readonly<{ style?: CellLayoutStyle }>;
export type TextProps = Readonly<{
  id?: string;
  children: string | number;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type ButtonProps = NamedContainerProps & Readonly<{
  variant?: ButtonVariant;
  focused?: boolean;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type BadgeProps = NamedContainerProps & Readonly<{
  tone?: BadgeTone;
  interactive?: boolean;
  focused?: boolean;
  style?: CellLayoutStyle;
}>;
export type CheckboxProps = NamedContainerProps & Readonly<{
  checked?: CellCheckboxState;
  focused?: boolean;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
type SliderBaseProps = NamedLeafProps & Readonly<{
  min?: number;
  max?: number;
  step?: number;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type SliderThumb = Readonly<{
  id: string;
  label: string;
  valueText?: string;
  focused?: boolean;
}>;
export type SliderProps = SliderBaseProps & (Readonly<{
  value: number;
  valueText?: string;
  focused?: boolean;
  thumbs?: never;
}> | Readonly<{
  id: string;
  label: string;
  value: readonly [number, number];
  thumbs: readonly [SliderThumb, SliderThumb];
  valueText?: never;
  focused?: never;
}>);
export type ToggleProps = NamedContainerProps & Readonly<{
  pressed?: boolean;
  focused?: boolean;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type ProgressProps = Readonly<{
  id?: string;
  label: string;
  value: number | null;
  max?: number;
  valueText?: string;
  number?: boolean;
  variant?: ProgressVariant;
  style?: CellLayoutStyle;
}>;
export type SpinnerProps = Readonly<{
  id?: string;
  label: string;
  variant?: SpinnerVariant;
}>;
export type TooltipProps = FloatingSurfaceAppearanceProps & Readonly<{
  id?: string;
  targetId: string;
  text: string;
}>;
export type SeparatorProps = Readonly<{
  id?: string;
  orientation?: "horizontal" | "vertical";
  variant?: SeparatorVariant;
  style?: CellLayoutStyle;
}>;
export type RadioGroupProps = NamedContainerProps & Readonly<{
  value?: string | null;
  orientation?: "horizontal" | "vertical";
  style?: CellLayoutStyle;
}>;
export type RadioItemProps = NamedContainerProps & Readonly<{
  value: string;
  focused?: boolean;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type RangeSliderProps = DisableableProps & Readonly<{
  id: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  children: ReactNode;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type RangeSliderThumbProps = Readonly<{
  id: string;
  label: string;
  value: number;
  valueText?: string;
  focused?: boolean;
  textStyle?: CellTextStyle;
}>;
export type SelectProps = ContainerProps & Readonly<{ style?: CellLayoutStyle; variant?: SurfaceVariant }>;
export type SelectTriggerProps = NamedContainerProps & Readonly<{
  focused?: boolean;
  expanded?: boolean;
  controlsId?: string;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type SelectContentProps = NamedContainerProps & Readonly<{
  frame?: CellFrame;
  borderShape?: CellBorderShape;
  scrollY?: number;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type SelectItemProps = NamedContainerProps & Readonly<{
  focused?: boolean;
  selected?: boolean;
  positionInSet?: number;
  setSize?: number;
  style?: CellLayoutStyle;
}>;
export type ComboboxProps = ContainerProps & Readonly<{ style?: CellLayoutStyle; variant?: SurfaceVariant }>;
export type ComboboxInputProps = Omit<TextInputProps, "variant"> & Readonly<{
  expanded?: boolean;
  controlsId?: string;
  activeDescendantId?: string;
}>;
export type ComboboxContentProps = SelectContentProps;
export type ComboboxItemProps = Omit<SelectItemProps, "focused"> & Readonly<{ active?: boolean }>;
export type ListProps = NamedContainerProps & Readonly<{ style?: CellLayoutStyle }>;
export type ListItemProps = NamedContainerProps & Readonly<{
  focused?: boolean;
  selected?: boolean;
  positionInSet?: number;
  setSize?: number;
  style?: CellLayoutStyle;
}>;
type CollectionProps = NamedContainerProps & Readonly<{
  orientation?: "horizontal" | "vertical";
  style?: CellLayoutStyle;
}>;
type CollectionItemProps = NamedContainerProps & Readonly<{
  focused?: boolean;
  selected?: boolean;
  style?: CellLayoutStyle;
}>;
export type MenuProps = CollectionProps;
export type MenuItemProps = Omit<CollectionItemProps, "selected">;
export type TreeProps = CollectionProps;
export type TreeItemProps = CollectionItemProps & Readonly<{
  expanded?: boolean;
  hasChildren?: boolean;
  level: number;
  parentItemId?: string;
}>;
export type TabsProps = CollectionProps & Readonly<{ variant?: TabsVariant }>;
export type TabProps = CollectionItemProps & Readonly<{ controlsId?: string }>;
export type TabPanelProps = NamedContainerProps & Readonly<{
  labelledById?: string;
  style?: CellLayoutStyle;
}>;
export type GridProps = CollectionProps & Readonly<{
  rowCount?: number;
  columnCount?: number;
}>;
export type GridRowProps = NamedContainerProps & Readonly<{
  rowIndex: number;
  style?: CellLayoutStyle;
}>;
export type GridCellProps = CollectionItemProps & Readonly<{
  rowIndex: number;
  columnIndex: number;
}>;
export type ScrollAreaProps = ContainerProps & SurfaceAppearanceProps & Readonly<{
  scrollX?: number;
  scrollY?: number;
  style?: CellLayoutStyle;
}>;
export type TextEditorProps = NamedLeafProps & Readonly<{
  state: CellTextSnapshot;
  focused?: boolean;
  readOnly?: boolean;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type TextInputProps = Omit<TextEditorProps, "style"> & Readonly<{
  variant?: SurfaceVariant;
  style?: CellSingleLineInputStyle;
}>;
export type TextAreaProps = TextEditorProps & SurfaceAppearanceProps;

type PrimitiveProps =
  | RootProps
  | BoxProps
  | AlertProps
  | OverlayProps
  | TextProps
  | ButtonProps
  | BadgeProps
  | CheckboxProps
  | ToggleProps
  | ProgressProps
  | SpinnerProps
  | TooltipProps
  | SeparatorProps
  | RadioGroupProps
  | RadioItemProps
  | SliderProps
  | RangeSliderProps
  | RangeSliderThumbProps
  | SelectProps
  | SelectTriggerProps
  | SelectContentProps
  | SelectItemProps
  | ComboboxProps
  | ComboboxInputProps
  | ComboboxContentProps
  | ComboboxItemProps
  | ListProps
  | ListItemProps
  | MenuProps
  | MenuItemProps
  | TreeProps
  | TreeItemProps
  | TabsProps
  | TabProps
  | TabPanelProps
  | GridProps
  | GridRowProps
  | GridCellProps
  | ScrollAreaProps
  | TextInputProps
  | TextAreaProps;

type PrimitiveComponent<Props extends PrimitiveProps> = ComponentType<Props>;

const kinds = new Map<unknown, WidgetKind>();

const primitive = <Props extends PrimitiveProps>(
  kind: WidgetKind
): PrimitiveComponent<Props> => {
  const CellPrimitive = (() => null) as PrimitiveComponent<Props>;
  CellPrimitive.displayName = `Cell${kind
    .split("-")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join("")}`;
  kinds.set(CellPrimitive, kind);
  return CellPrimitive;
};

export const Root = primitive<RootProps>("root");
export const Box = primitive<BoxProps>("box");
export const Alert = primitive<AlertProps>("alert");
export const AlertTitle = primitive<AlertTitleProps>("text");
export const AlertDescription = primitive<AlertDescriptionProps>("text");
export const Accordion = primitive<AccordionProps>("accordion");
export const AccordionItem = primitive<AccordionItemProps>("accordion-item");
export const AccordionTrigger = primitive<AccordionTriggerProps>("accordion-trigger");
export const AccordionContent = primitive<AccordionContentProps>("accordion-content");
export const Overlay = primitive<OverlayProps>("overlay");
export const Dialog = primitive<DialogProps>("overlay");
export const DialogTitle = primitive<DialogTitleProps>("text");
export const DialogDescription = primitive<DialogDescriptionProps>("text");
export const DialogFooter = primitive<DialogFooterProps>("box");
export const Text = primitive<TextProps>("text");
export const Button = primitive<ButtonProps>("button");
export const Badge = primitive<BadgeProps>("badge");
export const Checkbox = primitive<CheckboxProps>("checkbox");
export const Toggle = primitive<ToggleProps>("toggle");
export const Progress = primitive<ProgressProps>("progress");
export const Spinner = primitive<SpinnerProps>("spinner");
export const Tooltip = primitive<TooltipProps>("tooltip");
export const Separator = primitive<SeparatorProps>("separator");
export const RadioGroup = primitive<RadioGroupProps>("radio-group");
export const RadioItem = primitive<RadioItemProps>("radio-item");
export const Slider = primitive<SliderProps>("slider");
export const RangeSlider = primitive<RangeSliderProps>("range-slider");
export const RangeSliderThumb = primitive<RangeSliderThumbProps>("range-slider-thumb");
export const Select = primitive<SelectProps>("select");
export const SelectTrigger = primitive<SelectTriggerProps>("select-trigger");
export const SelectContent = primitive<SelectContentProps>("select-content");
export const SelectItem = primitive<SelectItemProps>("select-item");
export const Combobox = primitive<ComboboxProps>("combobox");
export const ComboboxInput = primitive<ComboboxInputProps>("combobox-input");
export const ComboboxContent = primitive<ComboboxContentProps>("combobox-content");
export const ComboboxItem = primitive<ComboboxItemProps>("combobox-item");
export const List = primitive<ListProps>("list");
export const ListItem = primitive<ListItemProps>("list-item");
export const Menu = primitive<MenuProps>("menu");
export const MenuItem = primitive<MenuItemProps>("menu-item");
export const Tree = primitive<TreeProps>("tree");
export const TreeItem = primitive<TreeItemProps>("tree-item");
export const Tabs = primitive<TabsProps>("tabs");
export const Tab = primitive<TabProps>("tab");
export const TabPanel = primitive<TabPanelProps>("tab-panel");
export const Grid = primitive<GridProps>("grid");
export const GridRow = primitive<GridRowProps>("grid-row");
export const GridCell = primitive<GridCellProps>("grid-cell");
export const ScrollArea = primitive<ScrollAreaProps>("scroll-area");
export const TextInput = primitive<TextInputProps>("text-input");
export const TextArea = primitive<TextAreaProps>("text-area");

export type WidgetDescriptor = Readonly<{
  kind: WidgetKind;
  explicitId: string | null;
  key: string | null;
  style: CellLayoutStyle;
  surfaceVariant: SurfaceVariant | null;
  frame: CellFrame;
  borderShape: CellBorderShape | null;
  text: string | null;
  textStyle: CellTextStyle;
  label: string | null;
  disabled: boolean;
  focused: boolean;
  selected: boolean;
  active: boolean;
  checked: CellCheckboxState;
  pressed: boolean;
  radioValue: string | null;
  progress: import("./types.js").WidgetNode["progress"];
  progressVariant: ProgressVariant;
  spinnerVariant: SpinnerVariant;
  tooltipTargetId: string | null;
  tabsVariant: TabsVariant;
  separatorVariant: SeparatorVariant;
  buttonVariant: ButtonVariant;
  badgeTone: BadgeTone;
  sliderValue: number;
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  sliderValueText: string | null;
  expanded: boolean;
  hasChildren: boolean;
  level: number | null;
  parentItemId: string | null;
  rowIndex: number | null;
  columnIndex: number | null;
  rowCount: number | null;
  columnCount: number | null;
  positionInSet: number | null;
  setSize: number | null;
  orientation: "horizontal" | "vertical" | null;
  controlsId: string | null;
  activeDescendantId: string | null;
  labelledById: string | null;
  textEditor: CellTextSnapshot | null;
  readOnly: boolean;
  overlayPosition: CellPoint | null;
  modal: boolean;
  dialog?: Readonly<{ initialFocusId?: string }>;
  dialogPart?: "title" | "description";
  closeOnOutsideClick?: boolean;
  scrollX: number;
  scrollY: number;
  children: readonly WidgetDescriptor[];
}>;

const flattenChildren = (value: ReactNode, target: ReactNode[]): void => {
  if (Array.isArray(value)) {
    for (const child of value) flattenChildren(child, target);
    return;
  }
  if (value === null || value === undefined || typeof value === "boolean") return;
  target.push(value);
};

const describe = (element: ReactElement, recipe: CellUiRecipe): WidgetDescriptor[] => {
  if (element.type === Fragment) {
    const fragmentChildren: ReactNode[] = [];
    flattenChildren((element.props as { children?: ReactNode }).children, fragmentChildren);
    return fragmentChildren.flatMap((child) => {
      if (!isValidElement(child)) {
        throw new TypeError("Cell UI fragments may only contain Cell UI primitives.");
      }
      return describe(child, recipe);
    });
  }

  const primitiveKind = kinds.get(element.type);
  const props = element.props as Record<string, unknown>;
  if (element.type === Slider && Array.isArray(props.value)) {
    const values = props.value as unknown[];
    const thumbs = props.thumbs as unknown;
    if (values.length !== 2 || values.some((value) => typeof value !== "number")
      || !Array.isArray(thumbs) || thumbs.length !== 2
      || props.children !== undefined) {
      throw new TypeError("Range Slider requires two values and two thumbs, without children.");
    }
    const [start, end] = thumbs as [SliderThumb, SliderThumb];
    return describe(<RangeSlider
      key={element.key}
      id={props.id as string}
      label={props.label as string}
      min={props.min as number | undefined}
      max={props.max as number | undefined}
      step={props.step as number | undefined}
      disabled={props.disabled === true}
      style={props.style as CellLayoutStyle | undefined}
      textStyle={props.textStyle as CellTextStyle | undefined}
    >
      <RangeSliderThumb {...start} value={values[0] as number} />
      <RangeSliderThumb {...end} value={values[1] as number} />
    </RangeSlider>, recipe);
  }
  if (element.type === Slider && props.thumbs !== undefined) {
    throw new TypeError("Single-value Slider cannot have thumbs.");
  }
  const kind = element.type === Badge && props.interactive === true
    ? "badge-action" : primitiveKind;
  if (!kind) {
    throw new TypeError("Cell UI only accepts Cell-native descriptors.");
  }
  if (kind === "badge-action" && (typeof props.id !== "string" || !props.id.trim())) {
    throw new TypeError("Interactive Badge requires a non-empty id.");
  }
  if (kind === "tooltip" && (
    typeof props.targetId !== "string" || !props.targetId.trim()
    || typeof props.text !== "string" || !tooltipText(props.text)
  )) throw new TypeError("Tooltip requires non-empty targetId and text props.");
  const isDialog = element.type === Dialog;
  if (isDialog && (typeof props.id !== "string" || !props.id.trim())) {
    throw new TypeError("Dialog requires a non-empty id.");
  }
  const progressMax = typeof props.max === "number" && Number.isFinite(props.max) && props.max > 0
    ? props.max : 100;
  const progressVariant = kind === "progress"
    ? resolveProgressVariant(props.variant)
    : "solid";
  if (
    (kind === "range-slider" || kind === "range-slider-thumb")
    && (typeof props.id !== "string" || props.id.length === 0 || typeof props.label !== "string" || props.label.length === 0)
  ) {
    throw new TypeError(`${kind} requires non-empty id and label props.`);
  }
  const childValues: ReactNode[] = [];
  flattenChildren(props.children as ReactNode, childValues);

  let text: string | null = null;
  let children: WidgetDescriptor[] = [];
  let alertLabel: string | null = null;
  if (kind === "alert") {
    const parts = childValues.map((child) => {
      if (!isValidElement(child)) throw new TypeError("Alert requires Cell-native children.");
      return child;
    });
    const [title, descriptionOrAction, action] = parts;
    const description = descriptionOrAction?.type === AlertDescription ? descriptionOrAction : undefined;
    const button = description ? action : descriptionOrAction;
    if (parts.length < 1 || parts.length > 3 || title?.type !== AlertTitle
      || !String((title.props as TextProps).children ?? "").trim()
      || (!description && parts.length > 2)
      || (description && action && action.type !== Button)
      || (button && button.type !== Button)) {
      throw new TypeError("Alert requires one non-empty AlertTitle, optional AlertDescription, and optional Button in order.");
    }
    alertLabel = [(title.props as AlertTitleProps).children,
      description ? (description.props as AlertDescriptionProps).children : null].filter(Boolean).join(" ");
    children = describe(<Box style={{ width: "100%", flexShrink: 1 }}>
      {title}
      {description || button ? <Box style={{ direction: "row", wrap: true, gap: 1, width: "100%" }}>
        {description ? <Box style={{ maxWidth: "100%" }}>{description}</Box> : null}
        {button}
      </Box> : null}
    </Box>, recipe);
  } else if (kind === "tooltip") {
    if (childValues.length > 0) throw new TypeError("Tooltip does not accept children.");
    text = tooltipText(props.text as string);
  } else if (kind === "text") {
    if (childValues.some((child) => typeof child !== "string" && typeof child !== "number")) {
      throw new TypeError("Text children must be strings or numbers.");
    }
    text = childValues.join("");
  } else if (kind !== "text-input" && kind !== "text-area" && kind !== "combobox-input") {
    children = childValues.flatMap((child) => {
      if (!isValidElement(child)) {
        throw new TypeError(`${kind} children must be Cell UI primitives.`);
      }
      return describe(child, recipe);
    });
  }
  if (kind === "range-slider-thumb" && children.length > 0) {
    throw new TypeError("RangeSliderThumb cannot contain children.");
  }
  if (element.type === DialogFooter) {
    children.unshift(...describe(<Box style={{ flexGrow: 1 }} />, recipe));
  }

  const position = props.position as CellPoint | undefined;
  const sliderRange = resolveCellSliderRange(
    typeof props.min === "number" ? props.min : undefined,
    typeof props.max === "number" ? props.max : undefined,
    typeof props.step === "number" ? props.step : undefined
  );
  if (
    kind === "overlay"
    && !isDialog
    && (!position || !Number.isInteger(position.x) || !Number.isInteger(position.y))
  ) {
    throw new TypeError("Overlay position must use integer Cell coordinates.");
  }
  const ownsFramedSurface = element.type === Box
    || element.type === Overlay
    || element.type === Dialog
    || element.type === ScrollArea
    || element.type === TextArea;
  const controlSurface = kind === "select"
    || kind === "combobox"
    || kind === "text-input";
  const ownsSurface = ownsFramedSurface || controlSurface || kind === "tooltip" || kind === "alert";
  const defaultsToSurface = controlSurface
    || isDialog
    || kind === "overlay"
    || kind === "alert";
  const surfaceVariant = ownsSurface
      ? resolveSurfaceVariant(
          props.variant,
          (controlSurface ? recipe.defaultControlVariant : undefined)
            ?? (defaultsToSurface ? "surface" : "ghost"),
        )
      : null;
  const frame = kind === "alert"
    ? props.border === "square" || props.border === "rounded" ? "bordered" : "none"
    : isDialog || kind === "tooltip"
      ? props.border === "none" ? "none" : "bordered"
    : ownsFramedSurface || kind === "select-content" || kind === "combobox-content"
      ? resolveCellFrame(props.frame, "none")
      : "none";
  const requestedBorderShape = isDialog || kind === "tooltip" || kind === "alert" ? props.border : props.borderShape;

  return [{
    kind,
    explicitId: typeof props.id === "string" ? props.id : null,
    key: element.key === null ? null : String(element.key),
    style: {
      ...(isDialog ? { width: 36, padding: 1, gap: 1 } : {}),
      ...(kind === "alert" ? { width: "100%" as const, maxWidth: 44, paddingLeft: 3, paddingRight: 1,
        paddingTop: 1, paddingBottom: 1 } : {}),
      ...(kind === "tooltip" ? { width: tooltipTextWidth(text ?? "") + (frame === "bordered" ? 4 : 2),
        height: frame === "bordered" ? 3 : 1, paddingLeft: 1, paddingRight: 1 } : {}),
      ...(element.type === DialogFooter ? { direction: "row" as const, gap: 1 } : {}),
      ...(kind === "text-input" || kind === "combobox-input"
        ? normalizeSingleLineInputStyle(props.style as CellLayoutStyle | undefined)
        : props.style as CellLayoutStyle | undefined),
      ...(kind === "alert" ? { paddingLeft: 3 + ((props.style as CellLayoutStyle | undefined)?.paddingLeft
        ?? (props.style as CellLayoutStyle | undefined)?.padding ?? 0) } : {}),
    },
    surfaceVariant,
    frame,
    borderShape: frame === "bordered" && (requestedBorderShape === "square" || requestedBorderShape === "rounded")
      ? requestedBorderShape : null,
    text,
    textStyle: { ...(element.type === DialogTitle || element.type === AlertTitle ? { bold: true } : {}), ...(props.textStyle as CellTextStyle | undefined) },
    label: alertLabel ?? (typeof props.label === "string" ? props.label : null),
    disabled: props.disabled === true,
    focused: props.focused === true,
    selected: props.selected === true,
    active: props.active === true,
    checked: props.checked === "indeterminate" ? "indeterminate" : props.checked === true,
    pressed: props.pressed === true,
    radioValue: typeof props.value === "string" ? props.value : null,
    progress: kind === "progress" ? {
      max: progressMax,
      value: props.value === null
        ? null
        : Number.isFinite(props.value) ? Math.max(0, Math.min(props.value as number, progressMax)) : 0,
      valueText: typeof props.valueText === "string" ? props.valueText : undefined,
      number: props.number === true,
    } : null,
    progressVariant,
    spinnerVariant: kind === "spinner" ? resolveSpinnerVariant(props.variant) : "wheel",
    tooltipTargetId: kind === "tooltip" ? props.targetId as string : null,
    tabsVariant: kind === "tabs" ? resolveTabsVariant(props.variant) : "underline",
    separatorVariant: kind === "separator" ? resolveSeparatorVariant(props.variant) : "line",
    buttonVariant: kind === "button"
      ? resolveButtonVariant(props.variant, recipe.defaultControlVariant ?? "solid")
      : "solid",
    badgeTone: kind === "alert" ? resolveAlertTone(props.tone)
      : kind === "badge" || kind === "badge-action" ? resolveBadgeTone(props.tone) : "neutral",
    sliderValue: kind === "range-slider-thumb"
      ? typeof props.value === "number" ? props.value : sliderRange.min
      : normalizeCellSliderValue(
          typeof props.value === "number" ? props.value : sliderRange.min,
          sliderRange
        ),
    sliderMin: sliderRange.min,
    sliderMax: sliderRange.max,
    sliderStep: sliderRange.step,
    sliderValueText: typeof props.valueText === "string" ? props.valueText : null,
    expanded: props.expanded === true,
    hasChildren: props.hasChildren === true,
    level: Number.isInteger(props.level) ? props.level as number : null,
    parentItemId: typeof props.parentItemId === "string" ? props.parentItemId : null,
    rowIndex: Number.isInteger(props.rowIndex) ? props.rowIndex as number : null,
    columnIndex: Number.isInteger(props.columnIndex) ? props.columnIndex as number : null,
    rowCount: Number.isInteger(props.rowCount) ? props.rowCount as number : null,
    columnCount: Number.isInteger(props.columnCount) ? props.columnCount as number : null,
    positionInSet: Number.isInteger(props.positionInSet) ? props.positionInSet as number : null,
    setSize: Number.isInteger(props.setSize) ? props.setSize as number : null,
    orientation: props.orientation === "horizontal" || props.orientation === "vertical"
      ? props.orientation
      : null,
    controlsId: typeof props.controlsId === "string" ? props.controlsId : null,
    activeDescendantId: typeof props.activeDescendantId === "string" ? props.activeDescendantId : null,
    labelledById: typeof props.labelledById === "string" ? props.labelledById : null,
    textEditor: kind === "text-input" || kind === "text-area" || kind === "combobox-input"
      ? props.state as CellTextSnapshot
      : null,
    readOnly: props.readOnly === true,
    overlayPosition: kind === "overlay" ? position! : null,
    modal: kind === "overlay" && props.modal !== false,
    ...(isDialog ? { dialog: { initialFocusId: typeof props.initialFocusId === "string" ? props.initialFocusId : undefined } } : {}),
    ...(element.type === DialogTitle ? { dialogPart: "title" as const } : {}),
    ...(element.type === DialogDescription ? { dialogPart: "description" as const } : {}),
    closeOnOutsideClick: props.closeOnOutsideClick !== false,
    scrollX: Number.isFinite(props.scrollX) ? Math.max(0, Math.trunc(props.scrollX as number)) : 0,
    scrollY: Number.isFinite(props.scrollY) ? Math.max(0, Math.trunc(props.scrollY as number)) : 0,
    children,
  }];
};

export const createWidgetDescriptor = (
  value: ReactElement<RootProps> | null,
  recipe: CellUiRecipe = {},
): WidgetDescriptor | null => {
  if (value === null) return null;
  const descriptors = describe(value, recipe);
  const root = descriptors[0];
  if (descriptors.length !== 1 || root?.kind !== "root") {
    throw new TypeError("A Cell UI render must contain exactly one Root descriptor.");
  }
  return root;
};
