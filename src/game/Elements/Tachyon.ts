import { Rectangle, Vector2 } from '../../xna';
import { LifeState, Utility } from '../Utilities/Utilities';
import type { GameState } from '../State/GameState';
import { TimeTraveler } from './TimeTraveler';

/** Falling particle that fills the time tank. */
export class Tachyon extends TimeTraveler {
  private scale = 0;

  override get destinationRectangle(): Rectangle {
    return Utility.newRectangleFromCenterPosition(
      new Vector2(Math.trunc(this.currentPosition.x), Math.trunc(this.currentPosition.y)),
      Math.trunc(this.width * this.scale),
      Math.trunc(this.height * this.scale),
    );
  }

  constructor();
  constructor(xPosition: number, speed: number, textureName: string, gameState: GameState);
  constructor(xPosition?: number, speed?: number, textureName?: string, gameState?: GameState) {
    super();
    if (xPosition === undefined) return;
    this.scale = Utility.nextRandomFloat(0.5, 1);
    this.initializeTimeTraveler(new Vector2(xPosition, 0), speed!, textureName!, gameState!);
  }

  override evaluatePosition(delta: number): Vector2 {
    const evaluate = this.startPosition.clone(); // struct copy
    evaluate.y = this.startPosition.y + delta;
    return evaluate;
  }

  override hasCollided(_value: number, _arg: unknown): void {
    this.lifeState = LifeState.DEAD;
  }
}
