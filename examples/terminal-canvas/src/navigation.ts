import type { TerminalCanvas } from './model.ts';
import type { TerminalAction } from './shortcuts.ts';
import type { EditorCommandResult } from '@chardesk/editor-core/editor/types';
import type { GridCornerOrEdge, GridEdge } from '@chardesk/editor-core/selection/commands';

type NavigationAction = { id: TerminalAction; label: string; run: () => EditorCommandResult };

/** Keyboard bindings and the fallback dialog execute this same Host command catalog. */
export function navigationActions(model: TerminalCanvas): NavigationAction[] {
  const actions: NavigationAction[] = [
    { id: 'select-row', label: 'Select current row', run: model.commands.selectRow },
    { id: 'select-column', label: 'Select current column', run: model.commands.selectColumn },
    { id: 'origin', label: 'Go to origin', run: () => model.commands.pointAt({ x: 0, y: 0 }) },
    { id: 'focus', label: 'Locate content', run: model.commands.focusContent },
  ];
  for (const extend of [false, true]) {
    for (const [id, edge, label] of [
      ['edge-left', 'left', 'left edge'],
      ['edge-right', 'right', 'right edge'],
      ['edge-start', 'top-left', 'top-left bound'],
      ['edge-end', 'bottom-right', 'bottom-right bound'],
    ] as const) {
      actions.push({
        id: `${extend ? 'extend-' : ''}${id}`,
        label: `${extend ? 'Extend' : 'Move'} to ${label}`,
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
        label: `${extend ? 'Extend' : 'Jump'} to content boundary ${direction}`,
        run: () => model.commands.navigateToContentBoundary(edge as GridEdge, extend),
      });
    }
    for (const [name, direction] of [
      ['up', -1],
      ['down', 1],
    ] as const) {
      actions.push({
        id: `${extend ? 'extend-' : ''}page-${name}`,
        label: `${extend ? 'Extend' : 'Move'} one page ${name}`,
        run: () =>
          model.commands.navigate(0, Math.max(1, model.viewport.height) * direction, extend),
      });
    }
  }
  return actions;
}
