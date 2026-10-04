import type { Tachyon } from '../Elements/Tachyon';
import type { GameState } from '../State/GameState';
import { LifeState, Utility } from '../Utilities/Utilities';

export class TachyonManager {
  private gs: GameState;

  constructor(gameState: GameState) {
    this.gs = gameState;
  }

  update(): void {
    const gs = this.gs;
    if (!gs.pause) {
      const temp: Tachyon[] = [];

      for (const x of gs.tachyons) {
        x.update();
        if (!Utility.isInScreenSpace(Utility.newRectangleFromCenterPosition(x.currentPosition, 30, 30))) {
          x.lifeState = LifeState.DEAD;
        }
        if (x.lifeState === LifeState.DELETING) {
          temp.push(x);
        }
      }

      // Remove the instances whose life cycle ended
      for (let i = 0; i < temp.length; i++) {
        gs.tachyons.remove(temp[i]);
      }
    }
  }
}
