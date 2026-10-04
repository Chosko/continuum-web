import { Rectangle, Vector2 } from '../../xna';
import { TextureConstant, Utility } from '../Utilities/Utilities';
import type { Gun } from '../Weapons/Gun';
import type { GameState } from '../State/GameState';
import { Bullet } from './Bullet';

/** Gun projectile (player bullets get a damage-scaled rectangle). */
export class GunBullet extends Bullet {
  override get destinationRectangle(): Rectangle {
    if (this.isPlayerBullet)
      return Utility.newRectangleFromCenterPosition(
        new Vector2(Math.trunc(this.currentPosition.x), Math.trunc(this.currentPosition.y)),
        Math.trunc((this.width * this.damage) / 4) + 8,
        Math.trunc((this.height * this.damage) / 4) + 8,
      );
    else return super.destinationRectangle;
  }

  constructor();
  constructor(startPosition: Vector2, direction: Vector2, gun: Gun, gameState: GameState);
  constructor(startPosition?: Vector2, direction?: Vector2, gun?: Gun, gameState?: GameState) {
    super();
    if (startPosition === undefined) return;
    if (gun!.isPlayerWeapon) this.initializeBullet(startPosition, direction!, TextureConstant.GUNBULLET, gun!, gameState!);
    else this.initializeBullet(startPosition, direction!, TextureConstant.ENEMYBULLET, gun!, gameState!);
  }
}
