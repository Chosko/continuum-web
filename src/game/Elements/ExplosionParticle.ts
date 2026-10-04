import { Vector2 } from '../../xna';
import { Constants, LifeState, Utility } from '../Utilities/Utilities';
import type { GameState } from '../State/GameState';
import { TimeTraveler } from './TimeTraveler';

/** Explosion / asteroid / grenade fragment (C# file ExplosionParticle.cs, class Chip). */
export class Chip extends TimeTraveler {
  private deltaDuration = 0;
  private direction: Vector2 = new Vector2();
  /** Coefficient a of the parabola. */
  private a = 0;
  private updatedAt = 0;
  private lastDamage = 0;
  private life = 0;

  alpha = 0;

  /**
   * Damage computed with a parabola Y = a X^2 + c (X = delta = elapsed time * speed),
   * memoized per delta. Note: uses Constants.GRANADE_DAMAGE as c, not the ctor damage.
   */
  get damage(): number {
    if (this.updatedAt !== this.delta) {
      this.lastDamage = Math.max(0, this.a * this.delta * this.delta + Constants.GRANADE_DAMAGE);
      this.updatedAt = this.delta;
    }
    return Math.trunc(this.lastDamage) + 1;
  }

  constructor();
  constructor(position: Vector2, direction: Vector2, speed: number, deltaDuration: number, damage: number, life: number, textureGroupName: string, gameState: GameState);
  constructor(
    position?: Vector2,
    direction?: Vector2,
    speed?: number,
    deltaDuration?: number,
    damage?: number,
    life?: number,
    textureGroupName?: string,
    gameState?: GameState,
  ) {
    super();
    if (position === undefined) return;
    // Struct parameter: work on a local copy.
    let dir = direction!.clone();
    if (dir.equals(Vector2.Zero)) dir = new Vector2(Utility.nextRandomFloat(0, 2) - 1, Utility.nextRandomFloat(0, 2) - 1);
    dir.normalize();
    this.direction = dir;
    this.lastDamage = damage!;
    this.life = life!;
    this.deltaDuration = deltaDuration!;
    this.a = -damage! / (deltaDuration! * deltaDuration!);

    const rotationSpeed = Utility.nextRandomFloat(-20, 20);
    const textureNames = [textureGroupName + '1', textureGroupName + '2', textureGroupName + '3'];
    this.initializeTimeTraveler(position, speed!, textureNames[Utility.nextRandomInt(0, 3)], gameState!, 0, rotationSpeed);
  }

  override evaluatePosition(delta: number): Vector2 {
    if (this.lifeState !== LifeState.DEAD) {
      const q = this.deltaDuration / 2;
      this.alpha = (-Math.abs(-delta + q) + q) / q;
    }
    if (delta > this.deltaDuration && this.lifeState !== LifeState.DEAD) this.lifeState = LifeState.DEAD;
    return Vector2.add(this.startPosition, Vector2.multiply(this.direction, delta));
  }

  override hasCollided(value: number, _arg: unknown): void {
    this.life -= value;
    if (this.life <= 0 && this.lifeState !== LifeState.DEAD) this.lifeState = LifeState.DEAD;
  }
}
