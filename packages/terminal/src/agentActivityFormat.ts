import { getGraphemeCellWidth, iterateGraphemes } from '@chardesk/protocol';
import type { CanvasAgentActivity } from '@chardesk/local-runtime/agents';
import type { Translate } from './i18n.ts';

const actions: Record<string, readonly [string, string]> = {
  canvas_read: ['Read canvas', 'Reading'],
  canvas_search: ['Search', 'Searching'],
  canvas_write: ['Write', 'Writing'],
  canvas_fill: ['Fill', 'Filling'],
  canvas_erase: ['Erase', 'Erasing'],
  canvas_render: ['Render', 'Rendering content'],
  canvas_code: ['Code', 'Running code'],
  canvas_undo: ['Undo', 'Undoing'],
};
export function activityAction(entry: CanvasAgentActivity, t: Translate) {
  const [done, working] = actions[entry.operation] ?? ['Operation', 'Working'];
  if (entry.status === 'working') return t(working);
  const action = t(done);
  if (entry.status === 'failed') return t`${action} failed`;
  if (entry.status === 'interrupted') return t`${action} interrupted`;
  return action;
}
export function activityTime(timestamp: number, t: Translate, now = Date.now()) {
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  if (minutes < 1) return t('Just now');
  if (minutes < 60) return t`${minutes}m ago`;
  if (minutes < 1440) return t`${Math.floor(minutes / 60)}h ago`;
  return t`${Math.floor(minutes / 1440)}d ago`;
}

/** Preserve captured argument boundaries; original shell pipelines and quoting are not available. */
export function formatAgentCommand(argv: readonly string[], platform: NodeJS.Platform) {
  return argv
    .map((value) => {
      if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
      const quoted =
        platform === 'win32' ? value.replaceAll("'", "''") : value.replaceAll("'", "'\\''");
      return `'${quoted}'`;
    })
    .join(' ');
}
export function wrapAgentDetail(text: string, width: number) {
  const rows: string[] = [];
  for (const line of text.split('\n')) {
    let row = '',
      used = 0;
    for (const { segment } of iterateGraphemes(line.replace(/\p{Cc}/gu, ' '))) {
      const size = getGraphemeCellWidth(segment);
      if (row && used + size > Math.max(1, width)) {
        rows.push(row);
        row = '';
        used = 0;
      }
      row += segment;
      used += size;
    }
    rows.push(row);
  }
  return rows;
}
