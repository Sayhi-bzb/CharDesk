import type {
  AccordionContentProps,
  AccordionItemProps,
  AccordionProps,
  BoxProps,
  ButtonProps,
  ComboboxInputProps,
  ComboboxProps,
  DialogProps,
  ProgressProps,
  RootProps,
  ScrollAreaProps,
  SeparatorProps,
  SelectContentProps,
  SelectProps,
  SelectTriggerProps,
  TextAreaProps,
  TextInputProps,
} from "@chardesk/cell-ui";

type Expect<Condition extends true> = Condition;
type Has<Props, Key extends PropertyKey> = Key extends keyof Props ? true : false;
type Lacks<Props, Key extends PropertyKey> = Key extends keyof Props ? false : true;
type Same<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;

type ComponentPropContract = [
  Expect<Has<RootProps, "children">>,
  Expect<Lacks<RootProps, "label">>,
  Expect<Lacks<BoxProps, "label">>,
  Expect<Has<BoxProps, "variant">>,
  Expect<Has<BoxProps, "frame">>,
  Expect<Lacks<ButtonProps, "size">>,
  Expect<Has<ButtonProps, "style">>,
  Expect<Same<NonNullable<ButtonProps["variant"]>, "solid" | "outline" | "surface" | "ghost">>,
  Expect<Lacks<AccordionProps, "label">>,
  Expect<Lacks<AccordionItemProps, "label">>,
  Expect<Has<AccordionContentProps, "label">>,
  Expect<Has<DialogProps, "label">>,
  Expect<Lacks<SelectProps, "label">>,
  Expect<Has<SelectTriggerProps, "label">>,
  Expect<Has<SelectContentProps, "label">>,
  Expect<Lacks<ComboboxProps, "label">>,
  Expect<Has<ComboboxInputProps, "label">>,
  Expect<Lacks<ComboboxInputProps, "variant">>,
  Expect<Lacks<ScrollAreaProps, "label">>,
  Expect<Lacks<TextInputProps, "children">>,
  Expect<Lacks<TextAreaProps, "children">>,
  Expect<Lacks<ComboboxInputProps, "children">>,
  Expect<Has<ProgressProps, "variant">>,
  Expect<Same<NonNullable<ProgressProps["variant"]>, "solid" | "outline">>,
  Expect<Same<NonNullable<SeparatorProps["variant"]>, "line" | "slash" | "double" | "dots">>,
  Expect<Lacks<ProgressProps, "size">>,
];

export type { ComponentPropContract };
