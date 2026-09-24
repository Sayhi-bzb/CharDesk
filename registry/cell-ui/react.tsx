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
import { parseCellMarkdown, type MarkdownSourceLine, type MarkdownInline } from "./markdown.js";
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
  /** Internal Markdown projection metadata. */
  markdownCode?: boolean;
  markdownTone?: MarkdownInline["tone"];
  markdownSource?: boolean;
  markdownLayoutOnly?: boolean;
}>;
export type MarkdownProps = Readonly<{
  id?: string;
  source: string;
  style?: CellLayoutStyle;
}>;
type MarkdownBlockProps = Readonly<{
  children?: ReactNode;
  role: "heading" | "paragraph" | "blockquote" | "list" | "listitem" | "code" | "table" | "row" | "cell";
  level?: number;
  style?: CellLayoutStyle;
  markdownCenteredText?: string;
  markdownTone?: MarkdownInline["tone"];
}>;
type MarkdownLinkProps = Readonly<{
  children: string;
  href: string;
  textStyle?: CellTextStyle;
  markdownCode?: boolean;
  markdownTone?: MarkdownInline["tone"];
  markdownSource?: boolean;
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
  | OverlayProps
  | TextProps
  | MarkdownBlockProps
  | MarkdownLinkProps
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
export const Markdown = (() => null) as ComponentType<MarkdownProps>;
Markdown.displayName = "CellMarkdown";
const MarkdownBlock = primitive<MarkdownBlockProps>("markdown-block");
const MarkdownLink = primitive<MarkdownLinkProps>("markdown-link");
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
  surfaceVariant: SurfaceVariant | null;
  frame: CellFrame;
  borderShape: CellBorderShape | null;
  text: string | null;
  href: string | null;
  markdownRole: MarkdownBlockProps["role"] | null;
  markdownCode: boolean;
  markdownTone: NonNullable<MarkdownInline["tone"]> | null;
  markdownSource: boolean;
  markdownLayoutOnly: boolean;
  markdownCenteredText: string | null;
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

const markdownInlineNodes = (
  content: readonly MarkdownInline[],
  keyPrefix = "",
  options: Readonly<{ header?: boolean; delimiter?: boolean }> = {},
): ReactNode[] => content.flatMap((part, index) => {
  const style = { bold: options.header || part.bold, italic: part.italic, strike: part.strike, underline: part.underline };
  const tone = options.delimiter ? "muted" : part.tone;
  if (part.href) return [<MarkdownLink key={`${keyPrefix}link-${index}`} href={part.href} textStyle={style}
    markdownCode={part.code} markdownTone={tone} markdownSource>{part.text}</MarkdownLink>];
  return part.text.split(/(\s+)/u).filter(Boolean).map((piece, pieceIndex) =>
    <Text key={`${keyPrefix}text-${index}-${pieceIndex}`} textStyle={style} markdownCode={part.code}
      markdownTone={tone} markdownSource>{piece}</Text>);
});

const markdownLineNode = (line: MarkdownSourceLine, key: string, roleOverride?: MarkdownBlockProps["role"]): ReactNode => {
  if (!line.text) return <Box key={key} style={{ height: 1 }} />;
  if (line.kind === "rule") return <MarkdownBlock key={key} role="paragraph" markdownCenteredText={line.text}
    markdownTone="muted"
    style={{ width: "100%", height: 1, flexShrink: 0 }} />;
  const fixed = line.kind === "code" || line.kind === "table";
  const role = line.kind === "quote" ? "blockquote" : line.kind === "list" ? "listitem"
    : line.kind === "table" ? "row" : line.kind;
  return <MarkdownBlock key={key} role={roleOverride ?? role} level={line.level}
    style={{ direction: "row", wrap: !fixed, width: fixed ? Math.max(1, getTextCellWidth(line.text)) : "100%", flexShrink: 0 }}>
    {markdownInlineNodes(line.content)}
  </MarkdownBlock>;
};

const markdownContentSlice = (content: readonly MarkdownInline[], start: number, end: number): MarkdownInline[] => {
  const result: MarkdownInline[] = [];
  let offset = 0;
  for (const part of content) {
    const from = Math.max(0, start - offset);
    const to = Math.min(part.text.length, end - offset);
    if (from < to) result.push({ ...part, text: part.text.slice(from, to) });
    offset += part.text.length;
  }
  return result;
};

const markdownTableCells = (line: MarkdownSourceLine) => {
  const separators = [...line.text.matchAll(/(?<!\\)\|/gu)].map((match) => match.index);
  const starts = [0, ...separators.filter((position) => position > 0)];
  return starts.map((start, index) => ({ start, end: starts[index + 1] ?? line.text.length }))
    .filter(({ start, end }) => line.text.slice(start, end).trim() !== "|");
};

const markdownTableRowNode = (
  line: MarkdownSourceLine,
  key: string,
  widths: readonly number[],
  alignments: readonly ("left" | "center" | "right")[],
  rowIndex: number,
): ReactNode => {
  const cells = markdownTableCells(line);
  const end = cells.at(-1)?.end ?? 0;
  const rowWidth = widths.reduce((sum, width) => sum + width, 0)
    + getTextCellWidth(line.text.slice(end));
  return <MarkdownBlock key={key} role="row"
    style={{ direction: "row", width: Math.max(1, rowWidth), flexShrink: 0 }}>
    {cells.map(({ start, end }, index) => {
      const raw = line.text.slice(start, end);
      const missing = Math.max(0, (widths[index] ?? 0) - getTextCellWidth(raw));
      const alignment = alignments[index] ?? "left";
      const before = alignment === "right" ? missing : alignment === "center" ? Math.floor(missing / 2) : 0;
      const after = missing - before;
      const pipe = raw.startsWith("|") ? 1 : 0;
      const layoutSpace = (count: number, name: string) => count > 0
        ? <Text key={name} markdownLayoutOnly>{" ".repeat(count)}</Text> : null;
      return <MarkdownBlock key={index} role="cell"
        style={{ direction: "row", width: Math.max(1, widths[index] ?? getTextCellWidth(raw)), flexShrink: 0 }}>
        {pipe ? markdownInlineNodes(markdownContentSlice(line.content, start, start + pipe), "pipe-",
          { delimiter: rowIndex === 1 }) : null}
        {layoutSpace(before, "before")}
        {markdownInlineNodes(markdownContentSlice(line.content, start + pipe, end), "content-",
          { header: rowIndex === 0, delimiter: rowIndex === 1 })}
        {layoutSpace(after, "after")}
      </MarkdownBlock>;
    })}
    {end < line.text.length ? markdownInlineNodes(markdownContentSlice(line.content, end, line.text.length),
      "trailing-", { delimiter: rowIndex === 1 }) : null}
  </MarkdownBlock>;
};

const markdownNodes = (lines: readonly MarkdownSourceLine[]): ReactNode[] => {
  const nodes: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const kind = lines[index]!.kind;
    if (kind !== "list" && kind !== "table") {
      nodes.push(markdownLineNode(lines[index]!, String(index)));
      index++;
      continue;
    }
    const start = index;
    while (index < lines.length && lines[index]!.kind === kind) index++;
    const tableLines = kind === "table" ? lines.slice(start, index) : [];
    const tableCells = tableLines.map(markdownTableCells);
    const columnCount = Math.max(0, ...tableCells.map((cells) => cells.length));
    const widths = Array.from({ length: columnCount }, (_, column) => Math.max(1,
      ...tableCells.map((cells, row) => {
        const cell = cells[column];
        return cell ? getTextCellWidth(tableLines[row]!.text.slice(cell.start, cell.end)) : 0;
      })));
    const alignments = Array.from({ length: columnCount }, (_, column): "left" | "center" | "right" => {
      const delimiter = tableCells[1]?.[column];
      const syntax = delimiter ? tableLines[1]!.text.slice(delimiter.start, delimiter.end).replace(/^\|/u, "").trim() : "";
      return /^:-+:$/u.test(syntax) ? "center" : /^-+:$/u.test(syntax) ? "right" : "left";
    });
    nodes.push(<MarkdownBlock key={start} role={kind} style={{ width: "100%" }}>
      {lines.slice(start, index).map((line, offset) => kind === "table"
        ? markdownTableRowNode(line, `${start + offset}`, widths, alignments, offset)
        : markdownLineNode(line, `${start + offset}`))}
    </MarkdownBlock>);
  }
  return nodes;
};

