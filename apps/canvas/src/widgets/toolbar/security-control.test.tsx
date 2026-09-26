import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecurityControl } from './security-control';

const SECURITY_DISCLOSURE_STORAGE_KEY = 'chardesk-security-disclosure-v1';
const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
};
const testState = vi.hoisted(() => ({
  persistence: {
    phase: 'ready' as const,
    restore: {
      phase: 'ready' as const,
      reason: null,
      error: null,
      temporaryDirty: false,
    },
    save: 'saved' as 'saved' | 'saving' | 'error',
    coordination: 'coordinator' as 'coordinator' | 'peer',
    error: null as string | null,
  },
}));

vi.mock('@/domains/canvas/public', () => ({
  useCanvasPersistence: () => testState.persistence,
}));

vi.mock('@/widgets/dialogs/data-security-dialog', () => ({
  DataSecurityDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Data security">
        <button onClick={() => onOpenChange(false)}>Close security</button>
      </div>
    ) : null,
}));

describe('SecurityControl', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage(),
    });
    testState.persistence.save = 'saved';
    testState.persistence.coordination = 'coordinator';
    testState.persistence.error = null;
    window.localStorage.removeItem(SECURITY_DISCLOSURE_STORAGE_KEY);
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage(),
    });
  });

  it('leaves viewport positioning to the editor chrome slot', async () => {
    render(<SecurityControl />);
    const host = screen.getByTestId('security-control-host');
    const control = screen.getByTestId('data-security-control');

    expect(host).not.toHaveClass('fixed', 'absolute');
    expect(control).not.toHaveAttribute('title');
    expect(control).toHaveAttribute('data-status', 'success');
    expect(control).toHaveClass('bg-success-muted', 'text-success');
    expect(screen.queryByRole('button', { name: 'Help' })).not.toBeInTheDocument();

    fireEvent.focus(control);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Data security');
  });

  it('opens Data security and returns focus to its trigger', async () => {
    const { unmount } = render(<SecurityControl />);
    const control = screen.getByRole('button', { name: 'Data security' });
    expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(control).toHaveAttribute('data-status', 'success');

    fireEvent.click(control);
    expect(await screen.findByRole('dialog', { name: 'Data security' })).toBeInTheDocument();
    expect(control).toHaveAttribute('aria-expanded', 'true');
    expect(control).not.toHaveAttribute('data-status');
    expect(control).toHaveClass('bg-control-open-surface');

    fireEvent.click(screen.getByRole('button', { name: 'Close security' }));
    expect(screen.queryByRole('dialog', { name: 'Data security' })).not.toBeInTheDocument();
    expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(control).toHaveClass('bg-transparent');
    await waitFor(() => expect(control).toHaveFocus());

    unmount();
    render(<SecurityControl />);
    expect(screen.getByRole('button', { name: 'Data security' })).not.toHaveAttribute('data-status');
  });

  it.each([
    ['error', 'coordinator', 'error'],
  ] as const)('keeps %s / %s persistence status visible after opening', async (save, coordination, status) => {
    testState.persistence.save = save;
    testState.persistence.coordination = coordination;
    render(<SecurityControl />);

    const control = screen.getByRole('button', { name: 'Data security' });
    expect(control).toHaveAttribute('data-status', status);

    fireEvent.click(control);
    expect(await screen.findByRole('dialog', { name: 'Data security' })).toBeInTheDocument();
    expect(control).toHaveAttribute('data-status', status);

    fireEvent.click(screen.getByRole('button', { name: 'Close security' }));
    expect(control).toHaveAttribute('data-status', status);
  });

  it('clears the current prompt even when browser storage is unavailable', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('unavailable');
      },
    });
    render(<SecurityControl />);

    const control = screen.getByRole('button', { name: 'Data security' });
    expect(control).toHaveAttribute('data-status', 'success');

    fireEvent.click(control);
    expect(await screen.findByRole('dialog', { name: 'Data security' })).toBeInTheDocument();
    expect(control).not.toHaveAttribute('data-status');
  });
});
