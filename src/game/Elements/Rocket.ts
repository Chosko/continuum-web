import { Vector2 } from '../../xna';
import { LifeState, TextureConstant, Utility } from '../Utilities/Utilities';
import type { RocketLauncher } from '../Weapons/RocketLauncher';
import type { GameState } from '../State/GameState';
import { Bullet } from './Bullet';
import { GunBullet } from './GunBullet';

/** Straight rocket. */
export class Rocket extends Bullet {
  constructor();
  constructor(startPosition: Vector2, direction: Vector2, rocketLauncher: RocketLauncher, gameState: GameState);
  constructor(startPosition?: Vector2, direction?: Vector2, rocketLauncher?: RocketLauncher, gameState?: GameState) {
    super();
    if (startPosition === undefined) return;
    this.initializeBullet(startPosition, direction!, TextureConstant.ROCKET, rocketLauncher!, gameState!);
  }

  protected override evaluateRotation(_rotationDelta: number): number {
    // C# passes the struct by value (CalculateXAngleFromVector normalizes its parameter).
    return Utility.calculateXAngleFromVector(this.direction.clone()) + Math.PI / 2;
  }

  override hasCollided(_value: number, arg: unknown): void {
    if (!(arg instanceof GunBullet)) {
      this.lifeState = LifeState.DEAD;
    }
  }
}
