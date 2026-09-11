import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cellVerificationScope, isCellInput } from './verification-cell.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

const globalInputs = new Set([
  '.github/workflows/ci.yml',
  'eslint.config.js',
  'knip.json',
  'package-lock.json',
  'package.json',
  'tsconfig.app.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vitest.config.ts',
  'vite.config.ts',
  'scripts/quality/verification.mjs',
  'scripts/quality/verification-cell.mjs',
  'scripts/testing/workspace-aliases.ts',
  'scripts/testing/workspace-aliases.js',
  'playwright.config.ts',
])

const isGlobalInput = file =>
  globalInputs.has(file) || file.startsWith('.github/workflows/')

const git = (args, allowFailure = false) => {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    if (allowFailure) return ''
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`)
  }
  return args.includes('-z') ? result.stdout : result.stdout.trim()
}

export function loadWorkspaceProjects(root = repositoryRoot) {
  const projects = []
  for (const parent of ['packages', 'apps']) {
    const parentPath = path.join(root, parent)
    for (const entry of readdirSync(parentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const relativeRoot = `${parent}/${entry.name}`
      const manifestPath = path.join(root, relativeRoot, 'package.json')
      if (!existsSync(manifestPath)) continue
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      projects.push({
        name: manifest.name,
        root: relativeRoot,
        kind: parent === 'packages' ? 'package' : 'app',
        manifest,
      })
    }
  }
  const names = new Set(projects.map(project => project.name))
  for (const project of projects) {
    project.dependencies = new Set(dependencyFields.flatMap(field =>
      Object.keys(project.manifest[field] ?? {}).filter(name => names.has(name)),
    ))
  }
  return projects
}

export function topologicalProjects(projects, selectedNames) {
  const selected = new Set(selectedNames)
  const byName = new Map(projects.map(project => [project.name, project]))
  const includeDependencies = (name) => {
    const project = byName.get(name)
    if (!project) return
    for (const dependency of project.dependencies) {
      if (selected.has(dependency)) continue
      selected.add(dependency)
      includeDependencies(dependency)
    }
  }
  for (const name of [...selected]) includeDependencies(name)

  const ordered = []
  const visiting = new Set()
  const visited = new Set()
  const visit = (name) => {
    if (visited.has(name)) return
    if (visiting.has(name)) throw new Error(`Workspace dependency cycle at ${name}`)
    visiting.add(name)
    const project = byName.get(name)
    for (const dependency of project?.dependencies ?? []) {
      if (selected.has(dependency)) visit(dependency)
    }
    visiting.delete(name)
    visited.add(name)
    if (project) ordered.push(project)
  }
  for (const name of selected) visit(name)
  return ordered
}

export function affectedProjectNames(projects, changedFiles, forceFull = false) {
  if (forceFull || changedFiles.some(isGlobalInput)) {
    return new Set(['root', ...projects.map(project => project.name)])
  }
  const affected = new Set()
  for (const file of changedFiles) {
    const project = projects.find(candidate =>
      file === candidate.root || file.startsWith(`${candidate.root}/`),
    )
    if (project) affected.add(project.name)
    else if (file.startsWith('src/') || file.startsWith('scripts/')
      || file.startsWith('e2e/')) affected.add('root')
  }

  const reverse = new Map(projects.map(project => [project.name, new Set()]))
  const rootManifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))
  for (const project of projects) {
    for (const dependency of project.dependencies) reverse.get(dependency)?.add(project.name)
    if (dependencyFields.some(field => rootManifest[field]?.[project.name])) {
      reverse.get(project.name)?.add('root')
    }
  }
  const queue = [...affected]
  while (queue.length > 0) {
    const name = queue.shift()
    for (const dependent of reverse.get(name) ?? []) {
      if (affected.has(dependent)) continue
      affected.add(dependent)
      queue.push(dependent)
    }
  }
  return affected
}

export const parseArguments = argv => {
  const options = { mode: 'quick', phase: 'all', base: undefined, shard: undefined, target: undefined, files: [], dryRun: false }
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--dry-run') { options.dryRun = true; continue }
    if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`Missing value for ${value}`)
    if (value === '--mode') options.mode = argv[++index]
    else if (value === '--phase') options.phase = argv[++index]
    else if (value === '--base') options.base = argv[++index]
    else if (value === '--shard') options.shard = argv[++index]
    else if (value === '--target') options.target = argv[++index]
    else if (value === '--file') options.files.push(argv[++index])
    else throw new Error(`Unknown verification argument: ${value}`)
  }
  if (!['quick', 'pr', 'full'].includes(options.mode)) throw new Error(`Invalid mode: ${options.mode}`)
  if (!['all', 'quality', 'typecheck', 'workspace-tests', 'root-node', 'root-dom', 'build', 'cell-e2e'].includes(options.phase)) {
    throw new Error(`Invalid phase: ${options.phase}`)
  }
  if (options.files.length && options.mode !== 'quick') throw new Error('--file is only allowed in quick mode; PR/full gates cannot be narrowed.')
  options.files = [...new Set(options.files.map(file => {
    const relative = path.relative(repositoryRoot, path.resolve(repositoryRoot, file)).split(path.sep).join('/')
    if (!relative || relative === '..' || relative.startsWith('../') || relative.includes('\0')) {
      throw new Error(`File must be inside the repository: ${file}`)
    }
    if (existsSync(path.join(repositoryRoot, relative)) && statSync(path.join(repositoryRoot, relative)).isDirectory()) {
      throw new Error(`--file requires a file, not a directory: ${file}`)
    }
    return relative
  }))]
  return options
}

const resolveDefaultBase = () => {
  const branch = git(['branch', '--show-current'], true)
  if (branch && branch !== 'main' && git(['rev-parse', '--verify', 'main'], true)) return 'main'
  return 'HEAD'
}

export function collectChangedFiles(base, readGit = git) {
  const changed = new Set()
  const resolvedBase = base ?? resolveDefaultBase()
  if (resolvedBase !== 'HEAD') {
    readGit(['diff', '--name-only', '--no-renames', '-z', `${resolvedBase}...HEAD`]).split('\0').filter(Boolean)
      .forEach(file => changed.add(file))
  }
  readGit(['diff', '--name-only', '--no-renames', '-z', 'HEAD']).split('\0').filter(Boolean)
    .forEach(file => changed.add(file))
  readGit(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)
    .forEach(file => changed.add(file))
  return { base: resolvedBase, files: [...changed].sort() }
}

const existingLintFiles = files => files.filter(file =>
  existsSync(path.join(repositoryRoot, file)) && /\.(?:c|m)?(?:j|t)sx?$/u.test(file),
)

const sourceFiles = files => files.filter(file =>
  existsSync(path.join(repositoryRoot, file)) && /\.(?:j|t)sx?$/u.test(file),
)

const runWorkspaceScript = (project, script, run) => run(
  npmCommand,
  ['run', script, '--workspace', project.name, '--ignore-scripts'],
  { label: `${script} ${project.name}` },
)

const createBuildRunner = (projects, run) => {
  const built = new Set()
  const build = (names) => {
    for (const project of topologicalProjects(projects, names)) {
      if (built.has(project.name) || !project.manifest.scripts?.build) continue
      runWorkspaceScript(project, 'build', run)
      built.add(project.name)
    }
  }
  return { build, built }
}

const runTypechecks = (projects, selected, buildRunner, run) => {
  const packageProjects = projects.filter(project =>
    selected.has(project.name) && project.kind === 'package',
  )
  for (const project of topologicalProjects(projects, packageProjects.map(project => project.name))) {
    buildRunner.build(project.dependencies)
    if (project.manifest.scripts?.typecheck) runWorkspaceScript(project, 'typecheck', run)
    else if (project.manifest.scripts?.build) buildRunner.build([project.name])
  }
  if (selected.has('root')) run(npxCommand, ['tsc', '-b', '--pretty', 'false'], { label: 'typecheck app' })
  for (const project of projects.filter(project =>
    selected.has(project.name) && project.kind === 'app' && project.manifest.scripts?.typecheck,
  )) {
    buildRunner.build(project.dependencies)
    runWorkspaceScript(project, 'typecheck', run)
  }
}

const runQuality = (mode, projects, selected, changedFiles, buildRunner, run, cellOnlyQuick) => {
  const full = mode === 'full'
  const lintFiles = full ? ['.'] : existingLintFiles(changedFiles)
  if (lintFiles.length > 0) run(npxCommand, ['eslint', ...lintFiles], { label: 'lint' })
  if (cellOnlyQuick) return
  runTypechecks(projects, selected, buildRunner, run)

  const shouldRunKnip = mode !== 'quick' || changedFiles.some(file =>
    file.endsWith('package.json') || !existsSync(path.join(repositoryRoot, file)),
  )
  if (shouldRunKnip) run(npxCommand, ['knip'], { label: 'knip' })

  const productionChange = full || mode === 'pr' || changedFiles.some(file =>
    /^(?:src|packages)\/.*\.(?:ts|tsx)$/u.test(file),
  )
  if (productionChange) run(npmCommand, ['run', 'check:architecture'], { label: 'architecture guards' })
}

const runWorkspaceTests = (projects, selected, buildRunner, run, cell, mode) => {
  for (const project of projects) {
    if (!selected.has(project.name) || !project.manifest.scripts?.test) continue
    if (project.name === '@chardesk/cell-ui' && mode === 'quick' && !cell.fullPackage) {
      for (const [environment, files] of [['node', cell.nodeTests], ['browser', cell.domTests]]) {
        if (files.length) run(npmCommand, ['run', `test:${environment}`, '-w', project.name, '--', ...files], {
          label: `cell ${environment} tests`, reason: cell.reason,
        })
      }
      continue
    }
    if (project.manifest.bin) buildRunner.build([project.name])
    runWorkspaceScript(project, 'test', run)
  }
}

const runRootTests = (project, mode, changedFiles, shard, run, cell, cellOnlyQuick) => {
  if (project === 'dom' && !shard && mode !== 'quick') {
    runRootTests(project, mode, changedFiles, '1/2', run, cell, cellOnlyQuick)
    runRootTests(project, mode, changedFiles, '2/2', run, cell, cellOnlyQuick)
    return
  }
  const args = ['vitest']
  const conservative = changedFiles.some(file => isGlobalInput(file)
    || !existsSync(path.join(repositoryRoot, file)) || /\.(css|json)$/u.test(file))
  const related = mode !== 'full' && !conservative ? sourceFiles(changedFiles) : []
  if (cellOnlyQuick) return
  if (related.length > 0) args.push('related', ...related, '--run')
  else args.push('run')
  args.push('--project', project, '--passWithNoTests')
  if (shard) args.push('--shard', shard)
  run(npxCommand, args, { label: `${project} tests${shard ? ` shard ${shard}` : ''}` })
}

const runBuild = (mode, projects, selected, buildRunner, target, run) => {
  let names = projects
    .filter(project => project.kind === 'package' && selected.has(project.name))
    .map(project => project.name)
  if (target && target !== 'app') names = [target]
  buildRunner.build(names)
  if (target && target !== 'app') return

  if (mode === 'full' || selected.has('root') || target === 'app') {
    run('node', ['scripts/data/generate-welcome-canvas.mjs', '--verify'], { label: 'verify welcome canvas' })
    run(npxCommand, ['tsc', '-b'], { label: 'compile app' })
    run(npxCommand, ['vite', 'build'], { label: 'build app' })
  }
  if (target === 'app') return
  const docs = projects.find(project => project.name === '@chardesk/docs')
  if (docs && (mode === 'full' || selected.has(docs.name))) {
    runWorkspaceScript(docs, 'build', run)
    run('node', ['scripts/docs/merge-build.mjs'], { label: 'merge docs build' })
    run('node', ['scripts/docs/verify-build.mjs'], { label: 'verify docs build' })
  }
  const site = projects.find(project => project.name === '@chardesk/chargraph-site')
  if (site && (mode === 'full' || selected.has(site.name))) {
    runWorkspaceScript(site, 'build', run)
    run('node', ['scripts/chargraph/merge-build.mjs'], { label: 'merge CharGraph build' })
    run('node', ['scripts/chargraph/verify-build.mjs'], { label: 'verify CharGraph build' })
  }
}

export function createVerificationPlan(options, changes, projects = loadWorkspaceProjects()) {
  if (options.target && options.target !== 'app' && !projects.some(project => project.name === options.target)) {
    throw new Error(`Unknown workspace target: ${options.target}`)
  }
  const tasks = []
  const keys = new Set()
  const run = (command, args, metadata = {}) => {
    const key = JSON.stringify([command, args])
    if (keys.has(key)) return
    keys.add(key)
    tasks.push({ command, args, label: metadata.label ?? [command, ...args].join(' '),
      reason: metadata.reason ?? `${options.mode}: affected project / requested phase` })
  }
  const selected = options.mode === 'full'
    ? new Set(['root', ...projects.map(project => project.name)])
    : affectedProjectNames(projects, changes.files)
  if (options.target && options.target !== 'app') selected.add(options.target)
  if (options.target === 'app') selected.add('root')
  const cell = cellVerificationScope(changes.files, {
    mode: options.mode, selected, root: repositoryRoot, global: changes.files.some(isGlobalInput),
  })
  const cellOnlyQuick = options.mode === 'quick' && !options.target
    && changes.files.length > 0 && changes.files.every(isCellInput)
  if (cell.gallery) selected.add('@chardesk/cell-ui-site')
  if (cell.fullPackage && cell.active) selected.add('@chardesk/cell-ui')
  const deferred = options.mode === 'quick'
    ? ['PR/full: complete quality checks, production builds and merge browser coverage'] : []
  const plan = { tasks, selected: [...selected], deferred, cell }
  if (selected.size === 0 && options.mode !== 'full') return plan

  const buildRunner = createBuildRunner(projects, run)
  const phase = options.phase
  if (phase === 'typecheck') {
    runTypechecks(projects, selected, buildRunner, run)
    return plan
  }
  if (phase === 'all' || phase === 'quality') {
    runQuality(options.mode, projects, selected, changes.files, buildRunner, run, cellOnlyQuick)
  }
  if (phase === 'all' || phase === 'workspace-tests') {
    runWorkspaceTests(projects, selected, buildRunner, run, cell, options.mode)
  }
  if ((phase === 'all' || phase === 'root-node') && selected.has('root')) {
    runRootTests('node', options.mode, changes.files, undefined, run, cell, cellOnlyQuick)
  }
  if ((phase === 'all' || phase === 'root-dom') && selected.has('root')) {
    runRootTests('dom', options.mode, changes.files, options.shard, run, cell, cellOnlyQuick)
  }
  if ((phase === 'all' || phase === 'cell-e2e') && cell.active) {
    // Batch unfiltered suites into one browser launch; filtered suites keep their own selector.
    const unfiltered = cell.browser.filter(suite => suite.grep === null).map(suite => suite.file)
    const suites = cell.browser.filter(suite => suite.grep !== null)
      .map(suite => ({ files: [suite.file], grep: suite.grep }))
    if (unfiltered.length) suites.unshift({ files: unfiltered, grep: null })
    for (const suite of suites) {
      run(npmCommand, ['run', 'test:e2e', '-w', '@chardesk/cell-ui-site', '--', ...suite.files, '--project=chromium',
        ...(cell.dualBrowser ? ['--project=webkit'] : []),
        ...(suite.grep ? ['--grep', suite.grep] : [])], { label: 'Cell browser tests', reason: cell.reason })
    }
  }
  if (phase === 'build' || (phase === 'all' && options.mode !== 'quick')) {
    runBuild(options.mode, projects, selected, buildRunner, options.target, run)
  }
  return plan
}

export function executeVerificationPlan(plan, { dryRun = false, spawn = spawnSync, log = console.log } = {}) {
  const started = performance.now()
  const timings = []
  let status = 0
  for (const task of plan.tasks) {
    log(`\n[verify] ${task.label}\n  reason: ${task.reason}\n  command: ${[task.command, ...task.args].map(arg => JSON.stringify(arg)).join(' ')}`)
    if (dryRun) continue
    const before = performance.now()
    const result = spawn(task.command, task.args, { cwd: repositoryRoot, stdio: 'inherit', env: process.env })
    timings.push({ label: task.label, seconds: (performance.now() - before) / 1000 })
    status = result.status ?? 1
    if (result.error) log(`[verify] ${result.error.message}`)
    if (status !== 0) break
  }
  for (const note of plan.deferred) log(`[verify] deferred: ${note}`)
  if (!dryRun) {
    for (const timing of timings) log(`[verify] timing: ${timing.label} ${timing.seconds.toFixed(2)}s`)
    log(`[verify] total ${((performance.now() - started) / 1000).toFixed(2)}s; ${timings.length}/${plan.tasks.length} tasks; status=${status}`)
  }
  return status
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv)
  const changes = options.files.length ? { base: 'explicit files', files: options.files } : collectChangedFiles(options.base)
  const plan = createVerificationPlan(options, changes)
  console.log(`[verify] mode=${options.mode} phase=${options.phase} base=${changes.base}`)
  console.log(`[verify] changed=${changes.files.length} affected=${plan.selected.join(',') || 'none'}`)
  process.exitCode = executeVerificationPlan(plan, { dryRun: options.dryRun })
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { main() } catch (error) {
    console.error(`[verify] ${error.message}`)
    process.exitCode = 1
  }
}
