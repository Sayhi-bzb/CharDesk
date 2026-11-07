/* eslint-disable react-refresh/only-export-components */
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { KeyInput } from '@chardesk/keyboard';
import {
  browserKeyInput,
  createBrowserInput,
  registerBrowserHandler,
  type BrowserKeymap,
} from '@chardesk/editor-input/browser';
import { classifyShortcutTarget, type ShortcutTargetKind } from '@/shared/utils/dom-focus';

type ShortcutDispatchContext = {
  targetKind: ShortcutTargetKind;
};

type ShortcutDispatchResult = {
  claimed: boolean;
  preventDefault?: boolean;
  stopImmediatePropagation?: boolean;
};

export type ShortcutLayer = {
  id: string;
  priority: number;
  enabled?: boolean;
  onKeyDown?: (
    input: KeyInput,
    context: ShortcutDispatchContext
  ) => ShortcutDispatchResult | undefined;
  onKeyUp?: (
    input: KeyInput,
    context: ShortcutDispatchContext
  ) => ShortcutDispatchResult | undefined;
};

export const SHORTCUT_PRIORITY = {
  observer: 1_000,
  presentation: 800,
  managedCanvas: 400,
  canvasInteraction: 350,
  dynamicCanvasCommand: 300,
  globalAction: 200,
  canvasGesture: 100,
  chrome: 50,
} as const;

type KeymapAttachment = (keymap: BrowserKeymap) => () => void;
type ShortcutDispatcherContextValue = { connect: (attach: KeymapAttachment) => () => void };
const ShortcutDispatcherContext = createContext<ShortcutDispatcherContextValue | null>(null);

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const inputRef = useRef<ReturnType<typeof createBrowserInput> | null>(null);
  const attachments = useRef(new Set<{ attach: KeymapAttachment; detach?: () => void }>());
  const connect = useCallback((attach: KeymapAttachment) => {
    const entry: { attach: KeymapAttachment; detach?: () => void } = { attach };
    attachments.current.add(entry);
    if (inputRef.current) entry.detach = attach(inputRef.current.keymap);
    return () => {
      entry.detach?.();
      attachments.current.delete(entry);
    };
  }, []);
  useEffect(() => {
    const input = createBrowserInput();
    inputRef.current = input;
    const entries = attachments.current;
    for (const entry of entries) entry.detach = entry.attach(input.keymap);
    return () => {
      for (const entry of entries) {
        entry.detach?.();
        entry.detach = undefined;
      }
      input.dispose();
      inputRef.current = null;
    };
  }, []);
  const value = useMemo(() => ({ connect }), [connect]);
  return (
    <ShortcutDispatcherContext.Provider value={value}>
      {children}
    </ShortcutDispatcherContext.Provider>
  );
}

export function useShortcutBindings(attach: KeymapAttachment) {
  const dispatcher = useContext(ShortcutDispatcherContext);
  if (!dispatcher) throw new Error('useShortcutBindings must be used within a ShortcutProvider.');
  useEffect(() => dispatcher.connect(attach), [dispatcher, attach]);
}

export function useShortcutLayer(layer: ShortcutLayer) {
  const dispatcher = useContext(ShortcutDispatcherContext);
  if (!dispatcher) throw new Error('useShortcutLayer must be used within a ShortcutProvider.');
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const priority = layer.priority;
  useEffect(
    () =>
      dispatcher.connect((keymap) =>
        registerBrowserHandler(keymap, {
          priority,
          enabled: () => layerRef.current.enabled !== false,
          handle: (event, phase) => {
            const native = event.originalEvent;
            if (!native) return false;
            const handler =
              phase === 'keydown' ? layerRef.current.onKeyDown : layerRef.current.onKeyUp;
            const result = handler?.(browserKeyInput(native), {
              targetKind: classifyShortcutTarget(native.target),
            });
            if (!result?.claimed) return false;
            if (result.preventDefault) native.preventDefault();
            if (result.stopImmediatePropagation) native.stopImmediatePropagation();
            return true;
          },
        })
      ),
    [dispatcher, priority]
  );
}
