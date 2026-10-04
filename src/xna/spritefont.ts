import { GraphicsDevice, Texture2D } from './graphics';
import { Vector2 } from './math';

/** Mirrors the .spritefont XML (FontDescription). */
export interface FontDescription {
  fontName: string;
  /** Points (XNA rasterizes at 96 dpi: px = size * 96 / 72). */
  size: number;
  spacing?: number;
  style?: 'Regular' | 'Bold' | 'Italic' | 'Bold, Italic';
  /** Inclusive char-code ranges; default [[32, 126]]. */
  characterRegions?: Array<[number, number]>;
  defaultCharacter?: string | null;
  /** CSS fallbacks appended after fontName. */
  fallbackFamilies?: string;
}

/** debugFont.spritefont from ContinuumLibContent: Arial 10pt, Regular, spacing 0, chars 32..126. */
export const DEBUG_FONT_DESCRIPTION: FontDescription = {
  fontName: 'Arial',
  size: 10,
  spacing: 0,
  style: 'Regular',
  characterRegions: [[32, 126]],
  defaultCharacter: null,
};

export interface Glyph {
  /** source rect in atlas pixels (oversampled) */
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  /** quad offset from the pen position, virtual px */
  offsetX: number;
  offsetY: number;
  /** pen advance, virtual px */
  advance: number;
}

const PAD = 2; // virtual px around each glyph to catch overhangs

/**
 * SpriteFont shim: rasterizes the font with canvas 2D into a premultiplied white glyph atlas
 * (like the XNA FontDescriptionProcessor bitmap), then SpriteBatch.drawString draws glyph quads.
 *
 *   font.measureString(text): Vector2      font.lineSpacing      font.spacing
 */
export class SpriteFont {
  readonly texture: Texture2D;
  readonly lineSpacing: number;
  spacing: number;
  defaultCharacter: string | null;
  /** Atlas pixels per virtual pixel (glyphs are rasterized at higher res for crispness). */
  readonly oversample: number;
  private readonly glyphs = new Map<string, Glyph>();

  private constructor(texture: Texture2D, lineSpacing: number, spacing: number, defaultCharacter: string | null, oversample: number) {
    this.texture = texture;
    this.lineSpacing = lineSpacing;
    this.spacing = spacing;
    this.defaultCharacter = defaultCharacter;
    this.oversample = oversample;
  }

  get characters(): string[] {
    return [...this.glyphs.keys()];
  }

  /** @internal */
  getGlyph(ch: string): Glyph | undefined {
    return this.glyphs.get(ch) ?? (this.defaultCharacter ? this.glyphs.get(this.defaultCharacter) : undefined);
  }

  /** XNA MeasureString: width of the widest line, height = lines * lineSpacing. */
  measureString(text: string): Vector2 {
    let maxW = 0;
    let w = 0;
    let lines = 1;
    let first = true;
    for (const ch of text) {
      if (ch === '\r') continue;
      if (ch === '\n') {
        maxW = Math.max(maxW, w);
        w = 0;
        lines++;
        first = true;
        continue;
      }
      const g = this.getGlyph(ch);
      if (!g) continue;
      if (!first) w += this.spacing;
      first = false;
      w += g.advance;
    }
    maxW = Math.max(maxW, w);
    return new Vector2(maxW, lines * this.lineSpacing);
  }

  /** Builds a SpriteFont. Await document.fonts.ready first if the font is a web font. */
  static create(graphicsDevice: GraphicsDevice, desc: FontDescription, oversample = 2): SpriteFont {
    const px = (desc.size * 96) / 72;
    const style = desc.style ?? 'Regular';
    const weight = style.includes('Bold') ? 'bold ' : '';
    const italic = style.includes('Italic') ? 'italic ' : '';
    const family = `"${desc.fontName}", ${desc.fallbackFamilies ?? '"Liberation Sans", Arimo, Helvetica, sans-serif'}`;
    const cssFont = (scale: number): string => `${italic}${weight}${px * scale}px ${family}`;

    const chars: string[] = [];
    for (const [a, b] of desc.characterRegions ?? [[32, 126]]) {
      for (let c = a; c <= b; c++) chars.push(String.fromCharCode(c));
    }

    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d')!;
    mctx.font = cssFont(1);
    const m = mctx.measureText('Mg');
    const ascent = m.fontBoundingBoxAscent ?? px * 0.905;
    const descent = m.fontBoundingBoxDescent ?? px * 0.212;
    const lineSpacing = Math.ceil(Math.max(ascent + descent, px * 1.15));

    const cellH = Math.ceil((lineSpacing + PAD * 2) * oversample);
    const maxRowW = 1024;
    type Placed = { ch: string; x: number; y: number; w: number; advance: number };
    const placed: Placed[] = [];
    let x = 0;
    let y = 0;
    for (const ch of chars) {
      const advance = mctx.measureText(ch).width;
      const w = Math.ceil((advance + PAD * 2) * oversample);
      if (x + w > maxRowW) {
        x = 0;
        y += cellH;
      }
      placed.push({ ch, x, y, w, advance });
      x += w;
    }
    const atlasW = maxRowW;
    const atlasH = y + cellH;

    const canvas = document.createElement('canvas');
    canvas.width = atlasW;
    canvas.height = atlasH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.font = cssFont(oversample);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    const baseline = (PAD + (lineSpacing - (ascent + descent)) / 2 + ascent) * oversample;
    for (const p of placed) ctx.fillText(p.ch, p.x + PAD * oversample, p.y + baseline);

    // premultiplied white: rgb = alpha
    const img = ctx.getImageData(0, 0, atlasW, atlasH);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      d[i] = d[i + 1] = d[i + 2] = a;
    }
    const tex = new Texture2D(graphicsDevice, atlasW, atlasH);
    tex.setData(new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
    tex.name = `SpriteFont:${desc.fontName}`;

    const font = new SpriteFont(tex, lineSpacing, desc.spacing ?? 0, desc.defaultCharacter ?? null, oversample);
    for (const p of placed) {
      font.glyphs.set(p.ch, {
        srcX: p.x,
        srcY: p.y,
        srcW: p.w,
        srcH: cellH,
        offsetX: -PAD,
        offsetY: -PAD,
        advance: p.advance,
      });
    }
    return font;
  }
}
