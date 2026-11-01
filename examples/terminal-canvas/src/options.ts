import type { PasteMode } from './text.ts';

export function parseOptions(args: readonly string[]) {
  let pasteMode: PasteMode | undefined,
    settingsPath: string | undefined,
    workspacePath: string | undefined;
  let blank = false,
    snapshot = false;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--paste-mode') {
      const value = args[++i];
      if (value !== 'auto' && value !== 'plain' && value !== 'ansi' && value !== 'markdown')
        throw new Error('--paste-mode must be auto, plain, ansi or markdown.');
      pasteMode = value;
    } else if (arg === '--settings') {
      settingsPath = args[++i];
      if (!settingsPath || settingsPath.startsWith('-'))
        throw new Error('--settings needs a filename.');
    } else if (arg === '--workspace') {
      workspacePath = args[++i];
      if (!workspacePath || workspacePath.startsWith('-'))
        throw new Error('--workspace needs a filename.');
    } else if (arg === '--blank') blank = true;
    else if (arg === '--snapshot') snapshot = true;
    else if (arg === '--') {
      files.push(...args.slice(i + 1));
      break;
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else files.push(arg);
  }
  if (snapshot && files.length > 1) throw new Error('Snapshot accepts one document.');
  return {
    pasteMode,
    workspacePath,
    files,
    blank,
    snapshot,
    ...(settingsPath ? { settingsPath } : {}),
  };
}
