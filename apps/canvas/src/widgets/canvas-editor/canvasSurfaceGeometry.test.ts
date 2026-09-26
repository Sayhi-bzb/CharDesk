import { describe, expect, it } from 'vitest';
import { resolveCanvasSurfaceGeometry } from './canvasSurfaceGeometry';

describe('canvas surface geometry', () => {
  it('matches the visible viewport exactly', () => {
    expect(resolveCanvasSurfaceGeometry({ width: 1024, height: 768 })).toEqual({
      width: 1024,
      height: 768,
      left: 0,
      top: 0,
    });
  });
});
