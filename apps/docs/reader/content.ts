import { defineDocs } from 'fumadocs-mdx/macro';
import { loader } from 'fumadocs-core/source';
import navigation from '../content/manual/navigation.json';
import { isValidElement, type ReactNode } from 'react';

const headingText = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(headingText).join('');
  return isValidElement<{ children?: ReactNode }>(node) ? headingText(node.props.children) : '';
};

export const manual = defineDocs({
  dir: 'content/manual',
  docs: { async: true, postprocess: { includeProcessedMarkdown: true } },
});
const manualSource = loader({ source: manual.toFumadocsSource(), baseUrl: '/' });
const manualUrl = (slug: string) => slug === 'getting-started' ? '/' : `/${slug}/`;
export const manualNavigation = navigation;
export async function manualEntries() {
  return Promise.all(manualSource.getPages().map(async page => {
    const slug = page.slugs.join('/');
    const raw = await page.data.getText('raw');
    const { toc } = await page.data.load();
    return {
      slug, path: page.path, title: page.data.title, description: page.data.description ?? '',
      url: manualUrl(slug), markdown: raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim(),
      sections: toc.map(item => ({ title: headingText(item.title), url: item.url })),
      aliases: navigation.aliases[slug as keyof typeof navigation.aliases] ?? [],
    };
  }));
}
