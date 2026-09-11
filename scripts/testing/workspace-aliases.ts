import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const source = (relativePath: string) => path.resolve(root, relativePath)

export const workspaceAliases = [
  { find: /^@chardesk\/cell-core$/, replacement: source('packages/cell-core/src/index.ts') },
  { find: /^@chardesk\/cell-ui\/browser$/, replacement: source('packages/cell-ui/src/browser.tsx') },
  { find: /^@chardesk\/cell-ui$/, replacement: source('packages/cell-ui/src/index.ts') },
  { find: /^@chardesk\/keyboard\/browser$/, replacement: source('packages/keyboard/src/browser.ts') },
  { find: /^@chardesk\/keyboard$/, replacement: source('packages/keyboard/src/index.ts') },
  { find: /^@chardesk\/collaboration-protocol$/, replacement: source('packages/collaboration-protocol/src/index.ts') },
  { find: /^@chardesk\/chargraph\/examples$/, replacement: source('packages/chargraph/src/examples.ts') },
  { find: /^@chardesk\/chargraph\/markdown$/, replacement: source('packages/chargraph/src/markdown-default.ts') },
  { find: /^@chardesk\/chargraph\/mermaid$/, replacement: source('packages/chargraph/src/mermaid.ts') },
  { find: /^@chardesk\/chargraph\/theme$/, replacement: source('packages/chargraph/src/render-theme.ts') },
  { find: /^@chardesk\/rendering\/canvas$/, replacement: source('packages/rendering/src/canvas.ts') },
  { find: /^@chardesk\/rendering\/theme$/, replacement: source('packages/rendering/src/content-theme.ts') },
  { find: /^@chardesk\/ui\/styles$/, replacement: source('packages/ui/src/styles.ts') },
  { find: /^@chardesk\/blackboard$/, replacement: source('packages/blackboard/src/index.ts') },
  { find: /^@chardesk\/chargraph$/, replacement: source('packages/chargraph/src/index.ts') },
  { find: /^@chardesk\/document$/, replacement: source('packages/document/src/index.ts') },
  { find: /^@chardesk\/fonts$/, replacement: source('packages/fonts/src/index.ts') },
  { find: /^@chardesk\/fonts\/browser$/, replacement: source('packages/fonts/src/browser.ts') },
  { find: /^@chardesk\/font-maple$/, replacement: source('packages/font-maple/src/index.ts') },
  { find: /^@chardesk\/protocol$/, replacement: source('packages/protocol/src/index.ts') },
  { find: /^@chardesk\/rendering$/, replacement: source('packages/rendering/src/index.ts') },
  { find: /^@chardesk\/ui$/, replacement: source('packages/ui/src/index.ts') },
  { find: /^@chardesk\/viewer$/, replacement: source('packages/viewer/src/index.ts') },
] as const
