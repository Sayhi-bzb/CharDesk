import { createContext, useContext, type MouseEvent, type ReactElement } from "react";
import type { CellSize, CellUiPresentation, RootProps, WidgetCommand } from "@chardesk/cell-ui";
import type { CellSvgIcons } from "@chardesk/cell-ui/browser";

export type DocumentSceneFragment = Readonly<{
  label: string;
  root: ReactElement<RootProps>;
  viewport: CellSize;
  presentation: CellUiPresentation;
  focusedId: string | null;
  onCommand: (command: WidgetCommand) => void;
  onHoverChange?: (targetId: string | null) => void;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  svgIcons?: CellSvgIcons;
}>;

export type DocumentSceneContextValue = Readonly<{
  width: number;
  register: (id: string, fragment: DocumentSceneFragment | null) => void;
}>;

export const DocumentSceneContext = createContext<DocumentSceneContextValue | null>(null);
export const useDocumentScene = () => useContext(DocumentSceneContext);
