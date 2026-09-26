import { useMemo } from 'react';
import {
  CLASSIC_MAC_DARK_THEME,
  CLASSIC_MAC_LIGHT_THEME,
  resolveCellUiTheme,
} from '@chardesk/cell-ui';
import { CellSurface, type CellSurfaceProps } from '@chardesk/cell-ui/browser';
import { useCanvasAppearance } from '@/shared/canvas-appearance/hooks';

/** Keep Cell-native Host controls on the existing Host theme revision. */
export function HostCellSurface(props: CellSurfaceProps) {
  const appearance = useCanvasAppearance();
  const theme = useMemo(() => {
    const base =
      appearance.resolvedTheme === 'dark' ? CLASSIC_MAC_DARK_THEME : CLASSIC_MAC_LIGHT_THEME;
    const host = appearance.visualTheme?.host;
    return resolveCellUiTheme({
      ...base,
      background: host?.background ?? base.background,
      foreground: host?.foreground ?? base.foreground,
    });
  }, [appearance]);
  return (
    <CellSurface
      {...props}
      theme={theme}
      palette={{ color: theme.foreground, background: theme.background }}
    />
  );
}
