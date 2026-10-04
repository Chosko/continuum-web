import { Texture2D, Vector2 } from '../../xna';
import { Animation } from '../Elements/Animation';
import { AreaDamage } from '../Elements/AreaDamage';
import { Asteroid } from '../Elements/Asteroid';
import { AsteroidRandomizer } from '../Elements/AsteroidRandomizer';
import { BackgroundTexture } from '../Elements/BackgroundTexture';
import type { Bullet } from '../Elements/Bullet';
import { Enemy } from '../Elements/Enemy';
import { EnemyRandomizer } from '../Elements/EnemyRandomizer';
import { Chip } from '../Elements/ExplosionParticle';
import { FollowingRocket } from '../Elements/FollowingRocket';
import { GunBullet } from '../Elements/GunBullet';
import { PlasmaGranade } from '../Elements/PlasmaGranade';
import { PowerUp } from '../Elements/PowerUp';
import type { Randomizer } from '../Elements/Randomizer';
import { Rocket } from '../Elements/Rocket';
import type { Tachyon } from '../Elements/Tachyon';
import { TachyonStream } from '../Elements/TachyonStream';
import { TachyonStreamRandomizer } from '../Elements/TachyonStreamRandomizer';
import { SoundManager } from '../Management/SoundManager';
import { TimeMachine } from '../Management/TimeMachine';
import { Collisions } from '../Utilities/Collisions';
import type { DynamicNormalRandomVariable } from '../Utilities/DynamicNormalRandomVariable';
import { LinkedList } from '../Utilities/LinkedList';
import type { QuadraticBezierCurve } from '../Utilities/QuadraticBezierCurve';
import type { TimeDependentVar } from '../Utilities/TimeDependentVar';
import { Constants, LifeState, PowerUpType, TextureConstant, TextureList, TimeState, Utility } from '../Utilities/Utilities';
import { Gun } from '../Weapons/Gun';
import type { IWeapons } from '../Weapons/IWeapons';
import { RocketLauncher } from '../Weapons/RocketLauncher';
import type { PlayerState } from './PlayerState';

/** The whole world state. */
export class GameState {
  // Game object lists
  backgrounds: LinkedList<BackgroundTexture>;
  animations: LinkedList<Animation>;
  asteroids: LinkedList<Asteroid>;
  bullets: LinkedList<Bullet>;
  newBullets: LinkedList<Bullet>;
  enemies: LinkedList<Enemy>;
  tachyons: LinkedList<Tachyon>;
  playerStates: LinkedList<PlayerState>;
  powerUps: LinkedList<PowerUp>;
  randomizers: LinkedList<Randomizer>;
  explosionParticles: LinkedList<Chip>;
  tachyonStream: TachyonStream | null = null;
  playerGun: Gun;
  playerRocketLauncher: RocketLauncher;
  collisions: Collisions;

  // Plasma grenade grid line points
  gridVerticalPoints: Vector2[][];
  gridHorizontalPoints: Vector2[][];

  // Multitouch values for the plasma grenade
  firstFingerPosition: Vector2 = new Vector2();
  secondFingerPosition: Vector2 = new Vector2();
  firstFinger: number | null = null;
  secondFinger: number | null = null;

  textures: Texture2D[] = [];
  textureIndices: TextureList;
  endLevel = false;
  pause = false;

  // LevelManager variables
  levelPosition: number;
  levelFramesWaited: number;

  // Game variables
  timeState: TimeState = TimeState.START_GAME_STATE;
  levelTime: TimeMachine;
  playerTime: TimeMachine;
  albertTime: TimeMachine;

  // Continuum backups for pause (obscured)
  alberttimecontunuumbackup: number | null = null;
  playertimecontunuumbackup: number | null = null;
  leveltimecontunuumbackup: number | null = null;

  get performMultitouchPlasmaGranade(): boolean {
    return (
      this.timeState === TimeState.CALIBRATION_PLASMA_GRANADE_PATH_CONTROL_POINT ||
      this.timeState === TimeState.CALIBRATION_PLASMA_GRANADE_PATH_TARGET_POINT ||
      this.timeState === TimeState.PLASMA_GRANADE_LAUNCHER ||
      this.timeState === TimeState.ENTER_PLASMA_GRANADE_LAUNCHER ||
      this.timeState === TimeState.EXIT_PLASMA_GRANADE_LAUNCHER
    );
  }

