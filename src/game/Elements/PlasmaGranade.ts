import { Vector2 } from '../../xna';
import { LifeState } from '../Utilities/Utilities';
import type { QuadraticBezierCurve } from '../Utilities/QuadraticBezierCurve';
import type { GameState } from '../State/GameState';
import { Bullet } from './Bullet';

/** Plasma grenade travelling along a quadratic Bezier curve; detonates at the end or on collision. */
export class PlasmaGranade extends Bullet {
  static readonly PLASMA_GRANADE_SPEED = 1;
  path!: QuadraticBezierCurve;

  constructor();
  constructor(path: QuadraticBezierCurve, textureName: string, gameState: GameState);
  constructor(path?: QuadraticBezierCurve, textureName?: string, gameState?: GameState) {
    super();
    if (path === undefined) return;
    this.initializeTimeTraveler(path.startPoint, PlasmaGranade.PLASMA_GRANADE_SPEED, textureName!, gameState!);
    this.path = path;
    this.damage = 0;
    this.isPlayerBullet = true;
  }

  override evaluatePosition(delta: number): Vector2 {
    // Check we don't go past the end of the curve
    if (delta >= 1) this.detonate();
    return this.path.evaluate(delta);
  }

  override hasCollided(_value: number, arg: unknown): void {
    if (!(arg instanceof Bullet)) this.detonate();
  }

  private detonate(): void {
    if (this.lifeState !== LifeState.DEAD) {
      this.gs.newGranadeExplosion(this.currentPosition.clone());
    }
    this.lifeState = LifeState.DEAD;
  }

  override toString(): string {
    return 'PlasmaGranade - ' + LifeState[this.lifeState];
  }
}
