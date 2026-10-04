import {
  Color,
  GameTimer,
  Rectangle,
  SharedGraphicsDeviceManager,
  SpriteBatch,
  SpriteEffects,
  TimeSpan,
  TouchPanel,
  Vector2,
  Vector3,
  siteUrl,
  type ContentManager,
  type GameTimerEventArgs,
  type SpriteFont,
  type Texture2D,
} from '../../xna';
import { App } from '../App';
import { Player } from '../Elements/Player';
import { AnimationManager } from '../Management/AnimationManager';
import { AsteroidManager } from '../Management/AsteroidsManager';
import { BackgroundManager } from '../Management/BackgroundManager';
import { BulletsManager } from '../Management/BulletsManager';
import { CollisionDetector } from '../Management/CollisionDetector';
import { EnemyManager } from '../Management/EnemyManager';
import { ExplosionParticleManager } from '../Management/ExplosionParticleManager';
import { InputManager } from '../Management/InputManager';
import { LevelManager } from '../Management/LevelManager';
import { PowerUpManager } from '../Management/PowerUpManager';
import { RandomizerManager } from '../Management/RandomizerManager';
import { SoundManager } from '../Management/SoundManager';
import { TachyonManager } from '../Management/TachyonManager';
import { TimeManager } from '../Management/TimeManager';
import { Score } from '../Scores/Score';
import { GameState } from '../State/GameState';
import { LineRenderer } from '../Utilities/LineRenderer';
import { Constants, LifeState, TextureConstant, TimeState } from '../Utilities/Utilities';
import { attachPressedState, createWpButton, createWpProgressBar } from './Controls';
import { MessageBox, MessageBoxButton, MessageBoxResult } from './MessageBox';
import { CancelEventArgs, PhoneApplicationPage, type NavigationEventArgs } from './Navigation';
import { Storyboard } from './Storyboard';

/**
 * GamePage.xaml(.cs): hosts the XNA game loop (GameTimer: OnUpdate then OnDraw each frame)
 * and the XAML overlay as DOM elements above the canvas (time tank bar, grenade button,
 * game-over name entry with Save/Back). Back key = PAUSED dialog (or leave after game over).
 *
 * Web deviations: the blocking MessageBox is emulated by stopping the GameTimer while the dialog
 * is open (the frame clock restarts at dt = 0 on resume, D3); UserIdleDetectionMode -> Screen
 * Wake Lock API (D5); the UIElementRenderer texture is replaced by the DOM overlay (D6).
 */
export class GamePage extends PhoneApplicationPage {
  contentManager: ContentManager;

  gameTimer: GameTimer;

  private counterDraw: number;
  private fpsDraw: number;
  private lastMsDraw: number;

  spriteBatch!: SpriteBatch;
  lineRenderer!: LineRenderer;

  // State
  gs: GameState;

  // Graphic effects
  bloodIndex = 0;
  shadowIndex = 0;
  scopeTextureIndex = 0;
  private fadeInterpolationIndex = 0;
  shadowSource: Rectangle = new Rectangle();
  bloodSource: Rectangle = new Rectangle();
  timeColor: Color = new Color(0, 0, 0, 0);
  bloodColor: Color = new Color(0, 0, 0, 0);
  gridColor: Color = new Color(0, 0, 0, 0);
  playerColor: Color = new Color(0, 0, 0, 0);

  // Managers
  timeManager: TimeManager;
  levelManager: LevelManager;
  inputManager: InputManager;
  backgroundManager: BackgroundManager;
  bulletsManager: BulletsManager;
  tachyonManager: TachyonManager;
  animationManager: AnimationManager;
  asteroidManager: AsteroidManager;
  enemyManager: EnemyManager;
  collisionDetector: CollisionDetector;
  powerUpManager: PowerUpManager;
  randomizerManager: RandomizerManager;
  explosionParticleManager: ExplosionParticleManager;
  player: Player;

  // Font
  private debugFont!: SpriteFont;

  // Debug strings (unused, kept for fidelity)
  debugText = '';
  debugText2 = '';

  // Scores
  scores: Score[] | null = null;

  private morto = false;

  // XAML overlay elements
  private readonly timeTankBar: { root: HTMLDivElement; setValue: (v: number) => void };
  private readonly endRectangle: HTMLDivElement;
  private readonly nameEndTextBox: HTMLInputElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly granadebutton_initialfade: Storyboard;

  private wakeLock: { release: () => Promise<void> } | null = null;
  private navigatedTo = false;
  private paused = false;

