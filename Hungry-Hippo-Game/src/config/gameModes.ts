export type GameMode = 'Easy' | 'Medium' | 'Hard';

export interface ModeSettings {
  fruitSpeed: number;  
  allowPenalty: boolean;
}

/**
 * Maps each `GameMode` to its corresponding game settings.
 * 
 * - `Easy`: fruitSpeed = 100, no penalty.
 * - `Medium`: fruitSpeed = 150, penalty applied.
 * - `Hard`: fruitSpeed = 300, penalty applied.
 * 
 * Can be used to dynamically configure game behavior based on user-selected mode.
 */
export const MODE_CONFIG: Record<GameMode, ModeSettings> = {
  Easy: {
    fruitSpeed: 100,
    allowPenalty: false,
  },
  Medium: {
    fruitSpeed: 125,
    allowPenalty: true,
  },
  Hard: {
    fruitSpeed: 150,
    allowPenalty: true,
  },
};