const describe = (element: ReactElement, recipe: CellUiRecipe, presentation: CellUiPresentation): WidgetDescriptor[] => {
  const textMode = presentation === "text";
  if (element.type === Fragment) {
    const fragmentChildren: ReactNode[] = [];
    flattenChildren((element.props as { children?: ReactNode }).children, fragmentChildren);
    return fragmentChildren.flatMap((child) => {
      if (!isValidElement(child)) {
        throw new TypeError("Cell UI fragments may only contain Cell UI primitives.");
      }
      return describe(child, recipe, presentation);
    });
  }

  if (element.type === Markdown) {
    const props = element.props as MarkdownProps;
    const lines = parseCellMarkdown(props.source);
    const fixedLineWidth = Math.max(0, ...lines.filter((line) => line.kind === "code" || line.kind === "table")
      .map((line) => getTextCellWidth(line.text)));
    return describe(<Box id={props.id} style={{ width: "100%", minWidth: fixedLineWidth || undefined,
      gap: 0, ...props.style }}>
      {markdownNodes(lines)}
    </Box>, recipe, presentation);
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
  const isDialog = element.type === Dialog;
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
      return describe(child, recipe, presentation);
    });
  }
  if (kind === "range-slider-thumb" && children.length > 0) {
    throw new TypeError("RangeSliderThumb cannot contain children.");
  }
  if (element.type === DialogFooter) {
    children.unshift(...describe(<Box style={{ flexGrow: 1 }} />, recipe, presentation));
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
  const ownsSurface = ownsFramedSurface || controlSurface || kind === "tooltip" || kind === "alert"
    || (kind === "table" && props.variant === "surface");
  const defaultsToSurface = controlSurface
    || isDialog
    || kind === "overlay"
    || kind === "alert"
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
      ? resolveCellFrame(props.frame, "none")
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
      ...(kind === "tooltip" ? { width: tooltipTextWidth(text ?? "") + (frame === "bordered" ? 4 : 2),
        height: frame === "bordered" ? 3 : 1, paddingLeft: 1, paddingRight: 1 } : {}),
      ...(element.type === DialogFooter ? { direction: "row" as const, gap: 1 } : {}),
      ...(kind === "text-input" || kind === "combobox-input"
        ? normalizeSingleLineInputStyle(props.style as CellLayoutStyle | undefined)
        : props.style as CellLayoutStyle | undefined),
      ...(kind === "alert" ? { paddingLeft: 3 + ((props.style as CellLayoutStyle | undefined)?.paddingLeft
        ?? (props.style as CellLayoutStyle | undefined)?.padding ?? 0) } : {}),
    },
    presentation,
    surfaceVariant,
    frame,
    borderShape: presentedBorderShape(presentation, frame, requestedBorderShape),
    text,
    href: kind === "markdown-link" ? props.href as string : null,
    markdownRole: kind === "markdown-block" ? props.role as MarkdownBlockProps["role"] : null,
    markdownCode: props.markdownCode === true,
    markdownTone: typeof props.markdownTone === "string" ? props.markdownTone as NonNullable<MarkdownInline["tone"]> : null,
    markdownSource: props.markdownSource === true,
    markdownLayoutOnly: props.markdownLayoutOnly === true,
    markdownCenteredText: kind === "markdown-block" && typeof props.markdownCenteredText === "string"
      ? props.markdownCenteredText : null,
    textStyle: { ...(element.type === DialogTitle || element.type === AlertTitle ? { bold: true } : {}), ...(props.textStyle as CellTextStyle | undefined) },
    label: alertLabel ?? (typeof props.label === "string" ? props.label : null),
    disabled: props.disabled === true,
    invalid: false,
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
    tabsVariant: kind === "tabs"
      ? presentedTabsVariant(presentation, resolveTabsVariant(props.variant)) : "underline",
    separatorVariant: kind === "separator" ? resolveSeparatorVariant(props.variant) : "line",
    buttonVariant: kind === "button"
      ? presentedButtonVariant(presentation, resolveButtonVariant(props.variant, recipe.defaultControlVariant ?? "solid")) : "solid",
    buttonTone: kind === "button" && props.tone === "danger" ? "danger" : "neutral",
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
