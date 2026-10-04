import { Matrix, Vector2 } from '../../xna';
import { Constants, FLOAT_MAX_VALUE, LifeState, TextureConstant, Utility } from '../Utilities/Utilities';
import type { RocketLauncher } from '../Weapons/RocketLauncher';
import type { GameState } from '../State/GameState';
import { Bullet } from './Bullet';
import { GunBullet } from './GunBullet';

/** Homing rocket: flies straight for FOLLOW_TIME_OUT seconds, then steers towards the nearest target. */
export class FollowingRocket extends Bullet {
  /** Time (s) after which the rocket starts following its target. */
  static readonly FOLLOW_TIME_OUT = 0.3;

  constructor();
  constructor(startPosition: Vector2, direction: Vector2, rocketLauncher: RocketLauncher, gameState: GameState);
  constructor(startPosition?: Vector2, direction?: Vector2, rocketLauncher?: RocketLauncher, gameState?: GameState) {
    super();
    if (startPosition === undefined) return;
    this.initializeBullet(startPosition, direction!, TextureConstant.FOLLOWINGROCKET, rocketLauncher!, gameState!);
  }

  override evaluatePosition(delta: number): Vector2 {
    if (this.elapsedTime > FollowingRocket.FOLLOW_TIME_OUT) {
      if (this.gs.levelTime.continuum > 0) {
        const target = this.nearestEnemy();
        if (!target.equals(new Vector2(-1, -1))) {
          this.travelToTarget(target, delta);
        }

        const evaluate = new Vector2();
        evaluate.x = this.currentPosition.x + this.direction.x * this.gs.levelTime.elapsedContinuumTime * this.speed;
        evaluate.y = this.currentPosition.y + this.direction.y * this.gs.levelTime.elapsedContinuumTime * this.speed;
        this.addElementRecord((v: unknown) => {
          this.currentPosition = (v as Vector2).clone();
        }, evaluate.clone());
        return evaluate;
      } else return this.currentPosition.clone();
    } else {
      return super.evaluatePosition(delta);
    }
  }

  /** Steers the direction towards the target. */
  private travelToTarget(target: Vector2, delta: number): void {
    const targetDirection = Vector2.subtract(target, this.currentPosition);
    targetDirection.normalize();

    let angle = Math.min(
      Constants.FOLLOWING_ROCKET_RADIANS_STEP * delta,
      Utility.calculateAngleBetweenVectors(this.direction.clone(), targetDirection.clone()),
    );

    if (
      (this.gs.levelTime.continuum >= 0 && Utility.towardsClockwise(this.direction.clone(), targetDirection.clone())) ||
      (this.gs.levelTime.continuum < 0 && !Utility.towardsClockwise(this.direction.clone(), targetDirection.clone()))
    )
      angle = -angle;

    const cx = this.currentPosition.x;
    const cy = this.currentPosition.y;
    const rotate = Matrix.multiply(
      Matrix.multiply(
        new Matrix(1, 0, 0, cx, 0, 1, 0, cy, 0, 0, 1, 0, 0, 0, 0, 1),
        new Matrix(Math.cos(angle), -Math.sin(angle), 0, 1, Math.sin(angle), Math.cos(angle), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1),
      ),
      new Matrix(1, 0, 0, -cx, 0, 1, 0, -cy, 0, 0, 1, 0, 0, 0, 0, 1),
    );

    const newDirection = Vector2.transform(this.direction, rotate);
    this.addElementRecord((v: unknown) => {
      this.direction = (v as Vector2).clone();
    }, newDirection.clone());
    this.direction = newDirection;
    const newRotation = Utility.calculateXAngleFromVector(this.direction.clone()) + Math.PI / 2;
    this.addElementRecord((v: unknown) => {
      this.rotation = v as number;
    }, newRotation);
    this.rotation = newRotation;
  }

  protected override evaluateRotation(_rotationDelta: number): number {
    if (this.elapsedTime <= FollowingRocket.FOLLOW_TIME_OUT)
      return Utility.calculateXAngleFromVector(this.direction.clone()) + Math.PI / 2;
    else return this.rotation;
  }

  /**
   * Player rocket: position of the nearest non-dead enemy, or (-1,-1) if none.
   * Enemy rocket: the player position.
   */
  private nearestEnemy(): Vector2 {
    if (this.isPlayerBullet) {
      let min = FLOAT_MAX_VALUE;
      let nearest = new Vector2(-1, -1);
      for (const x of this.gs.enemies) {
        if (x.lifeState !== LifeState.DEAD) {
          const distance = Vector2.distance(x.currentPosition, this.currentPosition);
          if (distance < min) {
            min = distance;
            nearest = x.currentPosition.clone();
          }
        }
      }
      return nearest;
    } else return this.gs.playerPosition.clone();
  }

  override hasCollided(_value: number, arg: unknown): void {
    if (!(arg instanceof GunBullet)) {
      this.lifeState = LifeState.DEAD;
    }
  }
}
