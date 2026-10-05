import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "./utils.js"
import { rx } from "./recipes.js"
import type { StatusTone } from "./tokens.js"

type SelectableItemProps = React.ComponentProps<"button"> & {
  asChild?: boolean
  orientation?: "horizontal" | "vertical"
  selected?: boolean
  muted?: boolean
  status?: StatusTone
  /** The row owns the hover/active surface for nested action controls. */
  compound?: boolean
}

function SelectableItem({
  asChild = false,
  orientation = "horizontal",
  selected = false,
  muted = false,
  status,
  compound = false,
  className,
  ...props
}: SelectableItemProps) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="selectable-item"
      data-selected={selected || undefined}
      data-status={status}
      className={cn(
        rx.selectableItem({ orientation, selected, muted, status, compound }),
        className
      )}
      {...props}
    />
  )
}

export { SelectableItem }