  get performGestureFlickDownRewindTime(): boolean {
    return this.timeState === TimeState.FORWARD;
  }

  get performGestureFlickDownStopRewind(): boolean {
    return this.timeState === TimeState.REWIND;
  }

  // Player variables
  private _playerLife: number = Constants.MAX_PLAYER_LIFE;
  get playerLife(): number {
    return this._playerLife;
  }
  set playerLife(value: number) {
    if (value < this._playerLife) this.damageTimer = Constants.PLAYER_LIFE_RISING_DELAY;
    this._playerLife = value;
    if (this._playerLife < 0) this._playerLife = 0;
    else if (this._playerLife > Constants.MAX_PLAYER_LIFE) this._playerLife = Constants.MAX_PLAYER_LIFE;
  }
  private _playerGranadeCount = 0;
  get playerGranadeCount(): number {
    return this._playerGranadeCount;
  }
  set playerGranadeCount(value: number) {
    this._playerGranadeCount = value;
    if (this._playerGranadeCount < 0) {
      this._playerGranadeCount = 0;
    }
  }
  playerPosition: Vector2;
  damageTimer: number;
  timeTank = 0;
  playerLifeState: LifeState = LifeState.NORMAL;
  toggleGun = true;
  private _playerWidth = 0;
  private _playerHeight = 0;
  get playerWidth(): number {
    return this._playerWidth;
  }
  get playerHeight(): number {
    return this._playerHeight;
  }

  // Player weapon variables
  granadeNumber = 100; // test value (only used by the grenade-button guard)

  constructor() {
    this.backgrounds = new LinkedList<BackgroundTexture>();
    this.asteroids = new LinkedList<Asteroid>();
    this.bullets = new LinkedList<Bullet>();
    this.newBullets = new LinkedList<Bullet>();
    this.enemies = new LinkedList<Enemy>();
    this.tachyons = new LinkedList<Tachyon>();
    this.playerStates = new LinkedList<PlayerState>();
    this.animations = new LinkedList<Animation>();
    this.powerUps = new LinkedList<PowerUp>();
    this.randomizers = new LinkedList<Randomizer>();
    this.explosionParticles = new LinkedList<Chip>();
    this.playerPosition = new Vector2(
      Math.trunc(Constants.SCREEN_WIDTH / 2),
      Math.trunc((3 * Constants.SCREEN_HEIGHT) / 4),
    );
    this.levelPosition = 0;
    this.levelFramesWaited = 0;
    this._playerGranadeCount = 0;
    this.damageTimer = 0;
    this.levelTime = new TimeMachine();
    this.playerTime = new TimeMachine();
    this.albertTime = new TimeMachine();
    this.collisions = new Collisions();
    this.textureIndices = new TextureList();
    this.playerGun = new Gun(true, this);
    this.playerRocketLauncher = new RocketLauncher(true, this);
    this.gridVerticalPoints = new Array<Vector2[]>(Constants.GRID_COLUMNS + 1);
    this.gridHorizontalPoints = new Array<Vector2[]>(Constants.GRID_ROWS + 1);
    for (let i = 0; i < this.gridVerticalPoints.length; i++) {
      this.gridVerticalPoints[i] = [new Vector2(), new Vector2()];
    }
    for (let i = 0; i < this.gridHorizontalPoints.length; i++) {
      this.gridHorizontalPoints[i] = [new Vector2(), new Vector2()];
    }
  }

  newGunBullet(position: Vector2, direction: Vector2, gun: Gun): void {
    const b: Bullet = new GunBullet(position.clone(), direction.clone(), gun, this);
    this.bullets.addFirst(b);
    this.collisions.insert(b);
  }

  newRocket(position: Vector2, direction: Vector2, rocketLauncher: RocketLauncher): void {
    const r: Bullet = new Rocket(position.clone(), direction.clone(), rocketLauncher, this);
    this.bullets.addFirst(r);
    this.collisions.insert(r);
  }

  newFollowingRocket(position: Vector2, direction: Vector2, rocketLauncher: RocketLauncher): void {
    const r: Bullet = new FollowingRocket(position.clone(), direction.clone(), rocketLauncher, this);
    this.bullets.addFirst(r);
    this.collisions.insert(r);
  }

