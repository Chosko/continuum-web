import { Vector2, type ContentManager, type Texture2D } from '../../xna';
import type { GameState } from '../State/GameState';
import { DynamicNormalRandomVariable } from '../Utilities/DynamicNormalRandomVariable';
import type { LevelElement } from '../Utilities/LevelElement';
import { LevelReader } from '../Utilities/LevelReader';
import { TimeDependentVar } from '../Utilities/TimeDependentVar';
import { PowerUpType, Utility } from '../Utilities/Utilities';

/** C# Convert.ToInt32(string): null → 0, strict integer parsing otherwise. */
function convertToInt32(s: string | null): number {
  if (s === null) return 0;
  const t = s.trim();
  if (!/^[+-]?\d+$/.test(t)) throw new Error('FormatException: Input string was not in a correct format. ("' + s + '")');
  const v = parseInt(t, 10);
  if (v > 2147483647 || v < -2147483648) throw new Error('OverflowException: Value was either too large or too small for an Int32.');
  return v;
}

/** Optional float attribute: null when absent. */
function optFloat(element: LevelElement, name: string): number | null {
  return element.attribute(name) === null ? null : Utility.stringToFloat(element.attribute(name));
}

/** Reads the level file: textures, random variables and the timeline of scripted events. */
export class LevelManager {
  private gs: GameState;
  private myReader: LevelReader;
  private element: LevelElement;
  private randomVariablesDictionary: Map<string, DynamicNormalRandomVariable> = new Map();
  private timeDependentVarsDictionary: Map<string, TimeDependentVar> = new Map();

  readonly title: string | null;
  readonly subtitle: string | null;
  readonly duration: number;
  readonly numberOfBackgroundLevels: number;

  private _isLevelFinished: boolean;
  get isLevelFinished(): boolean {
    return this._isLevelFinished;
  }

  constructor(gs: GameState, levelFile: string) {
    this.gs = gs;
    this.myReader = new LevelReader('Levels/' + levelFile);

    this.element = this.myReader.current;
    this.title = this.element.attribute('title');
    this.subtitle = this.element.attribute('subtitle');
    this.duration = convertToInt32(this.element.attribute('duration'));
    this.numberOfBackgroundLevels = convertToInt32(this.element.attribute('numlevels'));
    this._isLevelFinished = false;
    this.myReader.moveNext();
  }

  getTextures(cm: ContentManager): void {
    this.element = this.myReader.current;
    if (this.element.name === 'texturesDeclaration') {
      this.myReader.moveNext();
      this.element = this.myReader.current;
    } else return;

    const tmpList: Texture2D[] = [];
    let textureindex = 0;
    while (this.element.name === 'texture') {
      tmpList.push(cm.load<Texture2D>(this.element.attribute('path')!));
      this.gs.textureIndices.add(textureindex, this.element.attribute('id')!);
      textureindex++;
      this.myReader.moveNext();
      this.element = this.myReader.current;
    }

    this.gs.textures = tmpList.slice();

    this.gs.setPlayerBounds();
  }

  getRandomVariables(): void {
    this.element = this.myReader.current;
    if (this.element.name === 'randomVariablesDeclaration') {
      this.myReader.moveNext();
      this.element = this.myReader.current;
    } else return;

    this.randomVariablesDictionary = new Map<string, DynamicNormalRandomVariable>();
    this.timeDependentVarsDictionary = new Map<string, TimeDependentVar>();

    while (this.element.name === 'randomVariable' || this.element.name === 'timeDependentVar') {
      const element = this.element;
      if (element.name === 'randomVariable') {
        const id = element.attribute('id')!;
        const mean = Utility.stringToFloat(element.attribute('mean'));
        const standardDeviation = Utility.stringToFloat(element.attribute('standardDeviation'));
        const meanIncrementPerMinute = optFloat(element, 'meanIncrementPerMinute');
        const maxValue = optFloat(element, 'maxValue');
        const minValue = optFloat(element, 'minValue');
        if (this.randomVariablesDictionary.has(id)) throw new Error('ArgumentException: duplicate key ' + id);
        this.randomVariablesDictionary.set(
          id,
          new DynamicNormalRandomVariable(mean, standardDeviation, meanIncrementPerMinute, maxValue, minValue),
        );
        this.myReader.moveNext();
        this.element = this.myReader.current;
      } else if (element.name === 'timeDependentVar') {
        const id = element.attribute('id')!;
        const initialValue = Utility.stringToFloat(element.attribute('initialValue'));
        const valueIncrementPerMinute = optFloat(element, 'valueIncrementPerMinute');
        const valueDecrementPerMinute = optFloat(element, 'valueDecrementPerMinute');
        const maxValue = optFloat(element, 'maxValue');
        const minValue = optFloat(element, 'minValue');
        if (this.timeDependentVarsDictionary.has(id)) throw new Error('ArgumentException: duplicate key ' + id);
        this.timeDependentVarsDictionary.set(
          id,
          new TimeDependentVar(initialValue, maxValue, minValue, valueIncrementPerMinute, valueDecrementPerMinute),
        );
        this.myReader.moveNext();
        this.element = this.myReader.current;
      }
    }
  }

