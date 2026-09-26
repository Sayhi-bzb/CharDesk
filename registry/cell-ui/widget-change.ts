import type { WidgetNode } from "./types.js";

export const sameWidgetValue = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

export const sameNodeContent = (left: WidgetNode, right: WidgetNode) =>
  left.kind === right.kind
  && left.key === right.key
  && left.presentation === right.presentation
  && left.surfaceVariant === right.surfaceVariant
  && left.frame === right.frame
  && left.borderShape === right.borderShape
  && left.text === right.text
  && left.href === right.href
  && left.current === right.current
  && left.target === right.target
  && left.markdownRole === right.markdownRole
  && left.markdownCode === right.markdownCode
  && left.markdownTone === right.markdownTone
  && left.markdownSource === right.markdownSource
  && left.markdownLayoutOnly === right.markdownLayoutOnly
  && left.markdownCenteredText === right.markdownCenteredText
  && left.sharedScrollGuard === right.sharedScrollGuard
  && left.label === right.label
  && left.disabled === right.disabled
  && left.invalid === right.invalid
  && left.focused === right.focused
  && left.focusActive === right.focusActive
  && left.focusVisible === right.focusVisible
  && left.hovered === right.hovered
  && left.scrollbarVisible === right.scrollbarVisible
  && left.manipulating === right.manipulating
  && left.pressActive === right.pressActive
  && left.activationFlash === right.activationFlash
  && left.confirming === right.confirming
  && sameWidgetValue(left.confirmation, right.confirmation)
  && left.selected === right.selected
  && left.active === right.active
  && left.checked === right.checked
  && left.pressed === right.pressed
  && left.radioValue === right.radioValue
  && sameWidgetValue(left.progress, right.progress)
  && left.animationTimeMs === right.animationTimeMs
  && left.progressVariant === right.progressVariant
  && left.spinnerVariant === right.spinnerVariant
  && left.tooltipTargetId === right.tooltipTargetId
  && left.tooltipOpen === right.tooltipOpen
  && left.tabsVariant === right.tabsVariant
  && left.separatorVariant === right.separatorVariant
  && left.buttonVariant === right.buttonVariant
  && left.buttonTone === right.buttonTone
  && left.badgeTone === right.badgeTone
  && left.sliderValue === right.sliderValue
  && left.sliderMin === right.sliderMin
  && left.sliderMax === right.sliderMax
  && left.sliderStep === right.sliderStep
  && left.sliderValueText === right.sliderValueText
  && left.expanded === right.expanded
  && left.hasChildren === right.hasChildren
  && left.level === right.level
  && left.parentItemId === right.parentItemId
  && left.rowIndex === right.rowIndex
  && left.columnIndex === right.columnIndex
  && left.rowCount === right.rowCount
  && left.columnCount === right.columnCount
  && left.positionInSet === right.positionInSet
  && left.setSize === right.setSize
  && left.orientation === right.orientation
  && left.controlsId === right.controlsId
  && left.activeDescendantId === right.activeDescendantId
  && left.labelledById === right.labelledById
  && sameWidgetValue(left.textEditor, right.textEditor)
  && left.readOnly === right.readOnly
  && sameWidgetValue(left.overlayPosition, right.overlayPosition)
  && left.modal === right.modal
  && sameWidgetValue(left.dialog, right.dialog)
  && left.dialogPart === right.dialogPart
  && left.closeOnOutsideClick === right.closeOnOutsideClick
  && left.describedById === right.describedById
  && sameWidgetValue(left.style, right.style)
  && sameWidgetValue(left.textStyle, right.textStyle)
  && sameWidgetValue(left.scrollOffset, right.scrollOffset)
  && sameWidgetValue(left.children, right.children);

const hasLayoutChange = (before: WidgetNode, after: WidgetNode) =>
  before.kind !== after.kind
  || before.parentId !== after.parentId
  || before.index !== after.index
  || before.presentation !== after.presentation
  || before.text !== after.text
  || before.markdownRole !== after.markdownRole
  || before.markdownCenteredText !== after.markdownCenteredText
  || before.sharedScrollGuard !== after.sharedScrollGuard
  || before.buttonVariant !== after.buttonVariant
  || before.buttonTone !== after.buttonTone
  || before.progressVariant !== after.progressVariant
  || before.tabsVariant !== after.tabsVariant
  || before.frame !== after.frame
  || before.orientation !== after.orientation
  || (after.kind === "accordion-content" && before.expanded !== after.expanded)
  || !sameWidgetValue(before.style, after.style)
  || !sameWidgetValue(before.children, after.children);

