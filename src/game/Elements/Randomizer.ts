import { Vector2 } from '../../xna';
import { Constants, Utility } from '../Utilities/Utilities';
import type { TimeDependentVar } from '../Utilities/TimeDependentVar';
import type { GameState } from '../State/GameState';
import { TimeTraveler } from './TimeTraveler';

/** Abstract probabilistic spawner (speed 1, so Delta = seconds since creation). */
export abstract class Randomizer extends TimeTraveler {
  second = 0;
  initialProbability = 0;
  probability = 0;
  probabilityIncrementPerMinute = 0;
  probabilityMax = 0;
  texture = '';

  /** Max number of simultaneously alive elements. */
  private maxSimultaneousElements: TimeDependentVar | null = null;
  /** Max seconds without alive elements on screen. */
  private maxSecondsWithoutElements: TimeDependentVar | null = null;
  /** Last moment an alive element was found. */
  private aliveElementFoundAt = 0;
  /** Last moment the alive elements were counted (avoids recounting). */
  private aliveElementsCountUpdatedAt = 0;
  /** Number of alive elements (C# field aliveElementsCount; renamed: clashes with the method). */
  private aliveElementsCountValue = 0;

  protected initializeRandomizer(
    probability: number,
    probabilityIncrementPerMinute: number | null,
    probabilityMax: number | null,
    maxSimultaneousElements: TimeDependentVar | null,
    maxSecondsWithoutElements: TimeDependentVar | null,
    texture: string,
    gameState: GameState,
  ): void {
    this.initialProbability = probability;
    this.probability = this.initialProbability;
    this.probabilityIncrementPerMinute = probabilityIncrementPerMinute !== null ? probabilityIncrementPerMinute : 0;
    this.probabilityMax = probabilityMax !== null ? probabilityMax : 1;
    this.texture = texture;
    this.maxSimultaneousElements = maxSimultaneousElements;
    this.maxSecondsWithoutElements = maxSecondsWithoutElements;
    this.initializeTimeTraveler(Vector2.Zero, 1, texture, gameState);
    this.aliveElementFoundAt = 0;
    this.aliveElementsCountUpdatedAt = -1;
    this.aliveElementsCountValue = 0;
    this.second = 0;
  }

  override evaluatePosition(delta: number): Vector2 {
    if (this.maxSecondsWithoutElements !== null) {
      this.maxSecondsWithoutElements.update(delta);
    }

    if (this.maxSimultaneousElements !== null) {
      this.maxSimultaneousElements.update(delta);
    }

    if (delta > this.second && this.gs.levelTime.continuum > 0) {
      this.probability = this.initialProbability + (this.probabilityIncrementPerMinute * delta) / 60;
      if (this.probability > this.probabilityMax) this.probability = this.probabilityMax;
      const launches = this.testLaunch();
      if (launches > 0) {
        for (let i = 0; i < launches; i++) {
          if (this.maxSimultaneousElements === null || this.aliveElementsCount(delta) < this.maxSimultaneousElements.value)
            this.launch();
        }
      }
    }
    this.second = Math.trunc(delta) + 1;

    if (this.maxSecondsWithoutElements !== null) {
      if (this.aliveElementsCount(delta) > 0) {
        this.aliveElementFoundAt = delta;
      }
      // QUIRK: can never be true (kept as in the original)
      if (this.aliveElementFoundAt > delta + this.maxSecondsWithoutElements.value) {
        this.launch(); // launch a new element when the max time without elements expired
        this.aliveElementFoundAt = delta;
      }
    }

    return Vector2.Zero;
  }

  /** Returns the number of alive elements, counting them at most once per Delta. */
  private aliveElementsCount(delta: number): number {
    if (this.aliveElementsCountUpdatedAt !== delta) {
      this.aliveElementsCountValue = this.getAliveElementsCount();
      this.aliveElementsCountUpdatedAt = delta;
    }
    return this.aliveElementsCountValue;
  }

  protected abstract getAliveElementsCount(): number;

  /** Launches a new element. */
  protected abstract launch(): void;

  /** Returns how many elements to launch. */
  private testLaunch(): number {
    const r = Utility.nextRandomFloat(0, 1);
    let factor = 1;
    let launches = 0;
    for (let i = 0; i < Constants.MAX_RANDOMIZER_LAUNCHES; i++) {
      if (r < this.probability / factor) launches++;
      else break;
      factor *= 4;
    }
    return launches;
  }
}
