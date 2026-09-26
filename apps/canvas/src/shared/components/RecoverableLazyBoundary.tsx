import { Component, type ReactNode } from 'react';
import { feedback } from '@/shared/services/effects';
import { useUiI18n } from '@/shared/i18n';
import { isRecoverableModuleLoadError } from '@/shared/lib/moduleLoadRecovery';

type RecoverableLazyBoundaryProps = {
  children: ReactNode;
  resetKey?: string | number | boolean;
  onError?: () => void;
};

type RecoverableLazyBoundaryState = {
  error: unknown;
};

type BoundaryProps = RecoverableLazyBoundaryProps & {
  failureLabel: string;
  failureDescription: string;
  reloadLabel: string;
};

class LazyBoundary extends Component<
  BoundaryProps,
  RecoverableLazyBoundaryState
> {
  state: RecoverableLazyBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): RecoverableLazyBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown) {
    if (!isRecoverableModuleLoadError(error)) return;
    this.props.onError?.();
    feedback.error(this.props.failureLabel, {
      description: this.props.failureDescription,
      action: {
        label: this.props.reloadLabel,
        onClick: () => window.location.reload(),
      },
    });
  }

  componentDidUpdate(previousProps: BoundaryProps) {
    if (
      this.state.error &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (!isRecoverableModuleLoadError(this.state.error)) throw this.state.error;
    return null;
  }
}

export function RecoverableLazyBoundary(props: RecoverableLazyBoundaryProps) {
  const { t } = useUiI18n();
  return (
    <LazyBoundary
      {...props}
      failureLabel={t('moduleLoad.failed')}
      failureDescription={t('moduleLoad.description')}
      reloadLabel={t('moduleLoad.reload')}
    />
  );
}
