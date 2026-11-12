import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { Box, Button, Markdown, Root, Text, type WidgetCommand } from '@chardesk/cell-ui';
import { useCellScrollState } from '@chardesk/cell-ui/browser';
import { useDocumentationAppearance } from '@chardesk/docs-ui/appearance';
import { renderDocumentationCodeBlock } from '@chardesk/docs-ui/code';
import { DocumentationHeader } from '@chardesk/docs-ui/header';
import { DocumentationArticleSurface } from '@chardesk/docs-ui/article';
import { DocumentationLayout } from '@chardesk/docs-ui/layout';
import { DocumentationNavigation, DocumentationContents, useVisibleDocumentationSection } from '@chardesk/docs-ui/navigation';
import { useDocumentationLink } from '@chardesk/docs-ui/links';
import { SearchDialog } from './search-box';
import type { loader } from './routes/article';

type Data = Awaited<ReturnType<typeof loader>>;
const sectionHref = (id: string) => `#${id}`;

export default function DocumentationPage({ data: { page, navigation }, onReady }: { data: Data; onReady: () => void }) {
  const openLink = useDocumentationLink();
  const { hash } = useLocation();
  const { mode } = useDocumentationAppearance();
  const scroll = useCellScrollState();
  const [copies, setCopies] = useState<Record<string, 'Copy' | 'Copied' | 'Copy failed'>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); }, []);
  const [interactive, setInteractive] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const requestedSection = decodeURIComponent(hash.slice(1)) || null;
  const sections = useMemo(() => page.sections.map(section => ({ id: decodeURIComponent(section.url.slice(1)), label: section.title })), [page.sections]);
  const activeSection = useVisibleDocumentationSection(page.url, requestedSection, sections.map(section => section.id).join('\0'));
  const groups = useMemo(() => navigation.map((group, index) => ({
    id: `manual-${index}`, title: group.title,
    items: group.pages.map(item => ({ id: item.slug, label: item.title, href: item.url })),
    current: group.pages.some(item => item.slug === page.slug) ? page.slug : '',
  })), [navigation, page.slug]);
  const parts = useMemo(() => page.markdown.split(/^##\s+/m).slice(1), [page.markdown]);
  const anchorIds = useMemo(() => sections.map(section => section.id), [sections]);
  const anchorTargets = useMemo(() => Object.fromEntries(sections.map((section, index) => [section.id, `manual-section-${index}`])), [sections]);
  useEffect(() => {
    if (!requestedSection) return;
    const frame = requestAnimationFrame(() => document.getElementById(requestedSection)?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [requestedSection, page.slug]);
  const openSearch = useCallback(() => {
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSearchOpen(true);
  }, []);
  const closeSearch = () => {
    setSearchOpen(false);
    requestAnimationFrame(() => restoreFocus.current?.isConnected && restoreFocus.current.focus());
  };
  useLayoutEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    };
    window.addEventListener('keydown', shortcut);
    setInteractive(true); onReady();
    return () => window.removeEventListener('keydown', shortcut);
  }, [openSearch, onReady]);
  const codeTargets = useRef(new Map<string, string>());
  const onCommand = (command: WidgetCommand) => {
    scroll.dispatch(command);
    if (command.type === 'activate' && command.targetId.endsWith('-toggle')) {
      const id = command.targetId.slice(0, -7);
      setExpanded(current => ({ ...current, [id]: !current[id] }));
    }
    if (command.type === 'activate' && command.targetId.endsWith('-copy')) {
      const id = command.targetId.slice(0, -5);
      const source = codeTargets.current.get(id);
      if (source !== undefined) void navigator.clipboard.writeText(source).then(() => {
        setCopies(current => ({ ...current, [id]: 'Copied' }));
        clearTimeout(timers.current.get(id));
        timers.current.set(id, setTimeout(() => setCopies(current => ({ ...current, [id]: 'Copy' })), 2000));
      }).catch(() => setCopies(current => ({ ...current, [id]: 'Copy failed' })));
    }
    if (command.type === 'focus') setFocusedId(command.targetId);
    if (command.type === 'open-link') openLink(command.href, command.target);
  };
  return <div data-manual-cell-ui={interactive ? 'ready' : 'loading'}>
    <DocumentationHeader brandLabel="Manual" brandHref="/"
      extraControls={<Button id="manual-header-search" label="Search the manual" variant="ghost"><Text>Search</Text></Button>}
      onExtraCommand={command => { if (command.type === 'activate' && command.targetId === 'manual-header-search') openSearch(); }} />
    <DocumentationLayout>
      <DocumentationNavigation route={page.url} pageTitle={page.title} sections={sections} activeSection={activeSection}
        requestedSection={requestedSection} groups={groups} sectionHref={sectionHref} label="Manual" />
      <main className="docs-page cell-article-page" id="manual-content" tabIndex={-1}>
        <DocumentationArticleSurface label="Manual content" probeId="manual-article" focusedId={focusedId} onCommand={onCommand}
          anchorIds={anchorIds} anchorTargets={anchorTargets}
          content={<Root><Box id="manual-article-content" style={{ width: '100%', gap: 1 }}>
            <Markdown source={`# ${page.title}\n\n${page.description}`} />
            {parts.map((part, index) => <Box id={`manual-section-${index}`} key={index} style={{ width: '100%' }}><Markdown source={`## ${part}`} renderCodeBlock={block => {
              const id = `manual-${page.slug}-section-${index}-code-${block.index}`;
              codeTargets.current.set(id, block.code);
              return renderDocumentationCodeBlock(id, block.code, block.language ?? 'text', scroll.offset(`${id}-scroll`), copies[id] ?? 'Copy', expanded[id] ?? false, mode);
            }} /></Box>)}
            <Markdown source="[Open Canvas ↗](https://canvas.chardesk.com/) · [Cell UI ↗](https://ui.chardesk.com/) · [Feedback ↗](https://github.com/Sayhi-bzb/CharDesk/issues)" />
          </Box></Root>} />
      </main>
      <DocumentationContents route={page.url} sections={sections} activeSection={activeSection} sectionHref={sectionHref} label="On this page" />
    </DocumentationLayout>
    {searchOpen ? <SearchDialog onClose={closeSearch} /> : null}
  </div>;
}
