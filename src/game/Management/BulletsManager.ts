import type { Bullet } from '../Elements/Bullet';
import type { GameState } from '../State/GameState';
import type { LinkedList } from '../Utilities/LinkedList';
import { LifeState, Utility } from '../Utilities/Utilities';

export class BulletsManager {
  private gs: GameState;

  constructor(gameState: GameState) {
    this.gs = gameState;
  }

  update(): void {
    if (!this.gs.pause) {
      this.updateBullets(this.gs.bullets);
    }
  }

  updateBullets(list: LinkedList<Bullet>): void {
    // Appends every just-created bullet (gs.newBullets is never cleared; always empty in practice).
    for (const x of this.gs.newBullets) {
      list.addLast(x);
    }

    const temp: Bullet[] = [];

    for (const x of list) {
      x.update();

      if (!Utility.isInScreenSpace(Utility.newRectangleFromCenterPosition(x.currentPosition, 30, 30))) {
        x.lifeState = LifeState.DEAD;
      }

      if (x.lifeState === LifeState.DELETING) {
        temp.push(x);
      }
    }

    // Remove the bullets whose life cycle ended
    for (let i = 0; i < temp.length; i++) {
      list.remove(temp[i]);
    }
  }
}
