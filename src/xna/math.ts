/**
 * XNA 4.0 math value types: MathHelper, Vector2, Vector3, Point, Rectangle, Matrix.
 *
 * C# structs are VALUE types; these are JS classes (reference types). Rules:
 *  - Static operations (Vector2.add, Vector2.normalize, ...) ALWAYS return new instances.
 *  - Instance mutators (v.normalize(), r.offset(), r.inflate()) mutate in place, exactly like C#.
 *  - Static "constants" (Vector2.Zero, Vector2.One, Rectangle.Empty, ...) are getters that
 *    return a NEW instance on every access, so mutating them is harmless.
 *  - When C# copies a struct (assignment from a field/property/array element, passing by
 *    value and then mutating), call .clone(). See src/xna/README.md.
 */

export const MathHelper = {
  E: Math.E,
  Log10E: Math.LOG10E,
  Log2E: Math.LOG2E,
  Pi: Math.PI,
  PiOver2: Math.PI / 2,
  PiOver4: Math.PI / 4,
  TwoPi: Math.PI * 2,

  toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  },
  toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  },
  /** XNA: value > max ? max : value < min ? min : value (max checked first). */
  clamp(value: number, min: number, max: number): number {
    value = value > max ? max : value;
    value = value < min ? min : value;
    return value;
  },
  lerp(value1: number, value2: number, amount: number): number {
    return value1 + (value2 - value1) * amount;
  },
  min(a: number, b: number): number {
    return a < b ? a : b;
  },
  max(a: number, b: number): number {
    return a > b ? a : b;
  },
  distance(value1: number, value2: number): number {
    return Math.abs(value1 - value2);
  },
  /** Reduces an angle to (-PI, PI]. */
  wrapAngle(angle: number): number {
    angle = ieeeRemainder(angle, Math.PI * 2);
    if (angle <= -Math.PI) angle += Math.PI * 2;
    else if (angle > Math.PI) angle -= Math.PI * 2;
    return angle;
  },
  smoothStep(value1: number, value2: number, amount: number): number {
    let num = MathHelper.clamp(amount, 0, 1);
    num = num * num * (3 - 2 * num);
    return value1 + (value2 - value1) * num;
  },
  barycentric(value1: number, value2: number, value3: number, amount1: number, amount2: number): number {
    return value1 + amount1 * (value2 - value1) + amount2 * (value3 - value1);
  },
};

/** .NET Math.IEEERemainder: x - y * round-half-even(x / y). */
export function ieeeRemainder(x: number, y: number): number {
  const q = x / y;
  let r = Math.round(q);
  if (Math.abs(q % 1) === 0.5) r = 2 * Math.round(q / 2);
  return x - y * r;
}

// ---------------------------------------------------------------------------
// Vector2
// ---------------------------------------------------------------------------

export class Vector2 {
  x: number;
  y: number;

  /** new Vector2() / new Vector2(value) / new Vector2(x, y) */
  constructor(x?: number, y?: number) {
    if (x === undefined) {
      this.x = 0;
      this.y = 0;
    } else if (y === undefined) {
      this.x = x;
      this.y = x;
    } else {
      this.x = x;
      this.y = y;
    }
  }

  static get Zero(): Vector2 {
    return new Vector2(0, 0);
  }
  static get One(): Vector2 {
    return new Vector2(1, 1);
  }
  static get UnitX(): Vector2 {
    return new Vector2(1, 0);
  }
  static get UnitY(): Vector2 {
    return new Vector2(0, 1);
  }