  goToStartLevel(): void {
    this.element = this.myReader.current;
    if (this.element.name === 'startlevel') {
      this.myReader.moveNext();
      this.element = this.myReader.current;
    } else {
      throw new Error('Errore di sintassi nel file di livello');
    }
  }

  /** Dictionary.TryGetValue (C# throws ArgumentNullException on a null key). */
  private tryGetRV(key: string | null): DynamicNormalRandomVariable | null {
    if (key === null) throw new Error('ArgumentNullException: key');
    return this.randomVariablesDictionary.get(key) ?? null;
  }
  private tryGetTDV(key: string): TimeDependentVar | null {
    return this.timeDependentVarsDictionary.get(key) ?? null;
  }

  update(): void {
    const gs = this.gs;
    if (gs.levelTime.continuum > 0) {
      if (!this._isLevelFinished) {
        this.element = this.myReader.current;
        while (
          !this._isLevelFinished &&
          (this.element.attribute('timestamp') === null ||
            convertToInt32(this.element.attribute('timestamp')) <= gs.levelTime.time)
        ) {
          const element = this.element;
          switch (element.name) {
            case 'backgroundTexture':
              gs.newBackgroundTexture(
                convertToInt32(element.attribute('level')),
                convertToInt32(element.attribute('speed')),
                element.attribute('texture')!,
                element.attribute('transitionTexture'),
              );
              break;
            case 'asteroid':
              gs.newAsteroid(
                convertToInt32(element.attribute('xposition')),
                convertToInt32(element.attribute('speed')),
                convertToInt32(element.attribute('life')),
                element.attribute('texture')!,
              );
              break;
            case 'endlevel':
              this._isLevelFinished = true;
              break;
            case 'animation':
              gs.newAnimation(
                new Vector2(convertToInt32(element.attribute('x')), convertToInt32(element.attribute('y'))),
                element.attribute('texture')!,
                convertToInt32(element.attribute('frames')),
                convertToInt32(element.attribute('rows')),
                convertToInt32(element.attribute('cols')),
                convertToInt32(element.attribute('fps')),
                Utility.stringToFloat(element.attribute('rotation')),
                Utility.stringToFloat(element.attribute('rotationspeed')),
              );
              break;
            case 'enemy': {
              const powerUpTypeString = element.attribute('powerup');
              let powerUpType: PowerUpType;
              switch (powerUpTypeString) {
                case 'Gun':
                  powerUpType = PowerUpType.GUN;
                  break;
                case 'Rocket':
                  powerUpType = PowerUpType.ROCKET;
                  break;
                case null:
                  powerUpType = PowerUpType.NONE;
                  break;
                default:
                  throw new Error('InvalidCastException: Argomento non valido');
              }
              gs.newEnemy(
                new Vector2(convertToInt32(element.attribute('x')), convertToInt32(element.attribute('y'))),
                Utility.stringToFloat(element.attribute('speed')),
                element.attribute('texture')!,
                element.attribute('weapon'),
                convertToInt32(element.attribute('life')),
                powerUpType,
              );
              break;
            }
            case 'tachyonStream':
              gs.newTachyonStream(
                convertToInt32(element.attribute('xposition')),
                Utility.stringToFloat(element.attribute('duration')),
                element.attribute('texture')!,
              );
              break;
            case 'asteroidRandomizer': {
              const probabilityA = Utility.stringToFloat(element.attribute('launchProbabilityPerSecond'));
              const probabilityIncrementPerMinuteA = optFloat(element, 'probabilityIncrementPerMinute');
              // QUIRK: the level file spells it "pobabilityMax", so this is always null.
              const probabilityMaxA = optFloat(element, 'probabilityMax');
              let maxSimultaneousAsteroids: TimeDependentVar | null = null;
              let maxSecondsWithoutAsteroids: TimeDependentVar | null = null;
              const speedRVA = this.tryGetRV(element.attribute('speedRandomVariable'));
              const lifeRVA = this.tryGetRV(element.attribute('lifeRandomVariable'));
              if (element.attribute('maxSimultaneousAsteroids') !== null)
                maxSimultaneousAsteroids = this.tryGetTDV(element.attribute('maxSimultaneousAsteroids')!);
              if (element.attribute('maxSecondsWithoutAsteroids') !== null)
                maxSecondsWithoutAsteroids = this.tryGetTDV(element.attribute('maxSecondsWithoutAsteroids')!);
              gs.newAsteroidRandomizer(
                probabilityA,
                probabilityIncrementPerMinuteA,
                probabilityMaxA,
                speedRVA,
                lifeRVA,
                maxSimultaneousAsteroids,
                maxSecondsWithoutAsteroids,
                element.attribute('texture')!,
              );
              break;
            }
            case 'enemyRandomizer': {
              const probabilityE = Utility.stringToFloat(element.attribute('launchProbabilityPerSecond'));
              const probabilityIncrementPerMinuteE = optFloat(element, 'probabilityIncrementPerMinute');
              const probabilityMaxE = optFloat(element, 'probabilityMax');
              const powerUpProbabilityPerLaunch = optFloat(element, 'powerUpProbabilityPerLaunch');
              const rocketPowerUpProbability = optFloat(element, 'rocketPowerUpProbability');
              const granadePowerUpProbability = optFloat(element, 'granadePowerUpProbability');
              let maxSimultaneousEnemies: TimeDependentVar | null = null;
              let maxSecondsWithoutEnemies: TimeDependentVar | null = null;
              const speedRVE = this.tryGetRV(element.attribute('speedRandomVariable'));
              const lifeRVE = this.tryGetRV(element.attribute('lifeRandomVariable'));
              if (element.attribute('maxSimultaneousEnemies') !== null)
                maxSimultaneousEnemies = this.tryGetTDV(element.attribute('maxSimultaneousEnemies')!);
              if (element.attribute('maxSecondsWithoutEnemies') !== null)
                maxSecondsWithoutEnemies = this.tryGetTDV(element.attribute('maxSecondsWithoutEnemies')!);
              gs.newEnemyRandomizer(
                probabilityE,
                probabilityIncrementPerMinuteE,
                probabilityMaxE,
                powerUpProbabilityPerLaunch,
                rocketPowerUpProbability,
                granadePowerUpProbability,
                speedRVE,
                lifeRVE,
                maxSimultaneousEnemies,
                maxSecondsWithoutEnemies,
                element.attribute('weapon')!,
                element.attribute('texture')!,
              );
              break;
            }
            case 'tachyonStreamRandomizer': {
              const probabilityT = Utility.stringToFloat(element.attribute('launchProbabilityPerSecond'));
              const probabilityIncrementPerMinuteT = optFloat(element, 'probabilityIncrementPerMinute');
              const probabilityMaxT = optFloat(element, 'probabilityMax');
              const durationRVT = this.tryGetRV(element.attribute('durationRandomVariable'));
              gs.newTachyonStreamRandomizer(
                probabilityT,
                probabilityIncrementPerMinuteT,
                probabilityMaxT,
                durationRVT,
                element.attribute('texture')!,
              );
              break;
            }
          }
          if (!this._isLevelFinished) {
            this.myReader.moveNext();
            this.element = this.myReader.current;
          }
        }
      }
    } else {
      while (
        this.myReader.previous!.attribute('timestamp') !== null &&
        convertToInt32(this.myReader.previous!.attribute('timestamp')) >= gs.levelTime.time
      ) {
        if (this._isLevelFinished) this._isLevelFinished = false;
        this.myReader.movePrevious();
      }
    }
  }
}
