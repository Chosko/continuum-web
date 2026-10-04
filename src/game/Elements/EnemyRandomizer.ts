import { Vector2 } from '../../xna';
import { Constants, LifeState, PowerUpType, Utility } from '../Utilities/Utilities';
import type { DynamicNormalRandomVariable } from '../Utilities/DynamicNormalRandomVariable';
import type { TimeDependentVar } from '../Utilities/TimeDependentVar';
import type { GameState } from '../State/GameState';
import { Randomizer } from './Randomizer';

/** Spawns enemies, possibly carrying a power-up. */
export class EnemyRandomizer extends Randomizer {
  speedRV!: DynamicNormalRandomVariable;
  lifeRV!: DynamicNormalRandomVariable;
  powerUpProbability = 0;
  rocketProbability = 0;
  granadeProbability = 0;
  weapon = '';

  constructor();
  constructor(
    probability: number,
    probabilityIncrementPerMinute: number | null,
    probabilityMax: number | null,
    powerUpProbabilityPerLaunch: number | null,
    rocketPowerUpProbability: number | null,
    granadePowerUpProbability: number | null,
    speedRandomVariable: DynamicNormalRandomVariable,
    lifeRandomVariable: DynamicNormalRandomVariable,
    maxSimultaneousEnemies: TimeDependentVar | null,
    maxSecondsWithoutEnemies: TimeDependentVar | null,
    weapon: string,
    texture: string,
    gameState: GameState,
  );
  constructor(
    probability?: number,
    probabilityIncrementPerMinute?: number | null,
    probabilityMax?: number | null,
    powerUpProbabilityPerLaunch?: number | null,
    rocketPowerUpProbability?: number | null,
    granadePowerUpProbability?: number | null,
    speedRandomVariable?: DynamicNormalRandomVariable,
    lifeRandomVariable?: DynamicNormalRandomVariable,
    maxSimultaneousEnemies?: TimeDependentVar | null,
    maxSecondsWithoutEnemies?: TimeDependentVar | null,
    weapon?: string,
    texture?: string,
    gameState?: GameState,
  ) {
    super();
    if (probability === undefined) return;
    this.initializeRandomizer(
      probability,
      probabilityIncrementPerMinute ?? null,
      probabilityMax ?? null,
      maxSimultaneousEnemies ?? null,
      maxSecondsWithoutEnemies ?? null,
      texture!,
      gameState!,
    );
    this.powerUpProbability = powerUpProbabilityPerLaunch == null ? 0 : powerUpProbabilityPerLaunch;
    this.rocketProbability = rocketPowerUpProbability == null ? 0 : rocketPowerUpProbability;
    this.granadeProbability = granadePowerUpProbability == null ? 0 : granadePowerUpProbability;
    this.weapon = weapon!;
    this.speedRV = speedRandomVariable!;
    this.lifeRV = lifeRandomVariable!;
  }

  override evaluatePosition(delta: number): Vector2 {
    // Update the random variables
    this.speedRV.update(delta);
    this.lifeRV.update(delta);

    return super.evaluatePosition(delta);
  }

  protected override launch(): void {
    let r = Utility.nextRandomDouble(0, 1);
    let t = PowerUpType.NONE;
    if (r < this.powerUpProbability) {
      r = Utility.nextRandomDouble(0, 1);
      if (r < this.rocketProbability) t = PowerUpType.ROCKET;
      else if (r < this.granadeProbability + this.rocketProbability) t = PowerUpType.GRANADE;
      else t = PowerUpType.GUN;
    }
    this.gs.newEnemy(
      new Vector2(Utility.nextRandomInt(-30, Constants.SCREEN_WIDTH + 30), -50),
      this.speedRV.next(),
      this.texture,
      this.weapon,
      Math.trunc(this.lifeRV.next()),
      t,
    );
  }

  protected override getAliveElementsCount(): number {
    let count = 0;
    for (const e of this.gs.enemies) {
      if (e.lifeState === LifeState.NORMAL || e.lifeState === LifeState.DAMAGED) count++;
    }
    return count;
  }

  override hasCollided(_value: number, _arg: unknown): void {}
}
