import {
  createClipboard,
  createHostClipboard,
  createRendererClipboardAdapter,
  decodePasteBytes,
  type ClipboardService,
  type RendererClipboardBoundary,
} from '@opentui/core';
import type { ClipboardPort } from '@chardesk/editor-core/clipboard/commands';

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
  }
): TerminalClipboardPort {
  let disposed = false;
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
      if (remote()) return { error: 'unsupported-data' };
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
    async write(payload) {
      try {
        const result = await service.writeText(payload.plain, { destination: 'best-available' });
        if (result.host.status === 'written') return { status: 'written' };
        if (result.terminal.status === 'attempted') return { status: 'dispatched' };
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
    }
  );
}
