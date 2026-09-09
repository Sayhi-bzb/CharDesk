import type { KeyInput } from "@chardesk/keyboard";
import { isCellKeyPress } from "./keyboard.js";
import { getEventPath, hitTest } from "./scene.js";
import type { CellPoint, FrameSnapshot, WidgetId } from "./types.js";
import { supportsPressFeedback } from "./widget-capabilities.js";
import { isInFocusScope, topFocusScopeId } from "./interaction.js";

type PointerPress = {
  pointerId: number;
  targetId: WidgetId;
  point: CellPoint;
  armed: boolean;
};

type KeyPress = {
  identity: string;
  targetId: WidgetId;
};

const keyIdentity = (input: KeyInput): string => `${input.code}\u0000${input.key}`;

const validPressTarget = (
  frame: FrameSnapshot,
  targetId: WidgetId,
  requireFocus = false
): boolean => {
  const node = frame.tree.nodes.get(targetId);
  const entry = frame.scene.entries.get(targetId);
  return !!node
    && supportsPressFeedback(node.kind)
    && !node.disabled
    && !!entry?.paintVisible
    && (isInFocusScope(frame.tree, targetId)
      || (node.kind === "select-trigger" && node.controlsId === topFocusScopeId(frame.tree)))
    && (!requireFocus || node.focused);
};

export const pressTargetAtPoint = (
  frame: FrameSnapshot,
  point: CellPoint
): WidgetId | null => {
  const hit = hitTest(frame.scene, point)[0];
  if (!hit) return null;
  return getEventPath(frame.scene, hit).find((id) => {
    const node = frame.tree.nodes.get(id);
    return !!node && supportsPressFeedback(node.kind) && !node.disabled && isInFocusScope(frame.tree, id);
  }) ?? null;
};

/** Owns transient down/up feedback; activation remains a WidgetCommand concern. */
export class PressManager {
  #pointer: PointerPress | null = null;
  #key: KeyPress | null = null;

  get activeId(): WidgetId | null {
    return this.#pointer?.armed ? this.#pointer.targetId : this.#key?.targetId ?? null;
  }

  beginPointer(frame: FrameSnapshot, pointerId: number, point: CellPoint): boolean {
    const before = this.activeId;
    const targetId = pressTargetAtPoint(frame, point);
    this.#key = null;
    this.#pointer = targetId ? { pointerId, targetId, point, armed: true } : null;
    return before !== this.activeId;
  }

  movePointer(frame: FrameSnapshot, pointerId: number, point: CellPoint): boolean {
    const pointer = this.#pointer;
    if (!pointer || pointer.pointerId !== pointerId) return false;
    const before = this.activeId;
    pointer.point = point;
    pointer.armed = pressTargetAtPoint(frame, point) === pointer.targetId;
    return before !== this.activeId;
  }

  endPointer(pointerId: number): boolean {
    if (this.#pointer?.pointerId !== pointerId) return false;
    const before = this.activeId;
    this.#pointer = null;
    return before !== this.activeId;
  }

  cancelPointer(pointerId: number): boolean {
    return this.endPointer(pointerId);
  }

  beginKey(frame: FrameSnapshot, input: KeyInput, targetId: WidgetId | null): boolean {
    if (
      !targetId
      || (!isCellKeyPress(input, "Enter") && !isCellKeyPress(input, " "))
      || !validPressTarget(frame, targetId, true)
    ) return false;
    const before = this.activeId;
    this.#pointer = null;
    this.#key = { identity: keyIdentity(input), targetId };
    return before !== this.activeId;
  }

  endKey(input: KeyInput): boolean {
    if (input.phase !== "up" || this.#key?.identity !== keyIdentity(input)) return false;
    const before = this.activeId;
    this.#key = null;
    return before !== this.activeId;
  }

  cancel(): boolean {
    const changed = this.activeId !== null;
    this.#pointer = null;
    this.#key = null;
    return changed;
  }

  sync(frame: FrameSnapshot): boolean {
    const before = this.activeId;
    if (this.#pointer) {
      if (!validPressTarget(frame, this.#pointer.targetId)) {
        this.#pointer = null;
      } else {
        this.#pointer.armed = pressTargetAtPoint(frame, this.#pointer.point) === this.#pointer.targetId;
      }
    }
    if (this.#key && !validPressTarget(frame, this.#key.targetId)) this.#key = null;
    return before !== this.activeId;
  }
}
