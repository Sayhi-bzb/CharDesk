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
  resolveButtonSize,
  resolveButtonVariant,
  type ButtonSize,
  type ButtonVariant,
} from "./button.js";
import { resolveSeparatorVariant, type SeparatorVariant } from "./separator.js";
import {
  resolveCellBlockVariant,
  type CellBlockVariant,
  type CellBorderShape,
} from "./border.js";

type CommonProps = Readonly<{
  id?: string;
  label?: string;
  disabled?: boolean;
  children?: ReactNode;
}>;

const normalizeSingleLineInputStyle = (
  style: CellLayoutStyle | undefined,
): CellSingleLineInputStyle => ({
  ...(style?.width !== undefined ? { width: style.width } : {}),
  ...(style?.minWidth !== undefined ? { minWidth: style.minWidth } : {}),
  ...(style?.maxWidth !== undefined ? { maxWidth: style.maxWidth } : {}),
  ...(style?.flexGrow !== undefined ? { flexGrow: style.flexGrow } : {}),
  ...(style?.flexShrink !== undefined ? { flexShrink: style.flexShrink } : {}),
});

type BlockAppearanceProps = Readonly<{
  variant?: CellBlockVariant;
  borderShape?: CellBorderShape;
}>;

export type RootProps = CommonProps & Readonly<{ style?: CellLayoutStyle }>;
export type BoxProps = CommonProps & BlockAppearanceProps & Readonly<{ style?: CellLayoutStyle }>;
export type AccordionProps = CommonProps & Readonly<{ style?: CellLayoutStyle }>;
export type AccordionItemProps = Omit<AccordionProps, "id"> & Readonly<{ id: string; expanded?: boolean }>;
export type AccordionTriggerProps = CommonProps & Readonly<{ focused?: boolean; style?: CellLayoutStyle; textStyle?: CellTextStyle }>;
export type AccordionContentProps = AccordionProps;
export type OverlayProps = CommonProps & BlockAppearanceProps & Readonly<{
  position: CellPoint;
  modal?: boolean;
  closeOnOutsideClick?: boolean;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type DialogProps = Omit<OverlayProps, "id" | "position"> & Readonly<{
  id: string;
  initialFocusId?: string;
}>;
export type DialogTitleProps = TextProps;
export type DialogDescriptionProps = TextProps;
export type DialogFooterProps = CommonProps & Readonly<{ style?: CellLayoutStyle }>;
export type TextProps = Readonly<{
  id?: string;
  children: string | number;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type ButtonProps = CommonProps & Readonly<{
  variant?: ButtonVariant;
  size?: ButtonSize;
  focused?: boolean;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type CheckboxProps = CommonProps & Readonly<{
  checked?: CellCheckboxState;
  focused?: boolean;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type SliderProps = Omit<CommonProps, "children"> & Readonly<{
  value: number;
  min?: number;
  max?: number;
  step?: number;
  valueText?: string;
  focused?: boolean;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type ToggleProps = CommonProps & Readonly<{
  pressed?: boolean;
  focused?: boolean;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type ProgressProps = Readonly<{
  id?: string;
  label: string;
  value: number;
  max?: number;
  valueText?: string;
  style?: CellLayoutStyle;
}>;
export type SeparatorProps = Readonly<{
  id?: string;
  orientation?: "horizontal" | "vertical";
  variant?: SeparatorVariant;
  style?: CellLayoutStyle;
}>;
export type RadioGroupProps = CommonProps & Readonly<{
  value?: string | null;
  orientation?: "horizontal" | "vertical";
  style?: CellLayoutStyle;
}>;
export type RadioItemProps = CommonProps & Readonly<{
  value: string;
  focused?: boolean;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type RangeSliderProps = Omit<CommonProps, "id" | "label" | "children"> & Readonly<{
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
export type SelectProps = CommonProps & Readonly<{ style?: CellLayoutStyle }>;
export type SelectTriggerProps = CommonProps & Readonly<{
  focused?: boolean;
  expanded?: boolean;
  controlsId?: string;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type SelectContentProps = CommonProps & BlockAppearanceProps & Readonly<{
  scrollY?: number;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type SelectItemProps = CommonProps & Readonly<{
  focused?: boolean;
  selected?: boolean;
  positionInSet?: number;
  setSize?: number;
  style?: CellLayoutStyle;
}>;
export type ComboboxProps = CommonProps & Readonly<{ style?: CellLayoutStyle }>;
export type ComboboxInputProps = TextInputProps & Readonly<{
  expanded?: boolean;
  controlsId?: string;
  activeDescendantId?: string;
}>;
export type ComboboxContentProps = SelectContentProps;
export type ComboboxItemProps = Omit<SelectItemProps, "focused"> & Readonly<{ active?: boolean }>;
export type ListProps = CommonProps & Readonly<{ style?: CellLayoutStyle }>;
export type ListItemProps = CommonProps & Readonly<{
  focused?: boolean;
  selected?: boolean;
  positionInSet?: number;
  setSize?: number;
  style?: CellLayoutStyle;
}>;
type CollectionProps = CommonProps & Readonly<{
  orientation?: "horizontal" | "vertical";
  style?: CellLayoutStyle;
}>;
type CollectionItemProps = CommonProps & Readonly<{
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
export type TabsProps = CollectionProps;
export type TabProps = CollectionItemProps & Readonly<{ controlsId?: string }>;
export type TabPanelProps = CommonProps & Readonly<{
  labelledById?: string;
  style?: CellLayoutStyle;
}>;
export type GridProps = CollectionProps & Readonly<{
  rowCount?: number;
  columnCount?: number;
}>;
export type GridRowProps = CommonProps & Readonly<{
  rowIndex: number;
  style?: CellLayoutStyle;
}>;
export type GridCellProps = CollectionItemProps & Readonly<{
  rowIndex: number;
  columnIndex: number;
}>;
export type ScrollAreaProps = CommonProps & BlockAppearanceProps & Readonly<{
  scrollX?: number;
  scrollY?: number;
  style?: CellLayoutStyle;
}>;
export type TextEditorProps = CommonProps & Readonly<{
  state: CellTextSnapshot;
  focused?: boolean;
  readOnly?: boolean;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type TextInputProps = Omit<TextEditorProps, "style"> & Readonly<{
  style?: CellSingleLineInputStyle;
}>;
export type TextAreaProps = TextEditorProps & BlockAppearanceProps;

type PrimitiveProps =
  | RootProps
  | BoxProps
  | OverlayProps
  | TextProps
  | ButtonProps
  | CheckboxProps
  | ToggleProps
  | ProgressProps
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
export const Checkbox = primitive<CheckboxProps>("checkbox");
export const Toggle = primitive<ToggleProps>("toggle");
export const Progress = primitive<ProgressProps>("progress");
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
  blockVariant: CellBlockVariant;
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
  separatorVariant: SeparatorVariant;
  buttonVariant: ButtonVariant;
  buttonSize: ButtonSize;
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

const describe = (element: ReactElement): WidgetDescriptor[] => {
  if (element.type === Fragment) {
    const fragmentChildren: ReactNode[] = [];
    flattenChildren((element.props as { children?: ReactNode }).children, fragmentChildren);
    return fragmentChildren.flatMap((child) => {
      if (!isValidElement(child)) {
        throw new TypeError("Cell UI fragments may only contain Cell UI primitives.");
      }
      return describe(child);
    });
  }

  const kind = kinds.get(element.type);
  if (!kind) {
    throw new TypeError("Cell UI only accepts Cell-native descriptors.");
  }

  const props = element.props as Record<string, unknown>;
  const isDialog = element.type === Dialog;
  if (isDialog && (typeof props.id !== "string" || !props.id.trim())) {
    throw new TypeError("Dialog requires a non-empty id.");
  }
  const progressMax = typeof props.max === "number" && Number.isFinite(props.max) && props.max > 0
    ? props.max : 100;
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
  if (kind === "text") {
    if (childValues.some((child) => typeof child !== "string" && typeof child !== "number")) {
      throw new TypeError("Text children must be strings or numbers.");
    }
    text = childValues.join("");
  } else if (kind !== "text-input" && kind !== "text-area" && kind !== "combobox-input") {
    children = childValues.flatMap((child) => {
      if (!isValidElement(child)) {
        throw new TypeError(`${kind} children must be Cell UI primitives.`);
      }
      return describe(child);
    });
  }
  if (kind === "range-slider-thumb" && children.length > 0) {
    throw new TypeError("RangeSliderThumb cannot contain children.");
  }
  if (element.type === DialogFooter) children.unshift(...describe(<Box style={{ flexGrow: 1 }} />));

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
  const ownsBlockAppearance = element.type === Box
    || element.type === Overlay
    || element.type === Dialog
    || element.type === ScrollArea
    || element.type === TextArea
    || element.type === SelectContent
    || element.type === ComboboxContent;
  const blockVariant = ownsBlockAppearance
    ? resolveCellBlockVariant(
        props.variant,
        isDialog
          ? "bordered"
          : kind === "overlay" || kind === "select-content" || kind === "combobox-content"
            ? "raised"
            : "plain",
      )
    : "plain";

  return [{
    kind,
    explicitId: typeof props.id === "string" ? props.id : null,
    key: element.key === null ? null : String(element.key),
    style: {
      ...(isDialog ? { width: 36, padding: 1, gap: 1 } : {}),
      ...(element.type === DialogFooter ? { direction: "row" as const, gap: 1 } : {}),
      ...(kind === "text-input" || kind === "combobox-input"
        ? normalizeSingleLineInputStyle(props.style as CellLayoutStyle | undefined)
        : props.style as CellLayoutStyle | undefined),
    },
    blockVariant,
    borderShape: blockVariant === "bordered"
      && (props.borderShape === "square" || props.borderShape === "rounded")
      ? props.borderShape
      : null,
    text,
    textStyle: { ...(element.type === DialogTitle ? { bold: true } : {}), ...(props.textStyle as CellTextStyle | undefined) },
    label: typeof props.label === "string" ? props.label : null,
    disabled: props.disabled === true,
    focused: props.focused === true,
    selected: props.selected === true,
    active: props.active === true,
    checked: props.checked === "indeterminate" ? "indeterminate" : props.checked === true,
    pressed: props.pressed === true,
    radioValue: typeof props.value === "string" ? props.value : null,
    progress: kind === "progress" ? {
      max: progressMax,
      value: Number.isFinite(props.value) ? Math.max(0, Math.min(props.value as number, progressMax)) : 0,
      valueText: typeof props.valueText === "string" ? props.valueText : undefined,
    } : null,
    separatorVariant: kind === "separator" ? resolveSeparatorVariant(props.variant) : "line",
    buttonVariant: kind === "button" ? resolveButtonVariant(props.variant) : "default",
    buttonSize: kind === "button" ? resolveButtonSize(props.size) : "default",
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
  value: ReactElement<RootProps> | null
): WidgetDescriptor | null => {
  if (value === null) return null;
  const descriptors = describe(value);
  const root = descriptors[0];
  if (descriptors.length !== 1 || root?.kind !== "root") {
    throw new TypeError("A Cell UI render must contain exactly one Root descriptor.");
  }
  return root;
};
