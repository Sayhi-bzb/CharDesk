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
  TextAreaComponentDemo,
  TableComponentDemo,
} from "./sections/components";
import { componentContent, sourceLinksForComponent as contentSourceLinks, type ComponentContent } from "./docs-content";

export type ComponentDocument = ComponentContent & Readonly<{ probeId: string; Demo: ComponentType }>;

const demos: Readonly<Record<string, ComponentType>> = {
  alert: AlertComponentDemo,
  dialog: DialogComponentDemo, accordion: AccordionComponentDemo, toggle: ToggleComponentDemo,
  progress: ProgressComponentDemo, spinner: SpinnerComponentDemo, tooltip: TooltipComponentDemo,
  separator: SeparatorComponentDemo, radio: RadioComponentDemo, button: ButtonComponentDemo,
  badge: BadgeComponentDemo, select: SelectComponentDemo, combobox: ComboboxComponentDemo,
  checkbox: CheckboxComponentDemo, slider: SliderComponentDemo, input: InputComponentDemo,
  tabs: TabsComponentDemo, "scroll-area": ScrollAreaComponentDemo,
  text: TextComponentDemo, "text-area": TextAreaComponentDemo,
  table: TableComponentDemo,
};

export const sourceLinksForComponent = contentSourceLinks;

export const componentDocuments: readonly ComponentDocument[] = [
  ...componentContent.map((content) => ({ ...content, probeId: `component-${content.slug}`, Demo: demos[content.slug]! })),
];
export const componentDocumentBySlug = new Map(componentDocuments.map((document) => [document.slug, document] as const));
export const componentNavigationDocuments = componentDocuments.toSorted((left, right) => left.title.localeCompare(right.title, "en"));