const hasGeometryChange = (before: WidgetNode, after: WidgetNode) =>
  before.tooltipOpen !== after.tooltipOpen
  || before.tooltipTargetId !== after.tooltipTargetId
  || !sameWidgetValue(before.scrollOffset, after.scrollOffset)
  || (before.kind === "range-slider-thumb" && (
    before.sliderValue !== after.sliderValue
    || before.sliderMin !== after.sliderMin
    || before.sliderMax !== after.sliderMax
    || before.sliderStep !== after.sliderStep
  ))
  || before.textEditor?.value !== after.textEditor?.value
  || before.textEditor?.scrollX !== after.textEditor?.scrollX
  || before.textEditor?.scrollY !== after.textEditor?.scrollY
  || !sameWidgetValue(before.textEditor?.composition, after.textEditor?.composition)
  || !sameWidgetValue(before.overlayPosition, after.overlayPosition);

const hasPaintChange = (before: WidgetNode, after: WidgetNode) =>
  before.focused !== after.focused
  || before.focusActive !== after.focusActive
  || before.focusVisible !== after.focusVisible
  || before.hovered !== after.hovered
  || before.scrollbarVisible !== after.scrollbarVisible
  || before.manipulating !== after.manipulating
  || before.pressActive !== after.pressActive
  || before.activationFlash !== after.activationFlash
  || before.confirming !== after.confirming
  || !sameWidgetValue(before.confirmation, after.confirmation)
  || before.selected !== after.selected
  || before.active !== after.active
  || before.checked !== after.checked
  || before.pressed !== after.pressed
  || !sameWidgetValue(before.progress, after.progress)
  || before.animationTimeMs !== after.animationTimeMs
  || before.progressVariant !== after.progressVariant
  || before.spinnerVariant !== after.spinnerVariant
  || before.tooltipOpen !== after.tooltipOpen
  || before.tabsVariant !== after.tabsVariant
  || before.separatorVariant !== after.separatorVariant
  || before.buttonVariant !== after.buttonVariant
  || before.buttonTone !== after.buttonTone
  || before.badgeTone !== after.badgeTone
  || before.surfaceVariant !== after.surfaceVariant
  || before.frame !== after.frame
  || before.borderShape !== after.borderShape
  || before.markdownCode !== after.markdownCode
  || before.markdownTone !== after.markdownTone
  || before.markdownSource !== after.markdownSource
  || before.markdownLayoutOnly !== after.markdownLayoutOnly
  || before.markdownCenteredText !== after.markdownCenteredText
  || before.sliderValue !== after.sliderValue
  || before.sliderMin !== after.sliderMin
  || before.sliderMax !== after.sliderMax
  || before.expanded !== after.expanded
  || before.disabled !== after.disabled
  || before.invalid !== after.invalid
  || !sameWidgetValue(before.textStyle, after.textStyle)
  || !sameWidgetValue(before.textEditor, after.textEditor);

const hasSemanticChange = (before: WidgetNode, after: WidgetNode) =>
  before.label !== after.label
  || before.invalid !== after.invalid
  || before.href !== after.href
  || before.current !== after.current
  || before.target !== after.target
  || before.markdownRole !== after.markdownRole
  || before.markdownCenteredText !== after.markdownCenteredText
  || before.disabled !== after.disabled
  || before.focused !== after.focused
  || before.selected !== after.selected
  || before.checked !== after.checked
  || before.pressed !== after.pressed
  || !sameWidgetValue(before.progress, after.progress)
  || before.sliderValue !== after.sliderValue
  || before.sliderMin !== after.sliderMin
  || before.sliderMax !== after.sliderMax
  || before.sliderValueText !== after.sliderValueText
  || before.expanded !== after.expanded
  || before.hasChildren !== after.hasChildren
  || before.level !== after.level
  || before.rowIndex !== after.rowIndex
  || before.columnIndex !== after.columnIndex
  || before.rowCount !== after.rowCount
  || before.columnCount !== after.columnCount
  || before.positionInSet !== after.positionInSet
  || before.setSize !== after.setSize
  || before.orientation !== after.orientation
  || before.controlsId !== after.controlsId
  || before.activeDescendantId !== after.activeDescendantId
  || before.labelledById !== after.labelledById
  || before.describedById !== after.describedById
  || before.dialogPart !== after.dialogPart
  || !sameWidgetValue(before.dialog, after.dialog)
  || before.readOnly !== after.readOnly
  || before.modal !== after.modal
  || before.text !== after.text
  || !sameWidgetValue(before.textEditor, after.textEditor);


/** Classify direct node changes; runtime applies its existing phase-cascade rules. */
export const classifyWidgetChange = (before: WidgetNode, after: WidgetNode) => ({
  layout: hasLayoutChange(before, after),
  geometry: hasGeometryChange(before, after),
  paint: hasPaintChange(before, after),
  semantics: hasSemanticChange(before, after),
});
