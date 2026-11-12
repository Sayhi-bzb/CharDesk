import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogTitle, Link, Root, ScrollArea, Text, TextInput, type WidgetCommand } from '@chardesk/cell-ui';
import { DEFAULT_CELL_UI_METRICS, CELL_SURFACE_GUARD_CELLS, useCellTextState, useCellScrollState } from '@chardesk/cell-ui/browser';
import { DocumentationSurface } from '@chardesk/docs-ui/appearance';
import { useDocumentationLink } from '@chardesk/docs-ui/links';
import { searchManual, type SearchPage } from './search';

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const openLink = useDocumentationLink();
  const openResult = (href: string, target?: '_blank') => { onClose(); openLink(href, target); };
  const host = useRef<HTMLDivElement>(null);
  const text = useCellTextState('manual-search-input');
  const scroll = useCellScrollState();
  const [focusedId, setFocusedId] = useState<string | null>('manual-search-input');
  const [pages, setPages] = useState<SearchPage[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [viewport, setViewport] = useState({ width: 60, height: 20 });
  const query = text.snapshot.value;
  useLayoutEffect(() => {
    const update = () => setViewport({
      width: Math.max(12, Math.floor((host.current?.clientWidth ?? 600) / DEFAULT_CELL_UI_METRICS.cellWidth) - 2 * CELL_SURFACE_GUARD_CELLS),
      height: Math.max(10, Math.min(26, Math.floor(window.innerHeight / DEFAULT_CELL_UI_METRICS.cellHeight) - 6)),
    });
    update(); window.addEventListener('resize', update);
    const focus = requestAnimationFrame(() => host.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus());
    return () => { window.removeEventListener('resize', update); cancelAnimationFrame(focus); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    void fetch('/api/search', { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Search unavailable');
      return response.json() as Promise<SearchPage[]>;
    }).then(data => { setPages(data); setStatus('ready'); }).catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [attempt]);
  const results = searchManual(pages ?? [], query);
  const message = status === 'loading' ? 'Searching…' : status === 'error' ? 'Search unavailable' : !query.trim() ? 'Enter a search term.' : results.length ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : 'No results. Try a shorter query.';
  const onCommand = (command: WidgetCommand) => {
    text.dispatch(command); scroll.dispatch(command);
    if (command.type === 'focus') setFocusedId(command.targetId);
    if (command.type === 'dismiss' || command.type === 'activate' && command.targetId === 'manual-search-close') onClose();
    if (command.type === 'open-link') openResult(command.href, command.target);
    if (command.type === 'activate' && command.targetId === 'manual-search-retry') setAttempt(value => value + 1);
  };
  const offset = scroll.offset('manual-search-scroll');
  return <div className="manual-search-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }} onKeyDownCapture={event => {
    if (event.nativeEvent.isComposing || text.snapshot.composition) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === 'Enter' && event.target instanceof HTMLTextAreaElement && results[0]) {
      event.preventDefault(); event.stopPropagation(); openResult(results[0].url);
    }
  }}><div className="manual-search-surface" ref={host}>
    <DocumentationSurface label="Search the manual" probeId="manual-search" viewport={viewport} focusedId={focusedId} onCommand={onCommand}>
      <Root><Dialog id="manual-search-dialog" modal initialFocusId="manual-search-input" style={{ width: '100%', height: viewport.height - 2, gap: 0 }}>
        <DialogTitle>Search the manual</DialogTitle>
        <TextInput id="manual-search-input" label="Search the manual" state={text.snapshot} style={{ width: '100%' }} />
        <Text>{message}</Text>
        {status === 'error' ? <Button id="manual-search-retry" label="Retry"><Text>Retry</Text></Button> : null}
        <ScrollArea id="manual-search-scroll" scrollX={offset.x} scrollY={offset.y} style={{ width: '100%', height: Math.max(2, viewport.height - 10 - (status === 'error' ? 1 : 0)) }}>
          <Box style={{ width: '100%', gap: 1 }}>{results.map((result, index) => <Box key={result.url} style={{ width: '100%' }}>
            <Link id={`manual-search-result-${index}`} href={result.url}>{`${result.title} · ${result.heading}`}</Link>
            <Text>{result.excerpt}</Text>
          </Box>)}</Box>
        </ScrollArea>
        <Button id="manual-search-close" label="Close search"><Text>Close</Text></Button>
      </Dialog></Root>
    </DocumentationSurface>
  </div></div>;
}
