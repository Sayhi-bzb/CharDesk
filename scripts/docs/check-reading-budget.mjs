import { glob, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEncoding } from 'js-tiktoken';
import { readingCases } from './reading-cases.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function evaluateReadingBudget({ index, pages, cases, baseline, countTokens }) {
  const links = text => [...text.matchAll(/(?:\]\(|→ )(\/(?:docs\/)?development(?:[\w/-]*))/g)]
    .map(match => match[1].replace(/^\/development/, '/docs/development'));
  const reachable = new Map();
  const queue = links(index).map(route => ({ route, via: [] }));
  while (queue.length) {
    const { route, via } = queue.shift();
    const markdown = pages.get(route);
    if (!markdown) throw new Error(`Reading index routes to a missing resource: ${route}`);
    const candidate = [...via, route];
    const cost = routePath => countTokens(routePath.map(page => pages.get(page)).join('\n\n'));
    if (!reachable.has(route) || cost(candidate) < cost(reachable.get(route))) {
      reachable.set(route, candidate);
    }
    if (candidate.length < 2) {
      for (const next of links(markdown)) queue.push({ route: next, via: candidate });
    }
  }
  const distant = [...pages.keys()].filter(route => !reachable.has(route) || reachable.get(route).length > 2);
  if (distant.length) throw new Error(`Contracts exceed the two-hop reading budget:\n${distant.join('\n')}`);

  const tasks = cases.map(task => {
    const route = `/docs/development/${task.page}`;
    const selected = reachable.get(route);
    if (!selected) throw new Error(`${task.id}: missing owner ${route}`);
    const texts = selected.map(page => pages.get(page));
    const contract = texts.at(-1);
    for (const marker of task.markers) {
      if (!contract.includes(marker)) throw new Error(`${task.id}: lost contract marker ${marker}`);
    }
    if (!/https:\/\/github.com\/Sayhi-bzb\/CharDesk\/(?:blob|tree)\/main\//.test(contract)) {
      throw new Error(`${task.id}: missing repository evidence`);
    }
    const before = baseline.tasks.find(row => row.id === task.id);
    if (!before || before.page !== task.page) throw new Error(`Task baseline drift: ${task.id}`);
    // Charge every opened page, including catalogs; navigation is not free.
    const tokens = countTokens([index, ...texts].join('\n\n'));
    return { id: task.id, page: task.page, hops: selected.length, before: before.tokens, after: tokens };
  });
  if (tasks.length !== baseline.tasks.length) throw new Error('Reading task set changed');
  const before = tasks.reduce((sum, row) => sum + row.before, 0);
  const after = tasks.reduce((sum, row) => sum + row.after, 0);
  return {
    tokenizer: baseline.tokenizer, encoding: baseline.encoding, baselineRevision: baseline.revision,
    metric: 'lowest-token path within two page opens; emitted index plus every opened page; equally weighted fixed tasks',
    index: { before: baseline.indexTokens, after: countTokens(index) },
    before, after, reduction: 1 - after / before, target: 0.3, tasks,
  };
}

export async function checkReadingBudget() {
  const output = path.join(root, 'apps/site/dist/docs');
  const [baseline, manifest] = await Promise.all([
    'scripts/docs/fixtures/reading-baseline.json', 'package.json',
  ].map(async file => JSON.parse(await readFile(path.join(root, file), 'utf8'))));
  if (baseline.encoding !== 'o200k_base' || baseline.tokenizer !== `js-tiktoken@${manifest.devDependencies['js-tiktoken']}`) {
    throw new Error('Reading baseline tokenizer differs from this benchmark');
  }
  const encoding = getEncoding('o200k_base');
  const index = await readFile(path.join(output, 'llms.txt'), 'utf8');
  const pages = new Map();
  for await (const file of glob('llms.mdx/**/content.md', { cwd: output })) {
    const route = `/docs/${file.slice('llms.mdx/'.length, -'/content.md'.length)}`;
    pages.set(route, await readFile(path.join(output, file), 'utf8'));
  }
  const report = evaluateReadingBudget({ index, pages, cases: readingCases, baseline, countTokens: text => encoding.encode(text).length });
  const reportDir = path.join(root, 'test-results/docs-reading');
  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Docs reading: ${report.tasks.length} tasks, ${report.before} → ${report.after} tokens (${(report.reduction * 100).toFixed(1)}% less); index ${report.index.before} → ${report.index.after}`);
  if (report.reduction < report.target) throw new Error('Docs reading reduction is below the 30% target');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkReadingBudget();
}
