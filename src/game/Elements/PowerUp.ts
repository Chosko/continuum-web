import { Vector2 } from '../../xna';
import { Constants, LifeState, type PowerUpType } from '../Utilities/Utilities';
import { SoundManager } from '../Management/SoundManager';
import type { GameState } from '../State/GameState';
import { TimeTraveler } from './TimeTraveler';

/** Falling power-up. */
export class PowerUp extends TimeTraveler {
  type!: PowerUpType;

  constructor();
  constructor(position: Vector2, type: PowerUpType, texture: string, gameState: GameState);
  constructor(position?: Vector2, type?: PowerUpType, texture?: string, gameState?: GameState) {
    super();
    if (position === undefined) return;
    this.initializeTimeTraveler(position, Constants.POWERUP_SPEED, texture!, gameState!, 0, 0);
    this.type = type!;
  }

  override evaluatePosition(delta: number): Vector2 {
    const evaluate = new Vector2();
    evaluate.x = this.startPosition.x;
    evaluate.y = this.startPosition.y + delta;
    return evaluate;
  }

  override hasCollided(_value: number, _arg: unknown): void {
    if (this.lifeState !== LifeState.DEAD) {
      this.lifeState = LifeState.DEAD;
      SoundManager.playSound('powerUp');
    }
  }
}
