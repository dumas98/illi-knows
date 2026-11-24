import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

vi.mock('../lib/firebase', () => ({ auth: { currentUser: null } }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
