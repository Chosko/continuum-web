import { Color, Random, Rectangle, Vector2 } from '../../xna';

/** Restores a variable to its previous state when travelling back in time. */
export type RewindMethod = (value: any) => void;

/** C# float.MaxValue. */
export const FLOAT_MAX_VALUE = 3.4028234663852886e38;

/** All game constants. */
export class Constants {
  /** Initial damage of a single grenade explosion particle. */
  static readonly GRANADE_DAMAGE = 10;
  /** Max number of scores kept in storage. */
  static readonly MAX_SCORES = 10;
  /** Screen width (set by GamePage). */
  static SCREEN_WIDTH = 0;
  /** Screen height (set by GamePage). */
  static SCREEN_HEIGHT = 0;
  static readonly MAX_TIME_TANK_VALUE = 8;
  /** How much the continuum changes per second. */
  static readonly CONTINUUM_LEAN = 1;
  static readonly CONTINUUM_MAX = 1;
  static readonly CONTINUUM_MIN = -1;
  /** Mutable: TimeManager.RewindInit overwrites it (persists across games in a session). */
  static TIME_TANK_CRITICAL_VALUE = 0.555;
  //static readonly SMOKE_DELAY = 0.04;
  static readonly MAX_ROCK_DELTA = 40;
  static readonly TACHYON_STREAM_WIDTH = 120;
  static readonly MIN_TACHYON_SPEED = 1000;
  static readonly MAX_TACHYON_SPEED = 2000;
  static readonly MIN_TACHYON_DELAY_INDEX = 0.001;
  static readonly MAX_TACHYON_DELAY_INDEX = 0.001;
  static readonly ROCK_SPEED = 50;
  static readonly MIN_CONTINUUM_SLOW_DOWN = 0.35;
  static readonly COLLISIONS_ARRAY_LENGTH = 1000;
  static readonly GUN_BULLET_X_DIRECTION = 0.4;
  static readonly ROCKET_X_DIRECTION = 0.3;
  static readonly TACHYON_TIME_VALUE = 0.01;
  static readonly MIN_RANDOM_MODULE_BEZIER_CONTROL_POINT_GENERATION = 100;
  static readonly MAX_RANDOM_MODULE_BEZIER_CONTROL_POINT_GENERATION = 200;
  static readonly CRITICAL_BOUND_DAMAGE = 1 / 3;
  static readonly FOLLOWING_ROCKET_RADIANS_STEP = 0.0003;
  static readonly MAX_PLAYER_LIFE = 20;
  /** (int)((MAX_PLAYER_LIFE / 3f) * 2) = 13 */
  static readonly PLAYER_LIFE_CRITICAL_VALUE = Math.trunc((20 / 3) * 2);
  static readonly PLAYER_LIFE_RISING_DELAY = 5.0;
  static readonly PLAYER_LIFE_RISING_INCREMENT = 0.5;
  static readonly POWERUP_SPEED = 60;
  /** Tint while travelling back in time (C# static Color field: a fresh copy per read). */
  static get BACK_IN_TIME_COLOR(): Color {
    return new Color(143, 193, 209);
  }
  static readonly INITIAL_BLACK_DURATION = 2;
  static readonly INITIAL_FADE_DURATION = 3;
  static readonly BOOSTER_TIME_TANK_MULTIPLIER = 2.0;
  static readonly PLASMA_GRANADE_LAUNCHER_ENTERING_EXITING_MODE_TIME = 0.4;
  static readonly PLASMA_GRANADE_TIME_OUT = 5;
  static readonly SCOPE_ROTATION_SPEED = 1;
  static readonly GRID_COLUMNS = 5;
  static readonly GRID_ROWS = 10;
  static readonly MAX_RANDOMIZER_LAUNCHES = 1;
  static readonly MAX_NAME_LENGTH = 15;
}

/**
 * Game helper methods.
 * C# NextRandom overloads are chosen by static argument types; JS cannot, so they are split:
 *   NextRandom(int,int)       -> nextRandomInt     (integer in [min, max))
 *   NextRandom(float,float)   -> nextRandomFloat
 *   NextRandom(double,double) -> nextRandomDouble
 */
export class Utility {
  private static r = new Random();

  /** Single.Parse(s, InvariantInfo). */
  static stringToFloat(s: string | null): number {
    if (s === null) throw new Error('ArgumentNullException: String reference not set to an instance of a String.');
    const t = s.trim();
    const v = Number(t);
    if (t === '' || Number.isNaN(v)) throw new Error('FormatException: Input string was not in a correct format. ("' + s + '")');
    return Math.fround(v);
  }

  /** C# NextRandom(int minValue, int maxValue). */
  static nextRandomInt(minValue: number, maxValue: number): number {
    const rflush = Utility.r.next(20);
    for (let i = 0; i < rflush; i++) Utility.r.next(minValue, maxValue);
    return Utility.r.next(minValue, maxValue);
  }

  /** C# NextRandom(float minValue, float maxValue). */
  static nextRandomFloat(minValue: number, maxValue: number): number {
    const rflush = Utility.r.next(20);
    for (let i = 0; i < rflush; i++) Utility.r.nextDouble();
    return Math.fround((maxValue - minValue) * Math.fround(Utility.r.nextDouble()) + minValue);
  }

