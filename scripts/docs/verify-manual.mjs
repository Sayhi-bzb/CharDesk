import { access, glob, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { legacyDocRoutes } from './legacy-routes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'apps/docs/dist');
const content = path.join(root, 'apps/docs/content/manual');
const navigation = JSON.parse(await readFile(path.join(content, 'navigation.json'), 'utf8'));
const pages = JSON.parse(await readFile(path.join(output, 'api/search'), 'utf8'));
const sources = [];
for await (const entry of glob('**/*.mdx', { cwd: content })) sources.push(entry);
const expected = navigation.groups.flatMap(group => group.pages).sort();
if (JSON.stringify(expected) !== JSON.stringify(sources.map(file => file.replace(/\.mdx$/, '')).sort())
  || JSON.stringify(expected) !== JSON.stringify(pages.map(page => page.slug).sort())
  || new Set(expected).size !== expected.length) throw new Error('Manual navigation, source and search coverage differ');
const documents = new Map();
const references = [];
for (const page of pages) {
  const source = await readFile(path.join(content, `${page.slug}.mdx`), 'utf8');
  if (page.markdown !== source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()) throw new Error(`Manual source drift: ${page.slug}`);
  if (!page.sections.length || page.sections.some(section => !section.title || section.title.includes('[object Object]'))) throw new Error(`Invalid manual headings: ${page.slug}`);
  const html = await readFile(path.join(output, page.url, 'index.html'), 'utf8');
  await access(path.join(output, page.url, '_.data'));
  const dom = new JSDOM(html);
  const document = dom.window.document;
  if (document.querySelector('link[rel="canonical"]')?.getAttribute('href') !== `https://docs.chardesk.com${page.url}`) throw new Error(`Invalid manual canonical: ${page.slug}`);
  if (document.documentElement.lang !== 'en' || document.querySelectorAll('h1').length !== 1
    || (document.querySelector('article')?.textContent?.length ?? 0) < 160) throw new Error(`Manual is not readable without JavaScript: ${page.slug}`);
  const schema = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}');
  if (schema.inLanguage !== 'en' || document.title !== `${page.title} · CharDesk Manual`) throw new Error(`Manual default content is not English: ${page.slug}`);
  if (document.querySelector('[data-docs-head]') || document.querySelector('a[href^="/development"]')) throw new Error('Engineering navigation leaked into the manual');
  if (!document.querySelector('nav a[aria-current="page"]')) throw new Error(`Missing active manual navigation: ${page.slug}`);
  const ids = new Set([...document.querySelectorAll('[id]')].map(node => node.id));
  documents.set(page.url, ids);
  for (const section of page.sections) if (!ids.has(decodeURIComponent(section.url.slice(1)))) throw new Error(`Unresolvable manual section: ${page.slug}${section.url}`);
  for (const anchor of document.querySelectorAll('a[href]')) {
    const url = new URL(anchor.getAttribute('href'), `https://docs.chardesk.com${page.url}`);
    if (url.origin === 'https://docs.chardesk.com') references.push(url);
  }
  for (const node of document.querySelectorAll('script[src], link[rel="stylesheet"]')) {
    const url = node.getAttribute('src') ?? node.getAttribute('href');
    if (url.startsWith('/')) await access(path.join(output, url));
  }
  dom.window.close();
}
for (const url of references) {
  const ids = documents.get(url.pathname);
  if (!ids || (url.hash && !ids.has(decodeURIComponent(url.hash.slice(1))))) throw new Error(`Broken product manual link: ${url}`);
}
const sitemap = await readFile(path.join(output, 'sitemap.xml'), 'utf8');
const llms = await readFile(path.join(output, 'llms.txt'), 'utf8');
for (const page of pages) {
  if (!sitemap.includes(`https://docs.chardesk.com${page.url}`) || !llms.includes(page.title)) throw new Error(`Missing manual discovery output: ${page.slug}`);
}
if (sitemap.includes('/development') || llms.includes('/development')) throw new Error('Engineering content leaked into product discovery');
if (!(await readFile(path.join(output, '404.html'), 'utf8')).includes('noindex, nofollow')) throw new Error('Manual 404 must not be indexed');
if (!legacyDocRoutes().length || legacyDocRoutes().some(route => route.from.includes('llms'))) throw new Error('Legacy human routing altered Agent resources');
console.log(`Product manual verified: ${pages.length} source-backed pages, search, anchors, static prose and legacy destinations`);
