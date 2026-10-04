import type { Enemy } from '../Elements/Enemy';
import type { GameState } from '../State/GameState';
import { LifeState } from '../Utilities/Utilities';

export class EnemyManager {
  private gs: GameState;

  constructor(gameState: GameState) {
    this.gs = gameState;
  }

  update(): void {
    const gs = this.gs;
    if (!gs.pause) {
      const temp: Enemy[] = [];

      for (const x of gs.enemies) {
        x.update();

        if (x.lifeState === LifeState.DELETING) {
          temp.push(x);
        }
      }

      // Remove the instances whose life cycle ended
      for (let i = 0; i < temp.length; i++) {
        gs.enemies.remove(temp[i]);
      }
    }
  }
}