  /** C# NextRandom(double minValue, double maxValue). */
  static nextRandomDouble(minValue: number, maxValue: number): number {
    const rflush = Utility.r.next(20);
    for (let i = 0; i < rflush; i++) Utility.r.nextDouble();
    return (maxValue - minValue) * Utility.r.nextDouble() + minValue;
  }

  /** Builds a rectangle from its center instead of its top-left corner. */
  static newRectangleFromCenterPosition(center: Vector2, width: number, height: number): Rectangle {
    return new Rectangle(
      Math.trunc(center.x) - Math.trunc(width / 2),
      Math.trunc(center.y) - Math.trunc(height / 2),
      width,
      height,
    );
  }

  /** True if the element is at least 1 pixel inside the screen. */
  static isInScreenSpace(rect: Rectangle): boolean {
    if (rect.x > 480 || rect.x < -rect.width || rect.y > 800 || rect.y < -rect.height) return false;
    else return true;
  }

  /** True if the element is entirely inside the screen. */
  static isTotallyInScreenSpace(rect: Rectangle): boolean {
    if (rect.x > 480 - rect.width || rect.x < 0 || rect.y > 800 - rect.height || rect.y < 0) return false;
    else return true;
  }

  /** Angle between a vector and the x axis. (The C# parameter is a by-value copy: normalized locally.) */
  static calculateXAngleFromVector(vector: Vector2): number {
    vector = vector.clone();
    vector.normalize();
    if (Math.sin(vector.y) >= 0) {
      return Math.acos(vector.x);
    } else {
      return 2 * Math.PI - Math.acos(vector.x);
    }
  }

  /** Angle between two vectors, starting from the first. */
  static calculateAngleBetweenVectors(source: Vector2, dest: Vector2): number {
    const alpha = Utility.calculateXAngleFromVector(source);
    const beta = Utility.calculateXAngleFromVector(dest);
    const gamma = alpha - beta;
    return gamma >= 0 ? gamma : gamma + 2 * Math.PI;
  }

  /** Whether a direction must rotate clockwise to approach another direction. */
  static towardsClockwise(direction: Vector2, target: Vector2): boolean {
    return Utility.calculateAngleBetweenVectors(direction, target) >= Math.PI;
  }
}

/** Texture ids shared by elements and animations. */
export class TextureConstant {
  //static readonly ANIMATION_EXPLOSION = 'explosion';
  //static readonly ANIMATION_DAMAGESMOKE = 'damagesmoke';
  static readonly ANIMATION_TACHYONSTREAM = 'tachyonstream';
  static readonly TACHYON = 'tachyon';
  static readonly ROCKET = 'rocket';
  static readonly ANIMATION_SPARKS = 'sparks';
  static readonly GUNBULLET = 'gunbullet';
  static readonly ENEMYBULLET = 'enemybullet';
  static readonly FOLLOWINGROCKET = 'followingrocket';
  static readonly GUN_POWERUP = 'gunpowerup';
  static readonly ROCKET_POWERUP = 'rocketpowerup';
  static readonly GRANADE_POWERUP = 'granadepowerup';
  static readonly VOID_TEXTURE = 'void';
  static readonly PLASMAGRANADE = 'plasmagranade';
  static readonly SCOPE = 'scope';
}

/** Kind of curved trajectory an object follows. */
export enum BezierPathTrajectory {
  RANDOM,
  TRAIETTORIA1,
  TRAIETTORIA2,
}

export enum TimeState {
  START_GAME_STATE,
  FORWARD,
  BEGIN_REWIND,
  START_REWIND,
  REWIND,
  BEGIN_FORWARD,
  START_FORWARD,
  BOOSTER,
  ENTER_PLASMA_GRANADE_LAUNCHER,
  PLASMA_GRANADE_LAUNCHER,
  CALIBRATION_PLASMA_GRANADE_PATH_CONTROL_POINT,
  CALIBRATION_PLASMA_GRANADE_PATH_TARGET_POINT,
  EXIT_PLASMA_GRANADE_LAUNCHER,
}

export enum EnemyType {
  NORMAL,
  EASY,
}

export enum LifeState {
  NORMAL,
  DAMAGED,
  DEAD,
  TRANSITIONING,
  BEINGREPLACED,
  DELETING,
}

export enum PowerUpType {
  GUN,
  ROCKET,
  GRANADE,
  NONE,
}

/** Maps a texture name to its index in the GameState textures array (newest-first linked list). */
export class TextureList {
  private first: TextureNode | null = null;

  add(textureIndex: number, name: string): void {
    const node = new TextureNode(textureIndex, name);
    node.next = this.first;
    this.first = node;
  }

  getTextureIndex(name: string): number {
    if (this.first !== null) return this.first.getTexture(name);
    else throw new Error('NullReferenceException: La texture cercata nella lista non esiste.');
  }
}

class TextureNode {
  next: TextureNode | null = null;
  textureIndex: number;
  name: string;

  constructor(textureIndex: number, name: string) {
    this.textureIndex = textureIndex;
    this.name = name;
  }

  getTexture(name: string): number {
    // Iterative version of the C# recursive lookup (same result).
    for (let n: TextureNode | null = this; n !== null; n = n.next) {
      if (n.name === name) return n.textureIndex;
    }
    throw new Error('NullReferenceException: La texture ' + name + ' cercata nella lista non esiste');
  }
}
