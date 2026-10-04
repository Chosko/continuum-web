import { Rectangle, Vector2 } from '../../xna';
import { QuadraticBezierCurve } from './QuadraticBezierCurve';
import { BezierPathTrajectory, Constants, Utility } from './Utilities';

/** A chain of quadratic Bezier curves. */
export class BezierPath {
  positionBounds: Rectangle = new Rectangle();
  startPosition: Vector2 = new Vector2();
  endPosition: Vector2 = new Vector2();
  numberOfCurves = 0;
  trajectoryType: BezierPathTrajectory = BezierPathTrajectory.RANDOM;
  trajectory: QuadraticBezierCurve[] = [];
  curveIndex = 0;
  private _isFinished = false;

  /** new BezierPath() or (trajectoryType, numberOfCurves, positionBounds, startPosition, endPosition) */
  constructor(
    trajectoryType?: BezierPathTrajectory,
    numberOfCurves?: number,
    positionBounds?: Rectangle,
    startPosition?: Vector2,
    endPosition?: Vector2,
  ) {
    if (trajectoryType === undefined) return;
    this.trajectoryType = trajectoryType;
    this.numberOfCurves = numberOfCurves!;
    this.positionBounds = positionBounds!.clone();
    this.startPosition = startPosition!.clone();
    this.endPosition = endPosition!.clone();
    this.curveIndex = 0;
    this._isFinished = false;
    const MIN = Constants.MIN_RANDOM_MODULE_BEZIER_CONTROL_POINT_GENERATION;
    const MAX = Constants.MAX_RANDOM_MODULE_BEZIER_CONTROL_POINT_GENERATION;
    const pb = this.positionBounds;
    const randomPoint = (): Vector2 =>
      new Vector2(Utility.nextRandomInt(pb.left, pb.right), Utility.nextRandomInt(pb.top, pb.bottom));
    switch (trajectoryType) {
      case BezierPathTrajectory.RANDOM: {
        const trajectory = new Array<QuadraticBezierCurve>(this.numberOfCurves);
        this.trajectory = trajectory;
        let sp = this.startPosition.clone();
        let cp = Vector2.add(
          Vector2.multiply(Vector2.normalize(Vector2.subtract(randomPoint(), sp)), Utility.nextRandomInt(MIN, MAX)),
          sp,
        );
        let tp = Vector2.add(
          Vector2.multiply(Vector2.normalize(Vector2.subtract(randomPoint(), cp)), Utility.nextRandomInt(MIN, MAX)),
          cp,
        );
        trajectory[0] = new QuadraticBezierCurve(sp, tp, cp);
        for (let i = 1; i < trajectory.length - 1; i++) {
          sp = trajectory[i - 1].targetPoint;
          cp = QuadraticBezierCurve.calculateNewControlPointVector(
            trajectory[i - 1].controlPoint,
            trajectory[i - 1].targetPoint,
            Utility.nextRandomInt(MIN, MAX),
          );
          tp = Vector2.add(
            Vector2.multiply(Vector2.normalize(Vector2.subtract(randomPoint(), sp)), Utility.nextRandomInt(MIN, MAX)),
            sp,
          );
          trajectory[i] = new QuadraticBezierCurve(sp, tp, cp);
        }
        sp = trajectory[trajectory.length - 2].targetPoint;
        cp = QuadraticBezierCurve.calculateNewControlPointVector(
          trajectory[trajectory.length - 2].controlPoint,
          trajectory[trajectory.length - 2].targetPoint,
          Utility.nextRandomInt(MIN, MAX),
        );
        tp = this.endPosition.clone();
        trajectory[trajectory.length - 1] = new QuadraticBezierCurve(sp, tp, cp);
        break;
      }
      case BezierPathTrajectory.TRAIETTORIA1:
        break;
      case BezierPathTrajectory.TRAIETTORIA2:
        break;
    }
  }

  /** Getter with a side effect (writes the isFinished field), like C#. */
  get isFinished(): boolean {
    this._isFinished = this.curveIndex >= this.trajectory.length;
    return this._isFinished;
  }

  nextPosition(delta: number): Vector2 {
    return this.trajectory[this.curveIndex].evaluate(delta - this.curveIndex);
  }
}
