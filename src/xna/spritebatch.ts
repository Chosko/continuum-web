import { Color } from './color';
import {
  BlendState,
  DepthStencilState,
  GraphicsDevice,
  type GL,
  RasterizerState,
  SamplerState,
  SpriteEffects,
  SpriteSortMode,
  Texture2D,
} from './graphics';
import { Matrix, Rectangle, Vector2 } from './math';
import type { SpriteFont } from './spritefont';

const VS = `
attribute vec2 a_pos;
attribute vec2 a_uv;
attribute vec4 a_color;
uniform vec4 u_proj;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  v_uv = a_uv;
  v_color = a_color;
  gl_Position = vec4(a_pos * u_proj.xy + u_proj.zw, 0.0, 1.0);
}`;

// highp where available: with mediump (fp16 on Apple/mobile GPUs) the interpolated UVs of a
// 2000px-wide sprite sheet are only ~1 texel accurate, so frames bleed/jitter on iOS.
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_tex;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  gl_FragColor = texture2D(u_tex, v_uv) * v_color;
}`;

/** Floats per vertex: x, y, u, v, color(packed as uint32 in the same slot). */
const VERTEX_FLOATS = 5;
const VERTEX_BYTES = VERTEX_FLOATS * 4;
const MAX_BATCH = 2048; // sprites per GL draw call (Uint16 indices: 4*2048 < 65536)
/** Per queued sprite: 4 vertices * (x, y, u, v) */
const SPRITE_FLOATS = 16;

function compile(gl: GL, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
  return s;
}

/**
 * XNA 4.0 SpriteBatch on WebGL.
 *
 *   begin()  == begin(SpriteSortMode.Deferred, BlendState.AlphaBlend, SamplerState.LinearClamp, ...)
 *   begin(sortMode, blendState?, samplerState?, depthStencilState?, rasterizerState?, effect?, transformMatrix?)
 *   draw(texture, destinationRectangle: Rectangle, color)
 *   draw(texture, destinationRectangle: Rectangle, sourceRectangle: Rectangle | null, color)
 *   draw(texture, destinationRectangle: Rectangle, sourceRectangle | null, color, rotation, origin, effects, layerDepth)
 *   draw(texture, position: Vector2, color)
 *   draw(texture, position: Vector2, sourceRectangle | null, color)
 *   draw(texture, position: Vector2, sourceRectangle | null, color, rotation, origin, scale: number | Vector2, effects, layerDepth)
 *   drawString(spriteFont, text, position, color)
 *   drawString(spriteFont, text, position, color, rotation, origin, scale: number | Vector2, effects, layerDepth)
 *   end()
 *
 * Colors are applied as a multiplicative tint on premultiplied texels (exactly XNA's SpriteEffect).
 */
export class SpriteBatch {
  readonly graphicsDevice: GraphicsDevice;
  private readonly gl: GL;
  private readonly program: WebGLProgram;
  private readonly uProj: WebGLUniformLocation;
  private readonly uTex: WebGLUniformLocation;
  private readonly aPos: number;
  private readonly aUv: number;
  private readonly aColor: number;
  private readonly vbo: WebGLBuffer;
  private readonly ibo: WebGLBuffer;
  private readonly vertexData: ArrayBuffer;
  private readonly vF32: Float32Array;
  private readonly vU32: Uint32Array;

  // Sprite queue (structure of arrays, grown on demand)
  private qVerts = new Float32Array(SPRITE_FLOATS * 256);
  private qColor = new Uint32Array(256);
  private qDepth = new Float32Array(256);
  private qTex: Texture2D[] = [];
  private qCount = 0;

  private inBegin = false;
  private sortMode = SpriteSortMode.Deferred;
  private blendState = BlendState.AlphaBlend;
  private samplerState = SamplerState.LinearClamp;
  private transform: Matrix | null = null;

  constructor(graphicsDevice: GraphicsDevice) {
    this.graphicsDevice = graphicsDevice;
    const gl = (this.gl = graphicsDevice.gl);
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program: ' + gl.getProgramInfoLog(p));
    this.program = p;
    this.uProj = gl.getUniformLocation(p, 'u_proj')!;
    this.uTex = gl.getUniformLocation(p, 'u_tex')!;
    this.aPos = gl.getAttribLocation(p, 'a_pos');
    this.aUv = gl.getAttribLocation(p, 'a_uv');
    this.aColor = gl.getAttribLocation(p, 'a_color');

    this.vertexData = new ArrayBuffer(MAX_BATCH * 4 * VERTEX_BYTES);
    this.vF32 = new Float32Array(this.vertexData);
    this.vU32 = new Uint32Array(this.vertexData);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);

    const indices = new Uint16Array(MAX_BATCH * 6);
    for (let i = 0, v = 0; i < indices.length; i += 6, v += 4) {
      indices[i] = v;
      indices[i + 1] = v + 1;
      indices[i + 2] = v + 2;
      indices[i + 3] = v + 1;
      indices[i + 4] = v + 3;
      indices[i + 5] = v + 2;
    }
    this.ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  }

  begin(
    sortMode: SpriteSortMode = SpriteSortMode.Deferred,
    blendState: BlendState | null = null,
    samplerState: SamplerState | null = null,
    _depthStencilState: DepthStencilState | null = null,
    _rasterizerState: RasterizerState | null = null,
    effect: unknown = null,
    transformMatrix: Matrix | null = null,
  ): void {
    if (this.inBegin) throw new Error('InvalidOperationException: End must be called before Begin can be called again.');
    if (effect) console.warn('SpriteBatch.begin: custom Effect is not supported; ignored.');
    this.inBegin = true;
    this.sortMode = sortMode;
    this.blendState = blendState ?? BlendState.AlphaBlend;
    this.samplerState = samplerState ?? SamplerState.LinearClamp;
    this.transform = transformMatrix;
    this.qCount = 0;
    if (sortMode === SpriteSortMode.Immediate) this.setupState();
  }

  end(): void {
    if (!this.inBegin) throw new Error('InvalidOperationException: Begin must be called before End.');
    this.inBegin = false;
    if (this.sortMode !== SpriteSortMode.Immediate) {
      this.setupState();
      this.flushQueue();
    }
    this.qTex.length = 0;
  }

  // ---------------------------------------------------------------- draw

  draw(texture: Texture2D, destinationRectangle: Rectangle, color: Color): void;
  draw(texture: Texture2D, destinationRectangle: Rectangle, sourceRectangle: Rectangle | null | undefined, color: Color): void;
  draw(
    texture: Texture2D,
    destinationRectangle: Rectangle,
    sourceRectangle: Rectangle | null | undefined,
    color: Color,
    rotation: number,
    origin: Vector2,
    effects: SpriteEffects,
    layerDepth: number,
  ): void;
  draw(texture: Texture2D, position: Vector2, color: Color): void;
  draw(texture: Texture2D, position: Vector2, sourceRectangle: Rectangle | null | undefined, color: Color): void;
  draw(
    texture: Texture2D,
    position: Vector2,
    sourceRectangle: Rectangle | null | undefined,
    color: Color,
    rotation: number,
    origin: Vector2,
    scale: number | Vector2,
    effects: SpriteEffects,
    layerDepth: number,
  ): void;
  draw(
    texture: Texture2D,
    dest: Rectangle | Vector2,
    a?: Rectangle | Color | null,
    b?: Color,
    rotation = 0,
    origin?: Vector2,
    c?: number | Vector2 | SpriteEffects,
    d?: SpriteEffects | number,
    e?: number,
  ): void {
    if (!this.inBegin) throw new Error('InvalidOperationException: Begin must be called before Draw.');
    let src: Rectangle | null | undefined;
    let color: Color;
    if (a instanceof Color) {
      color = a;
      src = null;
    } else {
      src = a;
      color = b!;
    }
    const sx = src ? src.x : 0;
    const sy = src ? src.y : 0;
    const sw = src ? src.width : texture.width;
    const sh = src ? src.height : texture.height;
    const ox0 = origin ? origin.x : 0;
    const oy0 = origin ? origin.y : 0;

    if (dest instanceof Rectangle) {
      const effects = (c as SpriteEffects | undefined) ?? SpriteEffects.None;
      const depth = (d as number | undefined) ?? 0;
      // XNA scales the origin from source space into destination space.
      const ox = sw !== 0 ? ox0 * (dest.width / sw) : 0;
      const oy = sh !== 0 ? oy0 * (dest.height / sh) : 0;
      this.queue(texture, sx, sy, sw, sh, dest.x, dest.y, dest.width, dest.height, ox, oy, rotation, effects, depth, color);
    } else {
      let scx = 1;
      let scy = 1;
      if (typeof c === 'number') scx = scy = c;
      else if (c instanceof Vector2) {
        scx = c.x;
        scy = c.y;
      }
      const effects = (d as SpriteEffects | undefined) ?? SpriteEffects.None;
      const depth = e ?? 0;
      this.queue(texture, sx, sy, sw, sh, dest.x, dest.y, sw * scx, sh * scy, ox0 * scx, oy0 * scy, rotation, effects, depth, color);
    }
  }

  drawString(spriteFont: SpriteFont, text: string, position: Vector2, color: Color): void;
  drawString(
    spriteFont: SpriteFont,
    text: string,
    position: Vector2,
    color: Color,
    rotation: number,
    origin: Vector2,
    scale: number | Vector2,
    effects: SpriteEffects,
    layerDepth: number,
  ): void;
  drawString(
    spriteFont: SpriteFont,
    text: string,
    position: Vector2,
    color: Color,
    rotation = 0,
    origin: Vector2 = Vector2.Zero,
    scale: number | Vector2 = 1,
    effects: SpriteEffects = SpriteEffects.None,
    layerDepth = 0,
  ): void {
    if (!this.inBegin) throw new Error('InvalidOperationException: Begin must be called before DrawString.');
    const scx = typeof scale === 'number' ? scale : scale.x;
    const scy = typeof scale === 'number' ? scale : scale.y;
    const tex = spriteFont.texture;
    const os = spriteFont.oversample;
    let penX = 0;
    let penY = 0;
    let first = true;
    for (const ch of text) {
      if (ch === '\r') continue;
      if (ch === '\n') {
        penX = 0;
        penY += spriteFont.lineSpacing;
        first = true;
        continue;
      }
      const g = spriteFont.getGlyph(ch);
      if (!g) continue;
      if (!first) penX += spriteFont.spacing;
      first = false;
      // glyph quad in string-local units; origin is subtracted before scale/rotation
      const lx = penX + g.offsetX;
      const ly = penY + g.offsetY;
      this.queue(
        tex,
        g.srcX, g.srcY, g.srcW, g.srcH,
        position.x, position.y,
        (g.srcW / os) * scx, (g.srcH / os) * scy,
        (origin.x - lx) * scx, (origin.y - ly) * scy,
        rotation, effects, layerDepth, color,
      );
      penX += g.advance;
    }
  }

  // ------------------------------------------------------------- internals

  private queue(
    tex: Texture2D,
    sx: number, sy: number, sw: number, sh: number,
    x: number, y: number, w: number, h: number,
    ox: number, oy: number,
    rotation: number,
    effects: SpriteEffects,
    depth: number,
    color: Color,
  ): void {
    const n = this.qCount;
    if (n >= this.qColor.length) this.grow();
    const q = this.qVerts;
    const o = n * SPRITE_FLOATS;

    // positions: TL, TR, BL, BR
    const dx = -ox;
    const dy = -oy;
    let x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number;
    if (rotation === 0) {
      x0 = x2 = x + dx;
      x1 = x3 = x + dx + w;
      y0 = y1 = y + dy;
      y2 = y3 = y + dy + h;
    } else {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      x0 = x + dx * cos - dy * sin;
      y0 = y + dx * sin + dy * cos;
      x1 = x + (dx + w) * cos - dy * sin;
      y1 = y + (dx + w) * sin + dy * cos;
      x2 = x + dx * cos - (dy + h) * sin;
      y2 = y + dx * sin + (dy + h) * cos;
      x3 = x + (dx + w) * cos - (dy + h) * sin;
      y3 = y + (dx + w) * sin + (dy + h) * cos;
    }
    const m = this.transform;
    if (m) {
      let t: number;
      t = x0 * m.M11 + y0 * m.M21 + m.M41; y0 = x0 * m.M12 + y0 * m.M22 + m.M42; x0 = t;
      t = x1 * m.M11 + y1 * m.M21 + m.M41; y1 = x1 * m.M12 + y1 * m.M22 + m.M42; x1 = t;
      t = x2 * m.M11 + y2 * m.M21 + m.M41; y2 = x2 * m.M12 + y2 * m.M22 + m.M42; x2 = t;
      t = x3 * m.M11 + y3 * m.M21 + m.M41; y3 = x3 * m.M12 + y3 * m.M22 + m.M42; x3 = t;
    }

    const iw = 1 / tex.width;
    const ih = 1 / tex.height;
    let u0 = sx * iw;
    let u1 = (sx + sw) * iw;
    let v0 = sy * ih;
    let v1 = (sy + sh) * ih;
    if (effects & SpriteEffects.FlipHorizontally) {
      const t = u0; u0 = u1; u1 = t;
    }
    if (effects & SpriteEffects.FlipVertically) {
      const t = v0; v0 = v1; v1 = t;
    }

    q[o] = x0; q[o + 1] = y0; q[o + 2] = u0; q[o + 3] = v0;
    q[o + 4] = x1; q[o + 5] = y1; q[o + 6] = u1; q[o + 7] = v0;
    q[o + 8] = x2; q[o + 9] = y2; q[o + 10] = u0; q[o + 11] = v1;
    q[o + 12] = x3; q[o + 13] = y3; q[o + 14] = u1; q[o + 15] = v1;
    this.qColor[n] = ((color.a << 24) | (color.b << 16) | (color.g << 8) | color.r) >>> 0;
    this.qDepth[n] = depth;
    this.qTex[n] = tex;
    this.qCount = n + 1;

    if (this.sortMode === SpriteSortMode.Immediate) this.flushQueue();
  }

  private grow(): void {
    const cap = this.qColor.length * 2;
    const v = new Float32Array(cap * SPRITE_FLOATS);
    v.set(this.qVerts);
    this.qVerts = v;
    const c = new Uint32Array(cap);
    c.set(this.qColor);
    this.qColor = c;
    const d = new Float32Array(cap);
    d.set(this.qDepth);
    this.qDepth = d;
  }

  private setupState(): void {
    const gl = this.gl;
    const gd = this.graphicsDevice;
    gd.bindTarget();
    gl.useProgram(this.program);
    const w = gd.targetWidth;
    const h = gd.targetHeight;
    if (gd.isRenderingToTarget) gl.uniform4f(this.uProj, 2 / w, 2 / h, -1, -1);
    else gl.uniform4f(this.uProj, 2 / w, -2 / h, -1, 1);
    gl.uniform1i(this.uTex, 0);
    gl.enable(gl.BLEND);
    const bs = this.blendState;
    gl.blendFunc(gl[bs.src], gl[bs.dst]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, VERTEX_BYTES, 0);
    gl.enableVertexAttribArray(this.aUv);
    gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, VERTEX_BYTES, 8);
    gl.enableVertexAttribArray(this.aColor);
    gl.vertexAttribPointer(this.aColor, 4, gl.UNSIGNED_BYTE, true, VERTEX_BYTES, 16);
    gl.activeTexture(gl.TEXTURE0);
  }

  private flushQueue(): void {
    const count = this.qCount;
    if (count === 0) return;
    let order: number[] | null = null;
    if (this.sortMode === SpriteSortMode.Texture) {
      order = Array.from({ length: count }, (_, i) => i);
      order.sort((a, b) => this.qTex[a].id - this.qTex[b].id);
    } else if (this.sortMode === SpriteSortMode.BackToFront) {
      order = Array.from({ length: count }, (_, i) => i);
      order.sort((a, b) => this.qDepth[b] - this.qDepth[a]);
    } else if (this.sortMode === SpriteSortMode.FrontToBack) {
      order = Array.from({ length: count }, (_, i) => i);
      order.sort((a, b) => this.qDepth[a] - this.qDepth[b]);
    }

    const gl = this.gl;
    const f = this.vF32;
    const u = this.vU32;
    const q = this.qVerts;
    let batchTex: Texture2D | null = null;
    let inBatch = 0;

    const submit = (): void => {
      if (inBatch === 0 || !batchTex) return;
      gl.bindTexture(gl.TEXTURE_2D, batchTex.glTexture);
      batchTex.applySampler(gl, this.samplerState);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.subarray(0, inBatch * 4 * VERTEX_FLOATS));
      gl.drawElements(gl.TRIANGLES, inBatch * 6, gl.UNSIGNED_SHORT, 0);
      inBatch = 0;
    };

    for (let k = 0; k < count; k++) {
      const i = order ? order[k] : k;
      const tex = this.qTex[i];
      if (tex !== batchTex || inBatch === MAX_BATCH) {
        submit();
        batchTex = tex;
      }
      const src = i * SPRITE_FLOATS;
      const col = this.qColor[i];
      let dst = inBatch * 4 * VERTEX_FLOATS;
      for (let v = 0; v < 4; v++) {
        const s = src + v * 4;
        f[dst] = q[s];
        f[dst + 1] = q[s + 1];
        f[dst + 2] = q[s + 2];
        f[dst + 3] = q[s + 3];
        u[dst + 4] = col;
        dst += VERTEX_FLOATS;
      }
      inBatch++;
    }
    submit();
    this.qCount = 0;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.vbo);
    gl.deleteBuffer(this.ibo);
    gl.deleteProgram(this.program);
  }
}
