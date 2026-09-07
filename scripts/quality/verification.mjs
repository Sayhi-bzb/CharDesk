import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
  'scripts/quality/verification.mjs',
  'scripts/testing/workspace-aliases.ts',
])

const isGlobalInput = file =>
  globalInputs.has(file) || file.startsWith('.github/workflows/')

const run = (command, args, options = {}) => {
  const label = options.label ?? [command, ...args].join(' ')
  console.log(`\n[verify] ${label}`)
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const git = (args, allowFailure = false) => {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    if (allowFailure) return ''
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`)
  }
  return result.stdout.trim()
}

const lines = value => value.split(/\r?\n/u).map(line => line.trim()).filter(Boolean)

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
    else if (file.startsWith('src/') || file.startsWith('scripts/')) affected.add('root')
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

const parseArguments = argv => {
  const options = { mode: 'quick', phase: 'all', base: undefined, shard: undefined, target: undefined }
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--mode') options.mode = argv[++index]
    else if (value === '--phase') options.phase = argv[++index]
    else if (value === '--base') options.base = argv[++index]
    else if (value === '--shard') options.shard = argv[++index]
    else if (value === '--target') options.target = argv[++index]
    else throw new Error(`Unknown verification argument: ${value}`)
  }
  if (!['quick', 'pr', 'full'].includes(options.mode)) throw new Error(`Invalid mode: ${options.mode}`)
  return options
}

const resolveDefaultBase = () => {
  const branch = git(['branch', '--show-current'], true)
  if (branch && branch !== 'main' && git(['rev-parse', '--verify', 'main'], true)) return 'main'
  return 'HEAD'
}

export function collectChangedFiles(base) {
  const changed = new Set()
  const resolvedBase = base ?? resolveDefaultBase()
  if (resolvedBase !== 'HEAD') {
    lines(git(['diff', '--name-only', '--diff-filter=ACMR', `${resolvedBase}...HEAD`], true))
      .forEach(file => changed.add(file))
  }
  lines(git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], true))
    .forEach(file => changed.add(file))
  lines(git(['ls-files', '--others', '--exclude-standard'], true))
    .forEach(file => changed.add(file))
  return { base: resolvedBase, files: [...changed].sort() }
}

const existingLintFiles = files => files.filter(file =>
  existsSync(path.join(repositoryRoot, file)) && /\.(?:c|m)?(?:j|t)sx?$/u.test(file),
)

const sourceFiles = files => files.filter(file =>
  existsSync(path.join(repositoryRoot, file)) && /\.(?:j|t)sx?$/u.test(file),
)

const runWorkspaceScript = (project, script) => run(
  npmCommand,
  ['run', script, '--workspace', project.name, '--ignore-scripts'],
  { label: `${script} ${project.name}` },
)

const createBuildRunner = projects => {
  const built = new Set()
  const build = (names) => {
    for (const project of topologicalProjects(projects, names)) {
      if (built.has(project.name) || !project.manifest.scripts?.build) continue
      runWorkspaceScript(project, 'build')
      built.add(project.name)
    }
  }
  return { build, built }
}

const runTypechecks = (projects, selected, buildRunner) => {
  const packageProjects = projects.filter(project =>
    selected.has(project.name) && project.kind === 'package',
  )
  for (const project of topologicalProjects(projects, packageProjects.map(project => project.name))) {
    buildRunner.build(project.dependencies)
    if (project.manifest.scripts?.typecheck) runWorkspaceScript(project, 'typecheck')
    else if (project.manifest.scripts?.build) buildRunner.build([project.name])
  }
  if (selected.has('root')) run(npxCommand, ['tsc', '-b', '--pretty', 'false'], { label: 'typecheck app' })
  for (const project of projects.filter(project =>
    selected.has(project.name) && project.kind === 'app' && project.manifest.scripts?.typecheck,
  )) {
    buildRunner.build(project.dependencies)
    runWorkspaceScript(project, 'typecheck')
  }
}

const runQuality = (mode, projects, selected, changedFiles, buildRunner) => {
  const full = mode === 'full'
  const lintFiles = full ? ['.'] : existingLintFiles(changedFiles)
  if (lintFiles.length > 0) run(npxCommand, ['eslint', ...lintFiles], { label: 'lint' })
  runTypechecks(projects, selected, buildRunner)

  const shouldRunKnip = mode !== 'quick' || changedFiles.some(file =>
    file.endsWith('package.json') || !existsSync(path.join(repositoryRoot, file)),
  )
  if (shouldRunKnip) run(npxCommand, ['knip'], { label: 'knip' })

  const productionChange = full || mode === 'pr' || changedFiles.some(file =>
    /^(?:src|packages)\/.*\.(?:ts|tsx)$/u.test(file),
  )
  if (productionChange) run(npmCommand, ['run', 'check:architecture'], { label: 'architecture guards' })
}

const runWorkspaceTests = (projects, selected, buildRunner) => {
  for (const project of projects) {
    if (!selected.has(project.name) || !project.manifest.scripts?.test) continue
    if (project.manifest.bin) buildRunner.build([project.name])
    runWorkspaceScript(project, 'test')
  }
}

const runRootTests = (project, mode, changedFiles, shard) => {
  if (project === 'dom' && !shard) {
    runRootTests(project, mode, changedFiles, '1/2')
    runRootTests(project, mode, changedFiles, '2/2')
    return
  }
  const args = ['vitest']
  const related = mode !== 'full' ? sourceFiles(changedFiles) : []
  if (related.length > 0) args.push('related', ...related)
  else args.push('run')
  args.push('--project', project, '--passWithNoTests')
  if (shard) args.push('--shard', shard)
  run(npxCommand, args, { label: `${project} tests${shard ? ` shard ${shard}` : ''}` })
}

const runBuild = (mode, projects, selected, buildRunner, target) => {
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
    runWorkspaceScript(docs, 'build')
    run('node', ['scripts/docs/merge-build.mjs'], { label: 'merge docs build' })
    run('node', ['scripts/docs/verify-build.mjs'], { label: 'verify docs build' })
  }
  const site = projects.find(project => project.name === '@chardesk/chargraph-site')
  if (site && (mode === 'full' || selected.has(site.name))) {
    runWorkspaceScript(site, 'build')
    run('node', ['scripts/chargraph/merge-build.mjs'], { label: 'merge CharGraph build' })
    run('node', ['scripts/chargraph/verify-build.mjs'], { label: 'verify CharGraph build' })
  }
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv)
  const projects = loadWorkspaceProjects()
  const changes = collectChangedFiles(options.base)
  const selected = options.mode === 'full'
    ? new Set(['root', ...projects.map(project => project.name)])
    : affectedProjectNames(projects, changes.files)
  if (options.target && options.target !== 'app') selected.add(options.target)
  if (options.target === 'app') selected.add('root')

  console.log(`[verify] mode=${options.mode} phase=${options.phase} base=${changes.base}`)
  console.log(`[verify] changed=${changes.files.length} affected=${[...selected].join(',') || 'none'}`)
  if (selected.size === 0 && options.mode !== 'full') return

  const buildRunner = createBuildRunner(projects)
  const phase = options.phase
  if (phase === 'typecheck') {
    runTypechecks(projects, selected, buildRunner)
    return
  }
  if (phase === 'all' || phase === 'quality') {
    runQuality(options.mode, projects, selected, changes.files, buildRunner)
  }
  if (phase === 'all' || phase === 'workspace-tests') {
    runWorkspaceTests(projects, selected, buildRunner)
  }
  if ((phase === 'all' || phase === 'root-node') && selected.has('root')) {
    runRootTests('node', options.mode, changes.files)
  }
  if ((phase === 'all' || phase === 'root-dom') && selected.has('root')) {
    runRootTests('dom', options.mode, changes.files, options.shard)
  }
  if (phase === 'build' || (phase === 'all' && options.mode !== 'quick')) {
    runBuild(options.mode, projects, selected, buildRunner, options.target)
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main()
