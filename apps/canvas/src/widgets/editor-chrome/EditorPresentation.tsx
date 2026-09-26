import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  EditorPresentationContext,
  useEditorPresentation,
  type EditorPresentationMode,
  type EditorWidgetRole,
} from './EditorPresentationContext';

const isVisible = (mode: EditorPresentationMode, role: EditorWidgetRole) =>
  mode === 'standard' || role === 'essential';

export function EditorPresentationProvider({
  children,
  initialMode = 'standard',
}: {
  children: ReactNode;
  initialMode?: EditorPresentationMode;
}) {
  const [mode, setMode] = useState<EditorPresentationMode>(initialMode);
  const isWidgetVisible = useCallback(
    (role: EditorWidgetRole) => isVisible(mode, role),
    [mode]
  );
  const value = useMemo(
    () => ({ mode, setMode, isWidgetVisible }),
    [isWidgetVisible, mode]
  );

  return (
    <EditorPresentationContext.Provider value={value}>
      {children}
    </EditorPresentationContext.Provider>
  );
}

export function EditorWidget({
  role,
  children,
}: {
  role: EditorWidgetRole;
  children: ReactNode;
}) {
  const { isWidgetVisible } = useEditorPresentation();
  return isWidgetVisible(role) ? children : null;
}
