import { createContext, useContext, type ReactElement } from "react";
import type { CellSize, CellUiPresentation, RootProps, WidgetCommand } from "@chardesk/cell-ui";

export type DocumentSceneFragment = Readonly<{
  label: string;
  root: ReactElement<RootProps>;
  viewport: CellSize;
  presentation: CellUiPresentation;
  focusedId: string | null;
  onCommand: (command: WidgetCommand) => void;
  onHoverChange?: (targetId: string | null) => void;
}>;

export type DocumentSceneContextValue = Readonly<{
  width: number;
  register: (id: string, fragment: DocumentSceneFragment | null) => void;
}>;

export const DocumentSceneContext = createContext<DocumentSceneContextValue | null>(null);
export const useDocumentScene = () => useContext(DocumentSceneContext);
