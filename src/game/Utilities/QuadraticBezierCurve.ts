import { Vector2 } from '../../xna';

/** Quadratic Bezier curve (start, target, control). Points are value copies (C# struct properties). */
export class QuadraticBezierCurve {
  private _startPoint: Vector2;
  private _targetPoint: Vector2;
  private _controlPoint: Vector2;

  get startPoint(): Vector2 {
    return this._startPoint.clone();
  }
  set startPoint(v: Vector2) {
    this._startPoint = v.clone();
  }
  get targetPoint(): Vector2 {
    return this._targetPoint.clone();
  }
  set targetPoint(v: Vector2) {
    this._targetPoint = v.clone();
  }
  get controlPoint(): Vector2 {
    return this._controlPoint.clone();
  }
  set controlPoint(v: Vector2) {
    this._controlPoint = v.clone();
  }

  /** new QuadraticBezierCurve() or (startPoint, targetPoint, controlPoint) */
  constructor(startPoint?: Vector2, targetPoint?: Vector2, controlPoint?: Vector2) {
    this._startPoint = startPoint ? startPoint.clone() : Vector2.Zero;
    this._targetPoint = targetPoint ? targetPoint.clone() : Vector2.Zero;
    this._controlPoint = controlPoint ? controlPoint.clone() : Vector2.Zero;
  }

  evaluate(t: number): Vector2 {
    return Vector2.lerp(
      Vector2.lerp(this._startPoint, this._controlPoint, t),
      Vector2.lerp(this._controlPoint, this._targetPoint, t),
      t,
    );
  }

  static calculateNewControlPointVector(lastControlPoint: Vector2, lastTargetPoint: Vector2, module: number): Vector2 {
    return Vector2.add(
      Vector2.multiply(Vector2.normalize(Vector2.subtract(lastTargetPoint, lastControlPoint)), module),
      lastTargetPoint,
    );
  }
}
