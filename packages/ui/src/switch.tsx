import * as React from "react";

import { cn } from "./utils.js";
import { rx } from "./recipes.js";

export type SwitchProps = Omit<React.ComponentProps<"button">, "onChange"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

function Switch({ checked = false, onCheckedChange, className, onClick, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-state={checked ? "on" : "off"}
      className={cn(rx.switch({ checked }), className)}
      onClick={(event) => {
        onCheckedChange?.(!checked);
        onClick?.(event);
      }}
      {...props}
    >
      <span
        aria-hidden="true"
        data-slot="switch-thumb"
        className={rx.switchThumb({ checked })}
      />
    </button>
  );
}

export { Switch };
