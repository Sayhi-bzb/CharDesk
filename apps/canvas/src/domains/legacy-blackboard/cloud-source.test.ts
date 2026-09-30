import { describe, expect, it } from 'vitest';
import { parseBlackboardSource, serializeBlackboardSource } from './cloud-source';

describe('Blackboard cloud source', () => {
  it('round-trips the source tree in stable order', () => {
    const snapshot = { workspace: { id: 'a', title: 'Board', revision: 1, createdAt: 1, updatedAt: 1 },
      files: [{ path: 'panels/a.panel', content: '# A' }, { path: 'blackboard.yaml', content: 'draft' }] };
    expect(parseBlackboardSource(serializeBlackboardSource(snapshot))).toEqual([
      { path: 'blackboard.yaml', content: 'draft' }, { path: 'panels/a.panel', content: '# A' },
    ]);
  });

  it('rejects duplicate, traversal, and missing manifest paths', () => {
    for (const files of [
      [{ path: 'blackboard.yaml', content: '' }, { path: 'blackboard.yaml', content: '' }],
      [{ path: 'blackboard.yaml', content: '' }, { path: '../other', content: '' }],
      [{ path: 'panels/a.panel', content: '' }],
    ]) expect(() => parseBlackboardSource(JSON.stringify({ chardesk: 'blackboard/source-v1', files }))).toThrow();
  });
});
