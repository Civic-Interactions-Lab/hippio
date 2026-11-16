import { describe, it, expect, vi } from 'vitest';

// Game extends Phaser's Scene; a bare class is enough to test its cleanup
vi.mock('phaser', () => ({ Scene: class {} }));
vi.mock('../Hippo', () => ({ Hippo: class {} }));
vi.mock('../EventBus', () => ({ EventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } }));

import { Game } from './Game';

// A Phaser group after Phaser has destroyed it: its children list is gone,
// so clear() fails the same way Phaser's real Group.clear() does
function destroyedGroup() {
  return {
    children: undefined as undefined | { size: number },
    clear: vi.fn(function (this: { children?: { size: number } }) {
      return this.children!.size;
    }),
  };
}

describe('Game scene cleanup', () => {
  it('does not crash when Phaser has already destroyed the fruit group', () => {
    const scene = new Game() as any;
    scene.foods = destroyedGroup();

    expect(() => scene.destroy()).not.toThrow();
    expect(scene.foods.clear).not.toHaveBeenCalled();
  });

  it('still clears the fruit group while it is alive', () => {
    const scene = new Game() as any;
    scene.foods = { children: { size: 2 }, clear: vi.fn() };

    scene.destroy();

    expect(scene.foods.clear).toHaveBeenCalledWith(true, true);
  });
});
