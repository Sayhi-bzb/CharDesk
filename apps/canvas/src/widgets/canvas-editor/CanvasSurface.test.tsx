import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CanvasSurface } from './CanvasSurface';
import { resolveCanvasSurfaceGeometry } from './canvasSurfaceGeometry';

describe('CanvasSurface', () => {
  it('composes exact canvas layers without scaling host overlays or input', () => {
    const containerRef = createRef<HTMLDivElement>();
    const contentCanvasRef = createRef<HTMLCanvasElement>();
    const interactionCanvasRef = createRef<HTMLCanvasElement>();
    const textareaRef = createRef<HTMLTextAreaElement>();
    const surfaceGeometry = resolveCanvasSurfaceGeometry({ width: 1000, height: 700 });

    render(
      <CanvasSurface
        containerRef={containerRef}
        contentCanvasRef={contentCanvasRef}
        interactionCanvasRef={interactionCanvasRef}
        surfaceGeometry={surfaceGeometry}
        textareaRef={textareaRef}
        textareaStyle={{}}
        textareaProps={{ 'aria-label': 'Canvas input' }}
      >
        <div data-testid="content-overlay" />
      </CanvasSurface>
    );

    const surface = screen.getByTestId('canvas-editor-surface');
    const layer = screen.getByTestId('canvas-viewport-layer');
    expect(surface).toHaveAttribute('data-slot', 'canvas-surface');
    expect(surface).toHaveAttribute('data-onboarding-target', 'canvas');
    expect(layer).toHaveClass('absolute', 'inset-0', 'pointer-events-none');
    expect(layer).not.toHaveClass('origin-top-left', 'will-change-transform');
    expect(layer.querySelectorAll(':scope > canvas')).toHaveLength(2);
    expect(layer).toContainElement(contentCanvasRef.current);
    expect(layer).toContainElement(interactionCanvasRef.current);
    expect(contentCanvasRef.current).toHaveAttribute('data-canvas-layer', 'content');
    expect(interactionCanvasRef.current).toHaveAttribute('data-canvas-layer', 'interaction');
    layer.querySelectorAll(':scope > canvas').forEach((canvas) => {
      expect(canvas).toHaveStyle({
        left: '0px',
        top: '0px',
        width: '1000px',
        height: '700px',
      });
    });
    expect(layer).not.toContainElement(screen.getByTestId('content-overlay'));
    expect(layer).not.toContainElement(screen.getByRole('textbox'));
  });

  it('keeps the canvas input mounted', () => {
    render(
      <CanvasSurface
        containerRef={createRef<HTMLDivElement>()}
        contentCanvasRef={createRef<HTMLCanvasElement>()}
        interactionCanvasRef={createRef<HTMLCanvasElement>()}
        surfaceGeometry={undefined}
        textareaRef={createRef<HTMLTextAreaElement>()}
        textareaStyle={{}}
        textareaProps={{ 'aria-label': 'Canvas input' }}
      />
    );

    expect(screen.getByRole('textbox', { name: 'Canvas input' })).toBeInTheDocument();
  });
});
