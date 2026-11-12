import type { Config } from '@react-router/dev/config';
import { glob } from 'node:fs/promises';
import { createGetUrl, getSlugs } from 'fumadocs-core/source';

const engineering = process.env.DOCS_BUILD_TARGET === 'engineering';
const publicBase = '/docs';
const docsUrl = createGetUrl(publicBase);

export default {
  appDirectory: engineering ? 'app' : 'reader',
  buildDirectory: engineering ? 'engineering-build' : 'build',
  basename: engineering ? '/docs/' : '/',
  ssr: false,
  async prerender({ getStaticPaths }) {
    const paths = new Set(getStaticPaths());
    paths.add('/api/search');
    paths.add('/llms.txt');
    paths.add('/llms-full.txt');
    if (engineering) {
      paths.add('/agent-routes.json');
      for await (const entry of glob('**/*.mdx', { cwd: 'content/docs' })) {
        const slugs = getSlugs(entry);
        paths.add(docsUrl(slugs).slice(publicBase.length) || '/');
        if (slugs[0] === 'development') paths.add(`/llms.mdx/${slugs.join('/')}/content.md`);
      }
    } else {
      paths.add('/robots.txt');
      paths.add('/sitemap.xml');
      for await (const entry of glob('**/*.mdx', { cwd: 'content/manual' })) {
        const slug = getSlugs(entry).join('/');
        paths.add(slug === 'getting-started' ? '/' : `/${slug}/`);
      }
    }
    return [...paths];
  },
} satisfies Config;
