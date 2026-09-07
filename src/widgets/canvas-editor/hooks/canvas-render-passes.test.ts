import { describe, expect, it } from 'vitest';
import { CANVAS_FRAME_INVALIDATION } from '../engine/FrameScheduler';
import {
  resolveCanvasRenderPasses,
  shouldSuppressCanvasContentRendering,
} from './useCanvasRenderer';

describe('canvas render passes', () => {
  it('keeps dynamic interaction updates off the content surface', () => {
    expect(resolveCanvasRenderPasses(CANVAS_FRAME_INVALIDATION.overlay)).toEqual({
      content: false,
      interaction: true,
    });
    expect(resolveCanvasRenderPasses(CANVAS_FRAME_INVALIDATION.scratch)).toEqual({
      content: false,
      interaction: true,
    });
  });

  it('redraws both surfaces for viewport changes', () => {
    expect(
      resolveCanvasRenderPasses(
        CANVAS_FRAME_INVALIDATION.background |
          CANVAS_FRAME_INVALIDATION.scratch |
          CANVAS_FRAME_INVALIDATION.overlay
      )
    ).toEqual({ content: true, interaction: true });
  });
});

describe('canvas stress render ablation', () => {
  it('requires the stress route and the explicit off mode', () => {
    expect(
      shouldSuppressCanvasContentRendering(
        '?canvas-stress=1&canvas-stress-render=off'
      )
    ).toBe(true);
    expect(shouldSuppressCanvasContentRendering('?canvas-stress-render=off')).toBe(false);
    expect(shouldSuppressCanvasContentRendering('?canvas-stress=1')).toBe(false);
  });
});
