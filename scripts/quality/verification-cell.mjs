import { existsSync } from 'node:fs'
import path from 'node:path'

export const isCellInput = file => file.startsWith('packages/cell-ui/')
  || file.startsWith('apps/cell-ui/')

const leafTests = {
  'button.ts': ['button.test.tsx', 'press.test.tsx', 'activation-feedback.test.tsx'],
  'checkbox.ts': ['checkbox.test.tsx', 'press.test.tsx'],
  'slider.ts': ['slider.test.tsx', 'range-slider.test.tsx'],
}
const sharedBrowserSuites = {
  'interaction.ts': ['components', 'basic-widgets', 'complex-widgets', 'command-palette', 'focus-ownership', 'focus-outline'],
  'browser-focus.ts': ['components', 'basic-widgets', 'focus-ownership', 'focus-outline', 'command-palette'],
  'pointer.ts': ['components', 'basic-widgets', 'hover', 'press', 'command-palette'],
  'press.ts': ['components', 'basic-widgets', 'press'],
  'theme.ts': ['theme-tokens', 'appearance', 'command-palette', 'boundaries', 'basic-widgets'],
  'visual.ts': ['theme-tokens', 'hover', 'press', 'basic-widgets', 'components'],
}

/** Explicit safety boundary: only reviewed leaf helpers receive narrow coverage. */
export function cellVerificationScope(files, { mode, selected, root, global = false }) {
  const touched = files.filter(isCellInput)
  const active = mode === 'full' || global || touched.length > 0 || selected.has('@chardesk/cell-ui')
  const nodeTests = new Set()
  const domTests = new Set()
  const browser = new Map()
  let fullPackage = mode !== 'quick'
  let gallery = false
  let dualBrowser = mode !== 'quick'
  let allBrowser = false
  const reasons = new Set()
  const addBrowser = (file, grep = null) => {
    if (browser.has(file) && browser.get(file) === null) return
    if (grep === null) browser.set(file, null)
    else browser.set(file, new Set([...(browser.get(file) ?? []), grep]))
  }
  const fallback = reason => {
    fullPackage = true
    gallery = true
    dualBrowser = true
    allBrowser = true
    reasons.add(reason)
  }
  if (active && (mode !== 'quick' || global || touched.length === 0)) {
    fallback('merge gate, global configuration, or upstream Cell dependency')
  } else for (const file of touched) {
    const name = path.basename(file)
    if (!existsSync(path.join(root, file))) {
      fallback(`deleted/unresolved input: ${file}`)
    } else if (file.startsWith('apps/cell-ui/e2e/')) {
      if (/\.spec\.ts$/u.test(file)) addBrowser(file.slice('apps/cell-ui/'.length))
      else fallback('shared Cell browser probe/helper')
      reasons.add('explicit browser test')
    } else if (file.startsWith('apps/cell-ui/src/')) {
      gallery = true
      addBrowser('e2e/components.spec.ts')
      addBrowser('e2e/basic-widgets.spec.ts')
      if (file.endsWith('.css') || /appearance|font|main/u.test(name)) {
        addBrowser('e2e/theme-tokens.spec.ts')
        addBrowser('e2e/appearance.spec.ts')
      }
      if (!['styles.css', 'component-catalog.tsx', 'components.tsx'].includes(name)
        && !/\.(dom\.)?test\.tsx?$/u.test(name)) fallback('unclassified Gallery module or configuration')
      reasons.add('Gallery layout/interaction: Gallery tests + Chromium')
    } else if (/\.dom\.test\.tsx?$/u.test(file)) {
      domTests.add(file.slice('packages/cell-ui/'.length))
      reasons.add('explicit DOM test')
    } else if (/\.test\.tsx?$/u.test(file)) {
      nodeTests.add(file.slice('packages/cell-ui/'.length))
      reasons.add('explicit character/state test')
    } else if (file === `packages/cell-ui/src/${name}` && leafTests[name]
      && leafTests[name].every(test => existsSync(path.join(root, 'packages/cell-ui/src', test)))) {
      leafTests[name].forEach(test => nodeTests.add(`src/${test}`))
      if (name === 'slider.ts') addBrowser('e2e/components.spec.ts', 'Slider Playground')
      reasons.add(`reviewed component helper: ${name}`)
    } else if (file === `packages/cell-ui/src/${name}` && sharedBrowserSuites[name]) {
      fullPackage = true
      gallery = true
      dualBrowser = true
      sharedBrowserSuites[name].forEach(suite => addBrowser(`e2e/${suite}.spec.ts`))
      reasons.add(`shared interaction/visual contract: ${name}`)
    } else {
      fallback(`shared or unclassified Cell input: ${name}`)
    }
  }
  return {
    active, fullPackage, gallery, dualBrowser,
    nodeTests: fullPackage ? [] : [...nodeTests].sort(),
    domTests: fullPackage ? [] : [...domTests].sort(),
    browser: !active ? [] : allBrowser
      ? [{ file: 'e2e', grep: null }]
      : [...browser].map(([file, patterns]) => ({ file, grep: patterns ? [...patterns].join('|') : null })),
    reason: [...reasons].join('; '),
  }
}
