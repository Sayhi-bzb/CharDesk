import { describe, expect, it } from 'vitest'
import { evaluateReadingBudget } from './check-reading-budget.mjs'
import { agentMarkdown } from '../../apps/docs/app/lib/agent-markdown'

const catalog = '/docs/development/architecture'
const owner = '/docs/development/architecture/ownership'
const evidence = 'https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-core/README.md'
const contract = `Immutable contract. [Evidence](${evidence})`
const cases = [{ id: 'owner', page: 'architecture/ownership', markers: ['Immutable contract'] }]
const baseline = { indexTokens: 1000, tasks: [{ id: 'owner', page: cases[0].page, tokens: 2000 }] }
const index = `[Architecture](${catalog})`
const pageIndex = `[Owner](${owner})`
const run = (pages = new Map([[catalog, pageIndex], [owner, contract]]), overrides = {}) => evaluateReadingBudget({
  index, pages, cases, baseline, countTokens: (text: string) => text.length, ...overrides,
})

describe('documentation reading guard', () => {
  it('charges intermediate catalogs as well as the index and contract', () => {
    const result = run()
    expect(result.tasks[0].hops).toBe(2)
    expect(result.after).toBe([index, pageIndex, contract].join('\n\n').length)
  })

  it('chooses the cheaper catalog when several two-page routes reach the same owner', () => {
    const heavy = '/docs/development/heavy'
    const result = run(new Map([
      [heavy, `${'Long unrelated contract. '.repeat(20)} ${pageIndex}`],
      [catalog, pageIndex], [owner, contract],
    ]), { index: `[Heavy](${heavy}) ${index}` })
    expect(result.after).toBe([`[Heavy](${heavy}) ${index}`, pageIndex, contract].join('\n\n').length)
  })

  it('rejects an owner hidden behind a third page', () => {
    const intermediate = '/docs/development/intermediate'
    expect(() => run(new Map([
      [catalog, `[More](${intermediate})`], [intermediate, pageIndex], [owner, contract],
    ]))).toThrow('two-hop')
  })

  it('rejects orphaned pages even when the selected task still resolves', () => {
    expect(() => run(new Map([
      [catalog, pageIndex], [owner, contract], ['/docs/development/orphan', 'unreachable'],
    ]))).toThrow('two-hop')
  })

  it('rejects dead links and empty destination resources', () => {
    expect(() => run(new Map([[catalog, pageIndex]]))).toThrow('missing resource')
    expect(() => run(new Map([[catalog, pageIndex], [owner, '']]))).toThrow('missing resource')
  })

  it('rejects a reachable page that lost its contract or evidence', () => {
    expect(() => run(new Map([[catalog, pageIndex], [owner, evidence]]))).toThrow('lost contract')
    expect(() => run(new Map([[catalog, pageIndex], [owner, 'Immutable contract']]))).toThrow('missing repository evidence')
  })

  it('rejects task substitution and silently reduced coverage', () => {
    expect(() => run(undefined, { baseline: { ...baseline, tasks: [{ ...baseline.tasks[0], page: 'other' }] } })).toThrow('baseline drift')
    expect(() => run(undefined, { cases: [] })).toThrow('task set changed')
  })
})

describe('Agent Markdown projection', () => {
  it('uses public docs links while preserving external links, anchors and already public URLs', () => {
    expect(agentMarkdown('[State](/development/architecture/state-authority#authority-model) [User](/user) [Existing](/docs/development) [External](https://example.com/development) [Here](#here)'))
      .toBe('[State](/docs/development/architecture/state-authority#authority-model) [User](/docs/user) [Existing](/docs/development) [External](https://example.com/development) [Here](#here)')
  })

  it('removes the website task component before the generated Markdown map is appended', () => {
    expect(agentMarkdown('  Before\n\n<AgentRoutes />\n\nAfter  ')).toBe('Before\n\n\n\nAfter')
  })
})
