import { globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Agent resource URLs deliberately have no redirect; only human HTML pages move. */
export function legacyDocRoutes() {
  return [...globSync('**/*.mdx', { cwd: path.join(root, 'apps/docs/content/docs') })].sort().map(file => {
    const slug = file.replace(/\.mdx$/, '').replace(/(^|\/)index$/, '').replace(/\/$/, '');
    const product = file === 'index.mdx' || file === 'user/index.mdx' ? '/' : file === 'user/collaboration.mdx' ? '/collaboration/' : null;
    return {
      from: `/docs${slug ? `/${slug}` : ''}`,
      to: product ? `https://docs.chardesk.com${product}` : `https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/docs/content/docs/${file}`,
      kind: product ? 'product' : 'repository',
    };
  });
}
export function legacyDocRedirects() {
  return legacyDocRoutes().flatMap(({ from, to }) => [`${from} ${to} 301`, `${from}/ ${to} 301`]).join('\n') + '\n';
}
