/**
 * Phase-1 demo: proves the XNA layer (preload, SpriteBatch, blend states, SpriteFont, audio,
 * touch, accelerometer, GameTimer). Will be replaced by the real app shell.
 */
import './style.css';
import { CONTENT_MANIFEST, TEXT_MANIFEST } from './contentManifest';
import { loadWebFonts } from './fonts';
import { createStage } from './stage';
import {
  Accelerometer,
  BlendState,
  Color,
  ContentManager,
  GameTimer,
  GestureType,
  MathHelper,
  Rectangle,
  SoundEffect,
  SpriteBatch,
  SpriteEffects,
  SpriteFont,
  SpriteSortMode,
  Texture2D,
  TimeSpan,
  TitleContainer,
  TouchPanel,
  Vector2,
  Vector3,
  requestMotionPermission,
} from './xna';

async function main(): Promise<void> {
  const app = document.getElementById('app')!;
  const stage = createStage(app);
  const gd = stage.graphicsDevice;

  const status = document.createElement('div');
  status.style.cssText =
    'position:absolute;left:0;right:0;bottom:24px;text-align:center;font:24px "Squared Display",sans-serif;color:#7CC6FF;pointer-events:none';
  stage.overlay.append(status);

  await loadWebFonts();
  const content = new ContentManager(gd, 'Content');
  await Promise.all([
    content.preload(CONTENT_MANIFEST, (d, t) => (status.textContent = `Loading ${d}/${t}`)),
    TitleContainer.preload(TEXT_MANIFEST),
  ]);
  status.textContent = 'Tap to play a sound';

  const level = new DOMParser().parseFromString(TitleContainer.readAllText('Levels/RandomLevel.xml'), 'text/xml');
  const levelTitle = level.documentElement.getAttribute('title') ?? '?';

  const spriteBatch = new SpriteBatch(gd);
  const bg = content.load<Texture2D>('Backgrounds/bgr0_0');
  const ship = content.load<Texture2D>('Ships/ship'); // case-insensitive like XNA on Windows
  const tachyon = content.load<Texture2D>('Effects/tachyon');
  const enemy = content.load<Texture2D>('Enemies/easy');
  const asteroid = content.load<Texture2D>('Asteroids/asteroid');
  const stream = content.load<Texture2D>('Animations/TachyonStream');
  const shadow = content.load<Texture2D>('Effects/shadowcorner');
  const font = content.load<SpriteFont>('debugFont');
  const explosion = content.load<SoundEffect>('Sounds/explosion');
  const line = Texture2D.createSolid(gd, 2, 3, Color.White);

  TouchPanel.enabledGestures = GestureType.Tap | GestureType.FreeDrag | GestureType.Flick;

  let accel = new Vector3(0, 0, -1);
  const accelerometer = new Accelerometer();
  accelerometer.currentValueChanged.add((_s, e) => {
    accel = e.sensorReading.acceleration;
  });
  accelerometer.start();

  stage.stage.addEventListener('pointerdown', () => void requestMotionPermission(), { once: true });

  const shipPos = new Vector2(240, 600);
  let lastGesture = 'none';
  let rotation = 0;
  let fps = 0;
  let frames = 0;
  let fpsTimer = 0;

  const timer = new GameTimer();
  timer.updateInterval = TimeSpan.Zero;
  timer.update.add((_s, e) => {
    const dt = e.elapsedTime.totalSeconds;
    rotation += dt;
    while (TouchPanel.isGestureAvailable) {
      const g = TouchPanel.readGesture();
      lastGesture = `${GestureType[g.gestureType]} ${g.gestureType === GestureType.Flick ? g.delta.toString() : g.position.toString()}`;
      if (g.gestureType === GestureType.Tap) {
        explosion.play(1, 0, 0);
      }
    }
    shipPos.x = MathHelper.clamp(shipPos.x + accel.x * 800 * dt, 0, 480);
    shipPos.y = MathHelper.clamp(shipPos.y - accel.y * 800 * dt, 0, 800);
  });

  timer.draw.add((_s, e) => {
    frames++;
    fpsTimer += e.elapsedTime.totalSeconds;
    if (fpsTimer >= 1) {
      fps = frames;
      frames = 0;
      fpsTimer -= 1;
    }
    gd.clear(Color.Black);

    spriteBatch.begin();
    spriteBatch.draw(bg, new Rectangle(0, 0, 480, 800), new Rectangle(0, 0, 480, 800), Color.White);
    // tachyon stream animation frame (sprite sheet 2000x1600, 40 frames in 2 rows of 20)
    const frame = Math.floor(rotation * 20) % 40;
    const fw = 100;
    const fh = 800;
    spriteBatch.draw(
      stream,
      new Rectangle(380, 400, fw, fh),
      new Rectangle((frame % 20) * fw, Math.floor(frame / 20) * fh, fw, fh),
      Color.White,
      0,
      new Vector2(fw / 2, fh / 2),
      SpriteEffects.None,
      0,
    );
    spriteBatch.draw(enemy, new Rectangle(120, 200, enemy.width, enemy.height), null, Color.White, rotation, new Vector2(enemy.width / 2, enemy.height / 2), SpriteEffects.None, 0);
    spriteBatch.draw(asteroid, new Vector2(300, 260), null, Color.lerp(Color.White, Color.Red, 0.5), -rotation, new Vector2(15, 14), 2, SpriteEffects.None, 0);
    spriteBatch.draw(ship, new Vector2(shipPos.x - ship.width / 2, shipPos.y - ship.height / 2), Color.White);
    // shadow corners (flip effects)
    const sr = new Rectangle(0, 0, 240, 400);
    spriteBatch.draw(shadow, new Rectangle(0, 0, 120, 200), sr, Color.White.mul(0.6), 0, Vector2.Zero, SpriteEffects.None, 0);
    spriteBatch.draw(shadow, new Rectangle(360, 0, 120, 200), sr, Color.White.mul(0.6), 0, Vector2.Zero, SpriteEffects.FlipHorizontally, 0);
    // a line like LineRenderer.DrawLine
    const p1 = new Vector2(40, 720);
    const p2 = new Vector2(440, 680);
    const diff = Vector2.subtract(p2, p1);
    spriteBatch.draw(line, p1, null, Color.Yellow.mul(0.5), Math.atan2(diff.y, diff.x), new Vector2(0, 1), new Vector2(diff.length() / 2, 1 / 3), SpriteEffects.None, 0);
    spriteBatch.end();

    spriteBatch.begin(SpriteSortMode.Deferred, BlendState.Additive);
    for (let i = 0; i < 12; i++) {
      const a = rotation * 2 + (i * Math.PI * 2) / 12;
      spriteBatch.draw(tachyon, new Vector2(240 + Math.cos(a) * 90, 420 + Math.sin(a) * 90), null, Color.White, 0, new Vector2(7, 6), 2, SpriteEffects.None, 0);
    }
    spriteBatch.end();

    spriteBatch.begin();
    const title = `Level: ${levelTitle}`;
    spriteBatch.drawString(font, title, new Vector2(240 - font.measureString(title).x / 2, 20), Color.White);
    spriteBatch.drawString(
      font,
      `FPS: ${fps}\nGesture: ${lastGesture}\nAccel (${Accelerometer.mode}): ${accel.x.toFixed(2)} ${accel.y.toFixed(2)} ${accel.z.toFixed(2)}\nArrows/WASD tilt on desktop`,
      new Vector2(8, 44),
      Color.White.mul(0.9),
    );
    spriteBatch.end();
  });
  timer.start();
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<pre style="position:fixed;left:0;top:0;color:#f66;white-space:pre-wrap">${String(err?.stack ?? err)}</pre>`,
  );
});
