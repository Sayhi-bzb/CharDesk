import { Component, type ReactNode } from 'react';

export class CellReaderBoundary extends Component<{ children: ReactNode; onExit: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onExit(); }
  render() {
    return this.state.failed ? <div role="alert"><p>The documentation interface is unavailable. You can still read the content.</p>
      <button type="button" onClick={() => window.location.reload()}>Reload</button></div> : this.props.children;
  }
}
