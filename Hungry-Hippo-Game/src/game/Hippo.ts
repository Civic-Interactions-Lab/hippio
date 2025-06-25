import { MoveStrategy } from "./moveStrategy/MoveStrategy";

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
    private mouthOpen = true;

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
        this.scene =scene;

        // Configure physics properties
        this.setCollideWorldBounds(true);
        // Play the 'walking' animation (assuming it's preloaded)
        this.play('walking');
        // Assign the movement strategy
        this.moveStrategy = moveStrategy;
    }

    /**
     * Updates the Hippo's state, primarily by delegating movement to its current `MoveStrategy`.
     * This method is typically called by the Phaser Scene's update loop.
     * @param cursors An object containing the current state of cursor keys (up, down, left, right).
     */
    public update(cursors: Phaser.Types.Input.Keyboard.CursorKeys) {
        this.moveStrategy.update(this, cursors);
    }

    /**
     * Sets a new movement strategy for the Hippo. This allows dynamic changes in behavior.
     * @param strategy The new MoveStrategy to apply.
     */
    public setStrategy(strategy: MoveStrategy): void {
        this.moveStrategy = strategy;
    }

    /**
     * Toggles the state of the Hippo's mouth between open and closed, and updates its sprite frame accordingly.
     * Assumes frame 0 is 'mouth open' and frame 3 is 'mouth closed'.
     */
    public toggleMouth() {
        this.mouthOpen = !this.mouthOpen;
        const frameIndex = this.mouthOpen ? 0 : 3;
        this.setFrame(frameIndex);
    }

    /**
     * Checks if the Hippo's mouth is currently open.
     * @returns True if the mouth is open, false otherwise.
     */
    public isMouthOpen(): boolean {
        return this.mouthOpen;
    }
}