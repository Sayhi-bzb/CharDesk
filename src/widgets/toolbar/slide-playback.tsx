'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert } from 'lucide-react';
import type { SlideDeck } from '@/domains/slides/public';
import { useEditor } from '@/domains/editor/public';
import { HOST_ICONOLOGY } from '@/shared/icons/iconology';
import { BACKGROUND_COLOR } from '@/shared/lib/constants';
import { useUiI18n } from '@/shared/i18n';
import { SHORTCUT_PRIORITY, useShortcutLayer } from '@/shared/shortcuts/dispatcher';
import { Button, StatusText } from '@chardesk/ui';

import { drawSlideCanvas } from './slide-canvas-renderer';
import {
  resolveSlidePlaybackIndex,
  SLIDE_PLAYBACK_MAX_ZOOM,
} from './slide-playback-model';

const PreviousIcon = HOST_ICONOLOGY.slideAction.previous;
const NextIcon = HOST_ICONOLOGY.slideAction.next;
const CloseIcon = HOST_ICONOLOGY.slideAction.close;

export function SlidePlaybackOverlay({
  deck,
  activeSlideId,
  warning,
  onActiveSlideChange,
  onExit,
}: {
  deck: SlideDeck;
  activeSlideId: string;
  warning?: string | null;
  onActiveSlideChange: (slideId: string) => void;
  onExit: () => void;
}) {
  const { t } = useUiI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const slideIndex = Math.max(
    0,
    deck.slides.findIndex((slide) => slide.id === activeSlideId)
  );
  const slide = deck.slides[slideIndex] ?? deck.slides[0];
  const isFirst = slideIndex === 0;
  const isLast = slideIndex === deck.slides.length - 1;

  const navigate = useCallback(
    (command: 'previous' | 'next' | 'first' | 'last') => {
      const nextIndex = resolveSlidePlaybackIndex(slideIndex, command, deck.slides.length);
      const nextSlide = deck.slides[nextIndex];
      if (nextSlide && nextSlide.id !== activeSlideId) {
        onActiveSlideChange(nextSlide.id);
      }
    },
    [activeSlideId, deck.slides, onActiveSlideChange, slideIndex]
  );
  const editor = useEditor();

  useEffect(() => {
    const definitions = [
      {
        id: 'next',
        label: 'Next Slide',
        shortcuts: ['arrowright', 'arrowdown', 'pagedown', 'space', 'enter'],
      },
      { id: 'previous', label: 'Previous Slide', shortcuts: ['arrowleft', 'arrowup', 'pageup'] },
      { id: 'first', label: 'First Slide', shortcuts: ['home'] },
      { id: 'last', label: 'Last Slide', shortcuts: ['end'] },
    ] as const;
    const disposers = definitions.flatMap((definition) => {
      const commandId = `presentation.${definition.id}`;
      const disposeCommand = editor.commands.register('slide.playback', {
        id: commandId,
        execute: () => {
          navigate(definition.id);
          return { handled: true, status: 'succeeded' };
        },
      });
      const disposeBinding = editor.keymap.register('slide.playback', {
        id: `presentation:${definition.id}`,
        label: definition.label,
        category: 'Presentation',
        scope: 'presentation',
        shortcuts: definition.shortcuts,
        target: { type: 'command', id: commandId },
        repeat: 'allow',
        weight: SHORTCUT_PRIORITY.presentation,
        when: () => true,
      });
      return [disposeBinding, disposeCommand];
    });
    return () => disposers.forEach((dispose) => dispose());
  }, [editor, navigate]);

  useShortcutLayer({
    id: 'slide-playback-exit',
    priority: SHORTCUT_PRIORITY.presentation,
    onKeyDown: (input) => {
      if (input.key !== 'Escape') return;
      onExit();
      return { claimed: true, preventDefault: true };
    },
  });

  useEffect(() => {
    hostRef.current?.focus();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas || !slide) return;
    const render = () =>
      drawSlideCanvas({
        canvas,
        slide,
        size: slide.size,
        viewportWidth: host.clientWidth,
        viewportHeight: host.clientHeight,
        maxZoom: SLIDE_PLAYBACK_MAX_ZOOM,
      });
    render();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(render);
    observer?.observe(host);
    window.addEventListener('resize', render);
    document.fonts?.addEventListener('loadingdone', render);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', render);
      document.fonts?.removeEventListener('loadingdone', render);
    };
  }, [deck, slide]);

  const pageLabel = useMemo(
    () =>
      t('slide.playback.page', {
        current: slideIndex + 1,
        total: deck.slides.length,
      }),
    [deck.slides.length, slideIndex, t]
  );

  if (!slide || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={hostRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('slide.playback.title')}
      tabIndex={-1}
      data-testid="slide-playback"
      data-visual-contract="presentation"
      style={{ backgroundColor: BACKGROUND_COLOR }}
      className="fixed inset-0 z-(--layer-presentation) overflow-hidden outline-none"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={slide.name}
        className="absolute inset-0 block size-full cursor-pointer"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          navigate(event.clientX < rect.left + rect.width / 2 ? 'previous' : 'next');
        }}
      />
      {warning ? (
        <StatusText tone="warning" asChild>
          <div
            data-canvas-ui="true"
            data-testid="slide-playback-warning"
            role="status"
            className="pointer-events-none absolute left-1/2 top-5 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-presentation-border bg-presentation-surface px-3 py-2 text-xs shadow-presentation backdrop-blur"
          >
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            <span>{warning}</span>
          </div>
        </StatusText>
      ) : null}
      <div
        data-canvas-ui="true"
        className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-presentation-border bg-presentation-surface p-1.5 text-presentation-foreground shadow-presentation backdrop-blur"
      >
        <Button
          data-visual-contract="presentation"
          tone="subtle"
          shape="square"
          size="md"
          className="text-presentation-foreground hover:bg-presentation-accent hover:text-presentation-foreground"
          aria-label={t('slide.playback.previous')}
          disabled={isFirst}
          onClick={() => navigate('previous')}
        >
          <PreviousIcon />
        </Button>
        <span className="min-w-20 px-2 text-center text-xs tabular-nums" aria-live="polite">
          {pageLabel}
        </span>
        <Button
          data-visual-contract="presentation"
          tone="subtle"
          shape="square"
          size="md"
          className="text-presentation-foreground hover:bg-presentation-accent hover:text-presentation-foreground"
          aria-label={t('slide.playback.next')}
          disabled={isLast}
          onClick={() => navigate('next')}
        >
          <NextIcon />
        </Button>
        <span
          data-slot="slide-playback-separator"
          className="mx-1 h-5 w-0.5 rounded-full bg-presentation-separator"
          aria-hidden="true"
        />
        <Button
          data-visual-contract="presentation"
          tone="subtle"
          shape="square"
          size="md"
          className="text-presentation-foreground hover:bg-presentation-accent hover:text-presentation-foreground"
          aria-label={t('slide.playback.exit')}
          onClick={onExit}
        >
          <CloseIcon />
        </Button>
      </div>
    </div>,
    document.body
  );
}
