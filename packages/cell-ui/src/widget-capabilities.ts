import type { WidgetKind, WidgetNode } from "./types.js";

export const isPrimitiveControlKind = (kind: WidgetKind): boolean =>
  kind === "accordion-trigger" ||
  kind === "button" || kind === "checkbox" || kind === "select-trigger" || kind === "select-item" || kind === "combobox-item"
  || kind === "toggle" || kind === "radio-item" || kind === "slider" || kind === "range-slider-thumb"
  || kind === "list-item" || kind === "menu-item" || kind === "tree-item" || kind === "tab" || kind === "grid-cell";

const collectionItemKinds = new Set<WidgetKind>([
  "list-item",
  "menu-item",
  "tree-item",
  "tab",
  "grid-cell",
  "select-item",
  "combobox-item",
]);

const selectableKinds = new Set<WidgetKind>([
  "list-item",
  "tree-item",
  "tab",
  "grid-cell",
  "select-item",
  "combobox-item",
]);

export const isCollectionItemKind = (kind: WidgetKind): boolean =>
  collectionItemKinds.has(kind);

export const isSelectableKind = (kind: WidgetKind): boolean =>
  selectableKinds.has(kind);

export const isTextEditorKind = (kind: WidgetKind): boolean =>
  kind === "text-input" || kind === "text-area" || kind === "combobox-input";

export const isActionableKind = (kind: WidgetKind): boolean =>
  kind === "accordion-trigger" ||
  kind === "button"
  || kind === "checkbox"
  || kind === "toggle"
  || kind === "radio-item"
  || kind === "slider"
  || kind === "range-slider-thumb"
  || kind === "select-trigger"
  || isCollectionItemKind(kind);

type FeedbackRule = Readonly<{ region: "control" | "thumb" | "editor" | "none"; press: boolean; activation: boolean; manipulation: boolean }>;
const control: FeedbackRule = { region: "control", press: false, activation: false, manipulation: false };
const tap: FeedbackRule = { ...control, press: true, activation: true };
const thumb: FeedbackRule = { region: "thumb", press: false, activation: false, manipulation: true };
const none: FeedbackRule = { region: "none", press: false, activation: false, manipulation: false };
const rules: Partial<Record<WidgetKind, FeedbackRule>> = {
  "accordion-trigger": { ...control, press: true },
  button: tap,
  checkbox: tap,
  toggle: tap,
  "radio-item": tap,
  "select-item": tap,
  "combobox-item": tap,
  "select-trigger": { ...control, press: true },
  "list-item": { ...control, press: true },
  "menu-item": tap,
  "tree-item": { ...control, press: true },
  tab: { ...control, press: true },
  "grid-cell": { ...control, press: true },
  slider: thumb,
  "range-slider-thumb": thumb,
  "scroll-area": { ...none, manipulation: true },
  "text-input": { ...none, region: "editor" },
  "text-area": { ...none, region: "editor" },
  "combobox-input": { ...none, region: "editor" },
};
export const feedbackRule = (kind: WidgetKind): FeedbackRule => rules[kind] ?? none;
export const supportsPressFeedback = (kind: WidgetKind): boolean => feedbackRule(kind).press;
export const supportsManipulationFeedback = (kind: WidgetKind): boolean => feedbackRule(kind).manipulation;
export const supportsActivationFeedback = (kind: WidgetKind): boolean => feedbackRule(kind).activation;

export const isFocusableKind = (kind: WidgetKind): boolean =>
  (isActionableKind(kind) && kind !== "combobox-item") || isTextEditorKind(kind);

export const isPortalKind = (kind: WidgetKind): boolean =>
  kind === "overlay" || kind === "select-content" || kind === "combobox-content";

export const isFocusScope = (node: WidgetNode): boolean =>
  (node.kind === "overlay" && node.modal) || node.kind === "select-content";

export const isDismissableScope = (node: WidgetNode): boolean =>
  (node.kind === "overlay" && (node.modal || !!node.dialog)) || node.kind === "select-content" || node.kind === "combobox-content";
