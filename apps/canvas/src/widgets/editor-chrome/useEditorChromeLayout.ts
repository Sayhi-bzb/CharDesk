import { createContext, useContext } from "react";
import type {
  EditorChromeEdge,
  EditorFormFactor,
  EditorViewportFrame,
  SidebarPresentation,
} from "./types";

export type EditorChromeContextValue = {
  formFactor: EditorFormFactor;
  sidebarPresentation: SidebarPresentation;
  viewportFrame: EditorViewportFrame;
  setShellNode: (node: HTMLDivElement | null) => void;
  setViewportNode: (node: HTMLDivElement | null) => void;
  registerRegion: (
    id: string,
    edge: EditorChromeEdge,
    node: HTMLElement | null
  ) => void;
};

export const EditorChromeContext =
  createContext<EditorChromeContextValue | null>(null);

export const useEditorChromeLayout = () => {
  const context = useContext(EditorChromeContext);
  if (!context) {
    throw new Error(
      "useEditorChromeLayout must be used within EditorChromeProvider"
    );
  }
  return context;
};