  /** Copy (C# struct assignment). */
  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }
  /** Copies another vector's components into this one (in place). */
  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  copyFrom(v: Vector2): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }
  /** In-place normalize (C# instance v.Normalize()). Zero vector becomes NaN like XNA. */
  normalize(): void {
    const inv = 1 / Math.sqrt(this.x * this.x + this.y * this.y);
    this.x *= inv;
    this.y *= inv;
  }
  equals(other: Vector2 | null | undefined): boolean {
    return !!other && this.x === other.x && this.y === other.y;
  }
  toString(): string {
    return `{X:${this.x} Y:${this.y}}`;
  }

  // ---- static ops (all return new instances) ----
  static add(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(a.x + b.x, a.y + b.y);
  }
  static subtract(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(a.x - b.x, a.y - b.y);
  }
  /** a * b (component-wise) or a * scalar. Also scalar * a: use multiply(a, s). */
  static multiply(a: Vector2, b: Vector2 | number): Vector2 {
    return typeof b === 'number' ? new Vector2(a.x * b, a.y * b) : new Vector2(a.x * b.x, a.y * b.y);
  }
  static divide(a: Vector2, b: Vector2 | number): Vector2 {
    if (typeof b === 'number') {
      const inv = 1 / b; // XNA multiplies by reciprocal
      return new Vector2(a.x * inv, a.y * inv);
    }
    return new Vector2(a.x / b.x, a.y / b.y);
  }
  static negate(a: Vector2): Vector2 {
    return new Vector2(-a.x, -a.y);
  }
  static normalize(v: Vector2): Vector2 {
    const inv = 1 / Math.sqrt(v.x * v.x + v.y * v.y);
    return new Vector2(v.x * inv, v.y * inv);
  }
  static distance(a: Vector2, b: Vector2): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  static distanceSquared(a: Vector2, b: Vector2): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }
  static dot(a: Vector2, b: Vector2): number {
    return a.x * b.x + a.y * b.y;
  }
  static lerp(a: Vector2, b: Vector2, amount: number): Vector2 {
    return new Vector2(a.x + (b.x - a.x) * amount, a.y + (b.y - a.y) * amount);
  }
  static min(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(a.x < b.x ? a.x : b.x, a.y < b.y ? a.y : b.y);
  }
  static max(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(a.x > b.x ? a.x : b.x, a.y > b.y ? a.y : b.y);
  }
  static clamp(v: Vector2, min: Vector2, max: Vector2): Vector2 {
    return new Vector2(MathHelper.clamp(v.x, min.x, max.x), MathHelper.clamp(v.y, min.y, max.y));
  }
  static reflect(v: Vector2, normal: Vector2): Vector2 {
    const d = v.x * normal.x + v.y * normal.y;
    return new Vector2(v.x - 2 * d * normal.x, v.y - 2 * d * normal.y);
  }
  /** XNA Vector2.Transform(position, matrix): row-vector * matrix (x*M11 + y*M21 + M41, ...). */
  static transform(position: Vector2, matrix: Matrix): Vector2 {
    return new Vector2(
      position.x * matrix.M11 + position.y * matrix.M21 + matrix.M41,
      position.x * matrix.M12 + position.y * matrix.M22 + matrix.M42,
    );
  }
  static transformNormal(normal: Vector2, matrix: Matrix): Vector2 {
    return new Vector2(
      normal.x * matrix.M11 + normal.y * matrix.M21,
      normal.x * matrix.M12 + normal.y * matrix.M22,
    );
  }
}

// ---------------------------------------------------------------------------
// Vector3
// ---------------------------------------------------------------------------

export class Vector3 {
  x: number;
  y: number;
  z: number;

  /** new Vector3() / new Vector3(value) / new Vector3(x, y, z) / new Vector3(Vector2, z) */
  constructor(x?: number | Vector2, y?: number, z?: number) {
    if (x instanceof Vector2) {
      this.x = x.x;
      this.y = x.y;
      this.z = y ?? 0;
    } else if (x === undefined) {
      this.x = this.y = this.z = 0;
    } else if (y === undefined) {
      this.x = this.y = this.z = x;
    } else {
      this.x = x;
      this.y = y;
      this.z = z ?? 0;
    }
  }

