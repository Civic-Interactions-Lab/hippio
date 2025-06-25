
// Import Phaser and EventBus
import Phaser from 'phaser';
import { EventBus } from '../EventBus';

export class Scoreboard
{
    // Private variables to track scoreboard
    private scene : Phaser.Scene;
    private playerScores : Record<string, number> = {};
    private scoreText: Phaser.GameObjects.Text;
    
}