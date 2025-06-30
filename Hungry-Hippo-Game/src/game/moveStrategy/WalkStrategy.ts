// WalkStrategy.ts – free 360° walking
import { MoveStrategy } from "./MoveStrategy";


export class WalkStrategy implements MoveStrategy {
  constructor(private speed = 300) {}

  update(
    sprite: Phaser.Physics.Arcade.Sprite,
    cursors: Phaser.Types.Input.Keyboard.CursorKeys
  ) {
    const vx =
      (cursors.left?.isDown ? -1 : 0) + (cursors.right?.isDown ? 1 : 0);
    const vy =
      (cursors.up?.isDown ? -1 : 0) + (cursors.down?.isDown ? 1 : 0);

    sprite.setVelocity(vx * this.speed, vy * this.speed);
  }
}