  static get Zero(): Vector3 {
    return new Vector3(0, 0, 0);
  }
  static get One(): Vector3 {
    return new Vector3(1, 1, 1);
  }
  static get UnitX(): Vector3 {
    return new Vector3(1, 0, 0);
  }
  static get UnitY(): Vector3 {
    return new Vector3(0, 1, 0);
  }
  static get UnitZ(): Vector3 {
    return new Vector3(0, 0, 1);
  }

  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }
  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copyFrom(v: Vector3): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  normalize(): void {
    const inv = 1 / this.length();
    this.x *= inv;
    this.y *= inv;
    this.z *= inv;
  }
  equals(o: Vector3 | null | undefined): boolean {
    return !!o && this.x === o.x && this.y === o.y && this.z === o.z;
  }
  toString(): string {
    return `{X:${this.x} Y:${this.y} Z:${this.z}}`;
  }

  static add(a: Vector3, b: Vector3): Vector3 {
    return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
  }
  static subtract(a: Vector3, b: Vector3): Vector3 {
    return new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
  }
  static multiply(a: Vector3, b: Vector3 | number): Vector3 {
    return typeof b === 'number'
      ? new Vector3(a.x * b, a.y * b, a.z * b)
      : new Vector3(a.x * b.x, a.y * b.y, a.z * b.z);
  }
  static divide(a: Vector3, b: Vector3 | number): Vector3 {
    if (typeof b === 'number') {
      const inv = 1 / b;
      return new Vector3(a.x * inv, a.y * inv, a.z * inv);
    }
    return new Vector3(a.x / b.x, a.y / b.y, a.z / b.z);
  }
  static negate(a: Vector3): Vector3 {
    return new Vector3(-a.x, -a.y, -a.z);
  }
  static normalize(v: Vector3): Vector3 {
    const inv = 1 / v.length();
    return new Vector3(v.x * inv, v.y * inv, v.z * inv);
  }
  static distance(a: Vector3, b: Vector3): number {
    return Vector3.subtract(a, b).length();
  }
  static dot(a: Vector3, b: Vector3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
  static cross(a: Vector3, b: Vector3): Vector3 {
    return new Vector3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  static lerp(a: Vector3, b: Vector3, amount: number): Vector3 {
    return new Vector3(a.x + (b.x - a.x) * amount, a.y + (b.y - a.y) * amount, a.z + (b.z - a.z) * amount);
  }
}

/**
 * C# `(int)` cast with WP7/ARM semantics: truncates toward zero, NaN -> 0, out-of-range values saturate.
 * (Plain Math.trunc would keep NaN / Infinity.)
 */
export const toInt32 = (v: number): number =>
  Number.isNaN(v) ? 0 : v >= 2147483647 ? 2147483647 : v <= -2147483648 ? -2147483648 : Math.trunc(v);

// ---------------------------------------------------------------------------
// Point (int x, int y)
// ---------------------------------------------------------------------------

export class Point {
  x: number;
  y: number;
  /** Values are truncated toward zero, like a C# (int) cast. */
  constructor(x = 0, y = 0) {
    this.x = toInt32(x);
    this.y = toInt32(y);
  }
  static get Zero(): Point {
    return new Point(0, 0);
  }
  clone(): Point {
    return new Point(this.x, this.y);
  }
  equals(o: Point | null | undefined): boolean {
    return !!o && this.x === o.x && this.y === o.y;
  }
  toString(): string {
    return `{X:${this.x} Y:${this.y}}`;
  }
}

// ---------------------------------------------------------------------------
// Rectangle (int x, y, width, height)
// ---------------------------------------------------------------------------

export class Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;

  /** Values are truncated toward zero, like a C# (int) cast. */
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = toInt32(x);
    this.y = toInt32(y);
    this.width = toInt32(width);
    this.height = toInt32(height);
  }

  static get Empty(): Rectangle {
    return new Rectangle();
  }

  get left(): number {
    return this.x;
  }
  get right(): number {
    return this.x + this.width;
  }
  get top(): number {
    return this.y;
  }
  get bottom(): number {
    return this.y + this.height;
  }
  /** Integer center (XNA: x + width / 2 with integer division). */
  get center(): Point {
    return new Point(this.x + Math.trunc(this.width / 2), this.y + Math.trunc(this.height / 2));
  }
  get location(): Point {
    return new Point(this.x, this.y);
  }
  set location(p: Point) {
    this.x = p.x;
    this.y = p.y;
  }
  get isEmpty(): boolean {
    return this.width === 0 && this.height === 0 && this.x === 0 && this.y === 0;
  }

  clone(): Rectangle {
    return new Rectangle(this.x, this.y, this.width, this.height);
  }

  /**
   * contains(x, y) | contains(Point) | contains(Vector2) | contains(Rectangle).
   * XNA semantics: left/top inclusive, right/bottom exclusive.
   */
  contains(x: number, y: number): boolean;
  contains(value: Point | Vector2 | Rectangle): boolean;
  contains(a: number | Point | Vector2 | Rectangle, b?: number): boolean {
    if (typeof a === 'number') {
      return this.x <= a && a < this.x + this.width && this.y <= b! && b! < this.y + this.height;
    }
    if (a instanceof Rectangle) {
      return (
        this.x <= a.x &&
        a.x + a.width <= this.x + this.width &&
        this.y <= a.y &&
        a.y + a.height <= this.y + this.height
      );
    }
    return this.x <= a.x && a.x < this.x + this.width && this.y <= a.y && a.y < this.y + this.height;
  }

  /** XNA semantics: strict inequalities (touching edges do NOT intersect). */
  intersects(value: Rectangle): boolean {
    return (
      value.x < this.x + this.width &&
      this.x < value.x + value.width &&
      value.y < this.y + this.height &&
      this.y < value.y + value.height
    );
  }

  /** In place. offset(dx, dy) | offset(Point) */
  offset(dx: number | Point, dy?: number): void {
    if (typeof dx === 'number') {
      this.x += toInt32(dx);
      this.y += toInt32(dy ?? 0);
    } else {
      this.x += dx.x;
      this.y += dx.y;
    }
  }
  /** In place. */
  inflate(horizontalAmount: number, verticalAmount: number): void {
    this.x -= horizontalAmount;
    this.y -= verticalAmount;
    this.width += horizontalAmount * 2;
    this.height += verticalAmount * 2;
  }

  equals(o: Rectangle | null | undefined): boolean {
    return !!o && this.x === o.x && this.y === o.y && this.width === o.width && this.height === o.height;
  }
  toString(): string {
    return `{X:${this.x} Y:${this.y} Width:${this.width} Height:${this.height}}`;
  }

  static intersect(a: Rectangle, b: Rectangle): Rectangle {
    const r = Math.min(a.x + a.width, b.x + b.width);
    const l = Math.max(a.x, b.x);
    const t = Math.max(a.y, b.y);
    const bt = Math.min(a.y + a.height, b.y + b.height);
    if (r > l && bt > t) return new Rectangle(l, t, r - l, bt - t);
    return Rectangle.Empty;
  }
  static union(a: Rectangle, b: Rectangle): Rectangle {
    const l = Math.min(a.x, b.x);
    const t = Math.min(a.y, b.y);
    return new Rectangle(l, t, Math.max(a.right, b.right) - l, Math.max(a.bottom, b.bottom) - t);
  }
}

