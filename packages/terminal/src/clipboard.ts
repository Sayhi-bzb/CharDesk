import {
  buildRichClipboardHtml,
  parseRichClipboardHtml,
} from '@chardesk/editor-core/clipboard/rich';
import {
  createClipboard,
  createHostClipboard,
  createRendererClipboardAdapter,
  decodePasteBytes,
  type ClipboardService,
  type RendererClipboardBoundary,
} from '@opentui/core';
import type { ClipboardPort } from '@chardesk/editor-core/clipboard/commands';

export type RichClipboardBackend = {
  getHtml(): string;
  setContents(contents: { text: string; html: string }): void;
};
type ImageClipboardBackend = { setImage(width: number, height: number, rgba: Buffer): void };
export type TerminalClipboardImage = { width: number; height: number; rgba: Buffer };
export type TerminalClipboardAccess = ClipboardPort & {
  canRead?: () => boolean;
  canWriteImage?: () => boolean;
  writeImage?: (
    image: TerminalClipboardImage,
    isCurrent?: () => boolean
  ) => Promise<{ status: 'written' | 'unavailable' | 'failed' }>;
};
export type TerminalClipboardPort = TerminalClipboardAccess & { dispose(): Promise<void> };

/** Remote reads use terminal paste events, never the server's native clipboard. */
export function adaptTerminalClipboard(
  service: ClipboardService,
  remote: () => boolean,
  image?: {
    supported: () => boolean;
    load: () => Promise<ImageClipboardBackend>;
  },
  rich?: { supported: () => boolean; load: () => Promise<RichClipboardBackend> }
): TerminalClipboardPort {
  let disposed = false;
  let richBackend: RichClipboardBackend | undefined;
  const canUseRich = () => !disposed && !remote() && Boolean(rich?.supported());
  let imageBackend: ImageClipboardBackend | undefined;
  const canWriteImage = () => !disposed && !remote() && Boolean(image?.supported());
  return {
    canWriteImage,
    async writeImage(pixels, isCurrent = () => true) {
      if (!canWriteImage() || !isCurrent()) return { status: 'unavailable' };
      try {
        imageBackend ??= await image!.load();
        if (!canWriteImage() || !isCurrent()) return { status: 'unavailable' };
        imageBackend.setImage(pixels.width, pixels.height, pixels.rgba);
        return { status: 'written' };
      } catch {
        return { status: 'failed' };
      }
    },
    canRead: () => !disposed && !remote(),
    async read() {
      if (disposed || remote()) return { error: 'unsupported-data' };
      if (canUseRich()) {
        try {
          richBackend ??= await rich!.load();
          if (!canUseRich()) return { error: 'unsupported-data' };
          const parsed = parseRichClipboardHtml(richBackend.getHtml());
          if (parsed) return parsed;
        } catch {
          /* Unsupported formats/backend retain the host text path. */
        }
      }
      if (disposed || remote()) return { error: 'unsupported-data' };
      try {
        const result = await service.read({ preferredTypes: ['text/plain'] });
        if (result.status === 'read')
          return { plainText: decodePasteBytes(result.representation.bytes) };
        if (result.status === 'empty') return { plainText: '' };
        return { error: 'clipboard-failed' };
      } catch {
        return { error: 'clipboard-failed' };
      }
    },
    async write(payload, options) {
      if (disposed) return { status: 'unavailable' };
      const html = options.rich && payload.rich ? buildRichClipboardHtml(payload) : null;
      if (html && canUseRich()) {
        try {
          richBackend ??= await rich!.load();
          if (canUseRich()) {
            richBackend.setContents({ text: payload.plain, html });
            return { status: 'written' };
          }
        } catch {
          /* Explicit plain fallback below, never sequential format writes. */
        }
      }
      if (disposed) return { status: 'unavailable' };
      const fallback = options.rich && payload.rich ? { warning: 'plain-fallback' as const } : {};
      try {
        const result = await service.writeText(payload.plain, { destination: 'best-available' });
        if (result.host.status === 'written') return { status: 'written', ...fallback };
        if (result.terminal.status === 'attempted') return { status: 'dispatched', ...fallback };
        return {
          status:
            result.host.status === 'failed' || result.terminal.status === 'local-failure'
              ? 'failed'
              : 'unavailable',
        };
      } catch {
        return { status: 'failed' };
      }
    },
    async dispose() {
      disposed = true;
      imageBackend = undefined;
      richBackend = undefined;
      await service.dispose();
    },
  };
}

export function createTerminalClipboardPort(
  renderer: RendererClipboardBoundary
): TerminalClipboardPort {
  const terminal = createRendererClipboardAdapter(renderer);
  return adaptTerminalClipboard(
    createClipboard({ host: createHostClipboard(), terminal }),
    () => terminal.remote,
    {
      // OSC 52 transports text; remote and WSL must not write a server/X11 clipboard.
      supported: () => !process.env.WSL_DISTRO_NAME && !process.env.WSL_INTEROP,
      load: async () => {
        const { Clipboard } = await import('@napi-rs/clipboard');
        return new Clipboard();
      },
    },
    {
      supported: () => !process.env.WSL_DISTRO_NAME && !process.env.WSL_INTEROP,
      load: async () => {
        const { ClipboardManager } = await import('@teddyzhu/clipboard');
        return new ClipboardManager();
      },
    }
  );
}
