import { expect, it, vi } from 'vitest';
import { createCanvasInteractionPort, InteractionStateCapture } from '../canvasInteractionPort';
import { createSelectionPreviewController } from '../preview/selectionPreviewController';
import { createPrimaryDragEndExecutor, createPrimaryDragEndHandler } from './dragEndExecution';

const fixture = () => {
  const setPreview = vi.fn();
  const selectionPreview = createSelectionPreviewController({
    setPreview,
    scheduler: { requestAnimationFrame: vi.fn(() => 1), cancelAnimationFrame: vi.fn() },
  });
  const effects = {
    fillArea: vi.fn(),
    setStaticGridActiveCell: vi.fn(),
    setStaticGridSelectionRange: vi.fn(),
    appendStaticGridSelectionRange: vi.fn(),
    clearSelections: vi.fn(),
    commitScratch: vi.fn(),
    forceHistorySave: vi.fn(),
    resetDragState: vi.fn(),
  };
  const executor = createPrimaryDragEndExecutor({ selectionPreview, ...effects });
  const port = createCanvasInteractionPort({
    capture: new InteractionStateCapture(),
    tool: 'select',
    canvasMode: 'freeform',
    brushChar: '#',
    pointerContext: { hasCanvasRect: () => true },
    dragStart: vi.fn(() => false),
    dragUpdate: vi.fn(),
    dragEnd: createPrimaryDragEndHandler({ executor }),
    commitSelection: executor.commitSelection,
    getSelectionAnchor: () => ({ x: 0, y: 0 }),
    beginInteraction: vi.fn(),
    completeInteraction: vi.fn(),
    cancelInteraction: vi.fn(),
    queuePan: vi.fn(),
    flushPan: vi.fn(),
    clearLinkHover: vi.fn(),
    setCursor: vi.fn(),
    addScratchPoints: vi.fn(),
    erasePoints: vi.fn(),
    setHoveredGrid: vi.fn(),
  });
  return { port, effects, selectionPreview, setPreview };
};

it('Web commits the release endpoint even when the last visual preview has not been published', () => {
  const f = fixture();
  f.selectionPreview.set({ start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
  f.port.complete(
    { type: 'selecting', anchor: { x: 0, y: 0 }, current: { x: 1, y: 0 } },
    { x: 4, y: 2 }
  );
  expect(f.effects.setStaticGridSelectionRange).toHaveBeenCalledExactlyOnceWith({
    start: { x: 0, y: 0 },
    end: { x: 4, y: 2 },
  });
  expect(f.selectionPreview.get()).toBeNull();
  expect(f.setPreview).toHaveBeenCalledExactlyOnceWith(null);
  expect(f.effects.forceHistorySave).not.toHaveBeenCalled();
});

it('Web collapses an old range on click without requiring a visual selection preview', () => {
  const f = fixture();
  f.port.complete(
    {
      type: 'rangeMovePending',
      anchor: { x: 2, y: 1 },
      current: { x: 2, y: 1 },
      accumulated: { x: 0, y: 0 },
    },
    { x: 2, y: 1 }
  );
  expect(f.effects.setStaticGridActiveCell).toHaveBeenCalledExactlyOnceWith({ x: 2, y: 1 });
  expect(f.effects.commitScratch).not.toHaveBeenCalled();
  expect(f.effects.resetDragState).toHaveBeenCalledOnce();
});

it('Web append commits the actual release range and clears the pending preview', () => {
  const f = fixture();
  f.port.complete(
    { type: 'selecting', anchor: { x: 1, y: 1 }, current: { x: 1, y: 1 }, append: true },
    { x: -1, y: 2 }
  );
  expect(f.effects.appendStaticGridSelectionRange).toHaveBeenCalledExactlyOnceWith({
    start: { x: 1, y: 1 },
    end: { x: -1, y: 2 },
  });
  expect(f.effects.setStaticGridSelectionRange).not.toHaveBeenCalled();
  expect(f.selectionPreview.get()).toBeNull();
});
