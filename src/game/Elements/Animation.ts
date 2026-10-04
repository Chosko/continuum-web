import { Rectangle, Vector2 } from '../../xna';
import { LifeState } from '../Utilities/Utilities';
import type { GameState } from '../State/GameState';
import { TimeTraveler } from './TimeTraveler';

/** Sprite-sheet animation. */
export class Animation extends TimeTraveler {
  length = 0;
  rows = 0;
  index = 0;
  cols = 0;
  sequenceWidth = 0;
  sequenceHeight = 0;
  row = 0;
  col = 0;
  stretchRatio = 0;
  cycles = 0;
  private cycleCounter = 0;

  override get destinationRectangle(): Rectangle {
    return new Rectangle(
      Math.trunc(this.currentPosition.x),
      Math.trunc(this.currentPosition.y),
      Math.trunc(this.stretchRatio * this.width),
      Math.trunc(this.stretchRatio * this.height),
    );
  }

  /**
   * C# overloads:
   *  Animation(Position, SequenceTexture, NumberOfFrames, NumberOfRows, NumberOfCols, FramePerSecond, RotationStartRadiant, RotationSpeed, gameState)
   *  Animation(Position, SequenceTexture, NumberOfFrames, NumberOfRows, NumberOfCols, FramePerSecond, Cycles, RotationStartRadiant, RotationSpeed, gameState)
   *  Animation()
   */
  constructor();
  constructor(position: Vector2, sequenceTexture: string, numberOfFrames: number, numberOfRows: number, numberOfCols: number, framePerSecond: number, rotationStartRadiant: number, rotationSpeed: number, gameState: GameState);
  constructor(position: Vector2, sequenceTexture: string, numberOfFrames: number, numberOfRows: number, numberOfCols: number, framePerSecond: number, cycles: number, rotationStartRadiant: number, rotationSpeed: number, gameState: GameState);
  constructor(
    position?: Vector2,
    sequenceTexture?: string,
    numberOfFrames?: number,
    numberOfRows?: number,
    numberOfCols?: number,
    framePerSecond?: number,
    a6?: number,
    a7?: number,
    a8?: number | GameState,
    a9?: GameState,
  ) {
    super();
    if (position === undefined) return;
    if (typeof a8 === 'number') {
      // (…, FramePerSecond, Cycles, RotationStartRadiant, RotationSpeed, gameState)
      this.initializeAnimation(position, sequenceTexture!, numberOfFrames!, numberOfRows!, numberOfCols!, framePerSecond!, a6!, a7!, a8, a9!);
    } else {
      // (…, FramePerSecond, RotationStartRadiant, RotationSpeed, gameState)
      this.initializeAnimation(position, sequenceTexture!, numberOfFrames!, numberOfRows!, numberOfCols!, framePerSecond!, 1, a6!, a7!, a8!);
    }
  }

  private initializeAnimation(
    position: Vector2,
    sequenceTexture: string,
    numberOfFrames: number,
    numberOfRows: number,
    numberOfCols: number,
    framePerSecond: number,
    cycles: number,
    rotationStartRadiant: number,
    rotationSpeed: number,
    gameState: GameState,
  ): void {
    this.rows = numberOfRows;
    this.length = numberOfFrames;
    this.cols = numberOfCols;
    this.index = 0;
    this.row = 0;
    this.col = 0;
    this.stretchRatio = 1;
    this.cycles = cycles;
    this.cycleCounter = 1;
    this.initializeTimeTraveler(position, framePerSecond, sequenceTexture, gameState, rotationStartRadiant, rotationSpeed);
    this.sequenceWidth = this.gs.textures[this.textureIndex].width;
    this.sequenceHeight = this.gs.textures[this.textureIndex].height;
    this.width = Math.trunc(this.sequenceWidth / numberOfCols);
    this.height = Math.trunc(this.sequenceHeight / numberOfRows);
    this.sourceRectangle = new Rectangle(0, 0, this.width, this.height);
    this.origin = new Vector2(this.sourceRectangle.center.x, this.sourceRectangle.center.y);
  }

  override evaluatePosition(delta: number): Vector2 {
    if (this.gs.levelTime.continuum !== 0) {
      this.index = Math.trunc(delta) % this.length;
      this.row = Math.trunc(this.index / this.cols);
      this.col = this.index % this.cols;
      this.sourceRectangle = new Rectangle(this.col * this.width, this.row * this.height, this.width, this.height);
      if (this.index < 0) this.lifeState = LifeState.DELETING;
      if (delta >= this.length * this.cycleCounter) {
        this.addElementRecord((v: unknown) => {
          this.cycleCounter = v as number;
        }, this.cycleCounter);
        this.cycleCounter++;
        if (this.cycleCounter > this.cycles) this.lifeState = LifeState.DEAD;
      }
    }
    // C# returns the struct by value: hand out a copy so callers can't alias startPosition.
    return this.startPosition.clone();
  }

  override toString(): string {
    return (
      '\n\nLength: ' + this.length + '\nRows: ' + this.rows + '\nCols: ' + this.cols +
      '\nFrameWidth: ' + this.width + '\nFrameHeight: ' + this.height +
      '\nWidth: ' + this.sequenceWidth + '\nHeight: ' + this.sequenceHeight +
      '\nIndex: ' + this.index + '\nRow: ' + this.row + '\nCol: ' + this.col +
      '\nDelta: ' + this.delta + '\nLifeState: ' + LifeState[this.lifeState]
    );
  }

  override hasCollided(_value: number, _arg: unknown): void {
    throw new Error('NotImplementedException: Non deve poter collidere!!!');
  }
}
