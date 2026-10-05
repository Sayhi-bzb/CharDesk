import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rx } from "./recipes.js";
import { Button } from "./button.js";
import { Input } from "./input.js";
import { IconButton } from "./icon-button.js";
import { Label } from "./label.js";
import { Select, SelectTrigger, SelectValue } from "./select.js";
import { SelectableItem } from "./selectable-item.js";
import { Surface } from "./surface.js";
import { SwatchButton } from "./swatch-button.js";

describe("compact UI density", () => {
  it("uses the compact global button size scale", () => {
    render(
      <>
        <Button size="xs">Extra small</Button>
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
        <Button disabled>Disabled</Button>
      </>
    );

    expect(screen.getByRole("button", { name: "Extra small" })).toHaveClass(
      "h-6",
      "text-[11px]"
    );
    expect(screen.getByRole("button", { name: "Small" })).toHaveClass(
      "h-7",
      "text-xs"
    );
    expect(screen.getByRole("button", { name: "Medium" })).toHaveClass(
      "h-8",
      "text-[13px]"
    );
    expect(screen.getByRole("button", { name: "Large" })).toHaveClass(
      "h-9",
      "text-sm"
    );
    expect(screen.getByRole("button", { name: "Extra small" })).toHaveClass(
      "cursor-pointer"
    );
    expect(screen.getByRole("button", { name: "Disabled" })).toHaveClass(
      "cursor-pointer",
      "disabled:cursor-default",
      "disabled:pointer-events-none"
    );
  });

  it("expresses active control state through the button contract", () => {
    render(
      <>
        <Button active>Active tool</Button>
        <Button pressed>Pressed toggle</Button>
        <Button open>Open panel</Button>
        <Button active open>Active open tool</Button>
      </>
    );

    expect(screen.getByRole("button", { name: "Active tool" })).toHaveClass(
      "bg-control-active-surface",
      "text-foreground",
      "hover:bg-control-active-surface",
      "hover:text-foreground"
    );
    expect(screen.getByRole("button", { name: "Pressed toggle" }))
      .toHaveClass("bg-control-pressed-surface", "text-foreground");
    expect(screen.getByRole("button", { name: "Pressed toggle" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Open panel" }))
      .toHaveClass("bg-control-open-surface", "text-foreground");
    expect(screen.getByRole("button", { name: "Open panel" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Active open tool" }))
      .toHaveClass(
        "bg-control-active-surface",
        "data-[state=open]:bg-control-active-surface"
      );
  });

  it("keeps the strongest persistent control state during interaction", () => {
    const active = rx
      .control({ tone: "subtle", open: true, pressed: true, active: true })
      .split(/\s+/);
    const pressed = rx
      .control({ tone: "subtle", open: true, pressed: true })
      .split(/\s+/);
    const open = rx.control({ tone: "subtle", open: true }).split(/\s+/);
    const destructiveActive = rx.control({
      tone: "subtle",
      active: true,
      destructive: true,
    }).split(/\s+/);

    expect(active).toContain("hover:bg-control-active-surface");
    expect(active).not.toContain("hover:bg-control-pressed-surface");
    expect(active).not.toContain("hover:bg-control-open-surface");
    expect(pressed).toContain("hover:bg-control-pressed-surface");
    expect(pressed).not.toContain("hover:bg-control-open-surface");
    expect(open).toContain("hover:bg-control-open-surface");
    expect(destructiveActive).toContain("hover:bg-control-active-surface");
    expect(destructiveActive).toContain("hover:text-destructive");
  });

  it("keeps nested controls on a selectable row's surface", () => {
    const classes = rx.selectableItem({ compound: true });
    const selectedClasses = rx.selectableItem({ compound: true, selected: true });

    expect(classes).toContain("[&_[data-slot=button]]:hover:bg-accent");
    expect(classes).toContain("[&_[data-slot=button]]:hover:text-accent-foreground");
    expect(selectedClasses).toContain(
      "data-[selected=true]:[&_[data-slot=button]]:hover:bg-control-active-surface"
    );
    expect(selectedClasses).toContain(
      "data-[selected=true]:[&_[data-slot=button]]:hover:text-foreground"
    );
  });

  it("owns icon, selection, swatch, destructive, and joined behavior", () => {
    render(
      <>
        <IconButton aria-label="Compact icon" size="xs">
          <svg />
        </IconButton>
        <SelectableItem selected status="success">Selected row</SelectableItem>
        <SwatchButton aria-label="Selected color" color="#ff0000" selected />
        <Button tone="subtle" destructive joined="middle" subordinate>
          Destructive segment
        </Button>
      </>
    );

    expect(screen.getByRole("button", { name: "Compact icon" })).toHaveClass("size-6");
    expect(screen.getByRole("button", { name: "Selected row" })).toHaveClass(
      "bg-success/20",
      "text-foreground",
      "cursor-pointer",
      "min-h-7",
      "gap-1.5",
      "px-2",
      "text-xs",
      "leading-4"
    );
    expect(screen.getByRole("button", { name: "Selected row" })).not.toHaveClass(
      "min-h-8",
      "text-sm"
    );
    expect(screen.getByRole("button", { name: "Selected row" })).toHaveAttribute(
      "data-status",
      "success"
    );
    expect(screen.getByRole("button", { name: "Selected color" })).toHaveClass(
      "ring-2",
      "ring-primary",
      "cursor-pointer"
    );
    expect(screen.getByRole("button", { name: "Destructive segment" })).toHaveClass(
      "rounded-none",
      "text-destructive",
      "hover:bg-destructive-muted",
      "opacity-40"
    );
  });

  it("uses the shared 12px rhythm for fields and labels", () => {
    render(
      <>
        <Label htmlFor="density-input">Field label</Label>
        <Input id="density-input" disabled />
      </>
    );

    expect(screen.getByText("Field label")).toHaveClass(
      "text-xs",
      "leading-4",
      "peer-disabled:cursor-default"
    );
    expect(screen.getByLabelText("Field label")).toHaveClass(
      "h-8",
      "text-[13px]",
      "disabled:cursor-default"
    );
  });

  it("uses pointer and disabled-default cursors for selects", () => {
    render(
      <Select disabled>
        <SelectTrigger aria-label="Mode">
          <SelectValue placeholder="Choose mode" />
        </SelectTrigger>
      </Select>
    );

    expect(screen.getByRole("combobox", { name: "Mode" })).toHaveClass(
      "cursor-pointer",
      "disabled:cursor-default"
    );
  });

  it("expresses search fields through the input contract", () => {
    render(<Input aria-label="Search" appearance="search" />);

    expect(screen.getByRole("textbox", { name: "Search" })).toHaveClass(
      "bg-search-surface",
      "border-0"
    );
  });

  it("provides stable panel typography recipes", () => {
    expect(rx.panelText()).toContain("text-[13px]");
    expect(rx.panelHeading()).toContain("font-semibold");
  });

  it("groups composite collection cards with one selected surface", () => {
    expect(rx.collectionCard()).toContain("hover:bg-control-open-surface");
    expect(rx.collectionCard({ selected: true })).toContain(
      "bg-control-active-surface"
    );
    expect(rx.collectionCard({ selected: true })).toContain(
      "hover:bg-control-active-surface"
    );
  });

  it("uses one compact interaction recipe for every menu family", () => {
    const item = rx.menuItem();
    const destructiveItem = rx.menuItem({ variant: "destructive" });

    expect(item).toContain("min-h-7");
    expect(item).toContain("rounded-item");
    expect(item).toContain("cursor-pointer");
    expect(item).toContain("data-[disabled]:cursor-default");
    expect(item).toContain("data-[highlighted]:bg-accent");
    expect(item).toContain("data-[state=checked]:bg-control-pressed-surface");
    expect(item).toContain(
      "data-[state=checked]:data-[highlighted]:bg-control-pressed-surface"
    );
    expect(rx.menuItem({ selected: true })).toContain(
      "data-[highlighted]:bg-control-active-surface"
    );
    expect(rx.menuItem({ selected: true })).toContain(
      "data-[state=checked]:data-[highlighted]:bg-control-active-surface"
    );
    expect(destructiveItem).toContain("bg-destructive-muted");
  });

  it("maps surface kinds to semantic surface recipes", () => {
    render(
      <>
        <Surface data-testid="embedded-surface" />
        <Surface data-testid="floating-surface" kind="floating" />
        <Surface data-testid="overlay-surface" kind="overlay" />
      </>
    );

    expect(screen.getByTestId("embedded-surface")).toHaveClass(
      "bg-secondary/70",
      "shadow-none",
      "ring-0"
    );
    expect(screen.getByTestId("floating-surface")).toHaveClass("bg-host-surface", "shadow-host");
    expect(screen.getByTestId("overlay-surface")).toHaveClass("bg-overlay-surface", "shadow-overlay");
    expect(screen.getByTestId("overlay-surface")).toHaveClass("rounded-surface");
  });

  it("owns compact and default overlay padding", () => {
    expect(rx.overlayContent()).toContain("p-2");
    expect(rx.overlayContent({ density: "default" })).toContain("p-4");
  });

  it("uses pointer and disabled-default cursors for tabs", () => {
    const tabsTrigger = rx.tabsTrigger();

    expect(tabsTrigger).toContain("cursor-pointer");
    expect(tabsTrigger).toContain("disabled:cursor-default");
    expect(tabsTrigger).toContain(
      "data-[state=active]:hover:bg-control-active-surface"
    );
  });
});
