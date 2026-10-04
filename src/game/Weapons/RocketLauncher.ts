import { Vector2 } from '../../xna';
import type { TimeMachine } from '../Management/TimeMachine';
import type { GameState } from '../State/GameState';
import { Constants, FLOAT_MAX_VALUE } from '../Utilities/Utilities';
import type { IWeapons } from './IWeapons';

/** RocketLauncher: player levels 0 (none)..6, enemy level -1. */
export class RocketLauncher implements IWeapons {
  lastShotTime: number;
  /** Whether this weapon belongs to the player or to an enemy. */
  player: boolean;
  /** C# field `level` (the `Level` property is the `level` accessor below). */
  _level: number;
  startTime = 0;
  /** When the weapon reached its current level. */
  levelStartTime: number;
  gs: GameState;
  ownerTime: TimeMachine;

  constructor(player: boolean, gameState: GameState) {
    this.gs = gameState;
    this.lastShotTime = this.startTime; // 0: startTime is assigned below (QUIRK)
    this.player = player;
    if (player) {
      this._level = this.minLevel;
      this.ownerTime = this.gs.playerTime;
    } else {
      this._level = -1;
      this.ownerTime = this.gs.levelTime;
    }
    this.startTime = this.ownerTime.time;
    this.levelStartTime = this.ownerTime.time;
  }

  update(position: Vector2): void {
    if (!this.gs.pause && this.ownerTime.continuum > 0 && this._level !== 0) {
      if (this.ownerTime.time - this.levelStartTime > this.getLevelDuration(this.level)) {
        this.upgrade(-1);
      }
      if (this.ownerTime.time - this.lastShotTime >= this.getTimeForShooting(this.level)) {
        let y: number;
        if (this.isPlayerWeapon) y = -1;
        else y = 1;

        switch (this.level) {
          case -1:
          case 1:
          case 2:
            this.gs.newRocket(position, new Vector2(0, y), this);
            break;
          case 3: {
            let dir = new Vector2(-Constants.ROCKET_X_DIRECTION, y);
            dir.normalize();
            this.gs.newRocket(position, dir, this);
            dir = new Vector2(0, y);
            this.gs.newRocket(position, dir, this);
            dir = new Vector2(Constants.ROCKET_X_DIRECTION, y);
            dir.normalize();
            this.gs.newRocket(position, dir, this);
            break;
          }
          case 4:
          case 5:
            this.gs.newFollowingRocket(position, new Vector2(0, y), this);
            break;
          case 6: {
            let dir = new Vector2(-Constants.ROCKET_X_DIRECTION, y);
            dir.normalize();
            this.gs.newFollowingRocket(position, dir, this);
            dir = new Vector2(0, y);
            this.gs.newFollowingRocket(position, dir, this);
            dir = new Vector2(Constants.ROCKET_X_DIRECTION, y);
            dir.normalize();
            this.gs.newFollowingRocket(position, dir, this);
            break;
          }
          default:
            throw new Error('Impossibile che ci sia il livello di potenziamento ' + this.level + ' in RocketLauncher');
        }
        this.lastShotTime = this.ownerTime.time;
      }
    }
    if (!this.gs.pause && this.ownerTime.continuum < 0) {
      if (this.ownerTime.time - this.lastShotTime < 0) {
        this.lastShotTime = this.lastShotTime - this.getTimeForShooting(this.level);
      }
    }
  }

  getDamage(level: number): number {
    switch (level) {
      case -1: return 4;
      case 1: return 4;
      case 2: return 5;
      case 3: return 5;
      case 4: return 6;
      case 5: return 7;
      case 6: return 7;
      default:
        throw new Error('Il numero di livello specificato (' + level + ') è inesistente per l\'arma RocketLauncher');
    }
  }

  getSpeed(level: number): number {
    switch (level) {
      case -1: return 300;
      case 1: return 300;
      case 2: return 400;
      case 3: return 400;
      case 4: return 500;
      case 5: return 600;
      case 6: return 600;
      default:
        throw new Error('Il numero di livello specificato (' + level + ') è inesistente per l\'arma RocketLauncher');
    }
  }

  getTimeForShooting(level: number): number {
    switch (level) {
      case -1: return 3.0;
      case 1: return 2.0;
      case 2: return 1.6;
      case 3: return 1.6;
      case 4: return 1.6;
      case 5: return 1.3;
      case 6: return 1.3;
      case 0: return 0;
      default:
        throw new Error('Il numero di livello specificato (' + level + ') è inesistente per l\'arma RocketLauncher');
    }
  }

  getLevelDuration(level: number): number {
    switch (level) {
      case -1: return FLOAT_MAX_VALUE;
      case 1: return FLOAT_MAX_VALUE;
      case 2: return 30;
      case 3: return 25;
      case 4: return 20;
      case 5: return 15;
      case 6: return 10;
      default:
        throw new Error('Il numero di livello specificato (' + level + ') è inesistente per l\'arma Gun');
    }
  }

  upgrade(numOfLevels: number): boolean {
    this._level = this._level + numOfLevels;
    this.levelStartTime = this.ownerTime.time;
    if (this._level > this.maxLevel) this._level = this.maxLevel;
    if (this._level < this.minLevel) this._level = this.minLevel;
    return true;
  }

  get isPlayerWeapon(): boolean {
    if (this._level >= 0) return true;
    else return false;
  }

  /** C# Level property: the setter only applies values <= MaxLevel and does not touch levelStartTime. */
  get level(): number {
    return this._level;
  }
  set level(value: number) {
    if (value <= this.maxLevel) this._level = value;
  }

  get maxLevel(): number {
    return 6;
  }

  get minLevel(): number {
    return 0;
  }
}