  constructor() {
    super('game-page', false);

    // Get the content manager from the application
    this.contentManager = App.current.content;

    // InitializeComponent(): the XAML overlay
    const timeTankBar = createWpProgressBar('game-timetankbar');
    this.timeTankBar = timeTankBar;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.tabIndex = -1;
    btn.className = 'game-lastchance';
    const btnBorder = document.createElement('span');
    btnBorder.className = 'game-lastchance-border';
    btnBorder.style.backgroundImage = `url("${siteUrl('grenade_button.png')}")`;
    const btnContent = document.createElement('span');
    btnContent.className = 'game-lastchance-content';
    btnContent.style.backgroundImage = `url("${siteUrl('grenade_button.png')}")`;
    btnBorder.append(btnContent);
    btn.append(btnBorder);
    attachPressedState(btn);
    btn.addEventListener('click', () => {
      btn.blur();
      this.buttonLastChance_Click();
    });

    this.endRectangle = document.createElement('div');
    this.endRectangle.className = 'game-endrectangle';

    this.nameEndTextBox = document.createElement('input');
    this.nameEndTextBox.type = 'text';
    this.nameEndTextBox.className = 'wp-textbox game-nametextbox';
    this.nameEndTextBox.value = 'Player';
    this.nameEndTextBox.autocomplete = 'off';
    this.nameEndTextBox.spellcheck = false;
    this.nameEndTextBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.nameEndTextBox.blur();
    });

    this.saveButton = createWpButton('Save', 'game-savebutton', () => this.saveButton_Click());
    this.cancelButton = createWpButton('Back', 'game-cancelbutton', () => this.cancelButton_Click());

    for (const el of [this.endRectangle, this.nameEndTextBox, this.saveButton, this.cancelButton]) {
      el.style.display = 'none'; // Visibility="Collapsed"
    }
    // z-order = XAML document order
    this.root.append(btn, timeTankBar.root, this.endRectangle, this.nameEndTextBox, this.saveButton, this.cancelButton);

    this.granadebutton_initialfade = new Storyboard().add(btn, 'opacity', [
      { t: 0, value: 0 },
      { t: 2, value: 0 },
      { t: 5, value: 1 },
    ]);

    // Create a timer for this page
    this.gameTimer = new GameTimer();
    this.gameTimer.updateInterval = TimeSpan.Zero;
    this.gameTimer.update.add(this.onUpdate);
    this.gameTimer.draw.add(this.onDraw);

    this.counterDraw = 0;
    this.lastMsDraw = 0;
    this.fpsDraw = 0;

    // Screen size of the current device
    Constants.SCREEN_WIDTH = SharedGraphicsDeviceManager.DefaultBackBufferWidth;
    Constants.SCREEN_HEIGHT = SharedGraphicsDeviceManager.DefaultBackBufferHeight;

    // Create a new GameState or use the existing one
    const app = App.current;
    if (app.gs === null) app.gs = new GameState();
    this.gs = app.gs;
    const gs = this.gs;
    this.levelManager = new LevelManager(gs, 'RandomLevel.xml');
    this.timeManager = new TimeManager(gs);
    this.inputManager = new InputManager(gs, this.timeManager);
    this.backgroundManager = new BackgroundManager(gs, this.levelManager.numberOfBackgroundLevels);
    this.bulletsManager = new BulletsManager(gs);
    this.tachyonManager = new TachyonManager(gs);
    this.animationManager = new AnimationManager(gs);
    this.asteroidManager = new AsteroidManager(gs);
    this.enemyManager = new EnemyManager(gs);
    this.powerUpManager = new PowerUpManager(gs);
    this.collisionDetector = new CollisionDetector(gs);
    this.randomizerManager = new RandomizerManager(gs);
    this.explosionParticleManager = new ExplosionParticleManager(gs);

    this.player = new Player(gs);
    this.playerColor = Color.White;

    SoundManager.loadSound('bulletHit');
    SoundManager.loadSound('explosion');
    SoundManager.loadSound('powerUp');
    SoundManager.loadSound('rewindStart');
    SoundManager.loadSound('rocket');
    SoundManager.loadSound('gridStart');
    SoundManager.loadSound('gridEnd');
    SoundManager.loadSound('rewindEnd');
    SoundManager.loadSound('rewindStart');

    gs.timeTank = 0;
  }

  override onBackKeyPress(e: CancelEventArgs): void {
    super.onBackKeyPress(e);

    if (this.paused) {
      e.cancel = true;
      return;
    }

    this.granadebutton_initialfade.pause();

    if (this.gs.playerLifeState === LifeState.DELETING) {
      this.navigationService.goBack();
      App.current.gs = null;
    } else {
      // MessageBox.Show blocks the UI thread (and so the GameTimer) on WP7: stop the loop while open.
      e.cancel = true;
      this.paused = true;
      this.gameTimer.stop();
      void MessageBox.show('Press OK to Exit\nPress CANCEL to Continue', 'PAUSED', MessageBoxButton.OKCancel).then(
        (result) => {
          this.paused = false;
          if (!this.navigatedTo) return;
          if (result === MessageBoxResult.OK) {
            App.current.gs = null;
            this.navigationService.goBack();
          } else {
            this.gameTimer.start(); // frame clock restarts with dt = 0 (D3)
            this.granadebutton_initialfade.resume();
            this.inputManager.recalibrateAccelerometer();
          }
        },
      );
    }
  }

  override onNavigatedTo(e: NavigationEventArgs): void {
    this.navigatedTo = true;
    const gd = SharedGraphicsDeviceManager.Current.graphicsDevice;

    this.spriteBatch = new SpriteBatch(gd);
    this.lineRenderer = new LineRenderer(gd);

    // Loading...
    this.levelManager.getTextures(this.contentManager);
    this.levelManager.getRandomVariables();
    this.levelManager.goToStartLevel();

    const gs = this.gs;
    this.player.textureIndex = gs.textureIndices.getTextureIndex('playership');
    this.shadowIndex = gs.textureIndices.getTextureIndex('shadow');
    this.bloodIndex = gs.textureIndices.getTextureIndex('blood');
    this.scopeTextureIndex = gs.textureIndices.getTextureIndex(TextureConstant.SCOPE);

    this.debugFont = this.contentManager.load<SpriteFont>('debugFont');

    // Default color
    this.timeColor = Color.Black;
    this.gridColor = Color.Yellow.mul(0.5);

    // Gestures recognized on the menu pages are stale for the new game (web: the TouchPanel
    // listens on the whole stage).
    TouchPanel.reset();

    // Start the timer
    this.gameTimer.start();

    // Disable UserIdleDetection (D5: Screen Wake Lock API)
    this.requestWakeLock();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    App.current.unobscured.add(this.onUnobscured);

    this.granadebutton_initialfade.begin();

    super.onNavigatedTo(e);
  }

  override onNavigatedFrom(e: NavigationEventArgs): void {
    this.navigatedTo = false;
    // Stop the timer
    this.gameTimer.stop();

    this.releaseWakeLock();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    App.current.unobscured.remove(this.onUnobscured);

    // Clear the canvas so the last frame doesn't linger under the other pages
    SharedGraphicsDeviceManager.Current.graphicsDevice.clear(Color.Black);

    super.onNavigatedFrom(e);
  }

  private onUpdate = (_sender: unknown, e: GameTimerEventArgs): void => {
    const gs = this.gs;
    this.timeTankBar.setValue((100.0 * gs.timeTank) / Constants.MAX_TIME_TANK_VALUE);
    this.playerColor = Color.White;
    if (gs.levelTime.time <= Constants.INITIAL_BLACK_DURATION + Constants.INITIAL_FADE_DURATION) {
      if (gs.levelTime.time <= Constants.INITIAL_BLACK_DURATION) this.timeColor = Color.Black;
      else {
        this.fadeInterpolationIndex = (gs.levelTime.time - Constants.INITIAL_BLACK_DURATION) / Constants.INITIAL_FADE_DURATION;
        this.timeColor = Color.lerp(Color.Black, Color.White, this.fadeInterpolationIndex);
      }
    } else if (gs.levelTime.continuum < 0)
      this.timeColor = Color.lerp(Color.White, Constants.BACK_IN_TIME_COLOR, Math.abs(gs.levelTime.continuum));
    // else: timeColor is NOT reset (QUIRK: keeps the aim-mode green tint)

    if (gs.playerLife <= Constants.PLAYER_LIFE_CRITICAL_VALUE) {
      this.bloodSource = new Rectangle(0, 0, 240, 400);
      const intensity = gs.playerLife / Constants.PLAYER_LIFE_CRITICAL_VALUE;
      this.playerColor = new Color(new Vector3(1, intensity, intensity));
    }

    if (gs.playerLifeState !== LifeState.DELETING) {
      this.timeManager.update(e);

      if (gs.levelTime.continuum < 0) {
        const hw = Math.trunc(Constants.SCREEN_WIDTH / 2);
        const hh = Math.trunc(Constants.SCREEN_HEIGHT / 2);
        this.shadowSource = new Rectangle(
          hw - Math.trunc(hw * gs.playerTime.continuum * (1 / Constants.CONTINUUM_MIN)),
          hh - Math.trunc(hh * gs.playerTime.continuum * (1 / Constants.CONTINUUM_MIN)),
          hw,
          hh,
        );
      }

      this.player.update(this.inputManager);
      this.inputManager.update();
      this.levelManager.update();
      this.backgroundManager.update();
      this.bulletsManager.update();
      this.tachyonManager.update();
      this.animationManager.update();
      this.asteroidManager.update();
      this.enemyManager.update();
      this.powerUpManager.update();
      this.collisionDetector.update();
      this.randomizerManager.update();
      this.explosionParticleManager.update();
    } else {
      if (!this.morto) {
        this.endRectangle.style.display = '';
        this.nameEndTextBox.style.display = '';
        this.saveButton.style.display = '';
        this.cancelButton.style.display = '';
      }
      this.morto = true;
    }
  };

  /** Allows the page to draw itself. */
  private onDraw = (_sender: unknown, e: GameTimerEventArgs): void => {
    const gs = this.gs;
    const sb = this.spriteBatch;
    const tm = this.timeManager;
    SharedGraphicsDeviceManager.Current.graphicsDevice.clear(Color.Black);
    sb.begin();

    const levels = this.backgroundManager.backgroundLevels;
    for (let i = 0; i < levels.length && levels[i] != null; i++) {
      const bg = levels[i]!;
      if (bg.lifeState !== LifeState.DEAD && bg.lifeState !== LifeState.DAMAGED) {
        switch (bg.lifeState) {
          case LifeState.NORMAL:
            sb.draw(gs.textures[bg.textureIndex], bg.destinationRectangle, this.timeColor);
            sb.draw(gs.textures[bg.textureIndex], bg.destinationRectangle2, this.timeColor);
            break;
          case LifeState.TRANSITIONING:
            sb.draw(gs.textures[bg.transitionTextureIndex!], bg.destinationRectangle, this.timeColor);
            sb.draw(gs.textures[bg.textureIndex], bg.destinationRectangle2, this.timeColor);
            break;
          case LifeState.BEINGREPLACED:
            sb.draw(gs.textures[bg.textureIndex], bg.destinationRectangle, this.timeColor);
            sb.draw(gs.textures[bg.replacingTextureIndex], bg.destinationRectangle2, this.timeColor);
            break;
        }
      }
    }

    for (const x of gs.animations)
      if (x.lifeState !== LifeState.DEAD) {
        sb.draw(gs.textures[x.textureIndex], x.destinationRectangle, x.sourceRectangle, this.timeColor, x.rotation, x.origin, SpriteEffects.None, 0);
      }

    if (gs.playerLifeState !== LifeState.DEAD && gs.playerLifeState !== LifeState.DELETING)
      sb.draw(
        gs.textures[this.player.textureIndex],
        new Vector2(
          gs.playerPosition.x - Math.trunc(gs.textures[0].width / 2),
          gs.playerPosition.y - Math.trunc(gs.textures[0].height / 2),
        ),
        new Color(Vector3.multiply(this.timeColor.toVector3(), this.playerColor.toVector3())),
      );

    for (const x of gs.powerUps)
      if (x.lifeState !== LifeState.DEAD) {
        sb.draw(gs.textures[x.textureIndex], x.destinationRectangle, x.sourceRectangle, this.timeColor, x.rotation, x.origin, SpriteEffects.None, 0);
      }

    for (const x of gs.tachyons)
      if (x.lifeState !== LifeState.DEAD) {
        sb.draw(gs.textures[x.textureIndex], x.destinationRectangle, x.sourceRectangle, this.timeColor, x.rotation, x.origin, SpriteEffects.None, 0);
      }

    for (const x of gs.bullets)
      if (x.lifeState !== LifeState.DEAD) {
        sb.draw(gs.textures[x.textureIndex], x.destinationRectangle, x.sourceRectangle, this.timeColor, x.rotation, x.origin, SpriteEffects.None, 0);
      }

    for (const x of gs.asteroids)
      if (x.lifeState !== LifeState.DEAD) {
        sb.draw(gs.textures[x.textureIndex], x.destinationRectangle, x.sourceRectangle, this.timeColor, x.rotation, x.origin, SpriteEffects.None, 0);
      }

    for (const x of gs.enemies)
      if (x.lifeState !== LifeState.DEAD) {
        const enemyColor = new Color(Vector3.multiply(this.timeColor.toVector3(), x.lifeColor.toVector3()));
        sb.draw(gs.textures[x.textureIndex], x.destinationRectangle, x.sourceRectangle, enemyColor, x.rotation, x.origin, SpriteEffects.None, 0);
      }

    for (const x of gs.explosionParticles)
      if (x.lifeState !== LifeState.DEAD) {
        sb.draw(gs.textures[x.textureIndex], x.destinationRectangle, x.sourceRectangle, this.timeColor.mul(x.alpha), x.rotation, x.origin, SpriteEffects.None, 0);
      }

    // Grid lines
    if (tm.drawLines) {
      if (tm.state === TimeState.ENTER_PLASMA_GRANADE_LAUNCHER)
        this.timeColor = Color.lerp(Color.White, Color.LightGreen, tm.normalizedDelta);

      if (tm.state === TimeState.EXIT_PLASMA_GRANADE_LAUNCHER)
        this.timeColor = Color.lerp(Color.LightGreen, Color.White, tm.normalizedDelta);

      for (let i = 0; i < gs.gridVerticalPoints.length; i++)
        this.lineRenderer.drawLine(sb, gs.gridVerticalPoints[i][0], gs.gridVerticalPoints[i][1], 1, this.gridColor);

      for (let i = 0; i < gs.gridHorizontalPoints.length; i++)
        this.lineRenderer.drawLine(sb, gs.gridHorizontalPoints[i][0], gs.gridHorizontalPoints[i][1], 1, this.gridColor);
    }

    if (tm.state === TimeState.CALIBRATION_PLASMA_GRANADE_PATH_TARGET_POINT) {
      const tx: Texture2D = gs.textures[this.scopeTextureIndex];
      sb.draw(
        tx,
        new Rectangle(Math.trunc(gs.firstFingerPosition.x), Math.trunc(gs.firstFingerPosition.y), tx.width, tx.height),
        null,
        Color.White,
        tm.rotation,
        new Vector2(Math.trunc(tx.width / 2), Math.trunc(tx.height / 2)),
        SpriteEffects.None,
        0,
      );
    }

    if (tm.state === TimeState.CALIBRATION_PLASMA_GRANADE_PATH_CONTROL_POINT) {
      const tx: Texture2D = gs.textures[this.scopeTextureIndex];
      const origin = new Vector2(Math.trunc(tx.width / 2), Math.trunc(tx.height / 2));
      sb.draw(
        tx,
        new Rectangle(Math.trunc(gs.firstFingerPosition.x), Math.trunc(gs.firstFingerPosition.y), tx.width, tx.height),
        null, Color.White, tm.rotation, origin, SpriteEffects.None, 0,
      );
      sb.draw(
        tx,
        new Rectangle(Math.trunc(gs.secondFingerPosition.x), Math.trunc(gs.secondFingerPosition.y), tx.width, tx.height),
        null, Color.White, tm.rotation, origin.clone(), SpriteEffects.None, 0,
      );
      let point1 = tm.path.evaluate(0);
      let point2 = Vector2.Zero;
      // float loop: 0.1f accumulated in float32 runs 9 times (the 0.9 -> 1.0 segment is not drawn)
      for (let i = Math.fround(0.1); i <= 1; i = Math.fround(i + Math.fround(0.1))) {
        point2 = tm.path.evaluate(i);
        this.lineRenderer.drawLine(sb, point1, point2, 2, Color.Azure);
        point1 = point2;
      }
    }

    const W = Constants.SCREEN_WIDTH;
    const H = Constants.SCREEN_HEIGHT;
    const hw = Math.trunc(W / 2);
    const hh = Math.trunc(H / 2);
    if (gs.playerTime.continuum < 0) {
      const tex = gs.textures[this.shadowIndex];
      sb.draw(tex, new Rectangle(0, 0, hw, hh), this.shadowSource, Color.White, 0, Vector2.Zero, SpriteEffects.None, 0);
      sb.draw(tex, new Rectangle(hw, 0, hw, hh), this.shadowSource, Color.White, 0, Vector2.Zero, SpriteEffects.FlipHorizontally, 0);
      sb.draw(tex, new Rectangle(hw, hh, hw, hh), this.shadowSource, Color.White, 0, Vector2.Zero, SpriteEffects.FlipHorizontally | SpriteEffects.FlipVertically, 0);
      sb.draw(tex, new Rectangle(0, hh, hw, hh), this.shadowSource, Color.White, 0, Vector2.Zero, SpriteEffects.FlipVertically, 0);
    }

    if (gs.playerLife <= Constants.PLAYER_LIFE_CRITICAL_VALUE) {
      const alpha = 1 - gs.playerLife / Constants.PLAYER_LIFE_CRITICAL_VALUE;
      const tex = gs.textures[this.bloodIndex];
      sb.draw(tex, new Rectangle(0, 0, hw, hh), this.bloodSource, new Color(255, 255, 255).mul(alpha), 0, Vector2.Zero, SpriteEffects.None, 0);
      sb.draw(tex, new Rectangle(hw, 0, hw, hh), this.bloodSource, new Color(255, 255, 255).mul(alpha), 0, Vector2.Zero, SpriteEffects.FlipHorizontally, 0);
      sb.draw(tex, new Rectangle(hw, hh, hw, hh), this.bloodSource, new Color(255, 255, 255).mul(alpha), 0, Vector2.Zero, SpriteEffects.FlipHorizontally | SpriteEffects.FlipVertically, 0);
      sb.draw(tex, new Rectangle(0, hh, hw, hh), this.bloodSource, new Color(255, 255, 255).mul(alpha), 0, Vector2.Zero, SpriteEffects.FlipVertically, 0);
    }

    // (UIrenderer.Texture: the XAML overlay is the DOM above the canvas)

    // Initial level fade
    if (gs.levelTime.time < Constants.INITIAL_BLACK_DURATION + Constants.INITIAL_FADE_DURATION) {
      const font = this.debugFont;
      const title = this.levelManager.title!;
      const subtitle = this.levelManager.subtitle!;
      const color = gs.levelTime.time > Constants.INITIAL_BLACK_DURATION ? Color.White.mul(1 - this.fadeInterpolationIndex) : Color.White;
      sb.drawString(font, title, new Vector2(hw - font.measureString(title).x / 2, hh), color);
      sb.drawString(font, subtitle, new Vector2(hw - font.measureString(subtitle).x / 2, hh + 20), color.clone());
    }

    sb.end();
    this.counterDraw++;
    if (e.totalTime.milliseconds < this.lastMsDraw) {
      this.fpsDraw = this.counterDraw;
      this.counterDraw = 0;
    }
    this.lastMsDraw = e.totalTime.milliseconds;
    this.debugText2 = '\nDraw: ' + this.fpsDraw.toString();
  };

  private buttonLastChance_Click(): void {
    if (this.gs.granadeNumber > 0) this.timeManager.activatePlasmaGranadeLauncher();
  }

  /** Save button click handler */
  private saveButton_Click(): void {
    let name = this.nameEndTextBox.value;

    if (name.length > Constants.MAX_NAME_LENGTH) name = name.substring(0, Constants.MAX_NAME_LENGTH);

    if (name.trim() === '') name = 'Player';

    this.scores = Score.writeScores(this.gs.playerTime.time, name);
    this.onBackKeyPress(new CancelEventArgs(false));
  }

  /** Cancel button click handler */
  private cancelButton_Click(): void {
    this.onBackKeyPress(new CancelEventArgs(false));
  }

  // ------------------------------------------------------------------ web helpers

  private requestWakeLock(): void {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (!wl) return;
      wl.request('screen').then(
        (lock) => {
          if (this.navigatedTo) this.wakeLock = lock;
          else void lock.release().catch(() => undefined);
        },
        () => undefined,
      );
    } catch {
      /* Wake Lock API unavailable */
    }
  }

  private releaseWakeLock(): void {
    try {
      const lock = this.wakeLock;
      this.wakeLock = null;
      if (lock) void lock.release().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  /** Wake locks are released by the browser when the page is hidden: re-acquire on return. */
  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && this.navigatedTo) {
      this.wakeLock = null;
      this.requestWakeLock();
    }
  };

  /** D3: after a tab switch, restart the frame clock (dt = 0) instead of a clamped jump. */
  private onUnobscured = (): void => {
    if (this.gameTimer.isRunning) {
      this.gameTimer.stop();
      this.gameTimer.start();
    }
  };
}
