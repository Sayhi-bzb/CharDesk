import { normalizeBlackboardPath } from '@chardesk/blackboard';
import type { BlackboardFile, BlackboardWorkspaceSnapshot } from './repository';

export const serializeBlackboardSource = (snapshot: BlackboardWorkspaceSnapshot): string =>
  JSON.stringify({ chardesk: 'blackboard/source-v1', files: [...snapshot.files]
    .sort((left, right) => left.path.localeCompare(right.path)) });

export const parseBlackboardSource = (content: string): BlackboardFile[] => {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Blackboard source');
  const source = value as Record<string, unknown>;
  if (source.chardesk !== 'blackboard/source-v1' || !Array.isArray(source.files)) {
    throw new Error('Invalid Blackboard source version');
  }
  const paths = new Set<string>();
  const files = source.files.map((file: unknown) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Error('Invalid Blackboard file');
    const entry = file as Record<string, unknown>;
    if (typeof entry.path !== 'string' || typeof entry.content !== 'string') throw new Error('Invalid Blackboard file');
    const path = normalizeBlackboardPath(entry.path);
    if (path !== entry.path || paths.has(path)) throw new Error('Duplicate or noncanonical Blackboard path');
    paths.add(path);
    return { path, content: entry.content };
  });
  if (!paths.has('blackboard.yaml')) throw new Error('Missing Blackboard manifest');
  return files.sort((left, right) => left.path.localeCompare(right.path));
};
