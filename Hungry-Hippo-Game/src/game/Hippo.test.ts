import { describe, test, expect, vi, beforeEach } from 'vitest';
import { MoveStrategy } from "./moveStrategy/MoveStrategy";

// ✅ Must mock Phaser *before* loading any file that uses it
(globalThis as any).Phaser = {
  Physics: {
    Arcade: {
      Sprite: class {
        setCollideWorldBounds = vi.fn();
        play = vi.fn();
        setFrame = vi.fn();
      },
    },
  },
};

// ✅ Mock scene
const mockScene = {
  add: { existing: vi.fn() },
  physics: { add: { existing: vi.fn() } },
} as unknown as Phaser.Scene;

class MockMoveStrategy implements MoveStrategy {
  update = vi.fn();
}

describe('Hippo', () => {
  let hippo: any;
  let strategy: MockMoveStrategy;

  beforeEach(async () => {
    // ✅ Dynamically import Hippo *after* mocking Phaser
    const { Hippo } = await import('./Hippo');
    strategy = new MockMoveStrategy();
    hippo = new Hippo(mockScene, 100, 100, 'hippoTexture', strategy);
  });

  test('initial state has mouth open', () => {
    expect(hippo.isMouthOpen()).toBe(true);
  });

  test('toggleMouth changes mouth state and updates frame', () => {
    hippo.toggleMouth();
    expect(hippo.isMouthOpen()).toBe(false);
  });

  test('update delegates to moveStrategy.update', () => {
    hippo.update('cursors');
    expect(strategy.update).toHaveBeenCalledWith(hippo, 'cursors');
  });

  test('setStrategy changes the moveStrategy', async () => {
    const newStrategy = new MockMoveStrategy();
    hippo.setStrategy(newStrategy);
    hippo.update('cursors');
    expect(newStrategy.update).toHaveBeenCalledWith(hippo, 'cursors');
  });

  test('toggleMouth calls setFrame with correct frame', () => {
    hippo.setFrame = vi.fn();
    hippo.toggleMouth(); // Should close mouth (frame 3)
    expect(hippo.setFrame).toHaveBeenCalledWith(3);
    hippo.toggleMouth(); // Should open mouth (frame 0)
    expect(hippo.setFrame).toHaveBeenCalledWith(0);
  });

  test('constructor sets up physics and animation', () => {
    expect(hippo.setCollideWorldBounds).toHaveBeenCalledWith(true);
    expect(hippo.play).toHaveBeenCalledWith('walking');
  });
  
});
