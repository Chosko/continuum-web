import { Vector2 } from '../../xna';
import { Constants, LifeState, Utility } from '../Utilities/Utilities';
import type { DynamicNormalRandomVariable } from '../Utilities/DynamicNormalRandomVariable';
import type { TimeDependentVar } from '../Utilities/TimeDependentVar';
import type { GameState } from '../State/GameState';
import { Randomizer } from './Randomizer';

/** Spawns asteroids. */
export class AsteroidRandomizer extends Randomizer {
  /** Speed of the launched asteroids. */
  speedRV!: DynamicNormalRandomVariable;
  /** Life of the launched asteroids. */
  lifeRV!: DynamicNormalRandomVariable;

  constructor();
  constructor(
    probability: number,
    probabilityIncrementPerMinute: number | null,
    probabilityMax: number | null,
    speedRandomVariable: DynamicNormalRandomVariable,
    lifeRandomVariable: DynamicNormalRandomVariable,
    maxSimultaneousAsteroids: TimeDependentVar | null,
    maxSecondsWithoutAsteroids: TimeDependentVar | null,
    texture: string,
    gameState: GameState,
  );
  constructor(
    probability?: number,
    probabilityIncrementPerMinute?: number | null,
    probabilityMax?: number | null,
    speedRandomVariable?: DynamicNormalRandomVariable,
    lifeRandomVariable?: DynamicNormalRandomVariable,
    maxSimultaneousAsteroids?: TimeDependentVar | null,
    maxSecondsWithoutAsteroids?: TimeDependentVar | null,
    texture?: string,
    gameState?: GameState,
  ) {
    super();
    if (probability === undefined) return;
    this.initializeRandomizer(
      probability,
      probabilityIncrementPerMinute ?? null,
      probabilityMax ?? null,
      maxSimultaneousAsteroids ?? null,
      maxSecondsWithoutAsteroids ?? null,
      texture!,
      gameState!,
    );

    this.speedRV = speedRandomVariable!;
    this.lifeRV = lifeRandomVariable!;
  }

  override evaluatePosition(delta: number): Vector2 {
    this.speedRV.update(delta);
    this.lifeRV.update(delta);
    return super.evaluatePosition(delta);
  }

  protected override getAliveElementsCount(): number {
    let count = 0;
    for (const a of this.gs.asteroids) {
      if (a.lifeState === LifeState.DAMAGED || a.lifeState === LifeState.NORMAL) count++;
    }
    return count;
  }

  protected override launch(): void {
    this.gs.newAsteroid(
      Utility.nextRandomInt(0, Constants.SCREEN_WIDTH),
      Math.trunc(this.speedRV.next()),
      Math.trunc(this.lifeRV.next()),
      this.texture,
    );
  }

  override hasCollided(_value: number, _arg: unknown): void {}
}
