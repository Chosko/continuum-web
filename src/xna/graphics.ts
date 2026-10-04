import { Color } from './color';

/** WP7 back buffer: 480x800 portrait (SharedGraphicsDeviceManager.DefaultBackBufferWidth/Height). */
export const VIRTUAL_WIDTH = 480;
export const VIRTUAL_HEIGHT = 800;

export type GL = WebGLRenderingContext | WebGL2RenderingContext;

// ---------------------------------------------------------------------------
// Enums / states
// ---------------------------------------------------------------------------

export enum SpriteSortMode {
  Deferred = 0,
  Immediate = 1,
  Texture = 2,
  BackToFront = 3,
  FrontToBack = 4,
}

/** Flags: combine with `|` exactly like C#. */
export enum SpriteEffects {
  None = 0,
  FlipHorizontally = 1,
  FlipVertically = 2,
}

export class BlendState {
  constructor(
    readonly name: string,
    /** GL enum names for blendFunc(src, dst) */
    readonly src: 'ONE' | 'SRC_ALPHA' | 'ZERO',
    readonly dst: 'ONE' | 'ONE_MINUS_SRC_ALPHA' | 'ZERO',
  ) {}
  /** XNA default for SpriteBatch: premultiplied alpha (One, InverseSourceAlpha). */
  static readonly AlphaBlend = new BlendState('AlphaBlend', 'ONE', 'ONE_MINUS_SRC_ALPHA');
  /** (SourceAlpha, One) */
  static readonly Additive = new BlendState('Additive', 'SRC_ALPHA', 'ONE');
  /** (SourceAlpha, InverseSourceAlpha) */
  static readonly NonPremultiplied = new BlendState('NonPremultiplied', 'SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA');
  /** (One, Zero) */
  static readonly Opaque = new BlendState('Opaque', 'ONE', 'ZERO');
}

export enum TextureFilter {
  Linear = 0,
  Point = 1,
}
export enum TextureAddressMode {
  Wrap = 0,
  Clamp = 1,
  Mirror = 2,
}

export class SamplerState {
  constructor(
    readonly name: string,
    readonly filter: TextureFilter,
    readonly address: TextureAddressMode,
  ) {}
  /** XNA SpriteBatch default. */
  static readonly LinearClamp = new SamplerState('LinearClamp', TextureFilter.Linear, TextureAddressMode.Clamp);
  static readonly LinearWrap = new SamplerState('LinearWrap', TextureFilter.Linear, TextureAddressMode.Wrap);
  static readonly PointClamp = new SamplerState('PointClamp', TextureFilter.Point, TextureAddressMode.Clamp);
  static readonly PointWrap = new SamplerState('PointWrap', TextureFilter.Point, TextureAddressMode.Wrap);
  static readonly AnisotropicClamp = new SamplerState('AnisotropicClamp', TextureFilter.Linear, TextureAddressMode.Clamp);
  static readonly AnisotropicWrap = new SamplerState('AnisotropicWrap', TextureFilter.Linear, TextureAddressMode.Wrap);
}

/** Accepted for signature compatibility; 2D sprite rendering ignores them. */
export class DepthStencilState {
  private constructor(readonly name: string) {}
  static readonly None = new DepthStencilState('None');
  static readonly Default = new DepthStencilState('Default');
  static readonly DepthRead = new DepthStencilState('DepthRead');
}
export class RasterizerState {
  private constructor(readonly name: string) {}
  static readonly CullNone = new RasterizerState('CullNone');
  static readonly CullClockwise = new RasterizerState('CullClockwise');
  static readonly CullCounterClockwise = new RasterizerState('CullCounterClockwise');
}

export class Viewport {
  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
  ) {}
  get aspectRatio(): number {
    return this.width / this.height;
  }
}

// ---------------------------------------------------------------------------
// Texture2D
// ---------------------------------------------------------------------------

let nextTextureId = 1;
const isPow2 = (n: number): boolean => (n & (n - 1)) === 0;

export interface TextureProcessorOptions {
  /** XNA TextureProcessor ColorKeyEnabled (default true). */
  colorKeyEnabled?: boolean;
  /** XNA TextureProcessor ColorKeyColor (default magenta 255,0,255,255). */
  colorKeyColor?: Color;
  /** XNA TextureProcessor PremultiplyAlpha (default true). */
  premultiplyAlpha?: boolean;
}

export class Texture2D {
  readonly width: number;
  readonly height: number;
  /** Unique id; used by SpriteSortMode.Texture. */
  readonly id = nextTextureId++;
  name = '';
  /** @internal */ glTexture: WebGLTexture;
  /** @internal last sampler applied (cached to avoid redundant texParameteri) */
  appliedSampler: SamplerState | null = null;
  protected readonly graphicsDevice: GraphicsDevice;

