import { Rectangle, Vector2 } from '../../xna';
import { LifeState, type RewindMethod } from '../Utilities/Utilities';
import { ElementRecord } from '../Utilities/ElementRecord';
import { LinkedList } from '../Utilities/LinkedList';
import type { GameState } from '../State/GameState';

/**
 * Abstract class for a generic object able to travel in time.
 * Its position is a pure function of levelTime; discrete changes are journaled as ElementRecords.
 * NOTE: keep this module free of runtime imports that cycle back to GameState/Elements.
 */
export abstract class TimeTraveler {
  /** Start position of the TimeTraveler. */
  startPosition: Vector2 = new Vector2();
  /** Start rotation of the TimeTraveler. */
  startRotation = 0;
  /** If true, Update is not allowed. Normally false. */
  blockUpdate = false;
  /** The TimeTraveler's ElementRecords (newest first). */
  elementRecords!: LinkedList<ElementRecord>;
  /**
   * Last evaluation of the current position.
   * (C# has both the field `currentPosition` and the read-only property `CurrentPosition` returning it:
   * both map to this field.)
   */
  currentPosition: Vector2 = new Vector2();
  /** Index of the texture used to render the TimeTraveler. */
  textureIndex = 0;
  /** Current life state (backing field of lifeState). */
  lifeS: LifeState = LifeState.NORMAL;
  /** The game state. */
  gs!: GameState;
  deathCounter = 0;
  deathTime = 0;
  delta = 0;
  speed = 0;
  rotationSpeed = 0;
  rotationDelta = 0;
  startTime = 0;
  /** Source rectangle in the texture (null = whole texture). */
  sourceRectangle: Rectangle | null = null;
  rotation = 0;
  origin: Vector2 = new Vector2();
  elapsedTime = 0;
  width = 0;
  height = 0;

  /** Destination rectangle for rendering. */
  get destinationRectangle(): Rectangle {
    return new Rectangle(Math.trunc(this.currentPosition.x), Math.trunc(this.currentPosition.y), this.width, this.height);
  }

  get lifeState(): LifeState {
    return this.lifeS;
  }

  set lifeState(value: LifeState) {
    if (this.lifeS !== LifeState.DELETING && value !== LifeState.DELETING) {
      if (this.lifeS !== LifeState.DEAD && value === LifeState.DEAD) this.deathTime = this.gs.levelTime.time;
      if (this.gs.levelTime.continuum > 0 && value !== this.lifeS) {
        this.addElementRecord((v: unknown) => {
          this.lifeS = v as LifeState;
        }, this.lifeS);
        this.lifeS = value;
      }
    } else this.lifeS = LifeState.DELETING;
  }

  get top(): number {
    return this.destinationRectangle.top;
  }

  get bottom(): number {
    return this.destinationRectangle.bottom;
  }

  /**
   * C# overloads:
   *  InitializeTimeTraveler(StartPosition, Speed, TextureName, gameState)
   *  InitializeTimeTraveler(StartPosition, Speed, TextureName, gameState, StartRotation, RotationSpeed)
   */
  protected initializeTimeTraveler(
    startPosition: Vector2,
    speed: number,
    textureName: string,
    gameState: GameState,
    startRotation?: number,
    rotationSpeed?: number,
  ): void {
    this.textureIndex = gameState.textureIndices.getTextureIndex(textureName);
    this.startPosition = startPosition.clone();
    this.currentPosition = startPosition.clone();
    this.lifeS = LifeState.NORMAL;
    this.gs = gameState;
    this.deathCounter = 0;
    this.deathTime = 0;
    this.delta = 0;
    this.speed = speed;
    if (startRotation === undefined || rotationSpeed === undefined) {
      this.startRotation = 0;
      this.rotationSpeed = 0;
    } else {
      this.startRotation = startRotation;
      this.rotation = this.startRotation;
      this.rotationSpeed = rotationSpeed;
    }
    this.startTime = this.gs.levelTime.time;
    this.elapsedTime = 0;
    this.width = this.gs.textures[this.textureIndex].width;
    this.height = this.gs.textures[this.textureIndex].height;
    this.origin = new Vector2(Math.trunc(this.width / 2), Math.trunc(this.height / 2));
    this.sourceRectangle = null;
    this.elementRecords = new LinkedList<ElementRecord>();
    this.blockUpdate = false;
  }

  /** Updates the TimeTraveler. */
  update(): void {
    if (!this.blockUpdate) {
      this.evaluateDelta();

      if (this.elementRecords.last !== null && this.gs.levelTime.time - this.elementRecords.last.value.time > this.gs.timeTank)
        this.elementRecords.removeLast();

      while (this.elementRecords.first !== null && this.elementRecords.first.value.time > this.gs.levelTime.time) {
        this.elementRecords.first.value.rewind();
        this.elementRecords.removeFirst();
      }

      this.currentPosition = this.evaluatePosition(this.delta);
      this.rotation = this.evaluateRotation(this.rotationDelta);

      if (this.lifeState === LifeState.DEAD) {
        this.deathCounter = this.gs.levelTime.time - this.deathTime;
        if (this.deathCounter > this.gs.timeTank) this.lifeState = LifeState.DELETING;
      }
    }

    if (this.gs.levelTime.time < this.startTime) this.lifeState = LifeState.DELETING;
  }

  /** Evaluates the rotation (base: uses the field rotationDelta, not the parameter). */
  protected evaluateRotation(_rotationDelta: number): number {
    return this.startRotation + this.rotationDelta;
  }

  protected evaluateDelta(): void {
    this.elapsedTime = this.gs.levelTime.time - this.startTime;
    this.delta = this.elapsedTime * this.speed;
    this.rotationDelta = this.elapsedTime * this.rotationSpeed;
  }

  /** Adds an ElementRecord (only when level time flows forward). */
  addElementRecord(rewind: RewindMethod, value: unknown): void {
    if (this.gs.levelTime.continuum > 0)
      this.elementRecords.addFirst(new ElementRecord(this.gs.levelTime.time, rewind, value));
  }

  /** Evaluates the position from the delta. */
  abstract evaluatePosition(delta: number): Vector2;

  /** Collision response. */
  abstract hasCollided(value: number, arg: unknown): void;
}
