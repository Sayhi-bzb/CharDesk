import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/domains/canvas/testing';
import {
  type CollaborationDescriptor,
  type CollaborationDescriptorV6,
  type CollaborationSnapshot,
} from '@/domains/collaboration/public';
import { setUiLanguage } from '@/shared/i18n';
import { CollaborationControl } from './CollaborationControl';

let snapshot: CollaborationSnapshot = {
  descriptor: null,
  documentStatus: 'idle',
  connectionStatus: 'idle',
  canEdit: true,
  peers: [],
  error: null,
  errorKind: null,
  hasLocalCopy: false,
  integrityIssues: [],
};

vi.mock('./useCollaborationSnapshot', () => ({
  useCollaborationSnapshot: () => snapshot,
}));

describe('CollaborationControl', () => {
  const initialState = useEditorStore.getState();
  const clipboardWrite = vi.fn();

  const seedSession = (
    mode: 'freeform' = 'freeform',
    collaboration?: CollaborationDescriptor
  ) => {
    act(() => {
      useEditorStore.setState({
        activeCanvasId: 'collaboration-canvas',
        canvasMode: mode,
        canvasSessions: [
          {
            id: 'collaboration-canvas',
            name: 'Collaboration Canvas',
            mode,
            collaboration,
          },
        ],
      });
    });
  };

  const openPanel = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Collaboration' }));
  };

  beforeEach(() => {
    setUiLanguage('en');
    snapshot = {
      descriptor: null,
      documentStatus: 'idle',
      connectionStatus: 'idle',
      canEdit: true,
      peers: [],
      error: null,
      errorKind: null,
      hasLocalCopy: false,
      integrityIssues: [],
    };
    clipboardWrite.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    window.history.replaceState(null, '', '/');
    seedSession();
  });

  afterEach(() => {
    cleanup();
    setUiLanguage('en');
    useEditorStore.setState(initialState, true);
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('opens a collaboration panel and keeps it open across sync room actions', async () => {
    render(<CollaborationControl />);

    const trigger = screen.getByRole('button', { name: 'Collaboration' });
    expect(trigger).not.toHaveAttribute('data-status');
    expect(trigger).not.toHaveAttribute('title');
    fireEvent.focus(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Collaboration');
    fireEvent.blur(trigger);

    openPanel();

    const panel = await screen.findByRole('dialog', { name: 'Collaboration' });
    expect(panel).toHaveClass('w-72', 'shadow-overlay');
    fireEvent.click(screen.getByRole('button', { name: 'Start collaboration' }));

    expect(screen.getByRole('dialog', { name: 'Collaboration' })).toBeInTheDocument();
    expect(screen.getByText('Sync server')).toBeInTheDocument();
    expect(useEditorStore.getState().canvasSessions[0].collaboration).toMatchObject({
      version: 7,
      provider: 'encrypted-relay',
    });
    expect(useEditorStore.getState().canvasSessions[0].collaboration).not.toHaveProperty('endpoint');

    fireEvent.click(screen.getByRole('button', { name: 'Copy edit link' }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledOnce());
    expect(clipboardWrite).toHaveBeenCalledWith(
      expect.stringMatching(/#r=[A-Za-z0-9_-]{66}$/)
    );
    expect(screen.getByRole('button', { name: 'Edit link copied' })).toHaveAttribute(
      'data-copy-feedback',
      'success'
    );
    expect(screen.getByRole('button', { name: 'Edit link copied' })).toHaveClass('text-success');
    expect(screen.getByRole('dialog', { name: 'Collaboration' })).toBeInTheDocument();

    window.dispatchEvent(new Event('blur'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Collaboration' })).not.toBeInTheDocument()
    );
  });

  it('does not offer collaboration for package-backed canvases', () => {
    act(() => {
      useEditorStore.setState({
        activeCanvasId: 'blackboard',
        canvasMode: 'freeform',
        canvasSessions: [{
          id: 'blackboard',
          name: 'Blackboard',
          mode: 'freeform',
          sourceBinding: {
            kind: 'blackboard',
            provider: 'browser-workspace',
            id: 'workspace',
          },
        }],
      });
    });

    render(<CollaborationControl />);
    expect(screen.queryByRole('button', { name: 'Collaboration' })).not.toBeInTheDocument();
  });

  it.each([
    ['invalid', '/#room=e30', 'This collaboration link is invalid.'],
    [
      'unsupported',
      `/#room=${btoa(JSON.stringify({ version: 4 })).replace(/=+$/g, '')}`,
      'This collaboration link uses an unsupported version.',
    ],
    [
      'retired',
      `/#room=${btoa(JSON.stringify({
        version: 6,
        documentVersion: 6,
        mode: 'freeform',
        provider: 'p2p',
        roomId: 'room-id-1234567890',
        key: 'room-key-1234567890123456789012345678901234567890',
      })).replace(/=+$/g, '')}`,
      'Direct P2P links are retired. Ask the host for a new sync-server link.',
    ],
  ])('keeps an %s incoming-link error on the collaboration control', async (_, url, message) => {
    window.history.replaceState(null, '', url);
    render(<CollaborationControl />);

    expect(screen.queryByRole('dialog', { name: 'Collaboration' })).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Collaboration' });
    await waitFor(() => expect(trigger).toHaveAttribute('data-error', 'true'));
    expect(trigger).toHaveAttribute('data-status', 'error');
    expect(trigger).toHaveClass('bg-error-muted', 'text-error');

    openPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('shows clipboard failures on the copy-link button', async () => {
    const descriptor: CollaborationDescriptorV6 = {
      version: 6,
      documentVersion: 6,
      mode: 'freeform',
      provider: 'websocket',
      roomId: 'room-id-1234567890',
      key: 'room-key-1234567890123456789012345678901234567890',
      endpoint: 'wss://sync.example.com',
    };
    seedSession('freeform', descriptor);
    clipboardWrite.mockRejectedValue(new Error('denied'));
    render(<CollaborationControl />);
    openPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Copy edit link' }));

    const failedButton = await screen.findByRole('button', {
      name: 'Could not copy edit link',
    });
    expect(failedButton).toHaveAttribute('data-copy-feedback', 'error');
    expect(failedButton).toHaveClass('text-error');
    expect(failedButton.querySelector('.lucide-x')).toBeInTheDocument();
  });

  it('shows room presence and keeps the menu open after leaving', async () => {
    const descriptor: CollaborationDescriptorV6 = {
      version: 6,
      documentVersion: 6,
      mode: "freeform",
      provider: 'websocket',
      roomId: 'room-id-1234567890',
      key: 'room-key-1234567890123456789012345678901234567890',
      endpoint: 'wss://sync.example.com',
    };
    seedSession('freeform', descriptor);
    snapshot = {
      descriptor,
      documentStatus: 'ready',
      connectionStatus: 'online',
      canEdit: true,
      peers: [
        {
          clientId: 2,
          id: 'peer-2',
          name: 'Remote Peer',
          color: '#22c55e',
        },
      ],
      error: null,
      errorKind: null,
      hasLocalCopy: true,
      integrityIssues: [],
    };
    render(<CollaborationControl />);

    const trigger = screen.getByRole('button', { name: 'Collaboration' });
    expect(trigger).not.toHaveAttribute('data-active');
    expect(trigger).toHaveAttribute('data-status', 'success');
    expect(trigger).toHaveClass('bg-success-muted', 'text-success');
    expect(screen.queryByTestId('collaboration-connected-indicator')).not.toBeInTheDocument();
    openPanel();
    expect(trigger).toHaveClass('bg-success-muted');
    expect(await screen.findByText('Connected')).toHaveClass('text-success');
    expect(screen.getByText('2 participant(s)')).toBeInTheDocument();
    expect(screen.getByText('Remote Peer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));

    expect(screen.getByRole('dialog', { name: 'Collaboration' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start collaboration' })).toBeInTheDocument();
    expect(useEditorStore.getState().canvasSessions[0].collaboration).toBeUndefined();
  });

  it('distinguishes disconnected state from recoverable integrity warnings', async () => {
    const descriptor: CollaborationDescriptorV6 = {
      version: 6,
      documentVersion: 6,
      mode: 'freeform',
      provider: 'websocket',
      roomId: 'room-id-1234567890',
      key: 'room-key-1234567890123456789012345678901234567890',
      endpoint: 'wss://sync.example.com',
    };
    seedSession('freeform', descriptor);
    snapshot = {
      descriptor,
      documentStatus: 'ready',
      connectionStatus: 'offline',
      canEdit: true,
      peers: [],
      error: null,
      errorKind: null,
      hasLocalCopy: true,
      integrityIssues: [
        { channel: 'cell-plane-operations', key: '1', reason: 'Skipped one invalid remote operation.' },
      ],
    };

    render(<CollaborationControl />);

    const trigger = screen.getByRole('button', { name: 'Collaboration' });
    expect(trigger).toHaveAttribute('data-status', 'error');
    expect(trigger).toHaveClass('bg-error-muted', 'text-error');
    openPanel();
    expect(await screen.findByText('Offline')).toHaveClass('text-error');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByText('Skipped one invalid remote operation.')).toHaveClass('text-warning');
  });

  it.each([
    ['restoring', 'idle', 'neutral'],
    ['ready', 'connecting', 'neutral'],
    ['joining', 'online', 'neutral'],
  ] as const)(
    'maps %s / %s collaboration state to the %s button surface',
    (documentStatus, connectionStatus, status) => {
      const descriptor: CollaborationDescriptorV6 = {
        version: 6,
        documentVersion: 6,
        mode: 'freeform',
        provider: 'websocket',
        roomId: 'room-id-1234567890',
        key: 'room-key-1234567890123456789012345678901234567890',
        endpoint: 'wss://sync.example.com',
      };
      seedSession('freeform', descriptor);
      snapshot = {
        ...snapshot,
        descriptor,
        documentStatus,
        connectionStatus,
      };

      render(<CollaborationControl />);

      expect(screen.getByRole('button', { name: 'Collaboration' })).toHaveAttribute(
        'data-status',
        status
      );
    }
  );

});
