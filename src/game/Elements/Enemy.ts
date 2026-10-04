import { Color, Rectangle, Vector2, Vector3 } from '../../xna';
import { BezierPathTrajectory, Constants, LifeState, PowerUpType } from '../Utilities/Utilities';
import { BezierPath } from '../Utilities/BezierPath';
import type { IWeapons } from '../Weapons/IWeapons';
import type { GameState } from '../State/GameState';
import { TimeTraveler } from './TimeTraveler';

/** Enemy following a random Bezier path; owns a weapon. */
export class Enemy extends TimeTraveler {
  weapon!: IWeapons;
  trajectory!: BezierPath;
  life = 0;
  boundDamaged = 0;
  powerUpType: PowerUpType = PowerUpType.GUN;
  lifeColor: Color = new Color(0, 0, 0, 0);

  constructor();
  constructor(startPosition: Vector2, speed: number, texture: string, weapon: IWeapons, life: number, gameState: GameState, powerUpType: PowerUpType);
  constructor(
    startPosition?: Vector2,
    speed?: number,
    texture?: string,
    weapon?: IWeapons,
    life?: number,
    gameState?: GameState,
    powerUpType?: PowerUpType,
  ) {
    super();
    if (startPosition === undefined) return;
    this.weapon = weapon!;
    this.life = life!;
    // random trajectory (to be set from the xml and passed to the ctor someday)
    this.trajectory = new BezierPath(
      BezierPathTrajectory.RANDOM,
      25,
      new Rectangle(0, 0, Constants.SCREEN_WIDTH, 500),
      startPosition.clone(),
      new Vector2(0, 0),
    );
    this.initializeTimeTraveler(startPosition, speed!, texture!, gameState!);
    // (int)(life * (1f/3f)) evaluated in float32
    this.boundDamaged = Math.trunc(Math.fround(this.life * Math.fround(Constants.CRITICAL_BOUND_DAMAGE)));
    this.powerUpType = powerUpType!;
    this.lifeColor = Color.White;
  }

  damaging(amount: number): void {
    this.addElementRecord((v: unknown) => {
      this.life = v as number;
    }, this.life);
    this.life -= amount;
    if (this.life <= 0 && this.lifeState !== LifeState.DEAD) {
      this.lifeState = LifeState.DEAD;
      this.gs.newExplosion(this.currentPosition.clone());
      if (this.powerUpType !== PowerUpType.NONE) this.gs.newPowerUp(this.currentPosition.clone(), this.powerUpType);
    } else if (this.life <= this.boundDamaged) this.lifeState = LifeState.DAMAGED;
  }

  override evaluatePosition(delta: number): Vector2 {
    let nextPosition = Vector2.Zero;
    this.trajectory.curveIndex = Math.trunc(delta);

    if (this.trajectory.isFinished) {
      this.lifeState = LifeState.DEAD;
    }
    if (this.lifeState !== LifeState.DEAD) {
      if (!this.trajectory.isFinished) nextPosition = this.trajectory.nextPosition(delta);
      this.weapon.update(nextPosition.clone());

      if (this.lifeState === LifeState.DAMAGED) {
        const intensity = this.life / this.boundDamaged;
        this.lifeColor = new Color(new Vector3(1, intensity, intensity));
      }
      // (smoke emission is commented out in the original: no smoke with the new graphics)
    }
    return nextPosition;
  }

  override toString(): string {
    return 'Enemy - ' + LifeState[this.lifeState];
  }

  override hasCollided(value: number, _arg: unknown): void {
    this.damaging(value);
  }
}
