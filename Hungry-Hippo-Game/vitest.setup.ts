import { vi } from 'vitest';
import { EventEmitter } from 'events';
import '@testing-library/jest-dom/vitest';

vi.mock('phaser', () => ({
  Events: { EventEmitter },
}));

// Browser-only mocks; server tests run in Node, where window does not exist
if (typeof window !== 'undefined') {
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
}