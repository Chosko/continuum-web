import type { Vector2 } from '../../xna';

/** Weapon interface. */
export interface IWeapons {
  readonly level: number;
  readonly maxLevel: number;
  readonly minLevel: number;
  readonly isPlayerWeapon: boolean;
  update(position: Vector2): void;
  upgrade(numOfLevels: number): boolean;
  getDamage(level: number): number;
  getSpeed(level: number): number;
  getTimeForShooting(level: number): number;
  getLevelDuration(level: number): number;
}
