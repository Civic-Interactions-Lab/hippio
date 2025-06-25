/**
 * @fileoverview
 * Unit tests for the Hippo class and its movement strategies, including EdgeSlideStrategy.
 * Uses Vitest for testing and mocking. Mocks Phaser globally to allow testing without Phaser runtime.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { MoveStrategy } from "./moveStrategy/MoveStrategy";
import { EdgeSlideStrategy } from "./EdgeSlideStrategy";

/**
 * Mock the Phaser global object before importing any files that depend on it.
 */
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

/**
 * Mock scene object to be used in tests.
 */
const mockScene = {
  add: { existing: vi.fn() },
  physics: { add: { existing: vi.fn() } },
} as unknown as Phaser.Scene;

/**
 * Mock implementation of MoveStrategy for testing Hippo's strategy delegation.
 */
class MockMoveStrategy implements MoveStrategy {
  update = vi.fn();
}

describe('Hippo', () => {
  let hippo: any;
  let strategy: MockMoveStrategy;

  /**
   * Before each test, dynamically import Hippo after mocking Phaser,
   * and instantiate a Hippo with a mock strategy.
   */
  beforeEach(async () => {
    const { Hippo } = await import('./Hippo'); // ✅ import after Phaser mock
    strategy = new MockMoveStrategy();
    hippo = new Hippo(mockScene, 100, 100, 'hippoTexture', strategy);
  });

  /**
   * Test that the Hippo's mouth is open upon initialization.
   */
  test('initial state has mouth open', () => {
    expect(hippo.isMouthOpen()).toBe(true);
  });

  /**
   * Test that toggleMouth changes the mouth state and updates the sprite frame.
   */
  test('toggleMouth changes mouth state and updates frame', () => {
    hippo.setFrame = vi.fn();
    hippo.toggleMouth(); // close mouth
    expect(hippo.isMouthOpen()).toBe(false);
    expect(hippo.setFrame).toHaveBeenCalledWith(3);
    hippo.toggleMouth(); // open mouth
    expect(hippo.setFrame).toHaveBeenCalledWith(0);
  });

  /**
   * Test that Hippo's update method delegates to the current move strategy.
   */
  test('update delegates to moveStrategy.update', () => {
    hippo.update('cursors');
    expect(strategy.update).toHaveBeenCalledWith(hippo, 'cursors');
  });

  /**
   * Test that setStrategy changes the Hippo's movement strategy.
   */
  test('setStrategy changes the moveStrategy', async () => {
    const newStrategy = new MockMoveStrategy();
    hippo.setStrategy(newStrategy);
    hippo.update('cursors');
    expect(newStrategy.update).toHaveBeenCalledWith(hippo, 'cursors');
  });

  /**
   * Test that the Hippo constructor sets up physics and animation.
   */
  test('constructor sets up physics and animation', () => {
    expect(hippo.setCollideWorldBounds).toHaveBeenCalledWith(true);
    expect(hippo.play).toHaveBeenCalledWith('walking');
  });

  /**
   * Parameterized tests for EdgeSlideStrategy.
   * Verifies that the Hippo is locked to the correct edge and moves only along the allowed axis.
   * @param edge - The edge to lock movement to ('top', 'bottom', 'left', 'right')
   * @param width - Scene width
   * @param height - Scene height
   * @param cursors - Cursor input simulation
   * @param [vx, vy] - Expected velocity
   * @param expectedPos - Expected locked position (x or y)
   * @param lockedAxis - The axis that should be locked ('x' or 'y')
   */
  describe.each([
    ['bottom', 800, 600, { left: { isDown: true } }, [ -200, 0 ], 600 - 64, 'y'],
    ['top',    800, 600, { right: { isDown: true } }, [ 200, 0 ], 64, 'y'],
    ['left',   800, 600, { up: { isDown: true } }, [ 0, -150 ], 64, 'x'],
    ['right',  800, 600, { down: { isDown: true } }, [ 0, 150 ], 800 - 64, 'x'],
  ])(
    'EdgeSlideStrategy: moves only along %s edge',
    (edge, width, height, cursors, [vx, vy], expectedPos, lockedAxis) => {
      test(`locks ${lockedAxis} axis and moves with velocity`, async () => {
        const { Hippo } = await import('./Hippo');
        const speed = Math.abs(vx || vy);
        const edgeStrategy = new EdgeSlideStrategy(edge as any, speed);
        const edgeHippo = new Hippo(mockScene, 0, 0, 'hippoTexture', edgeStrategy);

        edgeHippo.setVelocityX = vi.fn();
        edgeHippo.setVelocityY = vi.fn();
        edgeHippo.scene = { scale: { width, height } } as any;

        edgeHippo.update(cursors as any);

        if (lockedAxis === 'y') {
          expect(edgeHippo.y).toBe(expectedPos);
          expect(edgeHippo.setVelocityY).toHaveBeenCalledWith(0);
          expect(edgeHippo.setVelocityX).toHaveBeenCalledWith(vx);
        } else {
          expect(edgeHippo.x).toBe(expectedPos);
          expect(edgeHippo.setVelocityX).toHaveBeenCalledWith(0);
          expect(edgeHippo.setVelocityY).toHaveBeenCalledWith(vy);
        }
      });
    }
  );

  /**
   * Example test for EdgeSlideStrategy with the top edge and horizontal movement.
   */
  test('EdgeSlideStrategy keeps hippo at top edge and moves horizontally', async () => {
    const { Hippo } = await import('./Hippo');
    const width = 1024;
    const height = 768;

    const fakeScene: any = {
      add: { existing: vi.fn() },
      physics: { add: { existing: vi.fn() } },
      scale: { width, height },
      anims: { exists: vi.fn().mockReturnValue(true) }
    };

    const edgeHippo = new Hippo(fakeScene, 0, 0, 'character', new EdgeSlideStrategy('top', 150));

    // Mock velocity methods
    edgeHippo.setVelocityX = vi.fn();
    edgeHippo.setVelocityY = vi.fn();

    // Simulate pressing right arrow
    const cursors = { left: { isDown: false }, right: { isDown: true } };

    edgeHippo.update(cursors as any);

    // Hippo should be locked to y = 64 (top edge)
    expect(edgeHippo.y).toBe(64);
    // Should move right with speed 150
    expect(edgeHippo.setVelocityX).toHaveBeenCalledWith(150);
    // Should not move vertically
    expect(edgeHippo.setVelocityY).toHaveBeenCalledWith(0);
  });
});
