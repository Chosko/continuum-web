import type { Randomizer } from '../Elements/Randomizer';
import type { GameState } from '../State/GameState';
import { LifeState } from '../Utilities/Utilities';

export class RandomizerManager {
  private gs: GameState;

  constructor(gameState: GameState) {
    this.gs = gameState;
  }

  update(): void {
    const gs = this.gs;
    if (!gs.pause) {
      const temp: Randomizer[] = [];

      for (const x of gs.randomizers) {
        x.update();

        if (x.lifeState === LifeState.DELETING) {
          temp.push(x);
        }
      }

      // Remove the instances whose life cycle ended
      for (let i = 0; i < temp.length; i++) {
        gs.randomizers.remove(temp[i]);
      }
    }
  }
}
