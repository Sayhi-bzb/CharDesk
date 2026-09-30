import type { EditorFormFactor } from './types';

/** Presentation only: never changes document capabilities or saved preferences. */
export function resolveEditorHostPolicy(formFactor: EditorFormFactor) {
  const advanced = formFactor !== 'phone';
  return {
    advancedTools: advanced,
    advancedCharacters: advanced,
    manageAnchors: advanced,
    advancedSettings: advanced,
    splitView: advanced,
    sourceLink: advanced,
  };
}

export type EditorHostPolicy = ReturnType<typeof resolveEditorHostPolicy>;

export function isHostSettingVisible(
  policy: EditorHostPolicy,
  section: string,
  focusType?: string,
) {
  if (policy.advancedSettings) return true;
  if (section === 'shortcuts') return false;
  return !focusType || ['language', 'host-theme', 'canvas-font', 'text-renderer',
    'markdown-wrap', 'markdown-auto-anchors'].includes(focusType);
}
