/**
 * ContentManager shim. XNA loads synchronously from .xnb files; the browser must fetch
 * asynchronously, so assets are PRELOADED once (await content.preload(manifest)), after which
 * game code calls the synchronous content.load<T>(name) exactly like C#.
 *
 *   const content = new ContentManager(graphicsDevice, 'Content');
 *   await content.preload(CONTENT_MANIFEST, (done, total) => ...);
 *   const tex = content.load<Texture2D>('Ships/ship');      // case-insensitive, '\' or '/'
 *   const sfx = content.load<SoundEffect>('Sounds/explosion');
 *   const song = content.load<Song>('Sounds/continuum');
 *   const font = content.load<SpriteFont>('debugFont');
 *
 * Single assets can also be loaded on demand: await content.loadTexture2D('Ships/Ship'), etc.
 *
 * Non-content files that C# read with XmlReader/TitleContainer (e.g. Levels/RandomLevel.xml,
 * relative to the site root, NOT the Content folder):
 *   await TitleContainer.preload(['Levels/RandomLevel.xml']);
 *   const xml = TitleContainer.readAllText('Levels/RandomLevel.xml');
 */
import { SoundEffect, Song } from './audio';
import { GraphicsDevice, Texture2D, type TextureProcessorOptions } from './graphics';
import { SpriteFont, type FontDescription } from './spritefont';

export type ContentType = 'Texture2D' | 'SoundEffect' | 'Song' | 'SpriteFont';

export interface ContentManifestEntry {
  /** Asset name as used by XNA (no extension), e.g. 'Ships/Ship'. */
  name: string;
  type: ContentType;
  /** File path relative to the content root, with extension (Texture2D/SoundEffect/Song). */
  file?: string;
  /** SpriteFont description (SpriteFont only). */
  font?: FontDescription;
  /** Texture processor parameters (defaults = XNA defaults: color key magenta, premultiply). */
  processor?: TextureProcessorOptions;
}

/** Site base URL (Vite `base`), always ending with '/'. */
export function baseUrl(): string {
  const b = import.meta.env.BASE_URL || './';
  return b.endsWith('/') ? b : b + '/';
}

/** Resolves a path relative to the site root (handles spaces etc.). */
export function siteUrl(path: string): string {
  return baseUrl() + path.split('/').map(encodeURIComponent).join('/');
}

/** Safari / iOS WebKit (iOS Chrome/Firefox report CriOS/FxiOS, no "Chrome"). */
const isWebKit = (): boolean => {
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Android|Edg\//.test(ua);
};

const normalize = (name: string): string => name.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();

export class ContentManager {
  rootDirectory: string;
  readonly graphicsDevice: GraphicsDevice;
  private readonly cache = new Map<string, unknown>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(graphicsDevice: GraphicsDevice, rootDirectory = 'Content') {
    this.graphicsDevice = graphicsDevice;
    this.rootDirectory = rootDirectory;
  }

  /** Synchronous XNA-style load from the preload cache. Throws ContentLoadException if missing. */
  load<T>(assetName: string): T {
    const key = normalize(assetName);
    if (!this.cache.has(key)) {
      throw new Error(`ContentLoadException: "${assetName}" was not preloaded (add it to the content manifest)`);
    }
    return this.cache.get(key) as T;
  }

  isLoaded(assetName: string): boolean {
    return this.cache.has(normalize(assetName));
  }

  /** Loads every manifest entry in parallel. onProgress(done, total). */
  async preload(entries: ContentManifestEntry[], onProgress?: (done: number, total: number) => void): Promise<void> {
    let done = 0;
    const total = entries.length;
    onProgress?.(0, total);
    await Promise.all(
      entries.map(async (e) => {
        await this.loadEntry(e);
        done++;
        onProgress?.(done, total);
      }),
    );
  }

  loadEntry(entry: ContentManifestEntry): Promise<unknown> {
    const key = normalize(entry.name);
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = this.fetchEntry(entry).then((asset) => {
      this.cache.set(key, asset);
      this.inflight.delete(key);
      return asset;
    });
    this.inflight.set(key, p);
    return p;
  }

