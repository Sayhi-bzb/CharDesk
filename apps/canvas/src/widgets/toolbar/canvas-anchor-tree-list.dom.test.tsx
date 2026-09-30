import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasAnchorTreeList } from './canvas-anchor-tree-list';
import type { CanvasAnchor } from '@/domains/canvas/public';

afterEach(cleanup);
const anchors: CanvasAnchor[] = [
  { id: 'parent', label: 'Parent', point: { x: 0, y: 0 }, parentId: null, order: 0, detached: false },
  { id: 'child', label: 'Child', point: { x: 0, y: 1 }, parentId: 'parent', order: 0, detached: false },
];

it('navigation-only TOC preserves nesting without drag or reorder shortcuts', () => {
  const move = vi.fn();
  const navigate = vi.fn();
  const { container } = render(
    <CanvasAnchorTreeList
      anchors={anchors} editable={false} onMove={move}
      ariaLabel="Contents" getItemLabel={(anchor) => anchor.label}
      getMoveAnnouncement={(anchor) => anchor.label}
      renderItem={(anchor) => <button onClick={() => navigate(anchor.id)}>{anchor.label}</button>}
    />
  );
  const child = container.querySelector<HTMLElement>('[data-anchor-row="child"]')!;
  const parent = container.querySelector<HTMLElement>('[data-anchor-row="parent"]')!;
  expect(parseFloat(child.style.paddingLeft)).toBeGreaterThan(parseFloat(parent.style.paddingLeft));
  expect(container.querySelector('[draggable="true"]')).toBeNull();
  expect(container.querySelector('[data-drag-line]')).toBeNull();
  fireEvent.keyDown(child, { key: 'ArrowUp', altKey: true });
  expect(move).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Child' }));
  expect(navigate).toHaveBeenCalledWith('child');
});
