import { Vector2 } from '../../xna';
import { Constants, LifeState, Utility } from '../Utilities/Utilities';
import type { DynamicNormalRandomVariable } from '../Utilities/DynamicNormalRandomVariable';
import { TimeDependentVar } from '../Utilities/TimeDependentVar';
import type { GameState } from '../State/GameState';
import { Randomizer } from './Randomizer';

/** Spawns tachyon streams (at most one at a time). */
export class TachyonStreamRandomizer extends Randomizer {
  /** Duration of the launched TachyonStreams. */
  durationRV!: DynamicNormalRandomVariable;

  constructor();
  constructor(
    probability: number,
    probabilityIncrementPerMinute: number | null,
    probabilityMax: number | null,
    durationRandomVariable: DynamicNormalRandomVariable,
    maxSecondsWithoutTachyonStream: TimeDependentVar | null,
    texture: string,
    gameState: GameState,
  );
  constructor(
    probability?: number,
    probabilityIncrementPerMinute?: number | null,
    probabilityMax?: number | null,
    durationRandomVariable?: DynamicNormalRandomVariable,
    maxSecondsWithoutTachyonStream?: TimeDependentVar | null,
    texture?: string,
    gameState?: GameState,
  ) {
    super();
    if (probability === undefined) return;
    this.initializeRandomizer(
      probability,
      probabilityIncrementPerMinute ?? null,
      probabilityMax ?? null,
      new TimeDependentVar(1, null, null, null, null),
      maxSecondsWithoutTachyonStream ?? null,
      texture!,
      gameState!,
    );

    this.durationRV = durationRandomVariable!;
  }

  override evaluatePosition(delta: number): Vector2 {
    this.durationRV.update(delta);
    return super.evaluatePosition(delta);
  }

  protected override getAliveElementsCount(): number {
    return this.gs.tachyonStream != null &&
      (this.gs.tachyonStream.lifeState === LifeState.NORMAL || this.gs.tachyonStream.lifeState === LifeState.DAMAGED)
      ? 1
      : 0;
  }

  protected override launch(): void {
    if (
      this.gs.tachyonStream == null ||
      this.gs.tachyonStream.lifeState === LifeState.DEAD ||
      this.gs.tachyonStream.lifeState === LifeState.DELETING
    )
      this.gs.newTachyonStream(
        Utility.nextRandomInt(
          Math.trunc(Constants.TACHYON_STREAM_WIDTH / 2),
          Constants.SCREEN_WIDTH - Math.trunc(Constants.TACHYON_STREAM_WIDTH / 2),
        ),
        this.durationRV.next(),
        this.texture,
      );
  }

  override hasCollided(_value: number, _arg: unknown): void {}
}
