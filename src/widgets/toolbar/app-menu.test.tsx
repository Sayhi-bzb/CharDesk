import 'fake-indexeddb/auto';
import { TestCanvasContentSurface } from '@/domains/canvas/testing';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/domains/canvas/testing';
import { createSlideDeck } from '@/domains/slides/public';
import { setUiLanguage } from '@/shared/i18n';
import { browser, feedback } from '@/shared/services/effects';
import { AppMenu } from './app-menu';
import { CanvasWorkspaceProvider } from '@/widgets/canvas-editor/engine/CanvasWorkspace';
import { OnboardingTourContext } from '@/widgets/onboarding/onboarding-context';
import { EditorPresentationProvider } from '@/widgets/editor-chrome/public';
import { CanvasBreadcrumb } from '@/widgets/session-tabs/CanvasBreadcrumb';

describe('AppMenu document interchange', () => {
  const initialState = useEditorStore.getState();

  const blackboardFile = (webkitRelativePath: string, source: string) =>
    ({
      webkitRelativePath,
      text: async () => source,
    }) as File;

  beforeEach(() => {
    window.localStorage.removeItem('chardesk-github-stars-v1');
    window.localStorage.removeItem('chardesk-canvas-split-enabled');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stargazers_count: 1234 }),
    }));
  });

  afterEach(() => {
    cleanup();
    act(() => setUiLanguage('en'));
    useEditorStore.setState(initialState, true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers file and Blackboard imports while a Slide Deck is active', async () => {
    const slideDeck = createSlideDeck({ initialSlideId: 'slide-1' });
    useEditorStore.setState({
      canvasMode: 'slide',
      slideDeck,
      activeCanvasId: 'deck',
      canvasSessions: [
        {
          id: 'deck',
          name: 'Agent Deck',
          mode: 'slide',
        },
      ],
      contentSurface: new TestCanvasContentSurface(),
    });
    act(() => setUiLanguage('en'));

    const { container } = render(<CanvasBreadcrumb />);
    const inputs = container.querySelectorAll('input[type="file"]');
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveAttribute(
      'accept',
      '.chardesk,.slides.md,.ans,.txt'
    );
    expect((inputs[1] as HTMLInputElement).webkitdirectory).toBe(true);
    expect(inputs[1]).toHaveAttribute('multiple');

    fireEvent.click(screen.getByRole('button', { name: 'Select canvas' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Import' }), {
      button: 0,
      ctrlKey: false,
    });
    await screen.findByRole('menuitem', { name: 'File' });
    await screen.findByRole('menuitem', { name: 'Blackboard' });
  });

  it('imports a Blackboard directory into a detached editable canvas', async () => {
    vi.spyOn(feedback, 'error').mockImplementation(() => undefined);
    const before = useEditorStore.getState();
    const previousSessionId = before.activeCanvasId;
    const previousSessionCount = before.canvasSessions.length;
    const { container } = render(<CanvasBreadcrumb />);
    const directoryInput = container.querySelectorAll('input[type="file"]')[1];

    fireEvent.change(directoryInput, {
      target: {
        files: [
          blackboardFile(
            'gpu/blackboard.yaml',
            [
              'chardesk: blackboard/v1',
              'title: Imported GPU',
              'panels:',
              '  overview: { source: panels/overview.panel }',
              'layout:',
              '  areas: [[overview]]',
            ].join('\n')
          ),
          blackboardFile(
            'gpu/panels/overview.panel',
            [
              '```mermaid',
              'flowchart LR',
              '  A[GPU] --> B[Pixels]',
              '```',
            ].join('\n')
          ),
        ],
      },
    });

    await waitFor(() => {
      expect(feedback.error).not.toHaveBeenCalled();
      const state = useEditorStore.getState();
      expect(state.canvasSessions).toHaveLength(previousSessionCount + 1);
      expect(state.activeCanvasId).not.toBe(previousSessionId);
      expect(state.canvasSessions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: previousSessionId }),
          expect.objectContaining({
            id: state.activeCanvasId,
            name: 'Imported GPU',
            mode: 'freeform',
          }),
        ])
      );
    });

    const imported = useEditorStore.getState().canvasSessions.find(
      (session) => session.id === useEditorStore.getState().activeCanvasId,
    );
    if (!imported || imported.mode !== 'freeform') {
      throw new Error('Expected an editable Freeform session.');
    }
    expect('workspaceId' in imported).toBe(false);
    expect(useEditorStore.getState().contentSurface.reader.materialize().size).toBeGreaterThan(0);
  });

  it('keeps ANSI out of static canvas exports', async () => {
    useEditorStore.setState({
      canvasMode: 'freeform',
      contentSurface: new TestCanvasContentSurface([['0,0', { char: 'A', color: '#ffffff' }]]),
    });
    act(() => setUiLanguage('en'));
    render(<CanvasBreadcrumb />);

    const state = useEditorStore.getState();
    const activeName = state.canvasSessions.find(
      (session) => session.id === state.activeCanvasId
    )!.name;
    fireEvent.click(screen.getByRole('button', { name: 'Select canvas' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: `Manage ${activeName}` }), {
      button: 0,
      ctrlKey: false,
    });
    const exportItem = screen.getByRole('menuitem', { name: 'Export' });
    fireEvent.pointerMove(exportItem, { pointerType: 'mouse' });

    expect(await screen.findByRole('menuitem', { name: 'TXT' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'CharDesk' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'PNG' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'ANSI' })).not.toBeInTheDocument();
  });

  it('opens settings and restores menu trigger focus', async () => {
    act(() => setUiLanguage('en'));
    render(<AppMenu />);
    const trigger = screen.getByRole('button', { name: 'Open menu' });

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Settings' })
    );

    expect(
      await screen.findByRole('heading', { name: 'Settings' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());

  });

  it('keeps document I/O out of the app menu and exposes Clear canvas directly', async () => {
    act(() => setUiLanguage('en'));
    render(<AppMenu />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open menu' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByRole('menuitem', { name: 'Clear canvas' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'File' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Export' })).not.toBeInTheDocument();
  });

  it('toggles split view from the app menu with the horizontal split icon', async () => {
    act(() => setUiLanguage('en'));
    render(
      <CanvasWorkspaceProvider>
        <AppMenu />
      </CanvasWorkspaceProvider>
    );

    const trigger = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    const splitItem = await screen.findByRole('menuitem', { name: 'Split' });
    expect(splitItem.querySelector('.lucide-square-split-horizontal')).toBeInTheDocument();
    fireEvent.click(splitItem);

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    expect(await screen.findByRole('menuitem', { name: 'Close split' })).toBeInTheDocument();
  });

  it('hides unavailable split view and opens the touch guide on phone', async () => {
    act(() => setUiLanguage('en'));
    render(
      <OnboardingTourContext.Provider
        value={{ phase: 'idle', canStart: false, requestStart: vi.fn() }}
      >
        <CanvasWorkspaceProvider>
          <AppMenu formFactor="phone" splitAvailable={false} />
        </CanvasWorkspaceProvider>
      </OnboardingTourContext.Provider>
    );

    const trigger = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    expect(screen.queryByRole('menuitem', { name: 'Split' })).not.toBeInTheDocument();

    const helpItem = await screen.findByRole('menuitem', { name: 'Help' });
    fireEvent.pointerMove(helpItem, { pointerType: 'mouse' });
    await waitFor(() => expect(helpItem).toHaveAttribute('data-state', 'open'));
    const guideItem = await screen.findByRole('menuitem', { name: 'Guide' });
    expect(guideItem).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(guideItem);

    expect(
      await screen.findByRole('heading', { name: 'Using the canvas on touch' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Pinch with two fingers/)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());

    act(() => setUiLanguage('zh'));
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    const chineseHelpItem = await screen.findByRole('menuitem', { name: '帮助' });
    fireEvent.pointerMove(chineseHelpItem, { pointerType: 'mouse' });
    await waitFor(() => expect(chineseHelpItem).toHaveAttribute('data-state', 'open'));
    fireEvent.click(await screen.findByRole('menuitem', { name: '引导' }));
    expect(await screen.findByRole('heading', { name: '在触屏上使用画布' })).toBeInTheDocument();
  });

  it('starts the guide after closing the menu and opens documentation externally', async () => {
    act(() => setUiLanguage('en'));
    const requestStart = vi.fn();
    const openExternal = vi.spyOn(browser, 'openExternal').mockReturnValue(null);
    render(
      <OnboardingTourContext.Provider
        value={{ phase: 'idle', canStart: true, requestStart }}
      >
        <AppMenu />
      </OnboardingTourContext.Provider>
    );

    const trigger = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    const helpItem = await screen.findByRole('menuitem', { name: 'Help' });
    fireEvent.pointerMove(helpItem, { pointerType: 'mouse' });
    await waitFor(() => expect(helpItem).toHaveAttribute('data-state', 'open'));
    const guideItem = await screen.findByRole('menuitem', { name: 'Guide' });
    expect(guideItem.querySelector('.lucide-compass')).toBeInTheDocument();
    fireEvent.click(guideItem);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await waitFor(() => expect(requestStart).toHaveBeenCalledOnce());

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    const reopenedHelpItem = await screen.findByRole('menuitem', { name: 'Help' });
    fireEvent.pointerMove(reopenedHelpItem, { pointerType: 'mouse' });
    await waitFor(() => expect(reopenedHelpItem).toHaveAttribute('data-state', 'open'));
    const documentationItem = await screen.findByRole('menuitem', {
      name: 'Documentation',
    });
    expect(documentationItem.querySelector('.lucide-book-open')).toBeInTheDocument();
    fireEvent.click(documentationItem);

    expect(openExternal).toHaveBeenCalledWith('/docs');
  });

  it('disables the guide when onboarding is unavailable', async () => {
    act(() => setUiLanguage('en'));
    render(<AppMenu />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open menu' }), {
      button: 0,
      ctrlKey: false,
    });

    const helpItem = await screen.findByRole('menuitem', { name: 'Help' });
    fireEvent.pointerMove(helpItem, { pointerType: 'mouse' });
    await waitFor(() => expect(helpItem).toHaveAttribute('data-state', 'open'));
    expect(await screen.findByRole('menuitem', { name: 'Guide' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('localizes the settings menu item', async () => {
    act(() => setUiLanguage('zh'));
    render(<AppMenu />);

    fireEvent.pointerDown(screen.getByRole('button', { name: '打开菜单' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(
      await screen.findByRole('menuitem', { name: '设置' })
    ).toBeInTheDocument();
    const helpItem = screen.getByRole('menuitem', { name: '帮助' });
    fireEvent.pointerMove(helpItem, { pointerType: 'mouse' });
    await waitFor(() => expect(helpItem).toHaveAttribute('data-state', 'open'));
    expect(await screen.findByRole('menuitem', { name: '引导' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '文档' })).toBeInTheDocument();
  });

  it('toggles Zen and uses an explicit exit label', async () => {
    act(() => setUiLanguage('en'));
    render(
      <EditorPresentationProvider>
        <AppMenu />
      </EditorPresentationProvider>
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open menu' }), {
      button: 0,
      ctrlKey: false,
    });
    const enterItem = await screen.findByRole('menuitem', { name: 'Zen' });
    expect(enterItem.querySelector('.lucide-focus')).toBeInTheDocument();
    fireEvent.click(enterItem);

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open menu' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Exit Zen' }));

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open menu' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findByRole('menuitem', { name: 'Zen' })).toBeInTheDocument();
  });

  it('exits Zen before starting the guide', async () => {
    act(() => setUiLanguage('en'));
    const requestStart = vi.fn();
    render(
      <EditorPresentationProvider initialMode="zen">
        <OnboardingTourContext.Provider
          value={{ phase: 'idle', canStart: true, requestStart }}
        >
          <AppMenu />
        </OnboardingTourContext.Provider>
      </EditorPresentationProvider>
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open menu' }), {
      button: 0,
      ctrlKey: false,
    });
    const helpItem = await screen.findByRole('menuitem', { name: 'Help' });
    fireEvent.pointerMove(helpItem, { pointerType: 'mouse' });
    await waitFor(() => expect(helpItem).toHaveAttribute('data-state', 'open'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Guide' }));

    await waitFor(() => expect(requestStart).toHaveBeenCalledOnce());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open menu' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findByRole('menuitem', { name: 'Zen' })).toBeInTheDocument();
  });
});
