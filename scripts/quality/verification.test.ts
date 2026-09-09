import { describe, expect, it, vi } from 'vitest'
import {
  affectedProjectNames,
  loadWorkspaceProjects,
  topologicalProjects,
  parseArguments,
  collectChangedFiles,
  createVerificationPlan,
  executeVerificationPlan,
} from './verification.mjs'

describe('verification task graph', () => {
  const projects = loadWorkspaceProjects()

  it('orders workspace dependencies before their consumers', () => {
    const order = topologicalProjects(projects, ['@chardesk/cli']).map(project => project.name)
    expect(order.indexOf('@chardesk/protocol')).toBeLessThan(order.indexOf('@chardesk/chargraph'))
    expect(order.indexOf('@chardesk/chargraph')).toBeLessThan(order.indexOf('@chardesk/cli'))
    expect(order.at(-1)).toBe('@chardesk/cli')
    expect(new Set(order).size).toBe(order.length)
  })

  it('orders application package dependencies before the application', () => {
    const order = topologicalProjects(projects, ['@chardesk/sync-server'])
      .map(project => project.name)
    expect(order).toEqual([
      '@chardesk/collaboration-protocol',
      '@chardesk/sync-server',
    ])
  })

  it('includes transitive workspace consumers for a package change', () => {
    const affected = affectedProjectNames(projects, ['packages/protocol/src/index.ts'])
    expect(affected.has('@chardesk/protocol')).toBe(true)
    expect(affected.has('@chardesk/chargraph')).toBe(true)
    expect(affected.has('@chardesk/cli')).toBe(true)
    expect(affected.has('root')).toBe(true)
  })

  it('keeps documentation-only changes scoped to the docs app', () => {
    expect([...affectedProjectNames(projects, ['apps/docs/content/docs/index.mdx'])])
      .toEqual(['@chardesk/docs'])
  })

  it('falls back to the complete graph for global tool inputs', () => {
    const affected = affectedProjectNames(projects, ['package-lock.json'])
    expect(affected.size).toBe(projects.length + 1)
  })

  it('treats every workflow definition as a global input', () => {
    const affected = affectedProjectNames(projects, ['.github/workflows/release.yml'])
    expect(affected.size).toBe(projects.length + 1)
  })

  const planFor = (files: string[], mode = 'quick', phase = 'all') => createVerificationPlan(
    parseArguments(['--mode', mode, '--phase', phase]), { base: 'test', files }, projects,
  )

  it('normalizes explicit files without widening their scope', () => {
    const options = parseArguments(['--file', './packages/cell-ui/src/checkbox.ts', '--file', 'packages/cell-ui/src/checkbox.ts', '--dry-run'])
    expect(options.files).toEqual(['packages/cell-ui/src/checkbox.ts'])
    expect(options.dryRun).toBe(true)
    expect(planFor(options.files).selected).toEqual(['@chardesk/cell-ui'])
  })

  it.each(['pr', 'full'])('rejects narrowed %s gates', mode => {
    expect(() => parseArguments(['--mode', mode, '--file', 'src/app/App.tsx'])).toThrow('only allowed in quick')
  })

  it.each([
    ['--file'], ['--file', '../outside.ts'], ['--file', 'packages/cell-ui'],
    ['--phase', 'typo'], ['--mode', 'typo'], ['--mode', '--dry-run'],
  ])('rejects invalid arguments: %j', (...args) => {
    expect(() => parseArguments(args)).toThrow()
  })

  it('collects removed paths and both sides of renames with NUL-safe git output', () => {
    const readGit = vi.fn((args: string[]) => {
      if (args.includes('base...HEAD')) return 'packages/cell-ui/src/removed.ts\0'
      if (args[0] === 'ls-files') return 'exp/web-tui/new file.tsx\0'
      return 'exp/web-tui/old.tsx\0exp/web-tui/renamed.tsx\0'
    })
    expect(collectChangedFiles('base', readGit).files).toEqual([
      'exp/web-tui/new file.tsx', 'exp/web-tui/old.tsx', 'exp/web-tui/renamed.tsx', 'packages/cell-ui/src/removed.ts',
    ])
    for (const [args] of readGit.mock.calls.filter(([args]) => args[0] === 'diff')) {
      expect(args).toContain('--no-renames')
      expect(args).not.toContain('--diff-filter=ACMR')
    }
  })

  it('keeps a leaf helper on deterministic tests without browser or dependency builds', () => {
    const plan = planFor(['packages/cell-ui/src/checkbox.ts'])
    expect(plan.tasks).toHaveLength(2)
    expect(plan.tasks[1].args).toEqual(['run', 'test:node', '-w', '@chardesk/cell-ui', '--', 'src/checkbox.test.tsx', 'src/press.test.tsx'])
    expect(plan.deferred).not.toEqual([])
  })

  it('routes Gallery CSS to Gallery tests and Chromium, without splitting local DOM', () => {
    const plan = planFor(['exp/web-tui/styles.css'])
    expect(plan.selected).toContain('root')
    expect(plan.tasks.filter(task => task.label === 'dom tests')).toHaveLength(1)
    const browser = plan.tasks.find(task => task.label === 'Cell browser tests')!
    expect(browser.args).toContain('--project=chromium')
    expect(browser.args).not.toContain('--project=webkit-cell-gallery')
    expect(plan.tasks.some(task => task.args.includes('--shard'))).toBe(false)
  })

  it('escalates shared focus and subsumes leaf tests into the package suite', () => {
    const plan = planFor(['packages/cell-ui/src/checkbox.ts', 'packages/cell-ui/src/interaction.ts'])
    expect(plan.cell.nodeTests).toEqual([])
    expect(plan.tasks.filter(task => task.label === 'test @chardesk/cell-ui')).toHaveLength(1)
    expect(plan.tasks.filter(task => task.label === 'Cell browser tests')).toHaveLength(1)
    expect(plan.tasks.find(task => task.label === 'Cell browser tests')!.args).toContain('--project=webkit-cell-gallery')
    expect(new Set(plan.tasks.map(task => JSON.stringify([task.command, task.args]))).size).toBe(plan.tasks.length)
  })

  it.each(['packages/cell-ui/src/index.ts', 'packages/cell-ui/src/deleted.ts', 'exp/web-tui/unclassified.tsx', 'e2e/helpers/cell-probe.ts'])(
    'falls back safely for %s', file => {
      const plan = planFor([file])
      expect(plan.cell.fullPackage).toBe(true)
      expect(plan.cell.dualBrowser).toBe(true)
      expect(plan.cell.browser).toEqual([{ file: 'e2e/web-tui.*\\.spec\\.ts', grep: null }])
    },
  )

  it('does not activate Cell E2E for unrelated application changes', () => {
    expect(planFor(['src/app/App.tsx'], 'pr', 'cell-e2e').tasks).toEqual([])
  })

  it('preserves an explicit app target even without changed files', () => {
    const options = parseArguments(['--target', 'app', '--phase', 'root-node'])
    const plan = createVerificationPlan(options, { base: 'test', files: [] }, projects)
    expect(plan.tasks).toHaveLength(1)
    expect(plan.tasks[0].args).toEqual(['vitest', 'run', '--project', 'node', '--passWithNoTests'])
  })

  it('keeps selected package DOM tests out of the node lane', () => {
    const plan = planFor(['packages/cell-ui/src/radio.dom.test.tsx'])
    expect(plan.cell.nodeTests).toEqual([])
    expect(plan.tasks.find(task => task.label === 'cell browser tests')!.args).toContain('src/radio.dom.test.tsx')
    expect(plan.cell.browser).toEqual([])
  })

  it('falls back to complete root tests for a mixed deleted source instead of ignoring it', () => {
    const plan = planFor(['src/deleted-file.ts', 'src/app/App.tsx'], 'pr', 'root-node')
    expect(plan.tasks[0].args).toContain('run')
    expect(plan.tasks[0].args).not.toContain('related')
  })

  it.each(['pr', 'full'])('retains complete quality/build gates in %s and adds Cell E2E', mode => {
    const plan = planFor(['packages/cell-ui/src/checkbox.ts'], mode)
    expect(plan.tasks.some(task => task.args.includes('knip'))).toBe(true)
    expect(plan.tasks.some(task => task.args.includes('check:architecture'))).toBe(true)
    expect(plan.tasks.some(task => task.label.startsWith('build '))).toBe(true)
    expect(plan.tasks.find(task => task.label === 'Cell browser tests')!.args).toContain('--project=webkit-cell-gallery')
  })

  it('uses the identical task list for dry-run and execution and reports failed stages', () => {
    const plan = planFor(['packages/cell-ui/src/checkbox.ts'])
    const spawn = vi.fn(() => ({ status: 0 }))
    const log = vi.fn()
    expect(executeVerificationPlan(plan, { dryRun: true, spawn, log })).toBe(0)
    expect(spawn).not.toHaveBeenCalled()
    executeVerificationPlan(plan, { spawn, log })
    expect(spawn.mock.calls.map(call => call.slice(0, 2))).toEqual(plan.tasks.map(task => [task.command, task.args]))
    expect(log.mock.calls.some(([line]) => line.includes('timing:'))).toBe(true)
    spawn.mockReset().mockReturnValue({ status: 9 })
    expect(executeVerificationPlan(plan, { spawn, log })).toBe(9)
    expect(spawn).toHaveBeenCalledTimes(1)
  })
})