  /** C#: new Texture2D(graphicsDevice, width, height) -> transparent black texture. */
  constructor(graphicsDevice: GraphicsDevice, width: number, height: number) {
    this.graphicsDevice = graphicsDevice;
    this.width = width;
    this.height = height;
    const gl = graphicsDevice.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('Texture2D: createTexture failed');
    this.glTexture = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  get bounds(): { x: number; y: number; width: number; height: number } {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  /**
   * C# Texture2D.SetData(Color[]) or raw RGBA bytes. Data is uploaded as-is: XNA textures
   * hold PREMULTIPLIED colors when drawn with BlendState.AlphaBlend.
   */
  setData(data: Uint8Array | Color[]): void {
    let bytes: Uint8Array;
    if (data instanceof Uint8Array) {
      bytes = data;
    } else {
      bytes = new Uint8Array(data.length * 4);
      for (let i = 0; i < data.length; i++) {
        const c = data[i];
        bytes[i * 4] = c.r;
        bytes[i * 4 + 1] = c.g;
        bytes[i * 4 + 2] = c.b;
        bytes[i * 4 + 3] = c.a;
      }
    }
    if (bytes.length !== this.width * this.height * 4) throw new Error('Texture2D.setData: size mismatch');
    const gl = this.graphicsDevice.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.glTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }

  /**
   * Creates a texture from a decoded image, emulating the XNA content pipeline
   * TextureProcessor defaults (ColorKeyEnabled=true magenta -> transparent, PremultiplyAlpha=true).
   * Pixels are read back exactly (no canvas 2D precision loss) through a framebuffer.
   */
  static fromImage(
    graphicsDevice: GraphicsDevice,
    source: TexImageSource,
    width: number,
    height: number,
    options: TextureProcessorOptions = {},
  ): Texture2D {
    const colorKeyEnabled = options.colorKeyEnabled ?? true;
    const key = options.colorKeyColor ?? Color.Magenta;
    const premultiply = options.premultiplyAlpha ?? true;

    const tex = new Texture2D(graphicsDevice, width, height);
    const gl = graphicsDevice.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex.glTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    if (!colorKeyEnabled && !premultiply) return tex;

    const pixels = graphicsDevice.readTexturePixels(tex);
    if (!pixels) {
      // Readback unavailable: fall back to GL premultiplication (no color key).
      gl.bindTexture(gl.TEXTURE_2D, tex.glTexture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      return tex;
    }
    const kr = key.r, kg = key.g, kb = key.b, ka = key.a;
    for (let i = 0; i < pixels.length; i += 4) {
      const a = pixels[i + 3];
      if (colorKeyEnabled && pixels[i] === kr && pixels[i + 1] === kg && pixels[i + 2] === kb && a === ka) {
        pixels[i] = pixels[i + 1] = pixels[i + 2] = pixels[i + 3] = 0;
        continue;
      }
      if (premultiply && a !== 255) {
        pixels[i] = Math.round((pixels[i] * a) / 255);
        pixels[i + 1] = Math.round((pixels[i + 1] * a) / 255);
        pixels[i + 2] = Math.round((pixels[i + 2] * a) / 255);
      }
    }
    tex.setData(pixels);
    return tex;
  }

  /** Creates a texture filled with one color (e.g. a 1x1 white pixel for lines/rects). */
  static createSolid(graphicsDevice: GraphicsDevice, width: number, height: number, color: Color): Texture2D {
    const t = new Texture2D(graphicsDevice, width, height);
    const bytes = new Uint8Array(width * height * 4);
    for (let i = 0; i < bytes.length; i += 4) {
      bytes[i] = color.r;
      bytes[i + 1] = color.g;
      bytes[i + 2] = color.b;
      bytes[i + 3] = color.a;
    }
    t.setData(bytes);
    return t;
  }

  /** @internal apply a sampler state to this texture (WebGL1 keeps sampler state per texture). */
  applySampler(gl: GL, s: SamplerState): void {
    if (this.appliedSampler === s) return;
    this.appliedSampler = s;
    const filter = s.filter === TextureFilter.Point ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    const pot = isPow2(this.width) && isPow2(this.height);
    const isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    let wrap: number = gl.CLAMP_TO_EDGE;
    if (pot || isGL2) {
      if (s.address === TextureAddressMode.Wrap) wrap = gl.REPEAT;
      else if (s.address === TextureAddressMode.Mirror) wrap = gl.MIRRORED_REPEAT;
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  }

  dispose(): void {
    this.graphicsDevice.gl.deleteTexture(this.glTexture);
  }
}

/**
 * RenderTarget2D: a texture you can render into with
 * graphicsDevice.setRenderTarget(rt) ... graphicsDevice.setRenderTarget(null).
 * Contents are stored top-row-first like XNA, so it can be drawn as a normal texture.
 */
export class RenderTarget2D extends Texture2D {
  /** @internal */ framebuffer: WebGLFramebuffer;
  constructor(graphicsDevice: GraphicsDevice, width: number, height: number) {
    super(graphicsDevice, width, height);
    const gl = graphicsDevice.gl;
    const fb = gl.createFramebuffer();
    if (!fb) throw new Error('RenderTarget2D: createFramebuffer failed');
    this.framebuffer = fb;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.glTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, graphicsDevice.currentFramebuffer());
  }
  override dispose(): void {
    this.graphicsDevice.gl.deleteFramebuffer(this.framebuffer);
    super.dispose();
  }
}

// ---------------------------------------------------------------------------
// GraphicsDevice
// ---------------------------------------------------------------------------

export class PresentationParameters {
  constructor(
    public backBufferWidth: number,
    public backBufferHeight: number,
  ) {}
}

export class GraphicsDevice {
  readonly gl: GL;
  readonly canvas: HTMLCanvasElement;
  readonly presentationParameters: PresentationParameters;
  /** Viewport in VIRTUAL coordinates (480x800 for the back buffer). */
  viewport: Viewport;
  private renderTarget: RenderTarget2D | null = null;
  private readbackFb: WebGLFramebuffer | null = null;
  /** Bumped whenever the render target changes (SpriteBatch picks up the new projection). */
  renderTargetVersion = 0;

  constructor(canvas: HTMLCanvasElement, virtualWidth = VIRTUAL_WIDTH, virtualHeight = VIRTUAL_HEIGHT) {
    this.canvas = canvas;
    const attrs: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
    };
    const gl =
      (canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl', attrs) as WebGLRenderingContext | null);
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    this.presentationParameters = new PresentationParameters(virtualWidth, virtualHeight);
    this.viewport = new Viewport(0, 0, virtualWidth, virtualHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
  }

  /** Size of the current render target in virtual units (back buffer = 480x800). */
  get targetWidth(): number {
    return this.renderTarget ? this.renderTarget.width : this.presentationParameters.backBufferWidth;
  }
  get targetHeight(): number {
    return this.renderTarget ? this.renderTarget.height : this.presentationParameters.backBufferHeight;
  }
  /** True when rendering into a RenderTarget2D (SpriteBatch flips Y for those). */
  get isRenderingToTarget(): boolean {
    return this.renderTarget !== null;
  }

  /** @internal */
  currentFramebuffer(): WebGLFramebuffer | null {
    return this.renderTarget ? this.renderTarget.framebuffer : null;
  }

  /** @internal binds the current target and sets the GL viewport to cover it. */
  bindTarget(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.currentFramebuffer());
    if (this.renderTarget) gl.viewport(0, 0, this.renderTarget.width, this.renderTarget.height);
    else gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }

  setRenderTarget(target: RenderTarget2D | null): void {
    this.renderTarget = target;
    this.viewport = new Viewport(0, 0, this.targetWidth, this.targetHeight);
    this.renderTargetVersion++;
    this.bindTarget();
  }
  getRenderTarget(): RenderTarget2D | null {
    return this.renderTarget;
  }

  clear(color: Color): void {
    const gl = this.gl;
    this.bindTarget();
    gl.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a / 255);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * Resizes the drawing buffer (physical pixels). The virtual coordinate system stays
   * presentationParameters.backBufferWidth x backBufferHeight.
   */
  setDrawingBufferSize(pixelWidth: number, pixelHeight: number): void {
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
    if (!this.renderTarget) this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
  }

  /** @internal exact RGBA readback of a texture (top row first). */
  readTexturePixels(tex: Texture2D): Uint8Array | null {
    const gl = this.gl;
    this.readbackFb ??= gl.createFramebuffer();
    if (!this.readbackFb) return null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.readbackFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.glTexture, 0);
    let result: Uint8Array | null = null;
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
      result = new Uint8Array(tex.width * tex.height * 4);
      gl.readPixels(0, 0, tex.width, tex.height, gl.RGBA, gl.UNSIGNED_BYTE, result);
    }
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.currentFramebuffer());
    return result;
  }
}

/**
 * Stand-in for Microsoft.Xna.Framework.SharedGraphicsDeviceManager (Silverlight/XNA shared
 * rendering). Initialized once by the app: SharedGraphicsDeviceManager.initialize(device).
 */
export class SharedGraphicsDeviceManager {
  static readonly DefaultBackBufferWidth = VIRTUAL_WIDTH;
  static readonly DefaultBackBufferHeight = VIRTUAL_HEIGHT;
  private static current: SharedGraphicsDeviceManager | null = null;

  private constructor(readonly graphicsDevice: GraphicsDevice) {}

  static initialize(device: GraphicsDevice): SharedGraphicsDeviceManager {
    SharedGraphicsDeviceManager.current = new SharedGraphicsDeviceManager(device);
    return SharedGraphicsDeviceManager.current;
  }
  static get Current(): SharedGraphicsDeviceManager {
    if (!SharedGraphicsDeviceManager.current) throw new Error('SharedGraphicsDeviceManager not initialized');
    return SharedGraphicsDeviceManager.current;
  }
}
