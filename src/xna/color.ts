import { Vector3 } from './math';

/** Vector4-like input for Color constructor. */
export interface Vector4Like {
  x: number;
  y: number;
  z: number;
  w: number;
}

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);
/** .NET Math.Round(double): round half to even. */
const roundEven = (x: number): number => {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
};
/** XNA PackUNorm(255, v) via ClampAndRound: NaN -> 0, clamp(v*255, 0, 255), round half to even. */
const packUNorm = (v: number): number => {
  if (Number.isNaN(v)) return 0;
  v *= 255;
  v = v < 0 ? 0 : v > 255 ? 255 : v;
  return roundEven(v);
};

/**
 * XNA 4.0 Color: 4 bytes R,G,B,A (0..255). Value type -> use clone() when copying.
 *
 * Constructors:
 *   new Color(r, g, b)          ints 0..255 (alpha 255)           C# Color(int,int,int)
 *   new Color(r, g, b, a)       ints 0..255                        C# Color(int,int,int,int)
 *   new Color(vector3)          floats 0..1 (alpha 1)              C# Color(Vector3)
 *   new Color(vector4Like)      floats 0..1                        C# Color(Vector4)
 *   Color.fromFloats(r,g,b,a?)  floats 0..1                        C# Color(float,float,float[,float])
 *   Color.fromNonPremultiplied(r,g,b,a) ints 0..255
 *
 * Named colors are static getters returning a NEW instance each time (safe to mutate).
 * C# `color * alpha` -> Color.multiply(color, alpha) or color.mul(alpha).
 */
export class Color {
  r: number;
  g: number;
  b: number;
  a: number;

  constructor(v: Vector3 | Vector4Like);
  constructor(r: number, g: number, b: number, a?: number);
  constructor(r: number | Vector3 | Vector4Like, g?: number, b?: number, a?: number) {
    if (typeof r === 'number') {
      this.r = clampByte(Math.trunc(r));
      this.g = clampByte(Math.trunc(g ?? 0));
      this.b = clampByte(Math.trunc(b ?? 0));
      this.a = a === undefined ? 255 : clampByte(Math.trunc(a));
    } else {
      this.r = packUNorm(r.x);
      this.g = packUNorm(r.y);
      this.b = packUNorm(r.z);
      this.a = 'w' in r ? packUNorm(r.w) : 255;
    }
  }

  static fromFloats(r: number, g: number, b: number, a = 1): Color {
    const c = new Color(0, 0, 0, 0);
    c.r = packUNorm(r);
    c.g = packUNorm(g);
    c.b = packUNorm(b);
    c.a = packUNorm(a);
    return c;
  }

  /** XNA Color.FromNonPremultiplied(int r, int g, int b, int a). */
  static fromNonPremultiplied(r: number, g: number, b: number, a: number): Color {
    return new Color(
      Math.trunc((r * a) / 255),
      Math.trunc((g * a) / 255),
      Math.trunc((b * a) / 255),
      a,
    );
  }

  /** Packed value (ABGR, like XNA PackedValue). */
  get packedValue(): number {
    return ((this.a << 24) | (this.b << 16) | (this.g << 8) | this.r) >>> 0;
  }

  clone(): Color {
    return new Color(this.r, this.g, this.b, this.a);
  }

  toVector3(): Vector3 {
    return new Vector3(this.r / 255, this.g / 255, this.b / 255);
  }
  toVector4(): Vector4Like {
    return { x: this.r / 255, y: this.g / 255, z: this.b / 255, w: this.a / 255 };
  }

  /** Instance alias of Color.multiply(this, scale). Returns a NEW color. */
  mul(scale: number): Color {
    return Color.multiply(this, scale);
  }

  equals(o: Color | null | undefined): boolean {
    return !!o && this.r === o.r && this.g === o.g && this.b === o.b && this.a === o.a;
  }
  toString(): string {
    return `{R:${this.r} G:${this.g} B:${this.b} A:${this.a}}`;
  }

  /** C# `color * scale` (all four channels scaled, XNA fixed-point math). */
  static multiply(value: Color, scale: number): Color {
    let s = scale * 65536;
    s = !(s >= 0) ? 0 : s > 16777215 ? 16777215 : s; // NaN -> 0 (XNA: scale >= 0 ? ... : 0)
    const is = Math.trunc(s);
    const c = new Color(0, 0, 0, 0);
    c.r = Math.min(255, Math.floor((value.r * is) / 65536));
    c.g = Math.min(255, Math.floor((value.g * is) / 65536));
    c.b = Math.min(255, Math.floor((value.b * is) / 65536));
    c.a = Math.min(255, Math.floor((value.a * is) / 65536));
    return c;
  }

  /** XNA Color.Lerp (amount clamped to [0,1], fixed-point). */
  static lerp(value1: Color, value2: Color, amount: number): Color {
    let n = amount * 65536;
    if (Number.isNaN(n)) n = 0;
    n = n < 0 ? 0 : n > 65536 ? 65536 : n;
    n = roundEven(n);
    const c = new Color(0, 0, 0, 0);
    c.r = value1.r + Math.floor(((value2.r - value1.r) * n) / 65536);
    c.g = value1.g + Math.floor(((value2.g - value1.g) * n) / 65536);
    c.b = value1.b + Math.floor(((value2.b - value1.b) * n) / 65536);
    c.a = value1.a + Math.floor(((value2.a - value1.a) * n) / 65536);
    return c;
  }

  // ---- Named colors (XNA values). Getters -> new instance every access. ----
  static get Transparent(): Color { return new Color(0, 0, 0, 0); }
  static get TransparentBlack(): Color { return new Color(0, 0, 0, 0); }
  static get White(): Color { return new Color(255, 255, 255, 255); }
  static get Black(): Color { return new Color(0, 0, 0, 255); }
  static get Red(): Color { return new Color(255, 0, 0, 255); }
  static get Green(): Color { return new Color(0, 128, 0, 255); }
  static get Lime(): Color { return new Color(0, 255, 0, 255); }
  static get Blue(): Color { return new Color(0, 0, 255, 255); }
  static get Yellow(): Color { return new Color(255, 255, 0, 255); }
  static get Cyan(): Color { return new Color(0, 255, 255, 255); }
  static get Magenta(): Color { return new Color(255, 0, 255, 255); }
  static get Azure(): Color { return new Color(240, 255, 255, 255); }
  static get LightGreen(): Color { return new Color(144, 238, 144, 255); }
  static get Gray(): Color { return new Color(128, 128, 128, 255); }
  static get DarkGray(): Color { return new Color(169, 169, 169, 255); }
  static get LightGray(): Color { return new Color(211, 211, 211, 255); }
  static get Orange(): Color { return new Color(255, 165, 0, 255); }
  static get CornflowerBlue(): Color { return new Color(100, 149, 237, 255); }
}
