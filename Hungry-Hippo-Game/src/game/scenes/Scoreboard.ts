
// Import Phaser and EventBus
import Phaser from 'phaser';
import { EventBus } from '../EventBus';

export class Scoreboard
{
    // Private variables to track scoreboard
    private scene : Phaser.Scene;
    private playerScores : Record<string, number> = {};
    private scoreText: Phaser.GameObjects.Text;
    
    constructor(scene: Phaser.Scene, x = 32, y = 32)
    {
        this.scene = scene;

        this.scoreText = this.scene.add.text(x, y, '', 
            {
                fontSize: '24px',
                color: '#000',
                fontFamily: 'Arial',
                align: 'left',
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                padding: { x: 10, y: 10}
            }
        );

        this.updateScoreText();
    }

    // Method to initialize the score for a player
    public addPlayer(playerId: string)
    {
        if(!(playerId in this.playerScores))
        {
            this.playerScores[playerId] = 0;
            this.updateScoreText();
        }
    }
}