import type { Point } from "@/shared/types";
import type { StructuredNode } from "./types";
import { createStructuredNodeId } from "./scene";

type StructuredLayerDirection = "forward" | "backward" | "front" | "back";

const normalizeOrders = (scene: StructuredNode[]) =>
  scene.map((node, index) => ({ ...node, order: index + 1 }));

const sortByOrder = (scene: StructuredNode[]) =>
  [...scene].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

export const getNextStructuredOrder = (scene: readonly StructuredNode[]) =>
  scene.length === 0 ? 1 : Math.max(...scene.map((node) => node.order)) + 1;

export const canReorderStructuredNodes = (
  scene: StructuredNode[],
  selectedIds: string[],
  direction: StructuredLayerDirection
) => {
  const selected = new Set(selectedIds);
  if (selected.size === 0) return false;
  const ordered = sortByOrder(scene);
  if (ordered.length < 2 || ordered.every((node) => selected.has(node.id))) {
    return false;
  }

  if (direction === "forward" || direction === "front") {
    return ordered.some(
      (node, index) =>
        selected.has(node.id) &&
        ordered.slice(index + 1).some((candidate) => !selected.has(candidate.id))
    );
  }

  return ordered.some(
    (node, index) =>
      selected.has(node.id) &&
      ordered.slice(0, index).some((candidate) => !selected.has(candidate.id))
  );
};

export const reorderStructuredNodes = (
  scene: StructuredNode[],
  selectedIds: string[],
  direction: StructuredLayerDirection
) => {
  const selected = new Set(selectedIds);
  if (selected.size === 0) return normalizeOrders(sortByOrder(scene));

  const ordered = normalizeOrders(sortByOrder(scene));
  const isSelected = (node: StructuredNode) => selected.has(node.id);

  if (direction === "front") {
    return normalizeOrders([
      ...ordered.filter((node) => !isSelected(node)),
      ...ordered.filter(isSelected),
    ]);
  }

  if (direction === "back") {
    return normalizeOrders([
      ...ordered.filter(isSelected),
      ...ordered.filter((node) => !isSelected(node)),
    ]);
  }

  const next = [...ordered];
  if (direction === "forward") {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (!isSelected(next[index]) || isSelected(next[index + 1])) continue;
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
    }
  } else {
    for (let index = 1; index < next.length; index += 1) {
      if (!isSelected(next[index]) || isSelected(next[index - 1])) continue;
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
    }
  }

  return normalizeOrders(next);
};

const offsetPoint = (point: Point, offset: Point): Point => ({
  x: point.x + offset.x,
  y: point.y + offset.y,
});

const cloneComponentWithRemappedInstance = (
  component: StructuredNode["component"],
  instanceIdMap: Map<string, string>
) => {
  if (!component) return {};
  let instanceId = instanceIdMap.get(component.instanceId);
  if (!instanceId) {
    instanceId = createStructuredNodeId();
    instanceIdMap.set(component.instanceId, instanceId);
  }
  return {
    component: {
      ...component,
      instanceId,
    },
  };
};

export const duplicateStructuredNodes = (
  scene: StructuredNode[],
  selectedIds: string[],
  offset: Point = { x: 1, y: 1 }
) => {
  const selected = new Set(selectedIds);
  const ordered = normalizeOrders(sortByOrder(scene));
  const highestOrder = ordered.length;
  const componentInstanceIdMap = new Map<string, string>();
  const duplicates = ordered
    .filter((node) => selected.has(node.id))
    .map((node, index): StructuredNode => {
      if (node.type !== "text") {
        return {
          ...node,
          id: createStructuredNodeId(),
          order: highestOrder + index + 1,
          style: { ...node.style },
          start: offsetPoint(node.start, offset),
          end: offsetPoint(node.end, offset),
          ...cloneComponentWithRemappedInstance(
            node.component,
            componentInstanceIdMap
          ),
        };
      }

      return {
        ...node,
        id: createStructuredNodeId(),
        order: highestOrder + index + 1,
        style: { ...node.style },
        position: offsetPoint(node.position, offset),
        ...cloneComponentWithRemappedInstance(
          node.component,
          componentInstanceIdMap
        ),
      };
    });

  return {
    scene: normalizeOrders([...ordered, ...duplicates]),
    duplicatedIds: duplicates.map((node) => node.id),
  };
};
