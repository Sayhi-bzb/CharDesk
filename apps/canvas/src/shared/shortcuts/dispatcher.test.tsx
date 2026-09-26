import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ShortcutProvider,
  useShortcutLayer,
  type ShortcutLayer,
} from "./dispatcher";

function RegisteredLayer(props: ShortcutLayer) {
  useShortcutLayer(props);
  return null;
}

describe("ShortcutProvider", () => {
  it("adapts the native event once into normalized keyboard facts", () => {
    const inputs: Parameters<NonNullable<ShortcutLayer["onKeyDown"]>>[0][] = [];
    render(
      <ShortcutProvider>
        <RegisteredLayer
          id="facts"
          priority={10}
          onKeyDown={(input) => {
            inputs.push(input);
            return { claimed: true };
          }}
        />
      </ShortcutProvider>
    );

    fireEvent.keyDown(window, {
      key: "K",
      code: "KeyK",
      ctrlKey: true,
      shiftKey: true,
      repeat: true,
      location: 2,
    });
    expect(inputs[0]).toMatchObject({
      type: "key",
      phase: "down",
      key: "K",
      code: "KeyK",
      location: 2,
      modifiers: { ctrl: true, shift: true },
      repeat: true,
      composing: false,
    });
  });

  it("dispatches by priority and stops after a layer claims the event", () => {
    const calls: string[] = [];
    render(
      <ShortcutProvider>
        <RegisteredLayer
          id="low"
          priority={10}
          onKeyDown={() => {
            calls.push("low");
            return { claimed: true };
          }}
        />
        <RegisteredLayer
          id="high"
          priority={20}
          onKeyDown={() => {
            calls.push("high");
            return { claimed: true };
          }}
        />
      </ShortcutProvider>
    );

    fireEvent.keyDown(window, { key: "x" });
    expect(calls).toEqual(["high"]);
  });

  it("continues past unclaimed layers and centralizes preventDefault", () => {
    const calls: string[] = [];
    render(
      <ShortcutProvider>
        <RegisteredLayer
          id="first"
          priority={20}
          onKeyDown={() => {
            calls.push("first");
            return { claimed: false };
          }}
        />
        <RegisteredLayer
          id="second"
          priority={10}
          onKeyDown={() => {
            calls.push("second");
            return { claimed: true, preventDefault: true };
          }}
        />
      </ShortcutProvider>
    );

    const event = new KeyboardEvent("keydown", {
      key: "x",
      bubbles: true,
      cancelable: true,
    });
    act(() => window.dispatchEvent(event));
    expect(calls).toEqual(["first", "second"]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps exclusive shortcuts from reaching later native or target handlers", () => {
    const laterWindowHandler = vi.fn();
    const targetHandler = vi.fn();
    const view = render(
      <ShortcutProvider>
        <RegisteredLayer
          id="exclusive"
          priority={10}
          onKeyDown={() => ({
            claimed: true,
            preventDefault: true,
            stopImmediatePropagation: true,
          })}
        />
        <textarea data-testid="target" onKeyDown={targetHandler} />
      </ShortcutProvider>
    );
    window.addEventListener("keydown", laterWindowHandler, true);

    const target = view.getByTestId("target");
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    act(() => target.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(laterWindowHandler).not.toHaveBeenCalled();
    expect(targetHandler).not.toHaveBeenCalled();
    window.removeEventListener("keydown", laterWindowHandler, true);
  });

  it("classifies managed canvas and external editable targets", () => {
    const kinds: string[] = [];
    render(
      <ShortcutProvider>
        <RegisteredLayer
          id="classifier"
          priority={10}
          onKeyDown={(_event, context) => {
            kinds.push(context.targetKind);
            return { claimed: true };
          }}
        />
      </ShortcutProvider>
    );
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    textarea.dataset.canvasManagedInput = "true";
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const dialogButton = document.createElement("button");
    dialog.append(dialogButton);
    document.body.append(input, textarea, dialog);

    fireEvent.keyDown(input, { key: "x" });
    fireEvent.keyDown(textarea, { key: "x" });
    fireEvent.keyDown(dialogButton, { key: "x" });
    expect(kinds).toEqual(["editable", "managed-canvas", "overlay"]);
  });

  it("ignores composing and already prevented events and unregisters layers", () => {
    const handler = vi.fn(() => ({ claimed: true }));
    const view = render(
      <ShortcutProvider>
        <RegisteredLayer id="guarded" priority={10} onKeyDown={handler} />
      </ShortcutProvider>
    );
    const composing = new KeyboardEvent("keydown", { key: "x" });
    Object.defineProperty(composing, "isComposing", { value: true });
    act(() => window.dispatchEvent(composing));

    const prevented = new KeyboardEvent("keydown", {
      key: "x",
      cancelable: true,
    });
    prevented.preventDefault();
    act(() => window.dispatchEvent(prevented));
    expect(handler).not.toHaveBeenCalled();

    view.unmount();
    fireEvent.keyDown(window, { key: "x" });
    expect(handler).not.toHaveBeenCalled();
  });
});
