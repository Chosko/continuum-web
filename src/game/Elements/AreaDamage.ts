import { Rectangle, Vector2 } from '../../xna';
import { LifeState, TextureConstant } from '../Utilities/Utilities';
import type { GameState } from '../State/GameState';
import { Bullet } from './Bullet';

/** Area damage (dead code in the original: GameState.newAreaDamage is never called). */
export class AreaDamage extends Bullet {
  duration = 0;
  stretchRatio = 0;

  override get destinationRectangle(): Rectangle {
    return new Rectangle(
      Math.trunc(this.currentPosition.x),
      Math.trunc(this.currentPosition.y),
      Math.trunc(this.stretchRatio * this.width),
      Math.trunc(this.stretchRatio * this.height),
    );
  }

  constructor();
  constructor(startPosition: Vector2, sequenceTexture: string, numberOfFrames: number, numberOfRows: number, numberOfCols: number, damageDuration: number, range: number, damage: number, gameState: GameState);
  constructor(
    startPosition?: Vector2,
    sequenceTexture?: string,
    numberOfFrames?: number,
    numberOfRows?: number,
    numberOfCols?: number,
    damageDuration?: number,
    range?: number,
    damage?: number,
    gameState?: GameState,
  ) {
    super();
    if (startPosition === undefined) return;
    this.initializeTimeTraveler(startPosition, 1, TextureConstant.VOID_TEXTURE, gameState!);
    this.stretchRatio = range! / 32;
    this.gs.newAnimation(startPosition.clone(), sequenceTexture!, numberOfFrames!, numberOfRows!, numberOfCols!, Math.trunc(numberOfFrames! / damageDuration!), 0, 0);
    this.damage = damage!;
    this.isPlayerBullet = true;
    this.duration = damageDuration!;
  }

  override evaluatePosition(delta: number): Vector2 {
    if (delta >= this.duration) this.lifeState = LifeState.DEAD;
    return this.startPosition.clone();
  }

  override hasCollided(_value: number, _arg: unknown): void {}

  override toString(): string {
    return 'PlasmaGranade - ' + LifeState[this.lifeState];
  }
}