// ---------------------------------------------------------------------------
// Matrix (row-major, row-vector convention like XNA)
// ---------------------------------------------------------------------------

export class Matrix {
  M11: number; M12: number; M13: number; M14: number;
  M21: number; M22: number; M23: number; M24: number;
  M31: number; M32: number; M33: number; M34: number;
  M41: number; M42: number; M43: number; M44: number;

  /** new Matrix() = all zeros (C# default struct); new Matrix(m11, m12, ..., m44). */
  constructor(
    m11 = 0, m12 = 0, m13 = 0, m14 = 0,
    m21 = 0, m22 = 0, m23 = 0, m24 = 0,
    m31 = 0, m32 = 0, m33 = 0, m34 = 0,
    m41 = 0, m42 = 0, m43 = 0, m44 = 0,
  ) {
    this.M11 = m11; this.M12 = m12; this.M13 = m13; this.M14 = m14;
    this.M21 = m21; this.M22 = m22; this.M23 = m23; this.M24 = m24;
    this.M31 = m31; this.M32 = m32; this.M33 = m33; this.M34 = m34;
    this.M41 = m41; this.M42 = m42; this.M43 = m43; this.M44 = m44;
  }

  static get Identity(): Matrix {
    return new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }

  clone(): Matrix {
    const m = this;
    return new Matrix(
      m.M11, m.M12, m.M13, m.M14, m.M21, m.M22, m.M23, m.M24,
      m.M31, m.M32, m.M33, m.M34, m.M41, m.M42, m.M43, m.M44,
    );
  }

