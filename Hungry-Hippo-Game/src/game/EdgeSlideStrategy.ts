import { MoveStrategy } from "./moveStrategy/MoveStrategy";

export type Edge = 'top' | 'bottom' | 'left' | 'right';

export class EdgeSlideStrategy implements MoveStrategy {
  constructor(
    private edge: Edge,
    private speed = 300,
    private margin?: number
  ) {}

  update(
    sprite: Phaser.Physics.Arcade.Sprite,
    cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  ) {
    if (!cursors) return;

    const halfW = sprite.displayWidth  / 2;
    const halfH = sprite.displayHeight / 2;
    const pad   = this.margin ?? Math.max(halfW, halfH, 16);

    const W = sprite.scene.scale.width;
    const H = sprite.scene.scale.height;

    switch (this.edge) {
      case 'top':
        this.lockY(sprite, pad);
        this.moveX(sprite, cursors);
        break;
      case 'bottom':
        this.lockY(sprite, H - pad);
        this.moveX(sprite, cursors);
        break;
      case 'left':
        this.lockX(sprite, pad);
        this.moveY(sprite, cursors);
        break;
      case 'right':
        this.lockX(sprite, W - pad);
        this.moveY(sprite, cursors);
        break;
    }
  }

  private lockY(sprite: Phaser.Physics.Arcade.Sprite, y: number) {
    sprite.y = y;
    sprite.setVelocityY(0);
  }

  private lockX(sprite: Phaser.Physics.Arcade.Sprite, x: number) {
    sprite.x = x;
    sprite.setVelocityX(0);
  }

  // Top & bottom edge: flipX so “left” looks left, “right” looks right
  private moveX(
  sprite: Phaser.Physics.Arcade.Sprite,
  cursors: Phaser.Types.Input.Keyboard.CursorKeys
) {
  if (cursors.left.isDown) {
    sprite.setVelocityX(-this.speed);
    // Top edge: hippo art is reversed, so flipX(false) to face left
    // Other edges: flipX(true) to face left
    sprite.setFlipX(this.edge === 'top' ? false : true);
  }
  else if (cursors.right.isDown) {
    sprite.setVelocityX(this.speed);
    // Top: flipX(true) to face right, others flipX(false)
    sprite.setFlipX(this.edge === 'top' ? true : false);
  }
  else {
    sprite.setVelocityX(0);
  }
}


  // Left & right edge: still flipX, but inverted for the right edge
  private moveY(
    sprite: Phaser.Physics.Arcade.Sprite,
    cursors: Phaser.Types.Input.Keyboard.CursorKeys
  ) {
    if (cursors.up.isDown) {
      sprite.setVelocityY(-this.speed);
      // up: left-edge flips to face up, right-edge unflipped
      sprite.setFlipX(this.edge === 'left');
    }
    else if (cursors.down.isDown) {
      sprite.setVelocityY(this.speed);
      // down: left-edge unflipped, right-edge flips to face down
      sprite.setFlipX(this.edge === 'right');
    }
    else {
      sprite.setVelocityY(0);
    }
  }
}
