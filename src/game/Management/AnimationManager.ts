import type { Animation } from '../Elements/Animation';
import type { GameState } from '../State/GameState';
import { LifeState } from '../Utilities/Utilities';

export class AnimationManager {
  private gs: GameState;

  constructor(gameState: GameState) {
    this.gs = gameState;
  }

  update(): void {
    const gs = this.gs;
    if (!gs.pause) {
      const temp: Animation[] = [];

      for (const x of gs.animations) {
        x.update();

        if (x.lifeState === LifeState.DELETING) {
          temp.push(x);
        }
      }

      // Remove the instances whose life cycle ended
      for (let i = 0; i < temp.length; i++) {
        gs.animations.remove(temp[i]);
      }
    }
  }
}
