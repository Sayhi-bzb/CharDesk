import type { ComponentType } from "react";
import {
  DialogComponentDemo,
  AccordionComponentDemo,
  ButtonComponentDemo,
  BadgeComponentDemo,
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

export const sourceLinksForComponent = contentSourceLinks;
export const componentDocuments: readonly ComponentDocument[] = [
  ...componentContent.map((content) => ({ ...content, probeId: content.slug === "overlay" ? "overlay" : `component-${content.slug}`, Demo: demos[content.slug]! })),
];
export const componentDocumentBySlug = new Map(componentDocuments.map((document) => [document.slug, document] as const));
export const defaultComponentSlug = "button";
export const componentNavigationDocuments = componentDocuments.toSorted((left, right) => left.title.localeCompare(right.title, "en"));
