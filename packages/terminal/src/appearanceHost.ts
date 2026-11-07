import type { CliRenderer, TerminalColors } from '@opentui/core';
import type { TerminalAppearanceRuntime } from './appearance.ts';

/** OpenTUI owns terminal protocols and its palette cache; this adapter owns attachment. */
export function attachTerminalAppearance(
  renderer: CliRenderer,
  appearance: TerminalAppearanceRuntime
) {
  const disconnect = appearance.connect({
    mode: () => renderer.themeMode,
    read: () => {
      renderer.clearPaletteCache();
      return renderer.getPalette({ size: 16, timeout: 150 });
    },
  });
  const refresh = () => {
    void appearance.refresh();
  };
  const palette = (colors: TerminalColors) => appearance.acceptPalette(colors, renderer.themeMode);
  renderer.on('theme_mode', refresh);
  renderer.on('palette', palette);
  renderer.on('focus', refresh);
  return () => {
    renderer.off('theme_mode', refresh);
    renderer.off('palette', palette);
    renderer.off('focus', refresh);
    disconnect();
  };
}
