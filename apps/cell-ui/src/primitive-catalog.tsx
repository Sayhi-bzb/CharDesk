import type { ComponentType } from "react";
import { ReorderingPrimitiveDemo } from "./primitives-demos";
import type { ComponentDocument } from "./component-catalog";

export type PrimitiveDocument = ComponentDocument;

export const primitiveDocuments: readonly PrimitiveDocument[] = [
  {
    slug: "reordering",
    title: "Reordering",
    description: "Reorder Cell-native rows with pointer drag or keyboard commands while the host owns the array state.",
    probeId: "primitive-reordering-page",
    Demo: (() => <ReorderingPrimitiveDemo probeId="primitive-reordering-page" />) as ComponentType,
    usage: `import { useState } from "react";
import { List, ListItem, Root, Text, reorderCellItems } from "@chardesk/cell-ui";

const [items, setItems] = useState([
  { id: "title", label: "Title" },
  { id: "chart", label: "Chart" },
]);

<Root>
  <List id="layers" label="Layers" reorderable>
    {items.map((item) => (
      <ListItem key={item.id} id={item.id} label={item.label}>
        <Text>{item.label}</Text>
      </ListItem>
    ))}
  </List>
</Root>;

// Apply the emitted reorder command in the host:
setItems((current) => [...reorderCellItems(current, targetId, toIndex)]);`,
    api: [
      { name: "List.reorderable", type: "boolean", description: "Enables pointer drag preview and reorder commands for direct ListItem children." },
      { name: "reorder", type: "WidgetCommand", description: "The host applies targetId and toIndex to its own ordered data." },
      { name: "reorderCellItems", type: "(items, targetId, toIndex) => items", description: "Pure helper for applying the command to application-owned data." },
    ],
  },
];

export const primitiveDocumentBySlug = new Map(primitiveDocuments.map((document) => [document.slug, document] as const));
export const primitiveNavigationDocuments = primitiveDocuments.toSorted((left, right) => left.title.localeCompare(right.title, "en"));
