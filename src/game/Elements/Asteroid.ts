import { Rectangle, Vector2 } from '../../xna';
import { LifeState, Utility } from '../Utilities/Utilities';
import type { GameState } from '../State/GameState';
import { TimeTraveler } from './TimeTraveler';

/** Asteroid with life; damage spawns chips. */
export class Asteroid extends TimeTraveler {
  direction: Vector2 = new Vector2();
  life = 0;

  override get destinationRectangle(): Rectangle {
    return new Rectangle(
      Math.trunc(this.currentPosition.x),
      Math.trunc(this.currentPosition.y),
      Math.trunc((this.width * this.life + 2000) / 50),
      Math.trunc((this.height * this.life + 2000) / 50),
    );
  }

  constructor();
  constructor(position: Vector2, direction: Vector2, speed: number, life: number, texture: string, gameState: GameState);
  constructor(position?: Vector2, direction?: Vector2, speed?: number, life?: number, texture?: string, gameState?: GameState) {
    super();
    if (position === undefined) return;
    const startRotation = Utility.nextRandomFloat(0, Math.PI * 2);
    const rotationSpeed = Utility.nextRandomFloat(-1, 1);
    this.initializeTimeTraveler(position, speed!, texture!, gameState!, startRotation, rotationSpeed);
    this.direction = direction!.clone();
    this.life = life!;
  }

  /** Damages the asteroid; direction is the direction of the spawned chip. */
  damage(value: number, direction: Vector2): void {
    if (this.life > 0) {
      this.addElementRecord((v: unknown) => {
        this.life = v as number;
      }, this.life);
      this.life -= value;
      this.gs.newAsteroidChip(this.currentPosition.clone(), direction.clone());
    }
    if (this.life <= 0) {
      this.lifeState = LifeState.DEAD;
      this.gs.newAsteroidExplosion(this.currentPosition.clone());
    }
  }

  override evaluatePosition(delta: number): Vector2 {
    const evaluate = new Vector2();
    evaluate.x = this.startPosition.x + this.direction.x * delta;
    evaluate.y = this.startPosition.y + this.direction.y * delta;
    return evaluate;
  }

  override hasCollided(value: number, arg: unknown): void {
    this.damage(value, Vector2.subtract(arg as Vector2, this.currentPosition));
  }

  override toString(): string {
    return 'Asteroid - ' + LifeState[this.lifeState];
  }
}
