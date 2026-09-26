/* eslint-disable react-refresh/only-export-components -- Cell UI descriptors are inert component factories. */
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
import { getTextCellWidth } from "@chardesk/protocol";
import { marked, type Token, type Tokens } from "marked";
import { normalizeCellSliderValue, resolveCellSliderRange } from "./slider.js";
import {
  resolveButtonVariant,
  type ButtonVariant,
} from "./button.js";
import { resolveSurfaceVariant, type SurfaceVariant } from "./surface-variant.js";
import {
  presentedBorderShape,
  presentedButtonVariant,
  presentedFrame,
  presentedProgressVariant,
  presentedTableVariant,
  presentedTabsVariant,
  type CellUiPresentation,
} from "./presentation.js";
import type { CellUiRecipe } from "./recipe.js";
import { resolveBadgeTone, type BadgeTone } from "./badge.js";
import { resolveAlertTone, type AlertTone } from "./alert.js";
import { resolveSeparatorVariant, type SeparatorVariant } from "./separator.js";
import { resolveProgressVariant, type ProgressVariant } from "./progress.js";
import { resolveSpinnerVariant, type SpinnerVariant } from "./spinner.js";
import { tooltipText, tooltipTextWidth } from "./tooltip.js";
import { parseCellMarkdownCodeBlocks, safeMarkdownHref, type MarkdownCodeBlock } from "./markdown.js";
import { highlightMarkdownCode, type MarkdownCodeRole } from "./markdown-code.js";
import { resolveTabsVariant, type TabsVariant } from "./tabs.js";
import { fitTableCell, resolveTableVariant, tableWidth, type TableColumn, type TableVariant } from "./table.js";
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
export type BoxProps = ContainerProps & SurfaceAppearanceProps & Readonly<{
  probeId?: string;
  probeLabel?: string;
  style?: CellLayoutStyle;
  presentation?: CellUiPresentation;
  overlayScope?: boolean;
}>;
export type AlertProps = IdentityProps & ChildrenProps & Readonly<{
  tone?: AlertTone;
  variant?: SurfaceVariant;
  border?: "none" | CellBorderShape;
  style?: CellLayoutStyle;
}>;
export type AlertTitleProps = TextProps;
export type AlertDescriptionProps = TextProps;
export type ToastProps = IdentityProps & ChildrenProps & SurfaceAppearanceProps & Readonly<{
  tone?: BadgeTone;
  style?: CellLayoutStyle;
}>;
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
export type AlertDialogProps = Omit<DialogProps, "modal" | "closeOnOutsideClick" | "initialFocusId"> & Readonly<{
  initialFocusId: string;
}>;
export type DialogTitleProps = TextProps;
export type DialogDescriptionProps = TextProps;
export type DialogFooterProps = ContainerProps & Readonly<{ style?: CellLayoutStyle }>;
export type TextProps = Readonly<{
  id?: string;
  children: string | number;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
  /** Internal Markdown projection metadata. */
  markdownCode?: boolean;
  markdownTone?: MarkdownTone;
  markdownSource?: boolean;
  markdownLayoutOnly?: boolean;
}>;
export type MarkdownProps = Readonly<{
  id?: string;
  source: string;
  style?: CellLayoutStyle;
  renderCodeBlock?: (block: MarkdownCodeBlock) => ReactElement;
  highlightCodeLine?: (line: string, lineIndex: number) => readonly MarkdownCodeToken[] | undefined;
}>;
export type MarkdownCodeToken = Readonly<{ content: string; color?: string }>;
type MarkdownTone = "accent" | "link" | "quote" | "muted" | MarkdownCodeRole;
type MarkdownBlockProps = Readonly<{
  children?: ReactNode;
  role: "heading" | "paragraph" | "blockquote" | "list" | "listitem" | "code" | "table" | "row" | "cell";
  label?: string;
  level?: number;
  style?: CellLayoutStyle;
  markdownCenteredText?: string;
  markdownTone?: MarkdownTone;
}>;
type MarkdownLinkProps = Readonly<{
  children: string;
  href: string;
  textStyle?: CellTextStyle;
  markdownCode?: boolean;
  markdownTone?: MarkdownTone;
  markdownSource?: boolean;
}>;
export type LinkProps = Readonly<{
  id?: string;
  children: string;
  href: string;
  label?: string;
  current?: "page" | "location";
  target?: "_blank";
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type ButtonProps = NamedContainerProps & Readonly<{
  variant?: ButtonVariant;
  tone?: "danger";
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
  placeholder?: string;
  focused?: boolean;
  expanded?: boolean;
  controlsId?: string;
  style?: CellLayoutStyle;
  textStyle?: CellTextStyle;
}>;
export type SelectContentProps = NamedContainerProps & Readonly<{
  open?: boolean;
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
export type ComboboxItemProps = Omit<SelectItemProps, "focused"> & Readonly<{ active?: boolean; hidden?: boolean }>;
export type ListProps = NamedContainerProps & Readonly<{ style?: CellLayoutStyle; reorderable?: boolean }>;
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
export type TableProps = IdentityProps & Readonly<{ label: string; columns: readonly TableColumn[]; variant?: TableVariant; children?: ReactNode }>;
export type TableRowProps = IdentityProps & ChildrenProps;
export type TableCellProps = IdentityProps & Readonly<{ children: string | number | ReactElement<TextProps> }>;
type TablePartProps = IdentityProps & NamedProps & ChildrenProps & Readonly<{ style?: CellLayoutStyle; rowIndex?: number; columnIndex?: number; rowCount?: number; columnCount?: number; frame?: CellFrame; borderShape?: CellBorderShape; variant?: SurfaceVariant; textStyle?: CellTextStyle }>;
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
export type FieldProps = Readonly<{
  id: string;
  label: string;
  error?: string;
  style?: CellLayoutStyle;
  children: ReactElement<TextInputProps | TextAreaProps | SelectProps | ComboboxProps>;
}>;

type PrimitiveProps =
  | RootProps
  | BoxProps
  | AlertProps
  | ToastProps
  | OverlayProps
  | TextProps
  | MarkdownBlockProps
  | MarkdownLinkProps
  | LinkProps
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
  | TablePartProps
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
export const Toast = primitive<ToastProps>("toast");
export const AlertTitle = primitive<AlertTitleProps>("text");
export const AlertDescription = primitive<AlertDescriptionProps>("text");
export const Accordion = primitive<AccordionProps>("accordion");
export const AccordionItem = primitive<AccordionItemProps>("accordion-item");
export const AccordionTrigger = primitive<AccordionTriggerProps>("accordion-trigger");
export const AccordionContent = primitive<AccordionContentProps>("accordion-content");
export const Overlay = primitive<OverlayProps>("overlay");
export const Dialog = primitive<DialogProps>("overlay");
export const AlertDialog = primitive<AlertDialogProps>("overlay");
export const DialogTitle = primitive<DialogTitleProps>("text");
export const DialogDescription = primitive<DialogDescriptionProps>("text");
export const DialogFooter = primitive<DialogFooterProps>("box");
export const Text = primitive<TextProps>("text");
export const Markdown = (() => null) as ComponentType<MarkdownProps>;
Markdown.displayName = "CellMarkdown";
const MarkdownBlock = primitive<MarkdownBlockProps>("markdown-block");
const MarkdownLink = primitive<MarkdownLinkProps>("markdown-link");
export const Link = primitive<LinkProps>("markdown-link");
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
export const Table = (() => null) as ComponentType<TableProps>;
export const TableRow = (() => null) as ComponentType<TableRowProps>;
export const TableCell = (() => null) as ComponentType<TableCellProps>;
Table.displayName = "CellTable";
TableRow.displayName = "CellTableRow";
TableCell.displayName = "CellTableCell";
const TableHeader = primitive<TablePartProps>("table-header");
const TableDivider = primitive<TablePartProps>("table-divider");
const TableDataRow = primitive<TablePartProps>("table-row");
const TableHead = primitive<TablePartProps>("table-head");
const TableDataCell = primitive<TablePartProps>("table-cell");
const TablePart = primitive<TablePartProps>("table");
export const ScrollArea = primitive<ScrollAreaProps>("scroll-area");
export const TextInput = primitive<TextInputProps>("text-input");
export const TextArea = primitive<TextAreaProps>("text-area");
export const Field = (() => null) as ComponentType<FieldProps>;
Field.displayName = "CellField";

export type WidgetDescriptor = Readonly<{
  kind: WidgetKind;
  explicitId: string | null;
  key: string | null;
  style: CellLayoutStyle;
  presentation: CellUiPresentation;
  overlayScope: boolean;
  probeId: string | null;
  surfaceVariant: SurfaceVariant | null;
  frame: CellFrame;
  borderShape: CellBorderShape | null;
  text: string | null;
  placeholder: string | null;
  href: string | null;
  current?: "page" | "location";
  target?: "_blank";
  markdownRole: MarkdownBlockProps["role"] | null;
  markdownCode: boolean;
  markdownTone: MarkdownTone | null;
  markdownSource: boolean;
  markdownLayoutOnly: boolean;
  markdownCenteredText: string | null;
  /** Built-in trailing content guard that a ScrollArea rail may occupy. */
  sharedScrollGuard: boolean;
  textStyle: CellTextStyle;
  label: string | null;
  disabled: boolean;
  focused: boolean;
  selected: boolean;
  reorderable: boolean;
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
  buttonTone: "neutral" | "danger";
  badgeTone: BadgeTone;
  invalid: boolean;
  describedById?: string;
  sliderValue: number;
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  sliderValueText: string | null;
  expanded: boolean;
  hidden: boolean;
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
  dialog?: Readonly<{ initialFocusId?: string; role?: "alertdialog" }>;
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

type MarkdownInlineStyle = Readonly<{
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  tone?: MarkdownTone;
}>;

const markdownInlineText = (tokens: readonly Token[]): string => tokens.map((token) => {
  if (token.type === "image") return "[Image: " + (token.text || "untitled") + "]";
  if (token.type === "br") return " ";
  if (token.type === "html") return "[HTML omitted]";
  if ("tokens" in token && Array.isArray(token.tokens)) return markdownInlineText(token.tokens);
  return "text" in token && typeof token.text === "string" ? token.text : "";
}).join("");

const markdownInlineNodes = (
  tokens: readonly Token[],
  style: MarkdownInlineStyle = {},
  keyPrefix = "",
): ReactNode[] => tokens.flatMap((token, index) => {
  const key = keyPrefix + index;
  if (token.type === "strong" || token.type === "em" || token.type === "del") {
    return markdownInlineNodes(token.tokens ?? [], {
      ...style,
      ...(token.type === "strong" ? { bold: true } : token.type === "em" ? { italic: true } : { strike: true }),
    }, key + "-");
  }
  if (token.type === "link" || token.type === "image") {
    const label = token.type === "image" ? "[Image: " + (token.text || "untitled") + "]" : token.text;
    const href = safeMarkdownHref(token.href);
    if (href) return [<MarkdownLink key={key} href={href}
      textStyle={{ bold: style.bold, italic: style.italic, strike: style.strike, underline: true }}
      markdownTone="link">{label}</MarkdownLink>];
    return [<Text key={key} textStyle={{ bold: style.bold, italic: style.italic, strike: style.strike }}>{label}</Text>];
  }
  if (token.type === "codespan") {
    return [<Text key={key} markdownCode markdownTone={style.tone}
      textStyle={{ bold: style.bold, italic: style.italic, strike: style.strike }}>{token.text}</Text>];
  }
  if (token.type === "text" && token.tokens?.length) return markdownInlineNodes(token.tokens, style, key + "-");
  const text = token.type === "br" ? " " : token.type === "html" ? "[HTML omitted]"
    : "text" in token && typeof token.text === "string" ? token.text.replace(/\n/gu, " ") : "";
  if (!text) return [];
  return text.split(/(\s+)/u).filter(Boolean).map((piece, pieceIndex) =>
    <Text key={key + "-" + pieceIndex} markdownTone={style.tone}
      textStyle={{ bold: style.bold, italic: style.italic, strike: style.strike }}>{piece}</Text>);
});

const markdownColumnWidths = (table: Tokens.Table): number[] =>
  table.header.map((_, index) => Math.max(1, ...[table.header, ...table.rows].map((row) =>
    getTextCellWidth(markdownInlineText(row[index]?.tokens ?? [])))));

const markdownTableWidth = (table: Tokens.Table): number =>
  markdownColumnWidths(table).reduce((sum, width) => sum + width, 0)
  + Math.max(0, table.header.length - 1) * 3;

const markdownTable = (table: Tokens.Table, key: string): ReactNode => {
  const rows = [table.header, ...table.rows];
  const widths = markdownColumnWidths(table);
  const total = markdownTableWidth(table);
  return <MarkdownBlock key={key} role="table" style={{ width: "100%", minWidth: total }}>
    {rows.map((row, rowIndex) => <Fragment key={rowIndex}>
      <MarkdownBlock role="row" style={{ direction: "row", width: total, flexShrink: 0 }}>
      {row.flatMap((cell, column) => {
        const width = widths[column]!;
        const missing = Math.max(0, width - getTextCellWidth(markdownInlineText(cell.tokens)));
        const align = table.align[column];
        const before = align === "right" ? missing : align === "center" ? Math.floor(missing / 2) : 0;
        return [column ? <Text key={`divider-${column}`} markdownTone="muted">{" │ "}</Text> : null,
          <MarkdownBlock key={column} role="cell"
          style={{ direction: "row", width, flexShrink: 0 }}>
          {before ? <Text>{" ".repeat(before)}</Text> : null}
          {markdownInlineNodes(cell.tokens, rowIndex === 0 ? { bold: true } : {})}
        </MarkdownBlock>];
      })}
      </MarkdownBlock>
      {rowIndex === 0 ? <Box style={{ direction: "row", width: total, height: 1, flexShrink: 0 }}>
        <Text markdownTone="muted">{widths.map((width) => "─".repeat(width)).join("─┼─")}</Text>
      </Box> : null}
    </Fragment>)}
  </MarkdownBlock>;
};

const markdownBlocks = (
  tokens: readonly Token[],
  codeBlocks: readonly MarkdownCodeBlock[] = [],
  renderCodeBlock?: MarkdownProps["renderCodeBlock"],
  highlightCodeLine?: MarkdownProps["highlightCodeLine"],
  sharedScrollGuard = false,
): ReactNode[] => {
  let codeIndex = 0;
  return tokens.flatMap((token, index): ReactNode[] => {
    const key = String(index);
    if (token.type === "space" || token.type === "def") return [];
    if (token.type === "heading") return [<MarkdownBlock key={key} role="heading" level={token.depth}
      label={markdownInlineText(token.tokens ?? []).replace(/\s+/gu, " ").trim()}
      style={{ direction: "row", wrap: true, width: "100%", flexShrink: 0 }}>
      <Text markdownTone="accent">{"#".repeat(token.depth) + " "}</Text>
      {markdownInlineNodes(token.tokens ?? [], { bold: true, tone: "accent" })}
    </MarkdownBlock>];
    if (token.type === "paragraph" || token.type === "text") return [<MarkdownBlock key={key} role="paragraph"
      style={{ direction: "row", wrap: true, width: "100%", flexShrink: 0 }}>
      {markdownInlineNodes(token.tokens ?? marked.Lexer.lexInline(token.text, { gfm: true }), {})}
    </MarkdownBlock>];
    if (token.type === "code") {
      const code = token as Tokens.Code;
      const slot = codeBlocks[codeIndex++];
      if (slot && renderCodeBlock) return [renderCodeBlock(slot)];
      const lines = code.text.split("\n");
      const width = Math.max(1, ...lines.map(getTextCellWidth));
      const syntax = highlightMarkdownCode(code.text, code.lang);
      return [<Box key={key} variant="surface" frame="none" style={{ width: "100%", padding: 1,
        ...(sharedScrollGuard ? { paddingRight: 0, paddingBottom: 0 } : {}) }}>
        {lines.map((line, lineIndex) => {
          const highlighted = highlightCodeLine?.(line, lineIndex);
          const parts = highlighted?.map(({ content }) => content).join("") === line ? highlighted : undefined;
          return <MarkdownBlock key={lineIndex} role="code"
            style={{ direction: "row", width, flexShrink: 0 }}>
            {parts?.length ? parts.map(({ content, color }, partIndex) =>
              <Text key={partIndex} textStyle={color ? { color } : undefined}>{content}</Text>)
              : syntax?.[lineIndex]?.length ? syntax[lineIndex]!.map(({ content, role }, partIndex) =>
                <Text key={partIndex} markdownTone={role}>{content}</Text>)
              : <Text>{line || " "}</Text>}
          </MarkdownBlock>;
        })}
      </Box>];
    }
    if (token.type === "hr") return [<MarkdownBlock key={key} role="paragraph"
      markdownCenteredText="/////" markdownTone="muted"
      style={{ width: "100%", height: 1, flexShrink: 0 }} />];
    if (token.type === "blockquote") return [<MarkdownBlock key={key} role="blockquote"
      style={{ direction: "row", width: "100%", flexShrink: 0 }}>
      <Text markdownTone="quote">{"│ "}</Text>
      <Box style={{ flexGrow: 1, flexShrink: 1, gap: 1 }}>{markdownBlocks(token.tokens ?? [])}</Box>
    </MarkdownBlock>];
    if (token.type === "list") {
      const list = token as Tokens.List;
      return [<MarkdownBlock key={key} role="list" style={{ width: "100%" }}>
      {list.items.map((item, itemIndex) => {
        const marker = item.task ? item.checked ? "☑ " : "☐ "
          : list.ordered ? String((Number(list.start) || 1) + itemIndex) + ". " : "• ";
        return <MarkdownBlock key={itemIndex} role="listitem" style={{ direction: "row", width: "100%" }}>
          <Text markdownTone="muted">{marker}</Text>
          <Box style={{ flexGrow: 1, flexShrink: 1 }}>{markdownBlocks(item.tokens)}</Box>
        </MarkdownBlock>;
      })}
    </MarkdownBlock>];
    }
    if (token.type === "table") return [markdownTable(token as Tokens.Table, key)];
    if (token.type === "html") return [<MarkdownBlock key={key} role="paragraph"
      style={{ width: "100%" }}><Text markdownTone="muted">[HTML omitted]</Text></MarkdownBlock>];
    return [];
  });
};

const markdownFixedWidth = (tokens: readonly Token[], skipCodeBlocks: boolean, sharedScrollGuard = false): number => Math.max(0, ...tokens.map((token) =>
  token.type === "code" && !skipCodeBlocks ? Math.max(1, ...(token as Tokens.Code).text.split("\n").map(getTextCellWidth)) + (sharedScrollGuard ? 1 : 2)
    : token.type === "table" ? markdownTableWidth(token as Tokens.Table) : 0));
const hasSharedScrollGuard = (node: WidgetDescriptor): boolean => node.kind !== "scroll-area"
  && (node.sharedScrollGuard || node.children.some(hasSharedScrollGuard));
const describe = (element: ReactElement, recipe: CellUiRecipe, inheritedPresentation: CellUiPresentation,
  inScrollArea = false): WidgetDescriptor[] => {
  const presentation = element.type === Box
    ? (element.props as BoxProps).presentation ?? inheritedPresentation : inheritedPresentation;
  const textMode = presentation === "text";
  if (element.type === Fragment) {
    const fragmentChildren: ReactNode[] = [];
    flattenChildren((element.props as { children?: ReactNode }).children, fragmentChildren);
    return fragmentChildren.flatMap((child) => {
      if (!isValidElement(child)) {
        throw new TypeError("Cell UI fragments may only contain Cell UI primitives.");
      }
      return describe(child, recipe, presentation, inScrollArea);
    });
  }

  if (element.type === Markdown) {
    const props = element.props as MarkdownProps;
    const tokens = marked.lexer(props.source, { gfm: true });
    const codeBlocks = props.renderCodeBlock ? parseCellMarkdownCodeBlocks(props.source) : [];
    const sharedScrollGuard = inScrollArea && !props.renderCodeBlock
      && tokens.filter((token) => token.type !== "space").length === 1
      && tokens.some((token) => token.type === "code");
    const fixedWidth = markdownFixedWidth(tokens, !!props.renderCodeBlock, sharedScrollGuard);
    const descriptors = describe(<Box id={props.id} style={{ width: "100%", minWidth: fixedWidth || undefined,
      gap: 1, ...props.style }}>
      {markdownBlocks(tokens, codeBlocks, props.renderCodeBlock, props.highlightCodeLine, sharedScrollGuard)}
    </Box>, recipe, presentation, inScrollArea);
    return sharedScrollGuard ? descriptors.map((node) => ({ ...node, sharedScrollGuard })) : descriptors;
  }

  const primitiveKind = kinds.get(element.type);
  const props = element.props as Record<string, unknown>;
  if (element.type === Field) {
    const field = props as FieldProps;
    if (!field.id?.trim() || !field.label?.trim() || !isValidElement(field.children)) {
      throw new TypeError("Field requires a non-empty id, label, and one input control.");
    }
    const expected = field.children.type === TextInput || field.children.type === TextArea
      ? field.children.type === TextInput ? "text-input" : "text-area"
      : field.children.type === Select ? "select-trigger"
      : field.children.type === Combobox ? "combobox-input" : null;
    if (!expected) throw new TypeError("Field accepts TextInput, TextArea, Select, or Combobox.");
    const error = field.error?.trim() ? field.error : "";
    const errorId = `${field.id}-error`;
    const input = describe(field.children, recipe, presentation);
    let matched = 0;
    const mark = (node: WidgetDescriptor): WidgetDescriptor => {
      if (node.kind === expected) {
        matched += 1;
        return { ...node, label: field.label, invalid: !!error,
          ...(error ? { describedById: errorId } : {}) };
      }
      return { ...node, children: node.children.map(mark) };
    };
    const marked = input.map(mark);
    if (matched !== 1) throw new TypeError(`Field requires exactly one ${expected} control.`);
    const [box] = describe(<Box id={field.id} style={{ width: "100%", gap: 0, ...field.style }}>
      <Text>{field.label}</Text>
    </Box>, recipe, presentation);
    const errorNode = error ? describe(<Text id={errorId}>{`! ${error}`}</Text>, recipe, presentation)
      .map((node) => ({ ...node, invalid: true })) : [];
    return [{ ...box!, children: [...box!.children, ...marked, ...errorNode] }];
  }
  if (element.type === Table) {
    const { columns, label } = props as TableProps;
    const variant = presentedTableVariant(presentation, resolveTableVariant(props.variant));
    const minimumColumnWidth = textMode || variant !== "outline" ? 1 : 3;
    if (!Array.isArray(columns) || columns.length === 0 || columns.some((column) =>
      typeof column.label !== "string" || !Number.isInteger(column.width) || column.width < minimumColumnWidth
    ) || typeof label !== "string" || !label.trim()) {
      throw new TypeError("Table requires a label and columns with positive integer Cell widths (at least 3 for outline).");
    }
    const displayColumns = textMode
      ? columns.map((column) => ({ ...column, width: Math.max(3, column.width) }))
      : columns;
    const rows: ReactNode[] = [];
    flattenChildren(props.children as ReactNode, rows);
    const gap = variant === "outline" ? 1 : 2;
    const width = tableWidth(displayColumns, variant);
    const surfaceInset = variant === "surface" ? { paddingLeft: 1, paddingRight: 1 } : {};
    const innerWidth = width - (variant === "outline" ? 2 : 0);
    const rowStyle = { direction: "row" as const, gap, width, height: 1, flexShrink: 0, ...surfaceInset };
    const header = <TableHeader rowIndex={1} style={rowStyle}>
      {displayColumns.map((column, index) => <TableHead key={index} label={column.label} columnIndex={index + 1}
        style={{ width: column.width, height: 1, flexShrink: 0 }} textStyle={{ bold: true }}>{fitTableCell(column.label, { ...column, align: "left" }, variant)}</TableHead>)}
    </TableHeader>;
    const dataRows = rows.map((row, rowIndex) => {
      if (!isValidElement(row) || row.type !== TableRow) throw new TypeError("Table children must be TableRow elements.");
      const rowProps = row.props as TableRowProps;
      const cells: ReactNode[] = [];
      flattenChildren(rowProps.children, cells);
      if (cells.length !== displayColumns.length) throw new TypeError("Each TableRow needs exactly one TableCell per column.");
      return <TableDataRow key={row.key ?? rowIndex} id={rowProps.id} rowIndex={rowIndex + 2}
        style={rowStyle}>
        {cells.map((cell, index) => {
          if (!isValidElement(cell) || cell.type !== TableCell) throw new TypeError("TableRow children must be TableCell elements.");
          const cellProps = cell.props as TableCellProps;
          const content = isValidElement(cellProps.children)
            ? cellProps.children.type === Text ? (cellProps.children.props as TextProps).children : null
            : cellProps.children;
          if (typeof content !== "string" && typeof content !== "number") throw new TypeError("TableCell content must be text or one Text element.");
          const raw = String(content);
          return <TableDataCell key={cell.key ?? index} id={cellProps.id} label={raw} columnIndex={index + 1}
            style={{ width: displayColumns[index]!.width, height: 1, flexShrink: 0 }}
            textStyle={isValidElement(cellProps.children) ? (cellProps.children.props as TextProps).textStyle : undefined}>
            {fitTableCell(raw, displayColumns[index]!, variant)}
          </TableDataCell>;
        })}
      </TableDataRow>;
    });
    return describe(<TablePart key={element.key} id={props.id as string | undefined} label={label}
      rowCount={dataRows.length + 1} columnCount={displayColumns.length}
      variant={variant === "surface" ? "surface" : undefined}
      frame={variant === "outline" ? "bordered" : "none"} borderShape="square"
      style={{ width, direction: "column", flexShrink: 0 }}>
      {header}{variant === "surface" ? null : <TableDivider style={{ width: innerWidth, height: 1, flexShrink: 0 }} />}{dataRows}
    </TablePart>, recipe, presentation);
  }
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
    </RangeSlider>, recipe, presentation);
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
  const isAlertDialog = element.type === AlertDialog;
  const isDialog = element.type === Dialog || isAlertDialog;
  if (isDialog && (typeof props.id !== "string" || !props.id.trim())) {
    throw new TypeError("Dialog requires a non-empty id.");
  }
  const progressMax = typeof props.max === "number" && Number.isFinite(props.max) && props.max > 0
    ? props.max : 100;
  const progressVariant = kind === "progress"
    ? presentedProgressVariant(presentation, resolveProgressVariant(props.variant)) : "solid";
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
    </Box>, recipe, presentation);
  } else if (kind === "tooltip") {
    if (childValues.length > 0) throw new TypeError("Tooltip does not accept children.");
    text = tooltipText(props.text as string);
  } else if (kind === "text" || kind === "markdown-link" || kind === "table-head" || kind === "table-cell") {
    if (childValues.some((child) => typeof child !== "string" && typeof child !== "number")) {
      throw new TypeError("Text children must be strings or numbers.");
    }
    text = childValues.join("");
  } else if (kind !== "text-input" && kind !== "text-area" && kind !== "combobox-input") {
    children = childValues.flatMap((child) => {
      if (!isValidElement(child)) {
        throw new TypeError(`${kind} children must be Cell UI primitives.`);
      }
      return describe(child, recipe, presentation, inScrollArea || kind === "scroll-area");
    });
  }
  if (kind === "range-slider-thumb" && children.length > 0) {
    throw new TypeError("RangeSliderThumb cannot contain children.");
  }
  if (element.type === DialogFooter) {
    children.unshift(...describe(<Box style={{ flexGrow: 1 }} />, recipe, presentation));
  }
  if (element.type === Link && (typeof props.href !== "string" || !safeMarkdownHref(props.href))) {
    throw new TypeError("Link requires a safe non-empty href.");
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
    || element.type === Toast
    || element.type === Overlay
    || element.type === Dialog
    || element.type === ScrollArea
    || element.type === TextArea;
  const controlSurface = kind === "select"
    || kind === "combobox"
    || kind === "text-input";
  const ownsSurface = ownsFramedSurface || controlSurface || kind === "tooltip" || kind === "alert"
    || (kind === "table" && props.variant === "surface");
  const defaultsToSurface = controlSurface
    || isDialog
    || kind === "overlay"
    || kind === "alert"
    || kind === "toast"
    || kind === "text-area";
  const surfaceVariant = ownsSurface
    ? resolveSurfaceVariant(
          props.variant,
          (controlSurface ? recipe.defaultControlVariant : undefined)
            ?? (defaultsToSurface ? "surface" : "ghost"),
        )
      : null;
  const requestedFrame = kind === "table" ? resolveCellFrame(props.frame, "none") : kind === "alert"
    ? props.border === "square" || props.border === "rounded" ? "bordered" : "none"
    : isDialog || kind === "tooltip"
      ? props.border === "none" ? "none" : "bordered"
    : ownsFramedSurface || kind === "select-content" || kind === "combobox-content"
      ? resolveCellFrame(props.frame, kind === "toast" ? "bordered" : "none")
      : "none";
  const frame = presentedFrame(presentation, kind, surfaceVariant, requestedFrame, isDialog);
  const requestedBorderShape = isDialog || kind === "tooltip" || kind === "alert" ? props.border : props.borderShape;

  return [{
    kind,
    explicitId: typeof props.id === "string" ? props.id : null,
    key: element.key === null ? null : String(element.key),
    style: {
      ...(isDialog ? { width: 36, padding: 1, gap: 1 } : {}),
      ...(kind === "alert" ? { width: "100%" as const, maxWidth: 44, paddingLeft: 3, paddingRight: 1,
        paddingTop: frame === "bordered" ? 0 : 1, paddingBottom: frame === "bordered" ? 0 : 1 } : {}),
      ...(kind === "toast" ? { width: "100%" as const, paddingLeft: resolveBadgeTone(props.tone) === "neutral" ? 1 : 3,
        paddingRight: 1 } : {}),
      ...(kind === "tooltip" ? { width: tooltipTextWidth(text ?? "") + (frame === "bordered" ? 4 : 2),
        height: frame === "bordered" ? 3 : 1, paddingLeft: 1, paddingRight: 1 } : {}),
      ...(element.type === DialogFooter ? { direction: "row" as const, gap: 1 } : {}),
      ...(kind === "text-input" || kind === "combobox-input"
        ? normalizeSingleLineInputStyle(props.style as CellLayoutStyle | undefined)
        : props.style as CellLayoutStyle | undefined),
      ...(kind === "alert" ? { paddingLeft: 3 + ((props.style as CellLayoutStyle | undefined)?.paddingLeft
        ?? (props.style as CellLayoutStyle | undefined)?.padding ?? 0) } : {}),
      ...(kind === "toast" ? { paddingLeft: (resolveBadgeTone(props.tone) === "neutral" ? 1 : 3)
        + ((props.style as CellLayoutStyle | undefined)?.paddingLeft
          ?? (props.style as CellLayoutStyle | undefined)?.padding ?? 0) } : {}),
    },
    presentation,
    overlayScope: element.type === Box && props.overlayScope === true,
    probeId: element.type === Box && typeof props.probeId === "string" ? props.probeId : null,
    surfaceVariant,
    frame,
    borderShape: presentedBorderShape(presentation, frame, requestedBorderShape),
    text,
    placeholder: kind === "select-trigger" && typeof props.placeholder === "string" ? props.placeholder : null,
    href: kind === "markdown-link" ? props.href as string : null,
    ...(element.type === Link && props.current ? { current: props.current as LinkProps["current"] } : {}),
    ...(element.type === Link && props.target ? { target: props.target as LinkProps["target"] } : {}),
    markdownRole: kind === "markdown-block" ? props.role as MarkdownBlockProps["role"] : null,
    markdownCode: props.markdownCode === true,
    markdownTone: typeof props.markdownTone === "string" ? props.markdownTone as MarkdownTone : null,
    markdownSource: props.markdownSource === true,
    markdownLayoutOnly: props.markdownLayoutOnly === true,
    markdownCenteredText: kind === "markdown-block" && typeof props.markdownCenteredText === "string"
      ? props.markdownCenteredText : null,
    sharedScrollGuard: kind === "scroll-area" && children.some(hasSharedScrollGuard),
    textStyle: { ...(element.type === DialogTitle || element.type === AlertTitle ? { bold: true } : {}), ...(props.textStyle as CellTextStyle | undefined) },
    label: alertLabel ?? (typeof props.label === "string" ? props.label
      : element.type === Box && typeof props.probeLabel === "string" ? props.probeLabel : null),
    disabled: props.disabled === true,
    invalid: false,
    focused: props.focused === true,
    selected: props.selected === true,
    reorderable: kind === "list" && props.reorderable === true,
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
    tabsVariant: kind === "tabs"
      ? presentedTabsVariant(presentation, resolveTabsVariant(props.variant)) : "underline",
    separatorVariant: kind === "separator" ? resolveSeparatorVariant(props.variant) : "line",
    buttonVariant: kind === "button"
      ? presentedButtonVariant(presentation, resolveButtonVariant(props.variant, recipe.defaultControlVariant ?? "solid")) : "solid",
    buttonTone: kind === "button" && props.tone === "danger" ? "danger" : "neutral",
    badgeTone: kind === "alert" ? resolveAlertTone(props.tone)
      : kind === "badge" || kind === "badge-action" || kind === "toast" ? resolveBadgeTone(props.tone) : "neutral",
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
    expanded: kind === "select-content" || kind === "combobox-content"
      ? props.open !== false : props.expanded === true,
    hidden: kind === "combobox-item" && props.hidden === true,
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
    modal: kind === "overlay" && (isAlertDialog || props.modal !== false),
    ...(isDialog ? { dialog: {
      initialFocusId: typeof props.initialFocusId === "string" ? props.initialFocusId : undefined,
      ...(isAlertDialog ? { role: "alertdialog" as const } : {}),
    } } : {}),
    ...(element.type === DialogTitle ? { dialogPart: "title" as const } : {}),
    ...(element.type === DialogDescription ? { dialogPart: "description" as const } : {}),
    closeOnOutsideClick: !isAlertDialog && props.closeOnOutsideClick !== false,
    scrollX: Number.isFinite(props.scrollX) ? Math.max(0, Math.trunc(props.scrollX as number)) : 0,
    scrollY: Number.isFinite(props.scrollY) ? Math.max(0, Math.trunc(props.scrollY as number)) : 0,
    children,
  }];
};

export const createWidgetDescriptor = (
  value: ReactElement<RootProps> | null,
  recipe: CellUiRecipe = {},
  presentation: CellUiPresentation = "rich",
): WidgetDescriptor | null => {
  if (value === null) return null;
  const descriptors = describe(value, recipe, presentation);
  const root = descriptors[0];
  if (descriptors.length !== 1 || root?.kind !== "root") {
    throw new TypeError("A Cell UI render must contain exactly one Root descriptor.");
  }
  return root;
};
