import { Vector2 } from '../../xna';
import { LifeState } from '../Utilities/Utilities';
import { SoundManager } from '../Management/SoundManager';
import type { IWeapons } from '../Weapons/IWeapons';
import type { GameState } from '../State/GameState';
import { TimeTraveler } from './TimeTraveler';

/** Abstract linear projectile. */
export abstract class Bullet extends TimeTraveler {
  direction: Vector2 = new Vector2();
  damage = 0;
  isPlayerBullet = false;

  initializeBullet(startPosition: Vector2, direction: Vector2, textureName: string, gun: IWeapons, gameState: GameState): void {
    this.initializeTimeTraveler(startPosition, gun.getSpeed(gun.level), textureName, gameState);
    this.direction = Vector2.normalize(direction);
    this.damage = gun.getDamage(gun.level);
    if (gun.isPlayerWeapon) this.isPlayerBullet = true;
    else this.isPlayerBullet = false;
  }

  override evaluatePosition(delta: number): Vector2 {
    const evaluate = new Vector2();
    evaluate.x = this.startPosition.x + this.direction.x * delta;
    evaluate.y = this.startPosition.y + this.direction.y * delta;
    return evaluate;
  }

  override hasCollided(_value: number, _arg: unknown): void {
    if (this.lifeState !== LifeState.DEAD) {
      this.lifeState = LifeState.DEAD;
      SoundManager.playSound('bulletHit');
    }
  }

  override toString(): string {
    return 'Bullet - ' + LifeState[this.lifeState];
  }
}