  /** C# `a * b` (Matrix.Multiply). */
  static multiply(a: Matrix, b: Matrix | number): Matrix {
    if (typeof b === 'number') {
      return new Matrix(
        a.M11 * b, a.M12 * b, a.M13 * b, a.M14 * b, a.M21 * b, a.M22 * b, a.M23 * b, a.M24 * b,
        a.M31 * b, a.M32 * b, a.M33 * b, a.M34 * b, a.M41 * b, a.M42 * b, a.M43 * b, a.M44 * b,
      );
    }
    return new Matrix(
      a.M11 * b.M11 + a.M12 * b.M21 + a.M13 * b.M31 + a.M14 * b.M41,
      a.M11 * b.M12 + a.M12 * b.M22 + a.M13 * b.M32 + a.M14 * b.M42,
      a.M11 * b.M13 + a.M12 * b.M23 + a.M13 * b.M33 + a.M14 * b.M43,
      a.M11 * b.M14 + a.M12 * b.M24 + a.M13 * b.M34 + a.M14 * b.M44,
      a.M21 * b.M11 + a.M22 * b.M21 + a.M23 * b.M31 + a.M24 * b.M41,
      a.M21 * b.M12 + a.M22 * b.M22 + a.M23 * b.M32 + a.M24 * b.M42,
      a.M21 * b.M13 + a.M22 * b.M23 + a.M23 * b.M33 + a.M24 * b.M43,
      a.M21 * b.M14 + a.M22 * b.M24 + a.M23 * b.M34 + a.M24 * b.M44,
      a.M31 * b.M11 + a.M32 * b.M21 + a.M33 * b.M31 + a.M34 * b.M41,
      a.M31 * b.M12 + a.M32 * b.M22 + a.M33 * b.M32 + a.M34 * b.M42,
      a.M31 * b.M13 + a.M32 * b.M23 + a.M33 * b.M33 + a.M34 * b.M43,
      a.M31 * b.M14 + a.M32 * b.M24 + a.M33 * b.M34 + a.M34 * b.M44,
      a.M41 * b.M11 + a.M42 * b.M21 + a.M43 * b.M31 + a.M44 * b.M41,
      a.M41 * b.M12 + a.M42 * b.M22 + a.M43 * b.M32 + a.M44 * b.M42,
      a.M41 * b.M13 + a.M42 * b.M23 + a.M43 * b.M33 + a.M44 * b.M43,
      a.M41 * b.M14 + a.M42 * b.M24 + a.M43 * b.M34 + a.M44 * b.M44,
    );
  }

  static createTranslation(x: number, y: number, z: number): Matrix {
    return new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1);
  }
  static createScale(x: number, y?: number, z?: number): Matrix {
    return new Matrix(x, 0, 0, 0, 0, y ?? x, 0, 0, 0, 0, z ?? x, 0, 0, 0, 0, 1);
  }
  static createRotationZ(radians: number): Matrix {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return new Matrix(c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }
}