  newAsteroid(xPosition: number, speed: number, life: number, texture: string): void {
    // Unused value, but it consumes random numbers like the original.
    const _rotation = Utility.nextRandomInt(0, 50) / Utility.nextRandomInt(1, 100);
    void _rotation;
    let xDirection = 0;
    if (xPosition < 20) xDirection = 0.5;
    else if (xPosition > 460) xDirection = -0.5;
    const a = new Asteroid(new Vector2(xPosition, 0), new Vector2(xDirection, 1), speed, life, texture, this);
    this.asteroids.addFirst(a);
    this.collisions.insert(a);
  }

  newBackgroundTexture(level: number, speed: number, texture: string, transitionTexture: string | null): void {
    this.backgrounds.addLast(new BackgroundTexture(level, speed, texture, transitionTexture, this));
  }

  newAnimation(
    position: Vector2,
    sequenceTexture: string,
    numberOfFrames: number,
    numberOfRows: number,
    numberOfCols: number,
    framePerSecond: number,
    rotationStartRadiant: number,
    rotationSpeed: number,
  ): void {
    this.animations.addLast(
      new Animation(
        position.clone(),
        sequenceTexture,
        numberOfFrames,
        numberOfRows,
        numberOfCols,
        framePerSecond,
        rotationStartRadiant,
        rotationSpeed,
        this,
      ),
    );
  }

  /** Dead code in the original (never called). */
  newAreaDamage(
    position: Vector2,
    sequenceTexture: string,
    numberOfFrames: number,
    numberOfRows: number,
    numberOfCols: number,
    damageDuration: number,
    range: number,
    damage: number,
  ): void {
    const ad = new AreaDamage(
      position.clone(),
      sequenceTexture,
      numberOfFrames,
      numberOfRows,
      numberOfCols,
      damageDuration,
      range,
      damage,
      this,
    );
    this.collisions.insert(ad);
    this.newBullets.addLast(ad);
  }

  newPlasmaGranade(path: QuadraticBezierCurve): void {
    const pg = new PlasmaGranade(path, TextureConstant.PLASMAGRANADE, this);
    this.collisions.insert(pg);
    this.bullets.addLast(pg);
  }

  newTachyonStream(xPosition: number, duration: number, sequenceTexture: string): void {
    const ts = new TachyonStream(xPosition, duration, sequenceTexture, this);
    this.animations.addLast(ts);
    this.tachyonStream = ts;
  }

  newExplosion(position: Vector2): void {
    SoundManager.playSound('explosion');
    for (let i = 0; i < 15; i++) {
      this.explosionParticles.addLast(
        new Chip(position.clone(), Vector2.Zero, Utility.nextRandomFloat(50, 200), 100, 0, 0, 'explosionChip', this),
      );
    }
  }

  newGranadeExplosion(position: Vector2): void {
    for (let i = 0; i < 30; i++) {
      const ep = new Chip(
        position.clone(),
        Vector2.Zero,
        Utility.nextRandomFloat(150, 300),
        200,
        Constants.GRANADE_DAMAGE,
        Constants.GRANADE_DAMAGE,
        'granadeChip',
        this,
      );
      this.explosionParticles.addLast(ep);
      this.collisions.insert(ep);
    }
  }

  newAsteroidChip(position: Vector2, direction: Vector2): void {
    this.explosionParticles.addLast(
      new Chip(position.clone(), direction.clone(), 300, 100, 0, 0, 'asteroidChip', this),
    );
  }

  newAsteroidExplosion(position: Vector2): void {
    for (let i = 0; i < 7; i++) {
      this.explosionParticles.addLast(
        new Chip(position.clone(), Vector2.Zero, Utility.nextRandomInt(50, 250), 100, 0, 0, 'asteroidChip', this),
      );
    }
  }

  newEnemy(
    startPosition: Vector2,
    speed: number,
    texture: string,
    weapon: string | null,
    life: number,
    powerUpType: PowerUpType,
  ): void {
    let newWeapon: IWeapons;
    switch (weapon) {
      case 'Gun':
        newWeapon = new Gun(false, this);
        break;
      case 'RocketLauncher':
        newWeapon = new RocketLauncher(false, this);
        break;
      default:
        throw new Error('NotImplementedException: Arma ' + weapon + 'non esistente.');
    }
    const e = new Enemy(startPosition.clone(), speed, texture, newWeapon, life, this, powerUpType);
    this.enemies.addLast(e);
    this.collisions.insert(e);
  }

