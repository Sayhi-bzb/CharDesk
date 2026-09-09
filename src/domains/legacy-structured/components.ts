import type { StructuredComponentInstance, StructuredNode } from "./types";

// Read-only decoder retained for validating legacy documents.
const isComponentMetadata = (
  component: unknown
): component is NonNullable<StructuredNode["component"]> =>
  !!component &&
  typeof component === "object" &&
  typeof (component as { instanceId?: unknown }).instanceId === "string" &&
  typeof (component as { templateId?: unknown }).templateId === "string" &&
  typeof (component as { role?: unknown }).role === "string";

const cloneStructuredComponent = (
  component: StructuredComponentInstance
): StructuredComponentInstance => ({
  id: component.id,
  templateId: component.templateId,
  label: component.label,
  atomIds: [...component.atomIds],
  roles: Object.fromEntries(
    Object.entries(component.roles).map(([role, atomIds]) => [role, [...atomIds]])
  ),
});

const decodeStringArray = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : null;

export const decodeStructuredComponents = (
  value: unknown,
  scene: StructuredNode[]
): StructuredComponentInstance[] => {
  if (!Array.isArray(value)) return deriveStructuredComponentsFromScene(scene);
  const decoded = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const atomIds = decodeStringArray(candidate.atomIds);
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.templateId !== "string" ||
      typeof candidate.label !== "string" ||
      !atomIds ||
      !candidate.roles ||
      typeof candidate.roles !== "object" ||
      Array.isArray(candidate.roles)
    ) {
      return [];
    }
    const roles = Object.fromEntries(
      Object.entries(candidate.roles).flatMap(([role, ids]) => {
        const decodedIds = decodeStringArray(ids);
        return decodedIds ? [[role, decodedIds]] : [];
      })
    );
    return [{
      id: candidate.id,
      templateId: candidate.templateId,
      label: candidate.label,
      atomIds,
      roles,
    } satisfies StructuredComponentInstance];
  });
  return normalizeStructuredComponents(decoded, scene);
};

const deriveStructuredComponentsFromScene = (
  scene: StructuredNode[]
): StructuredComponentInstance[] => {
  const byInstanceId = new Map<string, StructuredComponentInstance>();
  scene.forEach((node) => {
    const component = node.component;
    if (!isComponentMetadata(component)) return;
    const current =
      byInstanceId.get(component.instanceId) ??
      ({
        id: component.instanceId,
        templateId: component.templateId,
        label: component.templateId,
        atomIds: [],
        roles: {},
      } satisfies StructuredComponentInstance);
    current.atomIds.push(node.id);
    current.roles[component.role] = [
      ...(current.roles[component.role] ?? []),
      node.id,
    ];
    byInstanceId.set(component.instanceId, current);
  });
  return [...byInstanceId.values()];
};

const normalizeStructuredComponents = (
  components: StructuredComponentInstance[] | undefined,
  scene: StructuredNode[]
) => {
  const nodeIds = new Set(scene.map((node) => node.id));
  const source =
    components && components.length > 0
      ? components
      : deriveStructuredComponentsFromScene(scene);
  const normalized = source
    .map((component) => {
      const atomIds = component.atomIds.filter((id) => nodeIds.has(id));
      const roles = Object.fromEntries(
        Object.entries(component.roles)
          .map(([role, ids]) => [
            role,
            ids.filter((id) => nodeIds.has(id)),
          ])
          .filter(([, ids]) => ids.length > 0)
      );
      return {
        id: component.id,
        templateId: component.templateId,
        label: component.label,
        atomIds,
        roles,
      };
    })
    .filter((component) => component.atomIds.length > 0);

  return normalized.map(cloneStructuredComponent);
};