  loadTexture2D(name: string, file = name + '.png', processor?: TextureProcessorOptions): Promise<Texture2D> {
    return this.loadEntry({ name, type: 'Texture2D', file, processor }) as Promise<Texture2D>;
  }
  loadSoundEffect(name: string, file = name + '.wav'): Promise<SoundEffect> {
    return this.loadEntry({ name, type: 'SoundEffect', file }) as Promise<SoundEffect>;
  }
  loadSong(name: string, file = name + '.mp3'): Promise<Song> {
    return this.loadEntry({ name, type: 'Song', file }) as Promise<Song>;
  }
  loadSpriteFont(name: string, font: FontDescription): Promise<SpriteFont> {
    return this.loadEntry({ name, type: 'SpriteFont', font }) as Promise<SpriteFont>;
  }

  /** Drops all cached assets (XNA Unload). */
  unload(): void {
    for (const v of this.cache.values()) {
      if (v instanceof Texture2D) v.dispose();
    }
    this.cache.clear();
  }

  private url(file: string): string {
    return siteUrl(`${this.rootDirectory}/${file}`);
  }

  private async fetchEntry(e: ContentManifestEntry): Promise<unknown> {
    switch (e.type) {
      case 'Texture2D': {
        const url = this.url(e.file ?? e.name + '.png');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`ContentLoadException: ${url}: HTTP ${res.status}`);
        const blob = await res.blob();
        let source: TexImageSource;
        let w: number;
        let h: number;
        try {
          // WebKit (Safari, every iOS browser) has honoured premultiplyAlpha/colorSpaceConversion
          // 'none' unreliably: a premultiplied bitmap would be premultiplied twice and break the
          // exact magenta color key. Use the <img> path there (UNPACK_* pixelStorei applies).
          if (typeof createImageBitmap !== 'function' || isWebKit()) throw new Error('use <img>');
          const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
          source = bmp;
          w = bmp.width;
          h = bmp.height;
        } catch {
          const img = new Image();
          const obj = URL.createObjectURL(blob);
          const loaded = new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(`ContentLoadException: ${url}: image decode failed`));
          });
          img.src = obj;
          try {
            await img.decode();
          } catch {
            await loaded; // Safari can reject decode() spuriously (large images); onload still fires
          }
          URL.revokeObjectURL(obj);
          source = img;
          w = img.naturalWidth;
          h = img.naturalHeight;
        }
        const tex = Texture2D.fromImage(this.graphicsDevice, source, w, h, e.processor);
        if (source instanceof ImageBitmap) source.close();
        tex.name = e.name;
        return tex;
      }
      case 'SoundEffect': {
        const url = this.url(e.file ?? e.name + '.wav');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`ContentLoadException: ${url}: HTTP ${res.status}`);
        const sfx = await SoundEffect.fromArrayBuffer(await res.arrayBuffer());
        sfx.name = e.name;
        return sfx;
      }
      case 'Song': {
        const song = new Song(this.url(e.file ?? e.name + '.mp3'));
        song.name = e.name;
        return song; // streamed; do not block preload on the whole mp3
      }
      case 'SpriteFont': {
        if (!e.font) throw new Error(`SpriteFont ${e.name}: missing font description`);
        try {
          await document.fonts.load(`${e.font.size}pt "${e.font.fontName}"`);
        } catch {
          /* system font / not loadable: canvas falls back */
        }
        return SpriteFont.create(this.graphicsDevice, e.font);
      }
    }
  }
}

/** Text files outside the Content pipeline (TitleContainer / XmlReader.Create(path)). */
export const TitleContainer = {
  cache: new Map<string, string>(),
  async preload(paths: string[]): Promise<void> {
    await Promise.all(
      paths.map(async (p) => {
        const res = await fetch(siteUrl(p.replace(/\\/g, '/')));
        if (!res.ok) throw new Error(`TitleContainer: ${p}: HTTP ${res.status}`);
        TitleContainer.cache.set(normalize(p), await res.text());
      }),
    );
  },
  readAllText(path: string): string {
    const t = TitleContainer.cache.get(normalize(path));
    if (t === undefined) throw new Error(`FileNotFoundException: "${path}" was not preloaded`);
    return t;
  },
};
