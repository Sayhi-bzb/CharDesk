import { expect, test } from 'bun:test';
import { parseOptions } from './options.ts';

test('workspace options retain multiple paths and terminal preferences', () => {
  expect(
    parseOptions([
      'one.chardesk',
      '--paste-mode',
      'plain',
      '--workspace',
      'work.json',
      'two.chardesk',
      '--blank',
    ])
  ).toEqual({
    files: ['one.chardesk', 'two.chardesk'],
    pasteMode: 'plain',
    workspacePath: 'work.json',
    blank: true,
    snapshot: false,
  });
  expect(parseOptions(['--', '--help']).files).toEqual(['--help']);
  expect(parseOptions([]).pasteMode).toBeUndefined();
  expect(parseOptions(['--paste-mode', 'auto']).pasteMode).toBe('auto');
  expect(parseOptions(['--settings', 'prefs.json']).settingsPath).toBe('prefs.json');
});

test('invalid options and multi-document snapshots fail before workspace IO', () => {
  for (const args of [
    ['--lang'],
    ['--lang', 'de'],
    ['--lang', 'en'],
    ['--lang', 'zh'],
    ['--paste-mode', 'unknown'],
    ['--workspace'],
    ['--workspace', '--blank'],
    ['--settings'],
    ['--settings', '--blank'],
    ['--unknown'],
    ['--no-autosave'],
    ['--snapshot', 'a', 'b'],
  ])
    expect(() => parseOptions(args)).toThrow();
  expect(parseOptions(['--snapshot', 'a']).snapshot).toBe(true);
});
