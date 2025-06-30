import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { AAC_DATA } from '../../Foods';
import { WalkStrategy } from '../moveStrategy/WalkStrategy';
import { Hippo } from '../Hippo';
import { Scoreboard } from './Scoreboard';

export class Game extends Scene {
    private hippo: Phaser.Physics.Arcade.Sprite;
    private foods: Phaser.Physics.Arcade.Group;
    private foodKeys: string[] = [];
    private lanePositions = [256, 512, 768];
    private foodSpawnTimer: Phaser.Time.TimerEvent;
    private players: Record<string, Phaser.Physics.Arcade.Sprite> = {};
    private playerScoreLabels: Record<string, Phaser.GameObjects.Text> = {};
    private playerScores: Record<string, number> = {};
    private currentTargetFoodId: string | null = null;
    private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    private scoreboardContainer: Phaser.GameObjects.Container;
    private scoreboardTexts: Phaser.GameObjects.Text[] = [];
    private scoreboard: Scoreboard;
    private sendMessageToServer?: (message: object) => void;

    constructor() {
        super('Game');
    }

    preload() {
        this.load.image('background', '/assets/Underwater.png');
        AAC_DATA.categories.forEach(category => {
            category.foods.forEach(food => {
                if (food.imagePath) {
                    console.log(`[PRELOAD] Loading food: ${food.id} from ${food.imagePath}`);
                    this.load.image(food.id, food.imagePath);
                }
            });
        });
        this.load.spritesheet('character', '/assets/spritesheet.png', {
            frameWidth: 350,
            frameHeight: 425,
        });
    }

    create() {
        this.add.image(512, 384, 'background');
        this.hippo = new Hippo(this, 350, 425, 'character', new WalkStrategy());
        this.hippo.setScale(0.3);
        this.cursors = this.input!.keyboard!.createCursorKeys();
        EventBus.emit('current-scene-ready', this);

        this.foods = this.physics.add.group();

        this.scoreboard = new Scoreboard(this);
        this.scoreboard.addPlayer('host');
        this.playerScores["host"] = 0;

        this.physics.add.overlap(this.hippo, this.foods, this.handleFoodCollision, undefined);

        const padding = 20;
        this.scoreboardContainer = this.add.container(this.scale.width - padding, padding);
        this.scoreboardContainer.setScrollFactor(0);
        this.updateScoreboard();

        EventBus.on('external-score-update', (scores: Record<string, number>) => {
            for(const [playerId, score] of Object.entries(scores)) {
                this.scoreboard.setScore(playerId, score);
            }
        });
    }

    private handleFoodCollision = (
        hippoObj: Phaser.GameObjects.GameObject | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
        foodObj: Phaser.GameObjects.GameObject | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile
    ) => {
        const food = foodObj as Phaser.GameObjects.Sprite;
        if (food && food.texture) {
            food.destroy();
            this.handleFruitCollision('host', food);
        }
    };

    public setFoodKeys(keys: string[]) {
        this.foodKeys = keys;
    }

    public startSpawningFood() {
        if (!this.foodSpawnTimer) {
            this.foodSpawnTimer = this.time.addEvent({
                delay: 1500,
                callback: this.spawnFood,
                callbackScope: this,
                loop: true
            });
        }
    }

    spawnFood() {
        if (this.foodKeys.length === 0) return;
        const randomLaneX = Phaser.Utils.Array.GetRandom(this.lanePositions);
        const randomKey = Phaser.Utils.Array.GetRandom(this.foodKeys);
        const food = this.foods.create(randomLaneX, 0, randomKey) as Phaser.Physics.Arcade.Image;
        console.log(`[SPAWN] ${randomKey} at lane X=${randomLaneX}`);
        food.setScale(0.25);
        food.setVelocityY(750);
        food.setBounce(0.2);
        food.setCollideWorldBounds(true);
    }

