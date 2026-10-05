import { describe, expect, it } from 'vitest';
import type { BlackboardWorkspace } from '@/domains/legacy-blackboard/public';
import type { CanvasSessionDescriptor } from '@/domains/sessions/public';
import { collectLocalWorks } from './local-workspace-items';

describe('collectLocalWorks', () => {
  it('lists local sessions and repository works without duplicating source-backed views', () => {
    const sessions: CanvasSessionDescriptor[] = [
      { id: 'canvas', name: 'Canvas', mode: 'freeform' },
      { id: 'welcome', name: 'Welcome', mode: 'freeform', storagePolicy: 'ephemeral' },
      { id: 'slides', name: 'Deck', mode: 'slide' },
      { id: 'shared-canvas', name: 'Shared canvas', mode: 'freeform', collaboration: {
        version: 7, documentVersion: 6, mode: 'freeform', provider: 'encrypted-relay', roomId: 'room', key: 'key',
      } },
      { id: 'source-view', name: 'Board', mode: 'freeform', sourceBinding: {
        kind: 'blackboard', provider: 'browser-workspace', id: 'board',
      } },
    ];
    const blackboards: BlackboardWorkspace[] = [{
      id: 'board', title: 'Board', revision: 1, createdAt: 1, updatedAt: 1,
    }];
    expect(collectLocalWorks(sessions, blackboards)).toEqual([
      { id: 'canvas', name: 'Canvas', kind: 'canvas', shared: false, sessionId: 'canvas' },
      { id: 'slides', name: 'Deck', kind: 'slides', shared: false, sessionId: 'slides' },
      { id: 'shared-canvas', name: 'Shared canvas', kind: 'canvas', shared: true, sessionId: 'shared-canvas' },
      { id: 'board', name: 'Board', kind: 'retired', shared: false },
    ]);
  });
});
