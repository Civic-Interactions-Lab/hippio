import { Scene } from 'phaser';
import { EventBus } from '../EventBus';

export class Game extends Scene
{
    private fruits: Phaser.Physics.Arcade.Group;
    private fruitKeys = ['apple', 'banana', 'cherry', 'grape'];
    private lanePositions = [256, 512, 768]; // tweak as needed

    private fruitSpawnTimer: Phaser.Time.TimerEvent; // store timer reference

    private playerScores: Record<string, number> = {
        player1: 0
    }

    private scoreText: Phaser.GameObjects.Text;

    constructor ()
    {
        super('Game');
    }

    preload ()
    {
        this.load.setPath('assets');
        this.load.image('background', 'squareTiles.png');

        // Fruit images
        this.load.image('apple', 'apple.png');
        this.load.image('banana', 'banana.png');
        this.load.image('cherry', 'cherry.png');
        this.load.image('grape', 'grape.png');
        this.load.image('logo', 'logo.png');

        this.load.spritesheet('character', 'spritesheet.png',{
            frameWidth: 350,
            frameHeight: 425,
        });
        


        this.load.spritesheet('character', 'spritesheet.png',{
            frameWidth: 350,
            frameHeight: 425,
        });
        

    }

    create ()
    {
        
        this.add.image(512, 384, 'background');

        // this.anims.create({
        //     key: 'walking',
        //     frames: [
        //         { key: 'character', frame: 0 },
        //         { key: 'character', frame: 1 },
        //         { key: 'character', frame: 1 },
        //         { key: 'character', frame: 0 }
        //     ],
        //     frameRate: 4,
        //     repeat: -1
        // });
       
        this.anims.create({
            key: 'walking',
            frames: this.anims.generateFrameNumbers('character', { start: 0, end: 4 }),
            frameRate: 4,
            repeat: -1
        });

        
        const hippo = this.physics.add.sprite(350, 425, 'character', 0);
        hippo.play('walking');
        hippo.setCollideWorldBounds(true);
        hippo.setImmovable(true);

        
        EventBus.emit('current-scene-ready', this);
     // Initialize physics for "fruit" group
     this.fruits = this.physics.add.group();
        
     this.physics.add.overlap(hippo, this.fruits, this.handleFruitCollision, undefined, this);
     
     this.scoreText = this.add.text(16, 16, 'Score: 0', {
        fontSize: '32px',
        color: '#ffffff'
     });

     this.startSpawningFruit();
    }

    

    // Starts the timer to spawn fruits
    public startSpawningFruit() {
        if (!this.fruitSpawnTimer) {
            this.fruitSpawnTimer = this.time.addEvent({
                delay: 1500,
                callback: this.spawnFruit,
                callbackScope: this,
                loop: true
            });
        }
    }

    spawnFruit() {
        // Random lane position
        const randomLaneX = Phaser.Utils.Array.GetRandom(this.lanePositions);

        // Random fruit type
        const randomKey = Phaser.Utils.Array.GetRandom(this.fruitKeys);

        // Fruit spawned from top
        const fruit = this.fruits.create(randomLaneX, 0, randomKey) as Phaser.Physics.Arcade.Image;
        fruit.setScale(0.25); // Fruit 25% of original size

        // Gravity
        fruit.setVelocityY(750); // Will move 750 pixels/sec down
        fruit.setBounce(0.2); // Slight bounce at bottom but used to trigger falling
        fruit.setCollideWorldBounds(true);
    }

    public addFruitManually(fruitKey: string) {
        const x = Phaser.Math.Between(64, this.scale.width - 64);
        const fruit = this.fruits.create(x, 0, fruitKey) as Phaser.Physics.Arcade.Image;
        fruit.setScale(0.25);
        fruit.setVelocityY(600);
        fruit.setBounce(0.2);
        fruit.setCollideWorldBounds(true);
    }
    

    update() {
        this.fruits.getChildren().forEach((fruit) => {
            const sprite = fruit as Phaser.Physics.Arcade.Image;
            if (sprite.body && sprite.body.blocked.down) {
                sprite.destroy(); // Immediately remove fruits after touching bottom
            }
        });
    }


    private handleFruitCollision = (
        hippo: any,
        fruit: any
    ) => {
        fruit.destroy();
        this.playerScores['player1'] += 1;

        this.scoreText.setText(`Score: ${this.playerScores['player1']}`);

        EventBus.emit('scoreUpdate', {
            scores: { ...this.playerScores }
        });
    };
}
