/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button, FloatingSurface } from '@chardesk/ui';
import { useCanvasState } from '@/domains/canvas/public';
import type { CanvasTemplateId } from '@/domains/canvas-templates/public';
import type { Point } from '@/shared/types';
import { useUiI18n } from '@/shared/i18n';

type Target = {
  element: () => HTMLElement | null;
  enabled: () => boolean;
  preview: (id: CanvasTemplateId, client: Point) => void;
  clear: () => void;
  place: (id: CanvasTemplateId, client: Point) => void;
};
type Placement = { templateId: CanvasTemplateId; mode: 'tap' | 'drag'; pointerId?: number };
type Press = { pointerId: number; origin: Point; timer: ReturnType<typeof setTimeout> };
type PlacementContext = {
  pending: boolean;
  beginTap: (id: CanvasTemplateId, close: () => void) => void;
  beginPress: (id: CanvasTemplateId, event: ReactPointerEvent, close: () => void) => void;
  registerTarget: (target: Target) => () => void;
};
const Context = createContext<PlacementContext | null>(null);
export const useCanvasTemplatePlacement = () => useContext(Context);

export function CanvasTemplatePlacementProvider({ children }: { children: ReactNode }) {
  const { t } = useUiI18n();
  const sessionId = useCanvasState((state) => state.activeCanvasId);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const current = useRef<Placement | null>(null);
  const press = useRef<Press | null>(null);
  const tapOrigin = useRef<Point | null>(null);
  const suppressClickUntil = useRef(0);
  const targets = useRef(new Set<Target>());
  const touchSourceCleanup = useRef<(() => void) | null>(null);
  const clearPress = useCallback(() => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }, []);
  const cancel = useCallback(() => {
    clearPress();
    touchSourceCleanup.current?.();
    touchSourceCleanup.current = null;
    const pointerId = current.current?.pointerId;
    if (pointerId !== undefined && document.body.hasPointerCapture(pointerId)) {
      document.body.releasePointerCapture(pointerId);
    }
    current.current = null;
    tapOrigin.current = null;
    setPlacement(null);
    for (const target of targets.current) target.clear();
  }, [clearPress]);
  const begin = useCallback((next: Placement, close: () => void) => {
    cancel();
    current.current = next;
    setPlacement(next);
    close();
  }, [cancel]);
  const beginTap = useCallback((templateId: CanvasTemplateId, close: () => void) => {
    if (Date.now() < suppressClickUntil.current) return;
    begin({ templateId, mode: 'tap' }, close);
  }, [begin]);
  const beginPress = useCallback((templateId: CanvasTemplateId, event: ReactPointerEvent, close: () => void) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (event.isPrimary === false) return;
    clearPress();
    const { pointerId, clientX, clientY } = event;
    const source = event.currentTarget;
    press.current = {
      pointerId,
      origin: { x: clientX, y: clientY },
      timer: setTimeout(() => {
        suppressClickUntil.current = Date.now() + 700;
        // Capture on a persistent owner before the modal source unmounts.
        document.body.setPointerCapture(pointerId);
        begin({ templateId, mode: 'drag', pointerId }, close);
        // Touch events retain their original target even after the Sheet closes.
        // Keep a native listener there so browser scrolling cannot cancel the drag.
        const preventScroll = (move: Event) => move.preventDefault();
        source.addEventListener('touchmove', preventScroll, { passive: false });
        touchSourceCleanup.current = () => source.removeEventListener('touchmove', preventScroll);
      }, 400),
    };
  }, [begin, clearPress]);
  const registerTarget = useCallback((target: Target) => {
    targets.current.add(target);
    return () => {
      target.clear();
      targets.current.delete(target);
    };
  }, []);

  useEffect(() => { cancel(); }, [sessionId, cancel]);
  useEffect(() => {
    const point = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });
    const targetAt = (client: Point) => {
      const hit = document.elementsFromPoint(client.x, client.y).find((element) =>
        element.closest('[data-slot="sheet-content"], [data-slot="sheet-overlay"]')?.getAttribute('data-state') !== 'closed'
      );
      if (hit?.closest('[data-canvas-ui="true"], [role="dialog"], [data-slot="sheet-overlay"]')) return null;
      return [...targets.current].find((target) => {
        const element = target.element();
        return target.enabled() && element && hit && element.contains(hit);
      }) ?? null;
    };
    const showPreview = (session: Placement, client: Point) => {
      const target = targetAt(client);
      for (const candidate of targets.current) {
        if (candidate === target) candidate.preview(session.templateId, client);
        else candidate.clear();
      }
      return target;
    };
    const consume = (event: PointerEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const down = (event: PointerEvent) => {
      if (press.current && press.current.pointerId !== event.pointerId) {
        suppressClickUntil.current = Date.now() + 700;
        clearPress();
      }
      const session = current.current;
      if (!session) return;
      if (session.pointerId !== undefined) { cancel(); return; }
      if (!targetAt(point(event))) { cancel(); return; }
      session.pointerId = event.pointerId;
      tapOrigin.current = point(event);
      showPreview(session, point(event));
      consume(event);
    };
    const move = (event: PointerEvent) => {
      const pending = press.current;
      if (pending && pending.pointerId === event.pointerId &&
          Math.hypot(event.clientX - pending.origin.x, event.clientY - pending.origin.y) > 10) {
        suppressClickUntil.current = Date.now() + 700;
        clearPress();
      }
      const session = current.current;
      if (!session || (session.pointerId !== undefined && session.pointerId !== event.pointerId)) return;
      showPreview(session, point(event));
      consume(event);
    };
    const up = (event: PointerEvent) => {
      clearPress();
      const session = current.current;
      if (!session || session.pointerId !== event.pointerId) return;
      const client = point(event);
      const target = targetAt(client);
      const origin = tapOrigin.current;
      const moved = origin && Math.hypot(client.x - origin.x, client.y - origin.y) > 10;
      consume(event);
      if (session.mode === 'tap' && moved) {
        session.pointerId = undefined;
        tapOrigin.current = null;
        return;
      }
      suppressClickUntil.current = Date.now() + 700;
      cancel();
      if (target) target.place(session.templateId, client);
    };
    const canceled = () => cancel();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && current.current) { event.preventDefault(); cancel(); }
    };
    const hide = () => { if (document.hidden) cancel(); };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', canceled, true);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', canceled);
    return () => {
      clearPress();
      touchSourceCleanup.current?.();
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', canceled, true);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('blur', canceled);
    };
  }, [cancel, clearPress]);

  const value = useMemo(() => ({ pending: !!placement, beginTap, beginPress, registerTarget }),
    [placement, beginTap, beginPress, registerTarget]);
  return (
    <Context.Provider value={value}>
      {children}
      {placement && createPortal(
        <div data-canvas-ui="true" className="fixed inset-x-4 top-16 z-(--layer-popover) flex justify-center pointer-events-none">
          <FloatingSurface variant="control-bar" className="pointer-events-auto" data-testid="template-placement-control">
            <span className="px-2 text-xs">{t('templates.placeHint')}</span>
            <Button onClick={cancel}>{t('dialog.cancel')}</Button>
          </FloatingSurface>
        </div>, document.body
      )}
    </Context.Provider>
  );
}
