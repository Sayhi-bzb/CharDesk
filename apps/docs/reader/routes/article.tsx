import { use, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { manual, manualEntries, manualNavigation } from '../content';
import { CellReaderBoundary } from '../cell-reader-boundary';
import { completeManualBoot, revealManualFallback } from '../boot';

import DocumentationPage from '../documentation-page';
export async function loader({ params }: LoaderFunctionArgs) {
  const slug = (params['*'] ?? '').replace(/\/$/, '') || 'getting-started';
  const pages = await manualEntries();
  const page = pages.find(entry => entry.slug === slug);
  if (!page) throw new Response('Not found', { status: 404 });
  return { page, navigation: manualNavigation.groups.map(group => ({ title: group.title,
    pages: group.pages.map(slug => {
      const entry = pages.find(page => page.slug === slug);
      if (!entry) throw new Error(`Unknown manual navigation page: ${slug}`);
      return { title: entry.title, url: entry.url, slug: entry.slug };
    }),
  })) };
}
export default function Article() {
  const data = useLoaderData<typeof loader>();
  const { page, navigation } = data;
  const document = manual.getPage(page.path);
  if (!document) throw new Error(`Missing manual page: ${page.path}`);
  use(document.load());
  const Body = document.body;
  const [enhance, setEnhance] = useState(false);
  // Keep SSR readable, but mount client-only surfaces before a navigation paints.
  useLayoutEffect(() => setEnhance(true), []);
  const [ready, setReady] = useState(false);
  const [findMode, setFindMode] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  useLayoutEffect(() => {
    if (ready && !completeManualBoot()) setReady(false);
  }, [ready]);
  const onExit = useCallback(() => { revealManualFallback(); setReady(false); }, []);
  useEffect(() => {
    const find = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') setFindMode(true);
      if (event.key === 'Escape') setFindMode(false);
    };
    window.addEventListener('keydown', find);
    return () => window.removeEventListener('keydown', find);
  }, []);
  const native = !ready || findMode;
  const canonical = `https://docs.chardesk.com${page.url}`;
  const schema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article',
    headline: page.title, description: page.description, url: canonical, inLanguage: 'en',
    publisher: { '@type': 'Organization', name: 'CharDesk', url: 'https://chardesk.com/' },
  }).replaceAll('<', '\\u003c');
  return <div className="manual-document">
    <title>{`${page.title} · CharDesk Manual`}</title><meta name="description" content={page.description} />
    <meta name="robots" content="index, follow" /><link rel="canonical" href={canonical} />
    <meta property="og:title" content={`${page.title} · CharDesk`} /><meta property="og:description" content={page.description} />
    <meta property="og:url" content={canonical} /><meta property="og:type" content="article" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />
    <div className="manual-loading" role="status" aria-label="Loading manual">Loading manual…</div>
    {enhance && !findMode ? <CellReaderBoundary onExit={onExit}>
      <DocumentationPage data={data} onReady={onReady} />
    </CellReaderBoundary> : null}
    <div className="manual-fallback" hidden={!native}>
      {findMode ? <button type="button" onClick={() => setFindMode(false)}>Back to the manual</button> : null}
      <header><a href="/">CharDesk / Manual</a> · <a href={page.url}>Reload</a></header>
      <nav aria-label="Manual" id="manual-navigation">{navigation.map(group => <section key={group.title}>
        <h2>{group.title}</h2><ul>{group.pages.map(item => <li key={item.slug}><a href={item.url} aria-current={item.slug === page.slug ? 'page' : undefined}>{item.title}</a></li>)}</ul>
      </section>)}</nav>
      <main id={native ? 'manual-content' : 'manual-fallback-content'}>
        <h1>{page.title}</h1><p>{page.description}</p>
        <article className="manual-prose"><Body components={{ h2: props => <h2 {...props} id={native ? props.id : `fallback-${props.id}`} /> }} /></article>
      </main>
    </div>
  </div>;
}
