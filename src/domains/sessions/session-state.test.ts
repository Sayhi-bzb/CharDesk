import { describe, it, expect } from 'vitest';
import {
  resolveNextSessionName,
  createSessionId,
  normalizeSessionMode,
  withActiveCanvasSnapshot
} from './public';
import type {
  CanvasSessionDescriptor,
  CanvasSessionSnapshot,
} from './public';

describe('sessionHelpers', () => {
  describe('resolveNextSessionName', () => {
    it('should return "Canvas 1" for empty sessions', () => {
      expect(resolveNextSessionName([])).toBe('Canvas 1');
    });

    it('should return next number for sequential names', () => {
      const sessions: CanvasSessionDescriptor[] = [
        { id: '1', name: 'Canvas 1', mode: 'freeform' },
        { id: '2', name: 'Canvas 2', mode: 'freeform' }
      ];
      expect(resolveNextSessionName(sessions)).toBe('Canvas 3');
    });

    it('should find max number for non-sequential names', () => {
      const sessions: CanvasSessionDescriptor[] = [
        { id: '1', name: 'Canvas 5', mode: 'freeform' },
        { id: '2', name: 'Canvas 2', mode: 'freeform' }
      ];
      expect(resolveNextSessionName(sessions)).toBe('Canvas 6');
    });

    it('should ignore non-matching names', () => {
      const sessions: CanvasSessionDescriptor[] = [
        { id: '1', name: 'My Canvas', mode: 'freeform' },
        { id: '2', name: 'Canvas 3', mode: 'freeform' }
      ];
      expect(resolveNextSessionName(sessions)).toBe('Canvas 4');
    });

    it('should handle case-insensitive matching', () => {
      const sessions: CanvasSessionDescriptor[] = [
        { id: '1', name: 'CANVAS 5', mode: 'freeform' }
      ];
      expect(resolveNextSessionName(sessions)).toBe('Canvas 6');
    });
  });

  describe('createSessionId', () => {
    it('should create unique IDs', () => {
      const sessions: CanvasSessionDescriptor[] = [];
      const id1 = createSessionId(sessions);
      const id2 = createSessionId(sessions);
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^canvas-/);
      expect(id2).toMatch(/^canvas-/);
    });

    it('should not use existing IDs', () => {
      const existingId = 'canvas-test123';
      const sessions: CanvasSessionDescriptor[] = [
        { id: existingId, name: 'Test', mode: 'freeform' }
      ];
      // Generate multiple IDs to increase collision chance
      for (let i = 0; i < 10; i++) {
        const id = createSessionId(sessions);
        expect(id).not.toBe(existingId);
      }
    });

    it('should generate different IDs on collision', () => {
      // Create a session with ID that looks like a timestamp-based ID
      const sessions: CanvasSessionDescriptor[] = [
        { id: 'canvas-abc123-def45', name: 'Test', mode: 'freeform' }
      ];
      const id = createSessionId(sessions);
      expect(id).not.toBe('canvas-abc123-def45');
    });
  });

  describe('normalizeSessionMode', () => {
    it('should return structured for structured input', () => {
      expect(normalizeSessionMode('structured')).toBe('structured');
    });

    it('should return freeform for freeform input', () => {
      expect(normalizeSessionMode('freeform')).toBe('freeform');
    });


    it('should return freeform for any other input', () => {
      expect(normalizeSessionMode(null)).toBe('freeform');
      expect(normalizeSessionMode(undefined)).toBe('freeform');
      expect(normalizeSessionMode('invalid')).toBe('freeform');
      expect(normalizeSessionMode(123)).toBe('freeform');
      expect(normalizeSessionMode({})).toBe('freeform');
    });
  });

  describe('withActiveCanvasSnapshot', () => {
    it('should update active session with snapshot', () => {
      const sessions: CanvasSessionSnapshot[] = [
        { id: '1', name: 'Canvas 1', mode: 'freeform', scene: [], grid: [] },
        { id: '2', name: 'Canvas 2', mode: 'freeform', scene: [], grid: [] }
      ];

      const result = withActiveCanvasSnapshot(sessions, '1', {
        mode: 'structured',
        scene: [{ id: 'node1', type: 'box', order: 1, start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, style: { color: '#000' } }],
        grid: [['key1', { char: 'A', color: '#000' }]]
      });

      expect(result[0].mode).toBe('structured');
      expect(result[0].scene).toHaveLength(1);
      expect(result[0].grid).toHaveLength(1);
      expect(result[1]).toEqual(sessions[1]); // Unchanged
    });

    it('should not modify non-active sessions', () => {
      const sessions: CanvasSessionSnapshot[] = [
        { id: '1', name: 'Canvas 1', mode: 'freeform', scene: [], grid: [] },
        { id: '2', name: 'Canvas 2', mode: 'freeform', scene: [], grid: [] }
      ];

      const result = withActiveCanvasSnapshot(sessions, '999', {
        mode: 'structured',
        scene: [],
        grid: []
      });

      expect(result).toEqual(sessions);
    });

  });
});
