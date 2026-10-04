# XNA / WP7 compatibility layer

`src/xna/` reimplements the subset of XNA 4.0 / Windows Phone 7.1 APIs that Continuum uses
(found by grepping `Continuum/Continuum/**/*.cs`). The goal is that C# translates to TS nearly
line by line. Import everything from `./xna` (the barrel `src/xna/index.ts`).

Naming: **classes / enums / enum members / static constants are PascalCase as in XNA**
(`Vector2`, `Color.White`, `Vector2.Zero`, `SpriteEffects.FlipHorizontally`, `GestureType.Tap`,
`SharedGraphicsDeviceManager.DefaultBackBufferWidth`); **methods and properties are camelCase,
otherwise unchanged** (`Vector2.distance`, `v.length()`, `rect.intersects`, `rect.center`,
`MathHelper.clamp`, `spriteBatch.drawString`, `font.measureString`, `ts.totalSeconds`).
Fields of value types are lowercase: `v.x`, `v.y`, `r.width`, `c.r`. `Matrix` keeps `M11`..`M44`.

| Module | Main exports |
| --- | --- |
| `math.ts` | `MathHelper`, `Vector2`, `Vector3`, `Point`, `Rectangle`, `Matrix` |
| `color.ts` | `Color` |
| `timespan.ts` | `TimeSpan` |
| `event.ts` | `XnaEvent<T>` (C# events) |
| `random.ts` | `Random` (bit-exact .NET Framework generator) |
| `graphics.ts` | `GraphicsDevice`, `Texture2D`, `RenderTarget2D`, `BlendState`, `SamplerState`, `SpriteSortMode`, `SpriteEffects`, `SharedGraphicsDeviceManager`, `VIRTUAL_WIDTH/HEIGHT` |
| `spritebatch.ts` | `SpriteBatch` |
| `spritefont.ts` | `SpriteFont`, `DEBUG_FONT_DESCRIPTION` |
| `content.ts` | `ContentManager`, `TitleContainer`, `siteUrl` |
| `audio.ts` | `SoundEffect`, `SoundEffectInstance`, `SoundState`, `MediaPlayer`, `Song`, `MediaState`, `unlockAudio` |
| `touch.ts` | `TouchPanel`, `GestureType`, `GestureSample`, `TouchLocation`, `TouchLocationState`, `TouchCollection` |
| `accelerometer.ts` | `Accelerometer`, `AccelerometerReading`, `SensorReadingEventArgs`, `requestMotionPermission` |
| `gametimer.ts` | `GameTimer`, `GameTimerEventArgs` |
| `storage.ts` | `IsolatedStorageSettings`, `IsolatedStorageFile` |

The app shell is in `src/stage.ts` (`createStage(root)`), which creates the 480x800 stage, the
`GraphicsDevice`, initializes `SharedGraphicsDeviceManager`, attaches `TouchPanel` and installs
the audio unlock. The asset list is in `src/contentManifest.ts`.

---

## 1. Value types (C# `struct`): THE copy rules

`Vector2`, `Vector3`, `Point`, `Rectangle`, `Color`, `Matrix`, `TouchLocation` are structs in C#
(copied on assignment) but JS classes here (shared by reference). Follow these rules:

1. **Static operations always return new instances**: `Vector2.add/subtract/multiply/divide/negate/normalize/lerp/transform`,
   `Color.multiply/lerp`, `Rectangle.intersect/union`, `Matrix.multiply`. Safe to store.
2. **Static constants are getters returning a fresh instance** each access: `Vector2.Zero`,
   `Vector2.One`, `Vector3.Zero`, `Rectangle.Empty`, `Matrix.Identity`, `Color.White`, ... Mutating
   them is harmless (but allocates; hoist into a local in hot loops if you like).
3. **When C# copies a struct and either copy is later mutated, call `.clone()`**:
   ```csharp
   startPosition = StartPosition;      // field = parameter
   currentPosition = StartPosition;    // second field from the same value
   currentPosition.X += 5;             // mutation must not affect startPosition
   ```
   ```ts
   this.startPosition = startPosition.clone();
   this.currentPosition = startPosition.clone();
   this.currentPosition.x += 5;
   ```
   Clone when: storing a parameter/property value in a field, returning a field from a
   property getter that callers may mutate (e.g. `get CurrentPosition() { return this.currentPosition; }`
   is fine only if no caller mutates the result), copying array elements, saving "previous"
   values (`oldPos = pos`), and pushing into history lists (TimeMachine/ElementRecord records!).
   When in doubt, clone - it is always correct.
4. **Instance mutators mutate in place, exactly like C#**: `v.normalize()`, `rect.offset()`,
   `rect.inflate()`, `v.x = ...`. `Vector2.normalize(v)` (static) returns a new vector.
5. **C# compound assignment on a struct field rebinds, not mutates**: `pos += dir * speed` →
   `pos = Vector2.add(pos, Vector2.multiply(dir, speed))` (creates a new object - never write
   it as in-place mutation of a possibly shared instance).
6. **Default struct values**: an unassigned C# `Vector2` field is `(0,0)`, so initialize fields
   with `new Vector2()` / `Vector2.Zero`, `new Rectangle()`, `new Color(0,0,0,0)`
   (C# `default(Color)` is transparent black, not white).
7. **Nullable structs** (`Vector2?`, `Rectangle?`): use `Vector2 | null`; `x.Value` → `x!`,
   `x.HasValue` → `x !== null`.
8. **Equality**: C# `==` on structs compares values → use `a.equals(b)`, never `===`.
9. `Rectangle` and `Point` constructors **truncate toward zero** (as the C# `(int)` casts that
   were required anyway). Assigning fields directly (`r.x = 3.7`) does NOT truncate: write
   `Math.trunc(...)` yourself there.

## 2. Operators

C# operator overloads become static calls:

| C# | TS |
| --- | --- |
| `a + b`, `a - b` (vectors) | `Vector2.add(a, b)`, `Vector2.subtract(a, b)` |
| `v * s`, `s * v`, `v * w` | `Vector2.multiply(v, s)`, `Vector2.multiply(v, w)` |
| `v / s` | `Vector2.divide(v, s)` |
| `-v` | `Vector2.negate(v)` |
| `color * alpha` | `Color.multiply(color, alpha)` or `color.mul(alpha)` |
| `new Color(v3a * v3b)` | `new Color(Vector3.multiply(a.toVector3(), b.toVector3()))` |
| `m1 * m2` (Matrix) | `Matrix.multiply(m1, m2)` |
| `SpriteEffects.FlipHorizontally \| SpriteEffects.FlipVertically` | same (numeric flags) |
| `TouchPanel.EnabledGestures = A \| B` | same (numeric flags) |

## 3. Numbers

- C# `int / int` truncates: `Math.trunc(a / b)` (or `(a / b) | 0` for small values).
  Watch `Constants.SCREEN_WIDTH / 2` style expressions: with 480/800 they are exact, but
  `(SCREEN_WIDTH / 2) * x` where `x` is an odd int is not.
- `(int)x` cast → `Math.trunc(x)`. `(float)` / `(double)` casts → drop.
- `float` vs `double`: JS uses doubles. Results may differ in the last bits; this is accepted.
  Use `Math.fround` only if some logic depends on float rounding (unlikely).
- `Math.Abs/Min/Max/Sin/Cos/Atan2/Acos/Sqrt/Log` → `Math.abs/min/max/...`. `Math.PI` same.
  `MathHelper.Clamp` → `MathHelper.clamp` (XNA order: max checked first).
- `Convert.ToInt32(string)` → `parseInt(s, 10)` (C# rounds-half-even for doubles!).
  `float.Parse` with invariant culture → `parseFloat`.

## 4. Color

```ts
new Color(143, 193, 209)         // C# new Color(int r, int g, int b) - alpha 255
new Color(255, 255, 255, 128)    // ints 0..255
new Color(new Vector3(1, i, i))  // C# new Color(Vector3) - floats 0..1
Color.fromFloats(1, 0.5, 0.5)    // C# new Color(float, float, float[, float])  <-- JS cannot overload int/float!
Color.fromNonPremultiplied(r, g, b, a)
Color.lerp(Color.Black, Color.White, t)   // fixed-point XNA math, amount clamped to [0,1]
Color.White.mul(0.5)             // all four channels (premultiplied fade), like XNA
c.toVector3()
```

## 5. Rendering

```ts
const spriteBatch = new SpriteBatch(SharedGraphicsDeviceManager.Current.graphicsDevice);
gd.clear(Color.Black);
spriteBatch.begin();   // Deferred + BlendState.AlphaBlend (premultiplied) + LinearClamp
spriteBatch.draw(tex, destRect, color);
spriteBatch.draw(tex, destRect, srcRect /* or null */, color);
spriteBatch.draw(tex, destRect, srcRect, color, rotation, origin, SpriteEffects.None, layerDepth);
spriteBatch.draw(tex, position, color);
spriteBatch.draw(tex, position, srcRect, color);
spriteBatch.draw(tex, position, srcRect, color, rotation, origin, scale /* number|Vector2 */, effects, layerDepth);
spriteBatch.drawString(font, text, position, color[, rotation, origin, scale, effects, depth]);
spriteBatch.end();
spriteBatch.begin(SpriteSortMode.Deferred, BlendState.Additive);  // sortMode, blend, sampler, depthStencil, rasterizer, effect, transformMatrix
```

- Virtual resolution is 480x800 portrait (WP7 back buffer). All coordinates are virtual pixels;
  the stage scales them to the window (canvas backing store = 480x800 x devicePixelRatio).
- `Constants.SCREEN_WIDTH = SharedGraphicsDeviceManager.DefaultBackBufferWidth` → 480, height 800.
- Origin semantics match XNA: with a destination rectangle the origin is in source-texture pixels
  and is scaled to the destination size. Flip effects swap texture coordinates only (origin unchanged).
- Sort modes: Deferred, Immediate, Texture, BackToFront, FrontToBack (stable sorts). Custom
  `Effect`s are not supported (ignored with a warning). DepthStencil/Rasterizer accepted and ignored.
- Textures are loaded like the XNA content pipeline with default TextureProcessor settings
  (the `.contentproj` overrides nothing): **ColorKeyEnabled** (exact magenta 255,0,255,255 →
  transparent) and **PremultiplyAlpha**. Blend states: `AlphaBlend` = (ONE, ONE_MINUS_SRC_ALPHA),
  `Additive` = (SRC_ALPHA, ONE), `NonPremultiplied` = (SRC_ALPHA, ONE_MINUS_SRC_ALPHA), `Opaque`.
- `Texture2D`: `width`, `height`, `setData(Uint8Array | Color[])` (premultiplied data),
  `Texture2D.createSolid(gd, w, h, color)`.
- `LineRenderer` used `new RenderTarget2D(gd, 2, 3)` cleared white: either keep that
  (`RenderTarget2D` + `gd.setRenderTarget(rt); gd.clear(Color.White); gd.setRenderTarget(null)` works)
  or use `Texture2D.createSolid(gd, 2, 3, Color.White)` (equivalent, simpler).
- `UIElementRenderer` (Silverlight XAML rendered into a texture) has **no** equivalent: XAML
  pages/HUD become DOM elements inside `stage.overlay` (480x800 CSS px, scaled with the canvas).
  Draw order caveat: the overlay is always above the canvas. In GamePage the XAML texture was
  drawn before the level-title text; the title text should be drawn by the canvas anyway.
- `SpriteFont`: `debugFont` = Arial 10pt (13.33 px) rasterized via canvas into a glyph atlas
  (fallback Liberation Sans/Arimo/Helvetica if Arial is missing). `measureString(text): Vector2`,
  `lineSpacing`, `spacing`. Metrics are close to, not identical to, XNA's.

## 6. Content loading

C# `ContentManager.Load<T>()` is synchronous. In the browser everything in
`src/contentManifest.ts` is preloaded first, then `load<T>()` is a synchronous cache lookup:

```ts
const content = new ContentManager(graphicsDevice, 'Content');   // App.Content
await content.preload(CONTENT_MANIFEST, (done, total) => ...);
await TitleContainer.preload(TEXT_MANIFEST);                      // Levels/*.xml
content.load<Texture2D>('Ships/ship');        // names are case-insensitive (Windows FS), '\' ok
content.load<SoundEffect>('Sounds/' + name);
content.load<Song>('Sounds/continuum');
content.load<SpriteFont>('debugFont');
TitleContainer.readAllText('Levels/RandomLevel.xml')  // then parse with DOMParser (replaces XmlReader)
```
Missing assets throw `ContentLoadException: ... was not preloaded`. To add an asset, add it to
the manifest. Note `Levels/Level1.xml` references textures that no longer exist in the repo
(`Animations/animation`, `Animations/explosion`, `Backgrounds/background_roccia`) - only
`RandomLevel.xml` is used by the game.

Site-relative URLs (Vite `base: './'`): use `siteUrl('img/Ship.png')` for anything under `public/`
(e.g. `<img>` sources in the HTML pages), never absolute `/...` paths.

## 7. Timing (GameTimer, GameTime, TimeSpan)

```ts
gameTimer = new GameTimer();
gameTimer.updateInterval = TimeSpan.Zero;        // as in GamePage: one Update per frame
gameTimer.update.add(this.onUpdate);             // C# gameTimer.Update += OnUpdate;
gameTimer.draw.add(this.onDraw);
gameTimer.start(); gameTimer.stop();
private onUpdate = (sender: unknown, e: GameTimerEventArgs): void => {
  e.elapsedTime.totalSeconds; e.totalTime.milliseconds;
};
```
- Frames capped at 60 fps (Silverlight `MaxFrameRate` default) - `GameTimer.maxFrameRate`.
- Elapsed time per frame clamped to 100 ms (`GameTimer.maxElapsedMs`) so tab switches don't explode physics.
- `updateInterval > 0` gives fixed-step updates (WP7 default 333333 ticks = 30 Hz).
- The `FrameworkDispatcherTimer` / `FrameworkDispatcher.Update()` pump is not needed: drop it.
- `TimeSpan`: `TimeSpan.Zero`, `TimeSpan.fromSeconds(s)`, `new TimeSpan(d, h, m, s, ms)`,
  `.ticks`, `.minutes/.seconds/.milliseconds` (components), `.totalSeconds/.totalMilliseconds`,
  `.compareTo()`. Immutable.
- `DateTime.Now.Day/Month/Year` → `new Date().getDate()/getMonth() + 1/getFullYear()`.

## 8. Events

```ts
// C#: accelerometer.CurrentValueChanged += new EventHandler<...>(handler);
accelerometer.currentValueChanged.add(this.handler);   // handler = (sender, e) => ...
accelerometer.currentValueChanged.remove(this.handler);
// Declaring your own C# event:
readonly obscured = new XnaEvent<ObscuredEventArgs>();  this.obscured.invoke(this, args);
```
Use arrow-function properties (or `.bind(this)`) for handlers; keep the same reference to remove.

## 9. Input

**Touch** (positions in virtual 480x800 px):
```ts
TouchPanel.getCapabilities()                 // { isConnected: true, maximumTouchCount: 4 }
TouchPanel.enabledGestures = GestureType.Tap | GestureType.FreeDrag | GestureType.Flick;
while (TouchPanel.isGestureAvailable) {
  const g = TouchPanel.readGesture();         // g.gestureType, g.position, g.delta, g.timestamp
}
const collection = TouchPanel.getState();     // TouchCollection
collection.count; collection.get(i); collection.findById(id) /* null = not found */;
// C#: if (collection.FindById(id, out loc)) {...}  ->  const loc = collection.findById(id); if (loc) {...}
```
`TouchLocation`: `id`, `position`, `state` (`Pressed` first report, `Moved`, `Released` once -
released touches ARE included in that one `getState()` result, like XNA). Mouse acts as one finger.
Flick `delta` is a velocity in px/s (`delta.y > 0` = downward flick). Thresholds are in `touch.ts`.

**Accelerometer** (g units, WP7 axes: +X right, +Y top of screen, +Z out of the screen;
gravity direction, flat face-up = (0,0,-1)):
```ts
const accelerometer = new Accelerometer();
accelerometer.currentValueChanged.add((s, e) => { this.reading = e.sensorReading.acceleration; });
accelerometer.start(); accelerometer.stop();
```
On iOS, call `requestMotionPermission()` from a user-gesture handler (the main menu Start button)
before the game page. On desktop (no devicemotion data within 600 ms) arrow keys / WASD tilt
smoothly up to ±0.5 g (Right = +x, Up = +y). `Accelerometer.mode` tells which source is active.
The keyboard is ignored while an `<input>`/`<textarea>` has focus (name entry box).
`VibrateController.Default.Start(TimeSpan)` → `navigator.vibrate?.(ts.totalMilliseconds)` (not shimmed).

## 10. Audio

```ts
const sfx = content.load<SoundEffect>('Sounds/explosion');
sfx.play(); sfx.play(volume, pitch, pan);
const inst = sfx.createInstance(); inst.isLooped = true; inst.volume = 0.5; inst.play();
inst.state === SoundState.Stopped; inst.stop(); inst.pause(); inst.resume();
if (MediaPlayer.gameHasControl) { MediaPlayer.isRepeating = true; MediaPlayer.play(song); }
```
Browsers lock audio until a user gesture; the stage unlocks it on the first pointer/key event.
While locked, one-shot sound effects are dropped (`state` stays `Stopped`), looped instances
start on unlock and `MediaPlayer.play` is retried on unlock. Songs stream through an `<audio>`
element routed into Web Audio (not fully decoded in memory).

## 11. Storage

- `IsolatedStorageSettings.applicationSettings`: `get/set/contains/remove/tryGetValue/save`,
  JSON in localStorage.
- `IsolatedStorageFile.getUserStoreForApplication()`: `fileExists/readAllText/writeAllText/deleteFile`
  for text files. Replace `XmlSerializer` + `IsolatedStorageFileStream` (scores.xml, saved.xml)
  with JSON (or XML strings) written through this API. `using (...)` blocks → plain code.
- All access is try/catch-wrapped; private mode falls back to memory for the session.

## 12. Random

`new Random()` / `new Random(seed)` with `next()`, `next(max)`, `next(min, max)`,
`nextDouble()`: the exact .NET Framework algorithm (seeded sequences match WP7).

## 13. Misc C# idioms

- `LinkedList<T>` / `List<T>` / `Dictionary<K,V>` → arrays / `Map` (watch `First`, `Next`,
  `AddLast`, `Remove(node)` semantics in TimeMachine code; a small LinkedList class may be
  worth writing in the game code).
- `out` parameters → return value (or `{ value }` objects); `ref` → return the new value.
- `properties { get; private set; }` → public field or getter/setter.
- `foreach` over a collection that is modified inside the loop throws in C#; JS doesn't - keep logic identical.
- `string.Substring(a, len)` → `s.substring(a, a + len)`; `name.Trim() == ""` → `name.trim() === ''`.
- `MessageBox.Show(...)` / `NavigationService` / `PhoneApplicationService` → app shell (HTML overlay).
