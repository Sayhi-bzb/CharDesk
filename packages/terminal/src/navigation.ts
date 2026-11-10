import { english, type Translate } from './i18n.ts';
import type { TerminalCanvas } from '@chardesk/local-runtime/model';
import type { TerminalAction } from './shortcuts.ts';
import type { EditorCommandResult } from '@chardesk/editor-core/editor/types';
import type { GridCornerOrEdge, GridEdge } from '@chardesk/editor-core/selection/commands';

type NavigationAction = { id: TerminalAction; label: string; run: () => EditorCommandResult };

/** Keyboard bindings and the fallback dialog execute this same Host command catalog. */
export function navigationActions(
  model: TerminalCanvas,
  t: Translate = english
): NavigationAction[] {
  const actions: NavigationAction[] = [
    { id: 'select-row', label: t('Select current row'), run: model.commands.selectRow },
    { id: 'select-column', label: t('Select current column'), run: model.commands.selectColumn },
    { id: 'origin', label: t('Go to origin'), run: () => model.commands.pointAt({ x: 0, y: 0 }) },
    { id: 'focus', label: t('Locate content'), run: model.commands.focusContent },
  ];
  const directionLabels = { left: t('Left'), right: t('Right'), up: t('Up'), down: t('Down') };
  for (const extend of [false, true]) {
    for (const [id, edge, label] of [
      ['edge-left', 'left', t('left edge')],
      ['edge-right', 'right', t('right edge')],
      ['edge-start', 'top-left', t('top-left bound')],
      ['edge-end', 'bottom-right', t('bottom-right bound')],
    ] as const) {
      actions.push({
        id: `${extend ? 'extend-' : ''}${id}`,
        label: t`${extend ? t('Extend') : t('Move')} to ${label}`,
        run: () => model.commands.navigateToEdge(edge as GridCornerOrEdge, extend),
      });
    }
    for (const [direction, edge] of [
      ['left', 'left'],
      ['right', 'right'],
      ['up', 'top'],
      ['down', 'bottom'],
    ] as const) {
      actions.push({
        id: `${extend ? 'extend-' : ''}boundary-${direction}`,
        label: t`${extend ? t('Extend') : t('Jump')} to content boundary ${directionLabels[direction].toLowerCase()}`,
        run: () => model.commands.navigateToContentBoundary(edge as GridEdge, extend),
      });
    }
    for (const [name, direction] of [
      ['up', -1],
      ['down', 1],
    ] as const) {
      actions.push({
        id: `${extend ? 'extend-' : ''}page-${name}`,
        label: t`${extend ? t('Extend') : t('Move')} one page ${directionLabels[name].toLowerCase()}`,
        run: () =>
          model.commands.navigate(0, Math.max(1, model.viewport.height) * direction, extend),
      });
    }
  }
  return actions;
}
