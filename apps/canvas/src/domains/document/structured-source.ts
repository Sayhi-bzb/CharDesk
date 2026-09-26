import {
  decodeStructuredComponents,
  decodeStructuredNode,
  normalizeScene,
  sceneToGridEntries,
  type StructuredComponentInstance,
  type StructuredNode,
} from "@/domains/legacy-structured/public";
import type { CanvasImportSnapshot } from "@/domains/sessions/public";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const validateComponents = (
  value: unknown,
  scene: StructuredNode[]
): StructuredComponentInstance[] => {
  if (!Array.isArray(value)) {
    throw new Error("Structured CharDesk components must be an array.");
  }
  const nodeIds = new Set(scene.map((node) => node.id));
  const componentIds = new Set<string>();
  value.forEach((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.templateId !== "string" ||
      typeof item.label !== "string" ||
      !isStringArray(item.atomIds) ||
      !isRecord(item.roles)
    ) {
      throw new Error("Structured CharDesk contains an invalid component.");
    }
    if (componentIds.has(item.id)) {
      throw new Error(`Structured CharDesk contains duplicate component id: ${item.id}`);
    }
    componentIds.add(item.id);
    if (item.atomIds.some((id) => !nodeIds.has(id))) {
      throw new Error(`Structured CharDesk component ${item.id} references a missing node.`);
    }
    Object.values(item.roles).forEach((ids) => {
      if (!isStringArray(ids) || ids.some((id) => !nodeIds.has(id))) {
        throw new Error(`Structured CharDesk component ${item.id} has an invalid role.`);
      }
    });
  });
  scene.forEach((node) => {
    if (node.component && !componentIds.has(node.component.instanceId)) {
      throw new Error(
        `Structured CharDesk node ${node.id} references a missing component.`
      );
    }
  });
  return decodeStructuredComponents(value, scene);
};

export const parseStructuredDocumentBody = (
  body: string
): CanvasImportSnapshot => {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (cause) {
    throw new Error("Structured CharDesk body must be valid JSON.", { cause });
  }
  if (!isRecord(value) || !Array.isArray(value.scene)) {
    throw new Error("Structured CharDesk body must contain scene and components arrays.");
  }
  const decoded = value.scene.map(decodeStructuredNode);
  if (decoded.some((node) => node === null)) {
    throw new Error("Structured CharDesk contains an invalid scene node.");
  }
  const scene = normalizeScene(decoded as StructuredNode[]);
  const nodeIds = new Set<string>();
  scene.forEach((node) => {
    if (nodeIds.has(node.id)) {
      throw new Error(`Structured CharDesk contains duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);
  });
  const components = validateComponents(value.components, scene);
  void components;
  return {
    mode: "freeform",
    grid: sceneToGridEntries(scene),
  };
};
