import { Rectangle, Vector2 } from '../../xna';
import { LifeState } from '../Utilities/Utilities';
import type { GameState } from '../State/GameState';
import { TimeTraveler } from './TimeTraveler';

/** Vertically scrolling background drawn as two stacked copies. */
export class BackgroundTexture extends TimeTraveler {
  /** Position of the second copy. */
  currentPosition2: Vector2 = new Vector2();

  get destinationRectangle2(): Rectangle {
    return new Rectangle(Math.trunc(this.currentPosition2.x), Math.trunc(this.currentPosition2.y), this.width, this.height);
  }

  /** Time at which the background started scrolling. */
  startTime2 = 0;
  /** Texture of the background replacing this one. */
  replacingTextureIndex = 0;
  /** Transition texture (null if none). */
  transitionTextureIndex: number | null = null;
  /** Number of completed loops. */
  loops = 0;
  /** Background level (slot). */
  level = 0;

  constructor();
  constructor(level: number, speed: number, texture: string, transitionTexture: string | null, gameState: GameState);
  constructor(level?: number, speed?: number, texture?: string, transitionTexture?: string | null, gameState?: GameState) {
    super();
    if (level === undefined) return;
    const gameStateV = gameState!;
    const textureIndex = gameStateV.textureIndices.getTextureIndex(texture!);
    if (transitionTexture == null) {
      this.transitionTextureIndex = null;
    } else {
      this.transitionTextureIndex = gameStateV.textureIndices.getTextureIndex(transitionTexture);
    }
    this.loops = 0;
    this.level = level;
    this.initializeTimeTraveler(Vector2.Zero, speed!, texture!, gameStateV);
    // float32 arithmetic as in C#: (float)480 / Width, (int)(stretchRatio * Width)
    const stretchRatio = Math.fround(480 / this.width);
    this.width = Math.trunc(Math.fround(stretchRatio * this.width));
    this.height = Math.trunc(Math.fround(stretchRatio * this.height));
    this.startPosition = new Vector2(0, 800 - this.height);
    this.currentPosition = this.startPosition.clone();
    this.currentPosition2 = Vector2.subtract(this.startPosition, new Vector2(0, gameStateV.textures[textureIndex].height));
    this.startTime2 = 0;
    this.blockUpdate = true;
  }

  protected override evaluateDelta(): void {
    this.elapsedTime = this.gs.levelTime.time - this.startTime2;
    this.delta = this.elapsedTime * this.speed;
    if (this.elapsedTime < 0) this.elapsedTime = 0;
    if (this.delta < 0) this.delta = 0;
  }

  override evaluatePosition(delta: number): Vector2 {
    const evaluate = Vector2.Zero;
    switch (this.lifeState) {
      case LifeState.NORMAL:
        evaluate.y = this.startPosition.y + delta - this.height * this.loops;
        this.currentPosition2.y = evaluate.y - this.height;
        break;
      case LifeState.TRANSITIONING:
        evaluate.y = this.startPosition.y + delta - this.height * this.loops;
        this.currentPosition2.y = evaluate.y - this.height;
        break;
      case LifeState.BEINGREPLACED:
        evaluate.y = this.startPosition.y + delta - this.height * this.loops;
        this.currentPosition2.y = evaluate.y - this.height;
        break;
    }

    if (this.gs.levelTime.continuum > 0 && evaluate.y > 800) {
      this.addElementRecord((v: unknown) => {
        this.loops = v as number;
      }, this.loops);
      this.loops++;
      if (this.lifeState === LifeState.TRANSITIONING) {
        this.lifeState = LifeState.NORMAL;
      }
      if (this.lifeState === LifeState.BEINGREPLACED) {
        this.lifeState = LifeState.DEAD;
      }
    }

    return evaluate;
  }

  /** Marks this background as being replaced by newTexture. */
  replacing(newTexture: number): void {
    this.lifeState = LifeState.BEINGREPLACED;
    this.replacingTextureIndex = newTexture;
  }

  /** Starts scrolling. */
  start(): void {
    this.addElementRecord((v: unknown) => {
      this.startTime2 = v as number;
    }, this.startTime2);
    this.startTime2 = this.gs.levelTime.time;
    this.loops = 0;
    if (this.transitionTextureIndex !== null) this.lifeState = LifeState.TRANSITIONING;
    this.addElementRecord((v: unknown) => {
      this.blockUpdate = v as boolean;
    }, this.blockUpdate);
    this.blockUpdate = false;
  }

  override toString(): string {
    let str = 'Texture = ' + this.textureIndex + '\n   lifeState = ' + LifeState[this.lifeState] + '\n   loops = ' + this.loops;
    str += '\n   elapsedTime = ' + this.elapsedTime + '\n   delta = ' + this.delta;
    for (const x of this.elementRecords) {
      str += '\n   record: ' + x.time + '  ' + String(x.value);
    }
    return str;
  }

  override hasCollided(_value: number, _arg: unknown): void {
    throw new Error('NotImplementedException: Non deve poter collidere!!!');
  }
}
