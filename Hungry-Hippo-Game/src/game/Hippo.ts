import { MoveStrategy } from "./moveStrategy/MoveStrategy";
import type { Edge } from "../game/EdgeSlideStrategy";


/**
 * Represents a Hippo character in the game, extending Phaser's Arcade Sprite for physics capabilities.
 * The Hippo's movement behavior is determined by an injected MoveStrategy.
 */
export class Hippo extends Phaser.Physics.Arcade.Sprite {
    /**
     * The strategy dictating how the Hippo moves. This allows for flexible movement behaviors.
     * @private
     */
    private moveStrategy: MoveStrategy;

    /**
     * Tracks the state of the Hippo's mouth (open or closed).
     * @private
     */
    //private mouthOpen = true;

    public targetX: number = 0;
    public targetY: number = 0;
    public hasSynced = false;

    private pointerSpeed: number = 10;

    private isFrozen = false;


    public freeze(duration: number) {
        this.isFrozen = true;
        this.setTint(0x00aaff);
        this.scene.time.delayedCall(duration, () => {
            this.isFrozen = false;
            this.clearTint();
        });
    }


    public snapToEdge(edge: string) {
  // (this.scene as any) should be your Game scene
        const { x, y } = (this.scene as any).getEdgePosition(edge, this);
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        }



    public setTargetPosition(x: number, y: number) {
        this.targetX = x;
        this.targetY = y;
    }

      public setPointerSpeed(speed: number) {
        this.pointerSpeed = speed;
    }

    /**
     * Creates an instance of Hippo.
     * @param scene The Phaser Scene this Hippo belongs to.
     * @param x The initial x-coordinate of the Hippo.
     * @param y The initial y-coordinate of the Hippo.
     * @param texture The key of the texture to be used for the Hippo's sprite.
     * @param moveStrategy The initial movement strategy for the Hippo.
     */
    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        texture: string,
        moveStrategy: MoveStrategy
    ) {
        super(scene, x, y, texture, 0);

        // Add the sprite to the scene's display list
        scene.add.existing(this);
        // Enable physics for the sprite
        scene.physics.add.existing(this);

        // Configure physics properties
        this.setCollideWorldBounds(true);
        // Play the 'walking' animation (assuming it's preloaded)
        // this.play('walking');
        // Assign the movement strategy
        this.moveStrategy = moveStrategy;
    }

    /**
     * Updates the Hippo's state, primarily by delegating movement to its current `MoveStrategy`.
     * This method is typically called by the Phaser Scene's update loop.
     * @param cursors An object containing the current state of cursor keys (up, down, left, right).
     */
    public update(cursors?: Phaser.Types.Input.Keyboard.CursorKeys) {
        if (this.isFrozen) {
            this.setVelocity(0, 0);
            return;
        }
        if (cursors) {
            // local player – respond to keyboard input
            this.moveStrategy.update(this, cursors);
        } else {
            // remote player – interpolate to target position
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 1) {
                const move = Math.min(this.pointerSpeed, distance);
                this.x += (dx / distance) * move;
                this.y += (dy / distance) * move;
            }
        }
    }

   public updatePointerFlip(prevX: number, prevY: number, edge: Edge, newX: number, newY: number) {
       if ((edge === "top" || edge === "bottom") && newX !== prevX) {
                if (edge === "top") {
                    // INVERT for top: right should be flipX=false, left flipX=true
                    this.setFlipX(newX < prevX); // right: false, left: true
                } else {
                    // bottom stays as before: right flipX=true, left flipX=false
                    this.setFlipX(newX > prevX);
                }
                



        } else if ((edge === "left" || edge === "right") && newY !== prevY) {
        if (edge === "left") {
            this.setFlipX(newY > prevY); // down: true, up: false
        } else { // right
            this.setFlipX(newY < prevY); // up: true, down: false
  }
}
}




    /**
     * Sets a new movement strategy for the Hippo. This allows dynamic changes in behavior.
     * @param strategy The new MoveStrategy to apply.
     */
    public setStrategy(strategy: MoveStrategy): void {
        this.moveStrategy = strategy;
    }

    
}