    public addFoodManually(foodKey: string, angle: number) {
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;
        const food = this.foods.create(centerX, centerY, foodKey) as Phaser.Physics.Arcade.Image;
        food.setScale(0.15);

        const speed = 300;
        const velocityX = Math.cos(angle) * speed;
        const velocityY = Math.sin(angle) * speed;
        const degrees = Phaser.Math.RadToDeg(angle);
        const direction =
            degrees >= 45 && degrees < 135 ? 'down' :
            degrees >= 135 && degrees < 225 ? 'left' :
            degrees >= 225 && degrees < 315 ? 'up' : 'right';
        console.log(`[SPAWN] ${foodKey} launched ${direction} (${degrees.toFixed(0)}°)`);

        food.setVelocity(velocityX, velocityY);
        food.setBounce(0.2);
        food.setCollideWorldBounds(true);
    }

    public setTargetFood(foodId: string) {
        this.currentTargetFoodId = foodId;
        console.log(`[TARGET] Current target food set to: ${foodId}`);
    }

    update() {
        if (this.hippo && this.cursors) this.hippo.update(this.cursors);
        for (const playerId in this.players) {
            const player = this.players[playerId];
            const label = this.playerScoreLabels[playerId];
            if (player && label) {
                label.setPosition(player.x, player.y - 70);
                label.setText(String(this.scoreboard.getScore(playerId)));
            }
        }
    }

    addPlayer(playerId: string, x: number, y: number) {
        this.scoreboard.addPlayer(playerId);
        this.playerScores[playerId] = 0;
        if (!(playerId in this.players)) {
            const playerSprite = this.physics.add.sprite(x, y, 'character', 0);
            playerSprite.setCollideWorldBounds(true);
            playerSprite.setImmovable(true);
            playerSprite.play('walking');
            this.players[playerId] = playerSprite;

            this.physics.add.overlap(playerSprite, this.foods, (_hippo, fruit) => {
                let fruitGO: Phaser.GameObjects.GameObject | null = null;
                if (fruit instanceof Phaser.GameObjects.GameObject) {
                    fruitGO = fruit;
                } else if ('gameObject' in fruit) {
                    fruitGO = (fruit as any).gameObject;
                }
                if (fruitGO) {
                    this.handleFruitCollision(playerId, fruitGO);
                }
            }, undefined, this);

            const scoreLabel = this.add.text(x, y - 50, '0', {
                fontSize: '20px',
                color: '#ffffff',
                fontFamily: 'Arial',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                padding: { x: 6, y: 3 },
                align: 'center'
            });
            scoreLabel.setOrigin(0.5);
            this.playerScoreLabels[playerId] = scoreLabel;
        }
    }

    private handleFruitCollision = (
        playerId: string,
        fruit: Phaser.GameObjects.GameObject
    ) => {
        fruit.destroy();

        if ('texture' in fruit && fruit instanceof Phaser.GameObjects.Sprite) {
            const foodId = fruit.texture.key;
            const isCorrect = foodId === this.currentTargetFoodId;

            if (isCorrect) {
                this.playerScores[playerId] += 1;
                console.log(`[POINT] ${playerId} ate correct food: ${foodId}`);
            } else {
                this.playerScores[playerId] = Math.max(0, this.playerScores[playerId] - 1);
                console.log(`[PENALTY] ${playerId} ate wrong food: ${foodId}`);
            }

            this.updateScoreboard();

            EventBus.emit('scoreUpdate', {
                scores: { ...this.playerScores }
            });

            if (this.sendMessageToServer) {
                this.sendMessageToServer({
                    type: 'scoreUpdate',
                    playerId,
                    scores: { ...this.playerScores }
                });
            }
        }
    };

    private updateScoreboard() {
        this.scoreboardTexts.forEach(text => text.destroy());
        this.scoreboardTexts = [];

        const lineHeight = 28;
        let offsetY = 0;

        for (const [playerId, score] of Object.entries(this.playerScores)) {
            const scoreText = this.add.text(0, offsetY, `${playerId}: ${score}`, {
                fontSize: '20px',
                color: '#ffffff',
                fontFamily: 'Arial',
                stroke: '#000000',
                strokeThickness: 3,
                align: 'right',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                padding: { x: 10, y: 5 }
            });
            scoreText.setOrigin(1, 0);
            this.scoreboardContainer.add(scoreText);
            this.scoreboardTexts.push(scoreText);
            offsetY += lineHeight;
        }
    }

    public setSendMessage(sendFn: (message: object) => void) {
        this.sendMessageToServer = sendFn;
    }
}
