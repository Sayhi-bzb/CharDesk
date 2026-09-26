import { Component, type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { feedback } from '@/shared/services/effects';
import { RecoverableLazyBoundary } from '@/shared/components/RecoverableLazyBoundary';

class OuterBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <span>outer failure</span> : this.props.children;
  }
}

const ThrowError = ({ error }: { error: Error }) => {
  throw error;
};

describe('RecoverableLazyBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isolates module loading failures and offers reload feedback', async () => {
    const onError = vi.fn();
    const feedbackError = vi.spyOn(feedback, 'error').mockImplementation(() => undefined);

    render(
      <div>
        <span>canvas remains</span>
        <RecoverableLazyBoundary onError={onError}>
          <ThrowError error={new TypeError('Failed to fetch dynamically imported module')} />
        </RecoverableLazyBoundary>
      </div>
    );

    expect(screen.getByText('canvas remains')).toBeInTheDocument();
    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(feedbackError).toHaveBeenCalledWith(
      'Interface failed to load',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Reload' }),
      })
    );
  });

  it('rethrows ordinary render errors to the nearest application boundary', () => {
    const feedbackError = vi.spyOn(feedback, 'error').mockImplementation(() => undefined);

    render(
      <OuterBoundary>
        <RecoverableLazyBoundary>
          <ThrowError error={new Error('Invalid settings state')} />
        </RecoverableLazyBoundary>
      </OuterBoundary>
    );

    expect(screen.getByText('outer failure')).toBeInTheDocument();
    expect(feedbackError).not.toHaveBeenCalled();
  });
});
