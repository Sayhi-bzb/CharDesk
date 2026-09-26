import { createContext, useContext } from 'react';

export type EditorPresentationMode = 'standard' | 'zen';
export type EditorWidgetRole = 'essential' | 'host' | 'pane' | 'contextual';

type EditorPresentationValue = {
  mode: EditorPresentationMode;
  setMode: (mode: EditorPresentationMode) => void;
  isWidgetVisible: (role: EditorWidgetRole) => boolean;
};

export const EditorPresentationContext = createContext<EditorPresentationValue>({
  mode: 'standard',
  setMode: () => undefined,
  isWidgetVisible: () => true,
});

export const useEditorPresentation = () => useContext(EditorPresentationContext);
