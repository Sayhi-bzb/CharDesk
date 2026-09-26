import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window.matchMedia === 'undefined') {
  window.matchMedia = (query): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

afterEach(() => cleanup());
