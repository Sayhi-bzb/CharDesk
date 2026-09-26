import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CharLibrary } from '@/widgets/character-library/char-library';
import { useLibraryStore } from '@/domains/character-library/public';
import { useEditorStore } from '@/domains/canvas/testing';
import { writeClipboardPayload } from '@/domains/actions/public';
import { SidebarProvider } from '@chardesk/ui';
import { setUiLanguage } from '@/shared/i18n';

vi.mock('@/domains/actions/public', () => ({
  writeClipboardPayload: vi.fn(),
}));

describe('CharLibrary', () => {
  const initialCanvasState = useEditorStore.getState();
  const initialLibraryState = useLibraryStore.getState();

  beforeEach(() => {
    act(() => setUiLanguage('en'));
    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => undefined,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    act(() => setUiLanguage('en'));
    useEditorStore.setState(initialCanvasState, true);
    useLibraryStore.setState(initialLibraryState, true);
  });

  it('copies selected characters to the clipboard instead of activating brush', async () => {
    vi.mocked(writeClipboardPayload).mockResolvedValue(true);
    useEditorStore.setState({
      brushChar: '#',
      brushColor: '#123456',
      tool: 'select',
    });
    useLibraryStore.setState({
      packs: {},
      packStatus: { essentials: 'ready', nerd: 'ready', emoji: 'ready' },
      packErrors: {},
      searchQueries: { essentials: 'star', nerd: '', emoji: '' },
      searchResults: {
        essentials: [
          {
            id: 'U+2605',
            grapheme: '★',
            name: 'star icon',
            aliases: [],
            category: 'So',
            script: 'Common',
            coverage: 2,
            insertable: true,
          },
        ],
        nerd: [],
        emoji: [],
      },
    });

    render(
      <SidebarProvider>
        <CharLibrary view="essentials" />
      </SidebarProvider>
    );
    const starButton = screen.getByRole('button', { name: /star icon/i });
    const starPreview = starButton.querySelector<HTMLElement>('[aria-hidden="true"]');
    const colorScope = starButton.closest<HTMLElement>('.contents');

    expect(document.querySelector('[data-slot="character-group-header"]')).not.toBeInTheDocument();

    expect(starPreview).toHaveStyle({ color: 'var(--character-library-foreground)' });
    expect(colorScope).toHaveStyle({ '--character-library-foreground': '#123456' });

    act(() => useEditorStore.setState({ brushColor: '#abcdef' }));
    expect(colorScope).toHaveStyle({ '--character-library-foreground': '#abcdef' });

    fireEvent.click(starButton);

    await waitFor(() => expect(writeClipboardPayload).toHaveBeenCalledTimes(1));
    const [payload, options] = vi.mocked(writeClipboardPayload).mock.calls[0];
    expect(payload.plain).toBe('★');
    expect(JSON.parse(payload.rich!)).toEqual({
      type: 'ascii-metropolis-zone',
      version: 1,
      cells: [{ x: 0, y: 0, char: '★', color: '#abcdef' }],
    });
    expect(options).toEqual({ withRich: true });
    expect(useEditorStore.getState().tool).toBe('select');
    expect(useEditorStore.getState().brushChar).toBe('#');
    await waitFor(() => expect(starButton).toHaveAttribute('data-copy-feedback', 'success'));
    expect(starButton).toHaveClass('text-success');
    expect(starButton).not.toHaveClass('bg-control-active-surface');
    expect(starButton.querySelector('.lucide-check')).toHaveClass('opacity-100');
    expect(starButton.querySelector('.lucide-check')).not.toHaveStyle({
      color: 'var(--character-library-foreground)',
    });
    expect(starButton.querySelector('.lucide-x')).toHaveClass('opacity-0');
    expect(screen.getByRole('status')).toHaveTextContent('Copied ★');

    fireEvent.focus(starButton);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('star icon · U+2605');
    expect(tooltip).not.toHaveTextContent('So');
    await waitFor(() => expect(starButton).not.toHaveAttribute('data-copy-feedback'));
    expect(starButton).toHaveTextContent('★');
  });

  it('uses one tab stop and arrow keys to navigate a character collection', () => {
    useLibraryStore.setState({
      packs: {},
      packStatus: { essentials: 'ready', nerd: 'ready', emoji: 'ready' },
      packErrors: {},
      searchQueries: { essentials: 'marks', nerd: '', emoji: '' },
      searchResults: {
        essentials: [
          {
            id: 'one',
            grapheme: '!',
            name: 'first mark',
            aliases: [],
            category: 'Po',
            script: 'Common',
            coverage: 2,
            insertable: true,
          },
          {
            id: 'two',
            grapheme: '?',
            name: 'second mark',
            aliases: [],
            category: 'Po',
            script: 'Common',
            coverage: 2,
            insertable: true,
          },
          {
            id: 'three',
            grapheme: '‽',
            name: 'third mark',
            aliases: [],
            category: 'Po',
            script: 'Common',
            coverage: 2,
            insertable: true,
          },
        ],
        nerd: [],
        emoji: [],
      },
    });

    render(
      <SidebarProvider>
        <CharLibrary view="essentials" />
      </SidebarProvider>
    );

    const first = screen.getByRole('button', { name: /first mark/i });
    const second = screen.getByRole('button', { name: /second mark/i });
    const third = screen.getByRole('button', { name: /third mark/i });
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    expect(third).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('group', { name: 'Character palette' })).toHaveAccessibleDescription(
      /Use the arrow keys/
    );

    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(second, { key: 'End' });
    expect(third).toHaveFocus();
    fireEvent.keyDown(third, { key: 'Home' });
    expect(first).toHaveFocus();

    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 28,
      height: 28,
      right: 28,
      bottom: 28,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue({
      left: 30,
      top: 0,
      width: 28,
      height: 28,
      right: 58,
      bottom: 28,
      x: 30,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(third, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 30,
      width: 28,
      height: 28,
      right: 28,
      bottom: 58,
      x: 0,
      y: 30,
      toJSON: () => ({}),
    });
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(third).toHaveFocus();
    fireEvent.keyDown(third, { key: 'ArrowUp' });
    expect(first).toHaveFocus();
  });

  it('shows an inline error icon without opening feedback UI', async () => {
    vi.useFakeTimers();
    vi.mocked(writeClipboardPayload).mockResolvedValue(false);
    useLibraryStore.setState({
      packs: {},
      packStatus: { essentials: 'ready', nerd: 'ready', emoji: 'ready' },
      packErrors: {},
      searchQueries: { essentials: 'star', nerd: '', emoji: '' },
      searchResults: {
        essentials: [
          {
            id: 'U+2605',
            grapheme: '★',
            name: 'star icon',
            aliases: [],
            category: 'So',
            script: 'Common',
            coverage: 2,
            insertable: true,
          },
        ],
        nerd: [],
        emoji: [],
      },
    });

    render(
      <SidebarProvider>
        <CharLibrary view="essentials" />
      </SidebarProvider>
    );
    const starButton = screen.getByRole('button', { name: /star icon/i });
    fireEvent.click(starButton);
    await act(async () => {
      await Promise.resolve();
    });

    expect(starButton).toHaveAttribute('data-copy-feedback', 'error');
    expect(starButton.querySelector('.lucide-x')).toHaveClass('opacity-100');
    expect(starButton).toHaveClass('text-error');
    expect(screen.getByRole('status')).toHaveTextContent('Could not copy ★');

    act(() => vi.advanceTimersByTime(1199));
    expect(starButton).toHaveAttribute('data-copy-feedback', 'error');
    act(() => vi.advanceTimersByTime(1));
    expect(starButton).not.toHaveAttribute('data-copy-feedback');
    expect(starButton).toHaveTextContent('★');
  });

  it('targets one duplicate character button and resets the latest feedback timer', async () => {
    vi.useFakeTimers();
    vi.mocked(writeClipboardPayload).mockResolvedValue(true);
    useLibraryStore.setState({
      packs: {},
      packStatus: { essentials: 'ready', nerd: 'ready', emoji: 'ready' },
      packErrors: {},
      searchQueries: { essentials: 'star', nerd: '', emoji: '' },
      searchResults: {
        essentials: [
          {
            id: 'star-primary',
            grapheme: '★',
            name: 'primary star',
            aliases: [],
            category: 'So',
            script: 'Common',
            coverage: 2,
            insertable: true,
          },
          {
            id: 'star-secondary',
            grapheme: '★',
            name: 'secondary star',
            aliases: [],
            category: 'So',
            script: 'Common',
            coverage: 2,
            insertable: true,
          },
        ],
        nerd: [],
        emoji: [],
      },
    });

    render(
      <SidebarProvider>
        <CharLibrary view="essentials" />
      </SidebarProvider>
    );
    const primary = screen.getByRole('button', { name: /primary star/i });
    const secondary = screen.getByRole('button', { name: /secondary star/i });

    fireEvent.click(primary);
    await act(async () => {
      await Promise.resolve();
    });
    expect(primary).toHaveAttribute('data-copy-feedback', 'success');
    expect(secondary).not.toHaveAttribute('data-copy-feedback');

    act(() => vi.advanceTimersByTime(500));
    fireEvent.click(secondary);
    await act(async () => {
      await Promise.resolve();
    });
    expect(primary).not.toHaveAttribute('data-copy-feedback');
    expect(secondary).toHaveAttribute('data-copy-feedback', 'success');

    act(() => vi.advanceTimersByTime(599));
    expect(secondary).toHaveAttribute('data-copy-feedback', 'success');
    act(() => vi.advanceTimersByTime(1));
    expect(secondary).not.toHaveAttribute('data-copy-feedback');
  });

  it('localizes every curated pack directory and falls back to its asset label', () => {
    const labels = {
      essentials: [
        ['ascii', 'ASCII & Punctuation', 'ASCII 与标点'],
        ['lines', 'Lines & Blocks', '线条与块元素'],
        ['arrows', 'Arrows', '箭头'],
        ['shapes', 'Geometric Shapes', '几何图形'],
        ['math', 'Math', '数学'],
        ['technical', 'Technical', '技术符号'],
        ['numbers', 'Numbers & Letterlike Symbols', '数字与类字母符号'],
        ['dingbats', 'Dingbats', '装饰符号'],
        ['braille', 'Braille', '盲文'],
        ['common-symbols', 'Common Symbols', '常用符号'],
      ],
      nerd: [
        ['seti-ui-custom', 'Seti-UI-Custom', 'Seti UI 自定义'],
        ['devicons', 'Devicons', 'Devicons'],
        ['font-awesome', 'Font-Awesome', 'Font Awesome'],
        ['font-awesome-ext', 'Font-Awesome-Ext', 'Font Awesome 扩展'],
        ['material-design', 'Material-Design', 'Material Design'],
        ['weather-icons', 'Weather-Icons', '天气图标'],
        ['octicons', 'Octicons', 'Octicons'],
        ['powerline-symbols', 'Powerline-Symbols', 'Powerline 符号'],
        ['powerline-extra', 'Powerline-Extra', 'Powerline 扩展'],
        ['iec-power', 'IEC-Power', 'IEC 电源符号'],
        ['font-logos', 'Font-Logos', '字体标志'],
        ['pomicons', 'Pomicons', 'Pomicons'],
        ['codicons', 'Codicons', 'Codicons'],
        ['progress-indicators', 'Progress-Indicators', '进度指示器'],
        ['heavy-angle-brackets', 'Heavy-Angle-Brackets', '粗角括号'],
      ],
      emoji: [
        ['smileys-emotion', 'Smileys & Emotion', '笑脸与情感'],
        ['people-body', 'People & Body', '人物与身体'],
        ['component', 'Component', '组件'],
        ['animals-nature', 'Animals & Nature', '动物与自然'],
        ['food-drink', 'Food & Drink', '食物与饮品'],
        ['travel-places', 'Travel & Places', '旅行与地点'],
        ['activities', 'Activities', '活动'],
        ['objects', 'Objects', '物品'],
        ['symbols', 'Symbols', '符号'],
        ['flags', 'Flags', '旗帜'],
      ],
    } as const;
    const groups = (items: ReadonlyArray<readonly [string, string, string]>) =>
      items.map(([id, label]) => ({ id, label, entries: [] }));
    useLibraryStore.setState({
      packs: {
        essentials: [
          ...groups(labels.essentials),
          { id: 'future-group', label: 'Future Group', entries: [] },
        ],
        nerd: groups(labels.nerd),
        emoji: groups(labels.emoji),
      },
      packStatus: { essentials: 'ready', nerd: 'ready', emoji: 'ready' },
      packErrors: {},
      searchQueries: { essentials: '', nerd: '', emoji: '' },
      searchResults: { essentials: [], nerd: [], emoji: [] },
    });

    const { container, rerender } = render(
      <SidebarProvider>
        <CharLibrary view="essentials" />
      </SidebarProvider>
    );
    labels.essentials.forEach(([, english]) =>
      expect(screen.getByText(english)).toBeInTheDocument()
    );
    const groupTrigger = screen.getByText('Lines & Blocks').closest('button')!;
    const groupHeader = groupTrigger.closest('[data-slot="character-group-header"]');
    expect(container.querySelectorAll('[data-slot="character-group-header"]')).toHaveLength(
      labels.essentials.length + 1
    );
    expect(groupHeader).toHaveAttribute('data-surface-kind', 'embedded');
    expect(groupHeader).toHaveClass('sticky', 'top-0', 'z-10', 'bg-secondary/70');
    expect(groupTrigger).toHaveClass('min-h-7', 'text-xs', 'leading-4');
    expect(groupTrigger).not.toHaveClass('min-h-8', 'text-sm');
    fireEvent.click(groupTrigger);

    act(() => setUiLanguage('zh'));
    labels.essentials.forEach(([, , chinese]) =>
      expect(screen.getByText(chinese)).toBeInTheDocument()
    );
    expect(screen.getByText('Future Group')).toBeInTheDocument();
    expect(screen.getByText('线条与块元素').closest('button')).toHaveAttribute(
      'data-state',
      'open'
    );

    rerender(
      <SidebarProvider>
        <CharLibrary view="nerd" />
      </SidebarProvider>
    );
    labels.nerd.forEach(([, , chinese]) => expect(screen.getByText(chinese)).toBeInTheDocument());

    rerender(
      <SidebarProvider>
        <CharLibrary view="emoji" />
      </SidebarProvider>
    );
    labels.emoji.forEach(([, , chinese]) => expect(screen.getByText(chinese)).toBeInTheDocument());
  });

  it('selects Unicode views through Tabs and facets through Select', async () => {
    const loadUnicodeManifest = vi.fn().mockResolvedValue(undefined);
    const loadUnicodePage = vi.fn(
      async (facetType: 'block' | 'script' | 'category', facetId: string) => {
        useLibraryStore.setState({
          unicodeFacetType: facetType,
          unicodeFacetId: facetId,
        });
      }
    );
    useLibraryStore.setState({
      unicodeManifest: {
        schemaVersion: 1,
        unicodeVersion: '17.0.0',
        shardSize: 1024,
        shards: {},
        nameIndex: 'unicode/name-index.json',
        facets: {
          block: [
            {
              id: 'basic-latin',
              label: 'Basic Latin',
              count: 95,
              ranges: [[32, 126]],
            },
            {
              id: 'greek-coptic',
              label: 'Greek and Coptic',
              count: 117,
              ranges: [[880, 1023]],
            },
          ],
          script: [
            {
              id: 'latin',
              label: 'Latin',
              count: 1374,
              ranges: [[65, 90]],
            },
            {
              id: 'greek',
              label: 'Greek',
              count: 518,
              ranges: [[880, 1023]],
            },
          ],
          category: [
            {
              id: 'uppercase-letter',
              label: 'Uppercase Letter',
              count: 1858,
              ranges: [[65, 90]],
            },
          ],
        },
      },
      unicodeStatus: 'ready',
      unicodeError: null,
      unicodeFacetType: 'block',
      unicodeFacetId: 'basic-latin',
      unicodeResults: [],
      unicodeOffset: 0,
      unicodeHasMore: false,
      loadUnicodeManifest,
      loadUnicodePage,
    });

    render(
      <SidebarProvider>
        <CharLibrary view="unicode" />
      </SidebarProvider>
    );

    const trigger = screen.getByRole('combobox', { name: 'Unicode facet' });
    expect(document.querySelector('[data-slot="character-group-header"]')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Basic Latin (95)');

    act(() => {
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    });
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event('blur')));
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    act(() => {
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    });
    fireEvent.click(
      await screen.findByRole('option', {
        name: 'Greek and Coptic (117)',
      })
    );
    await waitFor(() => expect(loadUnicodePage).toHaveBeenCalledWith('block', 'greek-coptic'));
    expect(trigger).toHaveTextContent('Greek and Coptic (117)');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Script' }), {
      button: 0,
      ctrlKey: false,
    });
    await waitFor(() => expect(loadUnicodePage).toHaveBeenCalledWith('script', 'latin'));
    expect(trigger).toHaveTextContent('Latin (1374)');

    act(() => setUiLanguage('zh'));
    expect(screen.getByRole('combobox', { name: 'Unicode 分类' })).toBe(trigger);
    expect(screen.getByRole('tab', { name: '区块' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '文字系统' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '类别' })).toBeInTheDocument();
  });
});
