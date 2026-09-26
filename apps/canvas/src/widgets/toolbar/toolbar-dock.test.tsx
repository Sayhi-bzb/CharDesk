import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { Toolbar as ToolbarUnderTest } from '@/widgets/toolbar/dock';
import { useEditorStore } from '@/domains/canvas/testing';
import { setUiLanguage } from '@/shared/i18n';
import { ShortcutProvider } from '@/shared/shortcuts/dispatcher';
import { useEditorShortcutLayer } from '@/domains/editor/public';

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.stubGlobal(
  'ResizeObserver',
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

type TestToolbarProps = Omit<
  ComponentProps<typeof ToolbarUnderTest>,
  'isCanvasTextEditing' | 'onExitCanvasTextEditing'
> & {
  isCanvasTextEditing?: boolean;
  onExitCanvasTextEditing?: () => void;
};

function EditorShortcutTestLayer() {
  useEditorShortcutLayer();
  return null;
}

function Toolbar({
  isCanvasTextEditing = false,
  onExitCanvasTextEditing = () => {},
  ...props
}: TestToolbarProps) {
  return (
    <ShortcutProvider>
      <EditorShortcutTestLayer />
      <ToolbarUnderTest
        {...props}
        isCanvasTextEditing={isCanvasTextEditing}
        onExitCanvasTextEditing={onExitCanvasTextEditing}
      />
    </ShortcutProvider>
  );
}

describe('Toolbar dock', () => {
  const initialState = useEditorStore.getState();

  afterEach(() => {
    act(() => setUiLanguage('en'));
    useEditorStore.setState(initialState, true);
  });

  it('shows Hand first in freeform and selects it persistently', () => {
    useEditorStore.setState({ canvasMode: 'freeform', tool: 'select' });
    const setTool = vi.fn();
    const { container } = render(<Toolbar tool="select" setTool={setTool} onUndo={vi.fn()} />);

    const items = container.querySelectorAll('[data-toolbar-item]');
    expect(items[0]).toHaveAttribute('data-toolbar-item', 'pan');
    fireEvent.click(screen.getByRole('button', { name: 'Hand' }));
    expect(setTool).toHaveBeenCalledWith('pan');
  });

  it('maps Alt+digits to the visible freeform dock order', () => {
    useEditorStore.setState({ canvasMode: 'freeform', tool: 'select' });
    const setTool = vi.fn();
    render(<Toolbar tool="select" setTool={setTool} onUndo={vi.fn()} />);

    fireEvent.keyDown(window, {
      key: '¡',
      code: 'Digit1',
      altKey: true,
    });
    fireEvent.keyDown(window, {
      key: '£',
      code: 'Digit3',
      altKey: true,
    });

    expect(setTool).toHaveBeenNthCalledWith(1, 'pan');
    expect(setTool).toHaveBeenNthCalledWith(2, 'box');
    expect(screen.getByRole('button', { name: 'Hand' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Alt+1'
    );
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Alt+2'
    );
  });

  it('exits canvas text editing before using a Dock shortcut', () => {
    useEditorStore.setState({ canvasMode: 'freeform', tool: 'select' });
    const setTool = vi.fn();
    const onExitCanvasTextEditing = vi.fn();
    const input = document.createElement('input');
    document.body.append(input);
    const view = render(
      <Toolbar
        tool="select"
        setTool={setTool}
        onUndo={vi.fn()}
        isCanvasTextEditing
        onExitCanvasTextEditing={onExitCanvasTextEditing}
      />
    );

    fireEvent.keyDown(window, {
      key: '1',
      code: 'Digit1',
      altKey: true,
    });
    expect(onExitCanvasTextEditing).toHaveBeenCalledOnce();
    expect(setTool).toHaveBeenCalledWith('pan');
    expect(onExitCanvasTextEditing.mock.invocationCallOrder[0]).toBeLessThan(
      setTool.mock.invocationCallOrder[0]
    );

    view.rerender(
      <Toolbar
        tool="select"
        setTool={setTool}
        onUndo={vi.fn()}
        onExitCanvasTextEditing={onExitCanvasTextEditing}
      />
    );
    fireEvent.keyDown(input, {
      key: '1',
      code: 'Digit1',
      altKey: true,
    });
    expect(setTool).toHaveBeenCalledTimes(1);
    expect(onExitCanvasTextEditing).toHaveBeenCalledOnce();
    input.remove();
  });

  it('leaves Alt+6 available for the freeform palette surface', () => {
    useEditorStore.setState({ canvasMode: 'freeform', tool: 'select' });
    const onExitCanvasTextEditing = vi.fn();
    render(
      <Toolbar
        tool="select"
        setTool={vi.fn()}
        onUndo={vi.fn()}
        isCanvasTextEditing
        onExitCanvasTextEditing={onExitCanvasTextEditing}
      />
    );

    fireEvent.keyDown(window, {
      code: 'Digit6',
      altKey: true,
    });

    expect(onExitCanvasTextEditing).not.toHaveBeenCalled();
    expect(screen.queryByRole('tablist', { name: 'Color palettes' })).not.toBeInTheDocument();
  });

  it('uses the active accent state for Hand', () => {
    useEditorStore.setState({ canvasMode: 'freeform', tool: 'pan' });
    render(<Toolbar tool="pan" setTool={vi.fn()} onUndo={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Hand' })).toHaveClass(
      'bg-control-active-surface',
      'text-foreground'
    );
  });

  it('hides brush and eraser in freeform mode', () => {
    useEditorStore.setState({ canvasMode: 'freeform', tool: 'select' });

    render(<Toolbar tool="select" setTool={vi.fn()} onUndo={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Box' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Background' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paint Char Color' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Color' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Brush/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eraser' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fill Area' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('returns hidden freeform brush tool state to select', () => {
    useEditorStore.setState({ canvasMode: 'freeform', tool: 'brush' });
    const setTool = vi.fn();

    render(<Toolbar tool="brush" setTool={setTool} onUndo={vi.fn()} />);

    expect(setTool).toHaveBeenCalledWith('select');
  });

  it('returns hidden freeform eraser tool state to select', () => {
    useEditorStore.setState({ canvasMode: 'freeform', tool: 'eraser' });
    const setTool = vi.fn();

    render(<Toolbar tool="eraser" setTool={setTool} onUndo={vi.fn()} />);

    expect(setTool).toHaveBeenCalledWith('select');
  });

  it('activates background from the first-level freeform dock', () => {
    useEditorStore.setState({ canvasMode: 'freeform', tool: 'select' });
    const setTool = vi.fn();

    render(<Toolbar tool="select" setTool={setTool} onUndo={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Background' }));

    expect(setTool).toHaveBeenCalledWith('bg');
  });

  it('keeps background separate from the shape group active label', () => {
    useEditorStore.setState({ canvasMode: 'freeform', tool: 'bg' });

    render(<Toolbar tool="bg" setTool={vi.fn()} onUndo={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Box' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Background' })).toBeInTheDocument();
  });

  it('uses the top bar surface and accent background for the active tool', () => {
    useEditorStore.setState({ canvasMode: 'freeform', tool: 'select' });

    const { container } = render(<Toolbar tool="select" setTool={vi.fn()} onUndo={vi.fn()} />);
    const toolbar = screen.getByRole('toolbar');
    const activeItem = container.querySelector('[data-toolbar-item="select"]');
    const activeButton = screen.getByRole('button', { name: 'Select' });
    const inactiveItem = container.querySelector('[data-toolbar-item="shape-group"]');
    const inactiveButtons = inactiveItem?.querySelectorAll('button') ?? [];

    expect(screen.getByTestId('tool-dock')).toBe(toolbar.parentElement);
    expect(toolbar.parentElement).toHaveClass(
      'bg-host-surface',
      'rounded-surface',
      'border-0',
      'shadow-host'
    );
    expect(activeButton).toHaveClass('bg-control-active-surface', 'text-foreground');
    expect(inactiveItem).not.toHaveClass('bg-accent');
    expect(activeItem).not.toHaveClass('bg-accent');
    expect(inactiveButtons[0]).toHaveClass(
      'size-8',
      'rounded-r-none',
      'focus-visible:ring-2',
      'hover:bg-accent',
      'hover:text-accent-foreground'
    );
    expect(inactiveButtons[1]).toHaveClass(
      'size-8',
      'rounded-l-none',
      'focus-visible:ring-2',
      'hover:bg-accent',
      'hover:text-accent-foreground'
    );
    expect(inactiveButtons[1]).toHaveAttribute('data-toolbar-submenu-trigger', 'true');
    expect(inactiveButtons[1]).not.toHaveClass(
      'border-l',
      'border-transparent',
      'hover:border-border'
    );
    expect(toolbar.querySelector('[style*="translateX"]')).not.toBeInTheDocument();
  });

  it('uses dropdown menu semantics and styling for shape submenus', async () => {
    useEditorStore.setState({ canvasMode: 'freeform', tool: 'select' });
    const setTool = vi.fn();

    const { container } = render(<Toolbar tool="select" setTool={setTool} onUndo={vi.fn()} />);
    const shapeItem = container.querySelector('[data-toolbar-item="shape-group"]');
    const shapeButtons = shapeItem?.querySelectorAll('button') ?? [];

    fireEvent.pointerDown(shapeButtons[1], { button: 0, ctrlKey: false });
    const circle = await screen.findByRole('menuitemradio', {
      name: 'Circle',
    });

    expect(shapeItem).not.toHaveClass('bg-accent', 'text-foreground');
    expect(shapeButtons[0]).toHaveClass('bg-control-open-surface', 'text-foreground');
    expect(shapeButtons[1]).toHaveClass('bg-control-open-surface', 'text-foreground');
    expect(shapeButtons[1]).toHaveClass('opacity-40', 'data-[open=true]:opacity-100');
    const shapeMenu = document.querySelector('[data-slot="dropdown-menu-content"]');
    expect(shapeMenu).toHaveClass(
      'w-max',
      'min-w-40',
      'bg-overlay-surface',
      'border-0',
      'shadow-overlay',
      'rounded-surface'
    );
    expect(shapeMenu).not.toHaveClass('min-w-48');
    fireEvent.click(circle);
    expect(setTool).toHaveBeenCalledWith('circle');
    await waitFor(() =>
      expect(document.querySelector('[data-slot="dropdown-menu-content"]')).not.toBeInTheDocument()
    );
  });

  it('returns an unavailable arrow line tool to select in freeform', () => {
    useEditorStore.setState({ canvasMode: 'freeform', tool: 'arrowLine' });
    const setTool = vi.fn();

    render(<Toolbar tool="arrowLine" setTool={setTool} onUndo={vi.fn()} />);

    expect(setTool).toHaveBeenCalledWith('select');
  });

});
