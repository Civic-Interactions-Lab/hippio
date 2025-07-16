import { Game as MainGame } from './scenes/Game';
import { AUTO, Game, Types } from 'phaser';

// Find out more information about the Game Config at:
// https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.FIT, // Fit to container
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1024,
        height: 1024, // Base size
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0 }, // no global gravity; using velocity
            debug: false// change to true if you want to see hitboxes
            
        }
    },
    scene: [
        MainGame
    ]
};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
}

export default StartGame;
