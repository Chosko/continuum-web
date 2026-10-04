import { Vector2 } from '../../xna';
import { Constants, LifeState, TextureConstant, Utility } from '../Utilities/Utilities';
import type { GameState } from '../State/GameState';
import { Animation } from './Animation';
import { Tachyon } from './Tachyon';

/** Animation that emits Tachyons; slows level time near the player (see TimeManager). */
export class TachyonStream extends Animation {
  duration = 0;
  wait = 0;
  falloff = 0;

  constructor();
  constructor(xPosition: number, duration: number, sequenceTexture: string, gameState: GameState);
  constructor(xPosition?: number, duration?: number, sequenceTexture?: string, gameState?: GameState) {
    // C# `: base(...)` (or the parameterless base() for the parameterless ctor). The cast only selects
    // an Animation overload for the type checker; the runtime arguments are forwarded unchanged.
    super(
      ...((xPosition === undefined
        ? []
        : [
            new Vector2(xPosition, Math.trunc(Constants.SCREEN_HEIGHT / 2)),
            sequenceTexture!,
            40,
            2,
            20,
            Math.trunc(Math.fround((40 * 3) / duration!)),
            3,
            0,
            0,
            gameState!,
          ]) as []),
    );
    if (xPosition === undefined) return;
    this.duration = duration!;
    this.wait = 0;

    this.stretchRatio = Constants.TACHYON_STREAM_WIDTH / this.width;
  }

  override evaluatePosition(delta: number): Vector2 {
    if (this.lifeState !== LifeState.DEAD && this.gs.playerTime.continuum > 0) {
      if (this.wait <= 0) {
        this.falloff = (-Math.abs(this.duration / 2 - this.elapsedTime) + this.duration / 2) / (this.duration / 2);
        const halfWidth = Math.trunc(Constants.TACHYON_STREAM_WIDTH / 2);
        const t = new Tachyon(
          Math.trunc(this.currentPosition.x + Utility.nextRandomInt(-halfWidth, halfWidth) * this.falloff),
          Utility.nextRandomFloat(Constants.MIN_TACHYON_SPEED, Constants.MAX_TACHYON_SPEED),
          TextureConstant.TACHYON,
          this.gs,
        );
        this.gs.tachyons.addFirst(t);
        this.gs.collisions.insert(t);
        this.wait =
          Utility.nextRandomFloat(Constants.MIN_TACHYON_DELAY_INDEX, Constants.MAX_TACHYON_DELAY_INDEX) /
          (this.falloff + Constants.MIN_TACHYON_DELAY_INDEX);
      }
      if (this.gs.playerTime.continuum > 0) this.wait = this.wait - this.gs.playerTime.elapsedContinuumTime;
    }
    return super.evaluatePosition(delta);
  }
}
