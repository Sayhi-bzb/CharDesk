import type { ComponentType } from "react";
import {
  DialogComponentDemo,
  AccordionComponentDemo,
  ButtonComponentDemo,
  BadgeComponentDemo,
  AlertComponentDemo,
  CheckboxComponentDemo,
  ComboboxComponentDemo,
  ToggleComponentDemo,
  ProgressComponentDemo,
  SpinnerComponentDemo,
  TooltipComponentDemo,
  SeparatorComponentDemo,
  RadioComponentDemo,
  InputComponentDemo,
  ScrollAreaComponentDemo,
  SelectComponentDemo,
  SliderComponentDemo,
  TabsComponentDemo,
  TextComponentDemo,
  BoxComponentDemo,
  ListComponentDemo,
} from "./sections/components";

import { OverlayDemo } from "./sections/overlay";
import { GridComponentDemo, MenuComponentDemo, RangeSliderComponentDemo, TextAreaComponentDemo, TreeComponentDemo } from "./sections/foundations";
import { componentContent, sourceLinksForComponent as contentSourceLinks, type ComponentContent } from "./docs-content";

export type ComponentDocument = ComponentContent & Readonly<{ probeId: string; Demo: ComponentType }>;

const demos: Readonly<Record<string, ComponentType>> = {
  dialog: DialogComponentDemo, accordion: AccordionComponentDemo, toggle: ToggleComponentDemo,
  progress: ProgressComponentDemo, spinner: SpinnerComponentDemo, tooltip: TooltipComponentDemo,
  separator: SeparatorComponentDemo, radio: RadioComponentDemo, button: ButtonComponentDemo,
  badge: BadgeComponentDemo, select: SelectComponentDemo, combobox: ComboboxComponentDemo,
  checkbox: CheckboxComponentDemo, slider: SliderComponentDemo, input: InputComponentDemo,
  tabs: TabsComponentDemo, "scroll-area": ScrollAreaComponentDemo,
  text: TextComponentDemo, box: BoxComponentDemo, list: ListComponentDemo,
  overlay: OverlayDemo, "range-slider": RangeSliderComponentDemo, "text-area": TextAreaComponentDemo,
  menu: MenuComponentDemo, tree: TreeComponentDemo, grid: GridComponentDemo,
};

const alertDocument: ComponentDocument = {
    slug: "alert", title: "Alert",
    description: "Keep a status or warning visible beside the work it describes.",
    probeId: "component-alert", Demo: AlertComponentDemo,
    usage: `import { Alert, AlertTitle, AlertDescription, Button, Root, Text } from "@chardesk/cell-ui";

export function AlertExample() {
  return <Root><Alert tone="warning">
    <AlertTitle>Unsaved changes</AlertTitle>
    <AlertDescription>Changes are stored locally.</AlertDescription>
    <Button id="save"><Text>Save now</Text></Button>
  </Alert></Root>;
}`,
    api: [
      { name: "tone?", type: '"info" | "success" | "warning" | "error"', description: "Status meaning; info by default. Warning and error announce as alerts." },
      { name: "border?", type: '"none" | "square" | "rounded"', description: "None by default; framed borders use the tone's foreground color." },
      { name: "style?", type: "CellLayoutStyle", description: "Width and layout overrides; default maximum width is 44 Cells." },
      { name: "children", type: "Cell primitives", description: "One AlertTitle, optional AlertDescription, and optional Button in order." },
    ],
  };

export const sourceLinksForComponent = (slug: string) => slug === "alert"
  ? [{ label: "react.tsx", href: "https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx" }, { label: "alert.ts", href: "https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/alert.ts" }]
  : contentSourceLinks(slug);

export const componentDocuments: readonly ComponentDocument[] = [
  alertDocument,
  ...componentContent.map((content) => ({ ...content, probeId: content.slug === "overlay" ? "overlay" : `component-${content.slug}`, Demo: demos[content.slug]! })),
];
export const componentDocumentBySlug = new Map(componentDocuments.map((document) => [document.slug, document] as const));
export const defaultComponentSlug = "button";
export const componentNavigationDocuments = componentDocuments.toSorted((left, right) => left.title.localeCompare(right.title, "en"));
