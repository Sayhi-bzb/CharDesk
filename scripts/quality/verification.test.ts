import { describe, expect, it } from 'vitest'
import {
  affectedProjectNames,
  loadWorkspaceProjects,
  topologicalProjects,
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
})
