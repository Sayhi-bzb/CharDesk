import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useEditorStore } from '@/domains/canvas/testing';
import { setUiLanguage } from '@/shared/i18n';
import { ColorPickerPanel } from './index';

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

describe('ColorPickerPanel', () => {
  const initialState = useEditorStore.getState();

  afterEach(() => {
    act(() => setUiLanguage('en'));
    useEditorStore.setState(initialState, true);
  });

  it('uses compact header actions without shrinking the palette tabs', () => {
    render(
      <ColorPickerPanel
        value="#000000"
        onPick={vi.fn()}
        defaultColor="#000000"
        density="compact"
      />
    );

    expect(screen.getByRole('tab', { name: 'ANSI 16' })).toHaveClass('size-7');
    expect(screen.getByRole('button', { name: 'Hex: #000000' })).toHaveClass('size-6');
    expect(screen.getByRole('button', { name: 'Pick color from canvas' })).toHaveClass('size-6');
    expect(screen.getByRole('button', { name: 'Restore default color' })).toHaveClass('size-6');
  });

  it('switches between ansi 16 and preset color tabs', async () => {
    const onPick = vi.fn();

    render(<ColorPickerPanel value="#000000" onPick={onPick} defaultColor="#000000" />);

    expect(screen.getByRole('tab', { name: 'ANSI 16' })).toHaveAttribute('aria-selected', 'true');
    const activeSwatch = screen.getByRole('button', { name: 'Pick ANSI color #000000' });
    expect(activeSwatch).toHaveAttribute('aria-pressed', 'true');
    expect(activeSwatch).toHaveClass('ring-2', 'ring-primary');
    expect(activeSwatch.querySelector('svg')).not.toBeInTheDocument();
    const paletteTabs = screen.getByRole('tablist', {
      name: 'Color palettes',
    });
    expect(paletteTabs).toHaveAttribute('data-orientation', 'horizontal');
    expect(paletteTabs).toHaveClass('w-fit', 'flex-row', 'gap-0.5', 'p-px');
    const ansiTab = screen.getByRole('tab', { name: 'ANSI 16' });
    expect(ansiTab).toHaveAttribute('data-size', 'icon');
    expect(ansiTab).toHaveAttribute('data-active', 'true');
    expect(ansiTab).toHaveClass(
      'size-7',
      'rounded-control',
      'flex-none',
      'justify-center',
      'hover:bg-control-active-surface',
      'hover:text-foreground',
      'group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none'
    );
    expect(ansiTab).not.toHaveClass('min-w-8');
    expect(ansiTab.querySelector('svg')).toBeInTheDocument();
    const pickerPanel = paletteTabs.closest('[data-color-picker-panel="true"]');
    expect(pickerPanel).toHaveClass('w-40', 'gap-2', 'px-1');
    const pickerHeader = screen.getByTestId('color-picker-header');
    expect(pickerHeader).toHaveClass('gap-0.5');
    expect(pickerHeader).toContainElement(paletteTabs);
    const contentFrame = screen.getByTestId('color-picker-content-frame');
    expect(
      paletteTabs.compareDocumentPosition(contentFrame) & Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
    expect(contentFrame).toHaveClass('w-full', 'min-w-0');
    expect(contentFrame).not.toHaveClass('h-[8.875rem]', 'h-[6.375rem]');

    expect(screen.getByRole('tab', { name: 'ANSI 16' })).toHaveClass(
      'bg-control-active-surface',
      'text-foreground'
    );
    expect(screen.getByRole('tab', { name: 'Presets' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByText('Hex')).not.toBeInTheDocument();

    const activeColorView = screen.getByRole('tabpanel');
    const colorValueTrigger = screen.getByRole('button', { name: 'Hex: #000000' });
    expect(pickerHeader).toContainElement(colorValueTrigger);
    expect(activeColorView).not.toContainElement(colorValueTrigger);
    expect(screen.getByTestId('color-value-icon')).toHaveClass('size-4', 'rounded-full');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(activeColorView).toContainElement(screen.getByTestId('color-palette-grid'));

    const eyedropperTrigger = screen.getByRole('button', {
      name: 'Pick color from canvas',
    });
    const headerActions = screen.getByTestId('color-picker-header-actions');
    expect(headerActions).toHaveClass('gap-0.5');
    expect(headerActions).toContainElement(colorValueTrigger);
    expect(headerActions).toContainElement(eyedropperTrigger);
    expect(pickerHeader).toContainElement(eyedropperTrigger);
    expect(colorValueTrigger).toHaveClass('size-7');
    expect(eyedropperTrigger).toHaveClass('size-7');
    expect(eyedropperTrigger).not.toHaveAttribute('title');
    expect(eyedropperTrigger.querySelector('svg')).not.toHaveClass('size-3.5');
    expect(screen.getByRole('button', { name: 'Restore default color' })).toHaveClass('size-7');

    fireEvent.focus(eyedropperTrigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Pick color from canvas');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());

    fireEvent.click(colorValueTrigger);
    const hexInput = screen.getByRole('textbox', { name: 'Hex' });
    expect(hexInput).toHaveFocus();
    const visualColorPicker = screen.getByTestId('visual-color-picker');
    expect(visualColorPicker).toBeInTheDocument();
    expect(visualColorPicker.closest('[data-slot="popover-content"]')).toHaveAttribute(
      'data-side',
      'right'
    );
    expect(visualColorPicker.closest('[data-slot="popover-content"]')).toHaveAttribute(
      'data-align',
      'start'
    );
    expect(screen.getByRole('slider', { name: 'Color' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Hue' })).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Alpha' })).not.toBeInTheDocument();
    expect(hexInput).toHaveClass(
      'bg-search-surface',
      'border-0',
      'shadow-none',
      'focus-visible:ring-2',
      'focus-visible:ring-ring/45',
      'focus-visible:ring-inset'
    );
    expect(hexInput).not.toHaveClass('bg-muted/40');
    expect(screen.queryByRole('button', { name: 'Use' })).not.toBeInTheDocument();

    fireEvent.keyDown(hexInput, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pick ANSI color #c0c0c0' }));
    expect(onPick).toHaveBeenCalledWith('#c0c0c0');

    fireEvent.click(screen.getByRole('button', { name: 'Pick ANSI color #000080' }));
    expect(onPick).toHaveBeenCalledWith('#000080');
    expect(screen.getByTestId('color-palette-grid')).toHaveClass(
      'grid-cols-4',
      'justify-items-center',
      'gap-y-1'
    );
    const ansiColor = screen.getByRole('button', { name: 'Pick ANSI color #000080' });
    expect(ansiColor).toHaveClass('size-6', 'rounded-full', 'cursor-pointer');
    expect(ansiColor).not.toHaveClass('transition-transform', 'hover:scale-110', 'active:scale-95');
    expect(ansiColor.firstElementChild).toHaveClass('size-[18px]', 'rounded-full');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Presets' }), {
      button: 0,
    });

    expect(screen.getByRole('tab', { name: 'ANSI 16' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Presets' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Presets' })).toHaveClass(
      'bg-control-active-surface',
      'text-foreground'
    );
    expect(contentFrame).not.toHaveClass('h-[8.875rem]', 'h-[6.375rem]');
    expect(screen.getByTestId('color-palette-grid')).toHaveClass(
      'grid-cols-5',
      'justify-items-center',
      'gap-y-1'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pick preset color #7f1d1d' }));
    expect(onPick).toHaveBeenCalledWith('#7f1d1d');
    fireEvent.click(screen.getByRole('button', { name: 'Pick preset color #93c5fd' }));
    expect(onPick).toHaveBeenCalledWith('#93c5fd');
  });

  it('normalizes short hex colors before picking with Enter', () => {
    const onPick = vi.fn();

    render(<ColorPickerPanel value="#000000" onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hex: #000000' }));
    const input = screen.getByRole('textbox', { name: 'Hex' });
    fireEvent.change(input, {
      target: { value: '#0fc' },
    });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onPick).toHaveBeenCalledWith('#00ffcc');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hex: #00ffcc' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use' })).not.toBeInTheDocument();
  });

  it('keeps visual color changes local until the value popover is closed', async () => {
    const onPick = vi.fn();

    render(<ColorPickerPanel value="#ff0000" onPick={onPick} />);
    const colorValueTrigger = screen.getByRole('button', { name: 'Hex: #ff0000' });
    fireEvent.click(colorValueTrigger);

    const colorSlider = screen.getByRole('slider', { name: 'Color' });
    fireEvent.keyDown(colorSlider, { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 });

    const input = screen.getByRole('textbox', { name: 'Hex' });
    await waitFor(() => expect(input).not.toHaveValue('#ff0000'));
    const draftColor = input.getAttribute('value');
    expect(draftColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(onPick).not.toHaveBeenCalled();

    fireEvent.click(colorValueTrigger);

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(draftColor);
    expect(screen.queryByTestId('visual-color-picker')).not.toBeInTheDocument();
  });

  it('rejects alpha-bearing hex values', () => {
    const onPick = vi.fn();

    render(<ColorPickerPanel value="#000000" onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hex: #000000' }));
    const input = screen.getByRole('textbox', { name: 'Hex' });
    expect(input).toHaveAttribute('maxlength', '7');

    fireEvent.change(input, { target: { value: '#11223344' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Hex' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hex: #000000' })).toBeInTheDocument();
  });

  it('commits valid hex outside the panel and restores invalid input', () => {
    const onPick = vi.fn();

    render(<ColorPickerPanel value="#000000" onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hex: #000000' }));
    let input = screen.getByRole('textbox', { name: 'Hex' });
    fireEvent.change(input, { target: { value: '#123456' } });
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(onPick).toHaveBeenCalledWith('#123456');
    expect(screen.getByRole('button', { name: 'Hex: #123456' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hex: #123456' }));
    input = screen.getByRole('textbox', { name: 'Hex' });
    fireEvent.change(input, { target: { value: '#invalid' } });
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hex: #000000' })).toBeInTheDocument();
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('cancels pending hex while focus moves within the picker', () => {
    const onPick = vi.fn();

    render(<ColorPickerPanel value="#000000" onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hex: #000000' }));
    const input = screen.getByRole('textbox', { name: 'Hex' });
    const eyedropperTrigger = screen.getByRole('button', {
      name: 'Pick color from canvas',
    });
    fireEvent.change(input, { target: { value: '#123456' } });
    fireEvent.blur(input, { relatedTarget: eyedropperTrigger });

    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hex: #000000' })).toBeInTheDocument();
  });

  it('toggles automatic canvas color picking for the configured destination', () => {
    const onCanvasPickStarted = vi.fn();
    const { rerender } = render(
      <ColorPickerPanel
        value="#000000"
        onPick={vi.fn()}
        onCanvasPickStarted={onCanvasPickStarted}
      />
    );

    const eyedropperTrigger = screen.getByRole('button', {
      name: 'Pick color from canvas',
    });
    fireEvent.click(eyedropperTrigger);

    expect(onCanvasPickStarted).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().interaction.canvasColorPickerTarget).toBe('auto');
    expect(eyedropperTrigger).toHaveAttribute('aria-pressed', 'true');
    expect(eyedropperTrigger).toHaveClass('bg-control-pressed-surface', 'text-foreground');

    fireEvent.click(eyedropperTrigger);
    expect(useEditorStore.getState().interaction.canvasColorPickerTarget).toBeNull();
    expect(eyedropperTrigger).toHaveAttribute('aria-pressed', 'false');
    expect(onCanvasPickStarted).toHaveBeenCalledTimes(1);

    rerender(
      <ColorPickerPanel
        value="#000000"
        onPick={vi.fn()}
        onCanvasPickStarted={onCanvasPickStarted}
        canvasPickDestination="background"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pick color from canvas' }));
    expect(useEditorStore.getState().interaction.canvasColorPickerTarget).toBe('auto-to-background');
    expect(onCanvasPickStarted).toHaveBeenCalledTimes(2);
  });

  it('hides hex and eyedropper tools in palette-only mode', () => {
    render(
      <ColorPickerPanel
        value="#000000"
        onPick={vi.fn()}
        defaultColor="#000000"
        showCustomInput={false}
      />
    );

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Hex:/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Pick color from canvas' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore default color' })).not.toBeInTheDocument();
    expect(screen.getByTestId('color-picker-content-frame')).not.toHaveClass(
      'h-[8.875rem]',
      'h-[6.375rem]'
    );
    expect(screen.getByRole('tab', { name: 'ANSI 16' })).toBeInTheDocument();
  });

  it('restores the configured default color without requiring a custom color tool', () => {
    const onPick = vi.fn();
    const view = render(
      <ColorPickerPanel value="#ff0000" onPick={onPick} defaultColor="#000000" />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restore default color' }));
    expect(onPick).toHaveBeenCalledWith('#000000');

    view.rerender(<ColorPickerPanel value="#ff0000" onPick={onPick} />);
    expect(screen.queryByRole('button', { name: 'Restore default color' })).not.toBeInTheDocument();
  });
});
