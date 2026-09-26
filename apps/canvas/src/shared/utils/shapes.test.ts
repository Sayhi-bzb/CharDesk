import { describe, it, expect } from 'vitest';
import {
  getArrowLinePoints,
  getBoxPoints,
  getLShapeLinePoints,
  getStepLinePoints,
  getCirclePoints
} from '@/shared/utils/shapes';
import { BOX_CHARS } from '@/shared/lib/constants';

describe('shapes', () => {
  describe('getBoxPoints', () => {
    it('should create 3x3 box with corners', () => {
      const points = getBoxPoints({ x: 0, y: 0 }, { x: 2, y: 2 });

      // Should have 8 points (perimeter of 3x3)
      expect(points).toHaveLength(8);

      // Check corners
      expect(points.find(p => p.x === 0 && p.y === 0)?.char).toBe(BOX_CHARS.TOP_LEFT);
      expect(points.find(p => p.x === 2 && p.y === 0)?.char).toBe(BOX_CHARS.TOP_RIGHT);
      expect(points.find(p => p.x === 0 && p.y === 2)?.char).toBe(BOX_CHARS.BOTTOM_LEFT);
      expect(points.find(p => p.x === 2 && p.y === 2)?.char).toBe(BOX_CHARS.BOTTOM_RIGHT);
    });

    it('should handle reversed coordinates', () => {
      const points = getBoxPoints({ x: 5, y: 5 }, { x: 0, y: 0 });

      expect(points.find(p => p.x === 0 && p.y === 0)?.char).toBe(BOX_CHARS.TOP_LEFT);
      expect(points.find(p => p.x === 5 && p.y === 5)?.char).toBe(BOX_CHARS.BOTTOM_RIGHT);
    });

    it('should use horizontal/vertical chars for edges', () => {
      const points = getBoxPoints({ x: 0, y: 0 }, { x: 3, y: 3 });

      // Top edge middle
      expect(points.find(p => p.x === 1 && p.y === 0)?.char).toBe(BOX_CHARS.HORIZONTAL);
      expect(points.find(p => p.x === 2 && p.y === 0)?.char).toBe(BOX_CHARS.HORIZONTAL);

      // Left edge middle
      expect(points.find(p => p.x === 0 && p.y === 1)?.char).toBe(BOX_CHARS.VERTICAL);
      expect(points.find(p => p.x === 0 && p.y === 2)?.char).toBe(BOX_CHARS.VERTICAL);
    });

    it('should create single point for 1x1 box', () => {
      const points = getBoxPoints({ x: 0, y: 0 }, { x: 0, y: 0 });

      expect(points).toHaveLength(1);
      expect(points[0].char).toBe(BOX_CHARS.TOP_LEFT);
    });
  });

  describe('getLShapeLinePoints', () => {
    it('should create L-shape with vertical first', () => {
      const points = getLShapeLinePoints({ x: 0, y: 0 }, { x: 3, y: 3 }, true);

      // Should include start, junction, and end
      expect(points.some(p => p.x === 0 && p.y === 0)).toBe(true);
      expect(points.some(p => p.x === 0 && p.y === 3)).toBe(true); // junction
      expect(points.some(p => p.x === 3 && p.y === 3)).toBe(true);
    });

    it('should create L-shape with horizontal first', () => {
      const points = getLShapeLinePoints({ x: 0, y: 0 }, { x: 3, y: 3 }, false);

      expect(points.some(p => p.x === 0 && p.y === 0)).toBe(true);
      expect(points.some(p => p.x === 3 && p.y === 0)).toBe(true); // junction
      expect(points.some(p => p.x === 3 && p.y === 3)).toBe(true);
    });

    it('should assign appropriate characters', () => {
      const points = getLShapeLinePoints({ x: 0, y: 0 }, { x: 2, y: 2 }, true);

      // Start should have appropriate char
      expect(points[0].char).toBeDefined();

      // All points should have chars
      points.forEach(p => {
        expect(p.char).toBeDefined();
        expect(p.char.length).toBeGreaterThan(0);
      });
    });

    it('should handle straight horizontal line', () => {
      const points = getLShapeLinePoints({ x: 0, y: 0 }, { x: 3, y: 0 }, false);

      expect(points).toHaveLength(4);
      expect(points.every(p => p.y === 0)).toBe(true);
    });

    it('should handle straight vertical line', () => {
      const points = getLShapeLinePoints({ x: 0, y: 0 }, { x: 0, y: 3 }, true);

      expect(points).toHaveLength(4);
      expect(points.every(p => p.x === 0)).toBe(true);
    });

    it('should handle zero-length line', () => {
      const points = getLShapeLinePoints({ x: 5, y: 5 }, { x: 5, y: 5 }, true);
      expect(points).toHaveLength(1);
      expect(points[0]).toEqual({ x: 5, y: 5, char: expect.any(String) });
    });
  });

  describe('getArrowLinePoints', () => {
    const endChar = (
      start: { x: number; y: number },
      end: { x: number; y: number },
      isVerticalFirst: boolean
    ) => {
      const points = getArrowLinePoints(start, end, isVerticalFirst);
      return points[points.length - 1]?.char;
    };

    it('uses ASCII arrowheads for all four terminal directions', () => {
      expect(endChar({ x: 0, y: 0 }, { x: 3, y: 0 }, false)).toBe('>');
      expect(endChar({ x: 3, y: 0 }, { x: 0, y: 0 }, false)).toBe('<');
      expect(endChar({ x: 0, y: 0 }, { x: 0, y: 3 }, true)).toBe('v');
      expect(endChar({ x: 0, y: 3 }, { x: 0, y: 0 }, true)).toBe('^');
    });

    it('derives the arrowhead from the terminal segment of either L route', () => {
      expect(endChar({ x: 0, y: 0 }, { x: 3, y: 3 }, true)).toBe('>');
      expect(endChar({ x: 0, y: 0 }, { x: 3, y: 3 }, false)).toBe('v');
    });

    it('uses a deterministic right arrow for a single-cell line', () => {
      expect(getArrowLinePoints({ x: 5, y: 5 }, { x: 5, y: 5 }, true)).toEqual([
        { x: 5, y: 5, char: '>' },
      ]);
    });
  });

  describe('getStepLinePoints', () => {
    it('should create diagonal line using Bresenham algorithm', () => {
      const points = getStepLinePoints({ x: 0, y: 0 }, { x: 3, y: 3 });

      expect(points.some(p => p.x === 0 && p.y === 0)).toBe(true);
      expect(points.some(p => p.x === 3 && p.y === 3)).toBe(true);
    });

    it('should include all points along the path', () => {
      const points = getStepLinePoints({ x: 0, y: 0 }, { x: 2, y: 0 });

      expect(points).toHaveLength(3);
      expect(points[0]).toEqual({ x: 0, y: 0, char: expect.any(String) });
      expect(points[1]).toEqual({ x: 1, y: 0, char: expect.any(String) });
      expect(points[2]).toEqual({ x: 2, y: 0, char: expect.any(String) });
    });

    it('should handle negative direction', () => {
      const points = getStepLinePoints({ x: 3, y: 3 }, { x: 0, y: 0 });

      expect(points[0]).toEqual({ x: 3, y: 3, char: expect.any(String) });
      expect(points[points.length - 1]).toEqual({ x: 0, y: 0, char: expect.any(String) });
    });

    it('should assign appropriate characters', () => {
      const points = getStepLinePoints({ x: 0, y: 0 }, { x: 2, y: 2 });

      points.forEach(p => {
        expect(p.char).toBeDefined();
      });
    });
  });

  describe('getCirclePoints', () => {
    it('should return single point for tiny radius', () => {
      const points = getCirclePoints({ x: 5, y: 5 }, { x: 5, y: 5 });

      expect(points).toHaveLength(1);
      expect(points[0].char).toBe('·');
    });

    it('should create braille pattern circle', () => {
      const points = getCirclePoints({ x: 10, y: 10 }, { x: 15, y: 10 });

      // Should have multiple points forming circle
      expect(points.length).toBeGreaterThan(1);

      // All chars should be braille characters
      points.forEach(p => {
        const code = p.char.charCodeAt(0);
        expect(code).toBeGreaterThanOrEqual(0x2800);
        expect(code).toBeLessThanOrEqual(0x28FF);
      });
    });

    it('should center around center point', () => {
      const center = { x: 10, y: 10 };
      const points = getCirclePoints(center, { x: 15, y: 10 });

      // Points should be distributed around center
      const avgX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

      expect(Math.abs(avgX - center.x)).toBeLessThan(3);
      expect(Math.abs(avgY - center.y)).toBeLessThan(3);
    });
  });
});