  newAsteroidRandomizer(
    probability: number,
    probabilityIncrementPerMinute: number | null,
    probabilityMax: number | null,
    speedRandomVariable: DynamicNormalRandomVariable | null,
    lifeRandomVariable: DynamicNormalRandomVariable | null,
    maxSimultaneousAsteroids: TimeDependentVar | null,
    maxSecondsWithoutAsteroids: TimeDependentVar | null,
    texture: string,
  ): void {
    this.randomizers.addLast(
      new AsteroidRandomizer(
        probability,
        probabilityIncrementPerMinute,
        probabilityMax,
        speedRandomVariable!,
        lifeRandomVariable!,
        maxSimultaneousAsteroids,
        maxSecondsWithoutAsteroids,
        texture,
        this,
      ),
    );
  }

  newPowerUp(position: Vector2, type: PowerUpType): void {
    let texture: string;
    switch (type) {
      case PowerUpType.GUN:
        texture = TextureConstant.GUN_POWERUP;
        break;
      case PowerUpType.ROCKET:
        texture = TextureConstant.ROCKET_POWERUP;
        break;
      case PowerUpType.GRANADE:
        texture = TextureConstant.GRANADE_POWERUP;
        break;
      default:
        throw new Error('NotImplementedException: Tipo di PowerUp non ancora implementata');
    }
    const p = new PowerUp(position.clone(), type, texture, this);
    this.powerUps.addLast(p);
    this.collisions.insert(p);
  }

  newEnemyRandomizer(
    probability: number,
    probabilityIncrementPerMinute: number | null,
    probabilityMax: number | null,
    powerUpProbabilityPerLaunch: number | null,
    rocketPowerUpProbability: number | null,
    granadePowerUpProbability: number | null,
    speedRandomVariable: DynamicNormalRandomVariable | null,
    lifeRandomVariable: DynamicNormalRandomVariable | null,
    maxSimultaneousEnemies: TimeDependentVar | null,
    maxSecondsWithoutEnemies: TimeDependentVar | null,
    weapon: string,
    texture: string,
  ): void {
    this.randomizers.addLast(
      new EnemyRandomizer(
        probability,
        probabilityIncrementPerMinute,
        probabilityMax,
        powerUpProbabilityPerLaunch,
        rocketPowerUpProbability,
        granadePowerUpProbability,
        speedRandomVariable!,
        lifeRandomVariable!,
        maxSimultaneousEnemies,
        maxSecondsWithoutEnemies,
        weapon,
        texture,
        this,
      ),
    );
  }

  newTachyonStreamRandomizer(
    probability: number,
    probabilityIncrementPerMinute: number | null,
    probabilityMax: number | null,
    durationRandomVariable: DynamicNormalRandomVariable | null,
    texture: string,
  ): void {
    this.randomizers.addLast(
      new TachyonStreamRandomizer(
        probability,
        probabilityIncrementPerMinute,
        probabilityMax,
        durationRandomVariable!,
        null,
        texture,
        this,
      ),
    );
  }

  setPlayerBounds(): void {
    const tx = this.textures[this.textureIndices.getTextureIndex('playership')];
    this._playerWidth = tx.width;
    this._playerHeight = tx.height;
  }

  playerHasCollided(damage: number, _gunDowngrade: number, _rocketLauncherDowngrade: number): void {
    if (this.playerLifeState !== LifeState.DEAD) {
      this.playerLife -= damage;
      // VibrateController.Default.Start(new TimeSpan(0, 0, 0, 0, damage * 50))
      try {
        navigator.vibrate?.(damage * 50);
      } catch {
        /* ignore */
      }

      // Commented out in the original: power-ups are timed, weapons are not downgraded on damage.
      //playerGun.Upgrade(-gunDowngrade);
      //if (playerRocketLauncher.Level > 0)
      //    playerRocketLauncher.Upgrade(-rocketLauncherDowngrade);
      //else
      //    playerGun.Upgrade(-rocketLauncherDowngrade);
    }
  }
}
