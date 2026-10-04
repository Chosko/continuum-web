# Continuum Arena: porting notes (WP7 Silverlight+XNA C# → TypeScript/Vite/WebGL)

Source: `/home/user/continuum-arena` (read-only). Code is in `Continuum/Continuum/` (the "Continuum" app project). `ContinuumLib` is an empty XNA library that only exists to reference `ContinuumLibContent` (the XNA content project). In this document, `file:line` paths are relative to `Continuum/Continuum/` unless they start with `ContinuumLibContent/`. Comments and identifiers in the source are in Italian.

The goal is a **faithful port**: keep the behaviour, including the quirks marked **QUIRK**. Fix something only when the fix is listed as a deliberate deviation (see §8).

---

## 0. TL;DR for the 4 agents

* Logical screen: **480×800 portrait**. All game math is in these pixels. `Constants.SCREEN_WIDTH/HEIGHT` are set to 480/800 in `GamePage` ctor (GamePage.xaml.cs:102-103). Some code hardcodes 480/800 directly (Utilities.cs:303,317; BackgroundTexture.cs:72,75,113; GameState.cs:239).
* Game loop: one `update(dt)` followed by one `draw()` per display frame, with a **variable timestep** (`GameTimer.UpdateInterval = TimeSpan.Zero`, GamePage.xaml.cs:93). `dt = e.ElapsedTime.TotalSeconds` is used only in `TimeManager.Update` (TimeManager.cs:318). Every other piece of code derives its time from the three `TimeMachine`s.
* The "time travel" is **not** a full snapshot system. Each `TimeTraveler` computes its position as a pure function of `levelTime`. Discrete state changes are journaled as undo closures (`ElementRecord`). The player is journaled as 33 ms `PlayerState` snapshots. See §1.4.
* Rendering: a single `SpriteBatch.Begin()` per frame with the defaults: Deferred sort, **premultiplied** AlphaBlend, LinearClamp. The Silverlight overlay (grenade button, time-tank bar, end-game dialog) should become **DOM elements over the canvas**.
* Input: accelerometer tilt moves the ship. Flick down rewinds time. Tap stops the rewind. The grenade button starts aim mode; then 1 finger sets the target, a 2nd finger sets the Bezier control point, and lifting a finger fires. See §6.
* Persistence: only `scores.xml` (XmlSerializer `Score[]`, top 10 by survived time). See §1.6.
* Value-type semantics (Vector2/Rectangle/Color are structs) are the #1 porting hazard. See §7.

---

## 1. Architecture overview

### 1.1 App lifecycle (App.xaml / App.xaml.cs)

* `App()` (App.xaml.cs:51-101):
  1. `InitializeComponent()`. App.xaml has **empty** `Application.Resources`. Its `ApplicationLifetimeObjects` are `PhoneApplicationService` (Launching/Closing/Activated/Deactivated handlers) and `xna:SharedGraphicsDeviceManager`.
  2. `InitializePhoneApplication()` (boilerplate RootFrame) and `InitializeXnaApplication()` (:267-286). The latter creates `AppServiceProvider` (a trivial `IServiceProvider` dictionary that is only needed by ContentManager, so the web port can drop it), `ContentManager(Services, "Content")`, and a `GameTimer FrameworkDispatcherTimer` whose `FrameAction` calls `FrameworkDispatcher.Update()`. On the web that pump is a no-op.
  3. `gs = null` (the app holds the single `GameState gs`, :46).
  4. `RootFrame.Obscured` / `Unobscured` (:68-71, handlers :108-134). Obscured fires on a phone call or lock screen. It backs up `albertTime/playerTime/levelTime.continuum` into the nullable floats `gs.alberttimecontunuumbackup` etc. and sets all three to 0, which freezes the game because all time derives from albertTime. Unobscured restores them. **Web:** `document.visibilitychange` (hidden → obscured, visible → unobscured).
  5. If debugger attached: frame-rate counter plus `UserIdleDetectionMode.Disabled` (debug only, ignore).
  6. **Music** (:93-99): `if (MediaPlayer.GameHasControl) { Song music = Content.Load<Song>("Sounds/continuum"); FrameworkDispatcher.Update(); MediaPlayer.IsRepeating = true; MediaPlayer.Play(music); }`. The music starts once at app start and loops forever over all pages, with no volume control. **Web:** start a looping `continuum.mp3` on the first user gesture (autoplay policy).
  7. `SoundManager.Initialize(Content, "Sounds/")` (:100).
* `Application_Deactivated` (:152-167, tombstoning): if `gs != null`, takes a named `Mutex("SAVEMUTEX")` and XmlSerializes `gs` (plus 17 extra types, `GetTypesArray` :184-206) to IsolatedStorage `saved.xml`. **It is never read back anywhere**, so it is dead. Don't port it, or at most stub it.
* `Application_Launching/Activated/Closing`: empty.
* Start page: `WMAppManifest.xml` `DefaultTask NavigationPage="MainPage.xaml"`. App title "Continuum Arena" (use as `<title>`). Icon `ApplicationIcon.png` (62×62); tile background `Background.png` (173×173). OS splash `SplashScreenImage.jpg` (480×800).

### 1.2 Page navigation

```
MainPage ──Start──────────▶ GamePage   (new GamePage instance per navigation → new game)
         ──Instructions───▶ TutorialPage (class name `Tutorial`)
         ──Scores─────────▶ ScorePage
         ──Credits────────▶ Credits (class name `Page1`)
         ──Other Games────▶ (no Click handler: does nothing)
Back key on any sub page → GoBack to MainPage; Back on MainPage → exit app.
```
* MainPage stays alive in the back stack. Its constructor runs the `Apertura` intro storyboard **only once per app launch**; returning from another page does not replay it.
* GamePage back-key handling (GamePage.xaml.cs:140-173):
  * `granadebutton_initialfade.Pause()`.
  * If `gs.playerLifeState == DELETING` (game over), `GoBack()` and `app.gs = null`.
  * Otherwise show the modal `MessageBox.Show("Press OK to Exit\nPress CANCEL to Continue", "PAUSED", OKCancel)`. The blocking modal **is the pause feature**: the UI thread and therefore GameTimer stop.
    * OK → `app.gs = null; GoBack()`.
    * Cancel → `e.Cancel = true; storyboard.Resume(); inputManager.RecalibrateAccelerometer()`, which re-zeroes the tilt.
  * **Web:** Escape/browser-back/on-screen pause should open a modal and stop the RAF loop. On resume, reset the frame clock so dt does not include the paused time. It is unknown whether WP7's GameTimer delivered one huge `ElapsedTime` after the modal; resetting is the sane choice (deviation D3).
* `gs` lifetime: GamePage ctor does `if (app.gs == null) app.gs = new GameState(); gs = app.gs;` (:106-109). gs is set to null whenever the game page is left, so every Start is a fresh game.

### 1.3 GamePage hosting the XNA loop

Ctor (GamePage.xaml.cs:81-138):
* `contentManager = App.Content`. `LayoutUpdated += GamePage_LayoutUpdated`. That handler sets the back-buffer to ActualWidth/Height and creates `UIElementRenderer(this, w, h)` plus `SilverlightRectangle = (0,0,w,h)` (:175-192), which renders the page's XAML into a texture each frame.
* `gameTimer = new GameTimer(); UpdateInterval = TimeSpan.Zero; Update += OnUpdate; Draw += OnDraw`.
* `Constants.SCREEN_WIDTH = SharedGraphicsDeviceManager.DefaultBackBufferWidth (480); SCREEN_HEIGHT = DefaultBackBufferHeight (800)`.
* Creates the gs if needed (above), then in this order: `levelManager = new LevelManager(gs, "RandomLevel.xml")` (parses the XML header), `timeManager = new TimeManager(gs)` (sets `gs.timeState = FORWARD`), `inputManager = new InputManager(gs, timeManager)`, `backgroundManager = new BackgroundManager(gs, levelManager.NumberOfBackgroundLevels /*3*/)`, then `bulletsManager`, `tachyonManager`, `animationManager`, `asteroidManager`, `enemyManager`, `powerUpManager`, `collisionDetector`, `randomizerManager`, `explosionParticleManager`, `player = new Player(gs)`, `playerColor = White`.
* `SoundManager.LoadSound` for bulletHit, explosion, powerUp, rewindStart, rocket, gridStart, gridEnd, rewindEnd, rewindStart (duplicate, ignored by the ContainsKey guard). `gs.timeTank = 0`.

`OnNavigatedTo` (:194-228):
* `SetSharingMode(true)`; `PresentationInterval.One` (vsync).
* `spriteBatch = new SpriteBatch(gd)`; `lineRenderer = new LineRenderer(gd)`.
* `levelManager.getTextures(contentManager)` (loads every `<texture>` and fills `gs.textures[]` and `gs.textureIndices`, then calls `gs.SetPlayerBounds()`); `getRandomVariables()`; `goToStartLevel()`.
* `player.TextureIndex = idx("playership")`, `shadowIndex = idx("shadow")`, `bloodIndex = idx("blood")`, `scopeTextureIndex = idx("scope")`.
* `debugFont = Load<SpriteFont>("debugFont")`.
* `timeColor = Black; gridColor = Color.Yellow * 0.5f` (= premultiplied RGBA 127,127,0,127).
* `gameTimer.Start()`; `UserIdleDetectionMode.Disabled` (→ Screen Wake Lock API); `granadebutton_initialfade.Begin()`.

`OnNavigatedFrom` (:230-241): stop the timer, `SetSharingMode(false)`, idle detection back on.

**OnUpdate(e)** (:245-305), in order:
```
TimeTankBar.Value = 100 * gs.timeTank / MAX_TIME_TANK_VALUE(8)
playerColor = White
if levelTime.time <= 2+3:                       // INITIAL_BLACK_DURATION + INITIAL_FADE_DURATION
    if levelTime.time <= 2: timeColor = Black
    else: fadeInterpolationIndex = (levelTime.time-2)/3f; timeColor = Color.Lerp(Black, White, fadeInterpolationIndex)
else if levelTime.continuum < 0: timeColor = Color.Lerp(White, BACK_IN_TIME_COLOR(143,193,209), |levelTime.continuum|)
// else: timeColor is NOT reset → keeps last value (QUIRK, see Draw: the green tint of aim mode persists through it)
if gs.PlayerLife <= PLAYER_LIFE_CRITICAL_VALUE(13):
    bloodSource = Rect(0,0,240,400); intensity = PlayerLife/13f; playerColor = new Color(new Vector3(1, intensity, intensity))
if gs.playerLifeState != DELETING:
    debugText = ... (unused)
    timeManager.Update(e)
    if levelTime.continuum < 0:
        shadowSource = Rect(240 - (int)(240 * playerTime.continuum * (1f/-1)), 400 - (int)(400 * playerTime.continuum * (1f/-1)), 240, 400)
    player.Update(inputManager)
    inputManager.Update()
    levelManager.Update(); backgroundManager.Update(); bulletsManager.Update(); tachyonManager.Update();
    animationManager.Update(); asteroidManager.Update(); enemyManager.Update(); powerUpManager.Update();
    collisionDetector.Update(); randomizerManager.Update(); explosionParticleManager.Update()
else:
    if !morto: show EndRectangle, NameEndTextBox, SaveButton, CancelButton (Visibility.Visible)
    morto = true
```
Game over freezes the simulation, but Draw keeps running.

**OnDraw(e)** (:310-472). Clear Black, then `UIrenderer.Render()`, then `spriteBatch.Begin()` and draw in this exact order:
1. Backgrounds: `for i in 0..BackgroundLevels.Length while BackgroundLevels[i] != null`. Skip if lifeState is DEAD or DAMAGED. NORMAL: draw tex at `DestinationRectangle` and at `DestinationRectangle2`. TRANSITIONING: TransitionTexture at Dest1, tex at Dest2. BEINGREPLACED: tex at Dest1, ReplacingTexture at Dest2. All tinted `timeColor`, using overload `Draw(tex, Rectangle, Color)`.
2. `gs.animations` (includes the TachyonStream) where `!= DEAD`: `Draw(tex, x.DestinationRectangle, x.SourceRectangle, timeColor, x.Rotation, x.Origin, None, 0)`.
3. Player, if `playerLifeState` is neither DEAD nor DELETING: `Draw(tex[player.TextureIndex], new Vector2(pos.X - textures[0].Width/2, pos.Y - textures[0].Height/2) /*int div; textures[0] is "playership"*/, new Color(timeColor.ToVector3() * playerColor.ToVector3()))`.
4. Then, with the same 8-arg overload and `timeColor`: powerUps, tachyons, bullets, asteroids. Enemies use `new Color(timeColor.ToVector3() * x.LifeColor.ToVector3())`. Chips (`explosionParticles`) use `timeColor * x.Alpha`.
5. If `timeManager.DrawLines` (states ENTER/PLASMA_GRANADE_LAUNCHER/CALIBRATION_*/EXIT):
   * In ENTER, `timeColor = Lerp(White, LightGreen, NormalizedDelta)`. In EXIT, `timeColor = Lerp(LightGreen, White, NormalizedDelta)`. This assignment happens after the sprites are drawn, so it tints the **next** frame. It persists because Update doesn't reset it (QUIRK, required for the green tint during aiming).
   * Draw the 6 vertical and 11 horizontal grid lines with `lineRenderer.DrawLine(sb, p[0], p[1], 1, gridColor)`.
6. State CALIBRATION_..._TARGET_POINT: scope texture at `Rect((int)firstFingerPos.X, (int)firstFingerPos.Y, tx.W, tx.H)`, src null, White, `timeManager.Rotation`, origin `(tx.Width/2, tx.Height/2)` (int div).
   State CALIBRATION_..._CONTROL_POINT: scope at both fingers, plus the Bezier path polyline: `point1 = Path.Evaluate(0); for (float i = 0.1f; i <= 1; i += 0.1f) { point2 = Evaluate(i); DrawLine(point1, point2, 2, Color.Azure); point1 = point2; }`. **In float32 this loop runs 9 times, not 10.** The last segment (0.9→1.0) is NOT drawn (verified: float32 sum reaches 1.0000001). Use `Math.fround` or loop `k=1..9`.
7. If `playerTime.continuum < 0` (rewind vignette): 4 quadrants of the "shadow" texture (shadowcorner.png 240×400), each with dest 240×400 and src `shadowSource`, White. Order: TL None; TR FlipHorizontally; BR FlipH|FlipV; BL FlipVertically. `shadowSource` can point past the texture edge (x,y up to 240,400). With LinearClamp the edge texels smear. **The compat SpriteBatch must not clip/clamp source rects; compute UVs = src/texSize and let CLAMP_TO_EDGE do it.** Before the first rewind `shadowSource` is `Rectangle(0,0,0,0)` (zero-size).
8. If `PlayerLife <= 13`: same 4-quadrant pattern with the "blood" texture (240×400), src `bloodSource` (0,0,240,400), color `new Color(255,255,255) * (1 - PlayerLife/13f)`.
9. `Draw(UIrenderer.Texture, SilverlightRectangle, SilverlightRectangle, White)`: the XAML overlay. **Web:** DOM overlay instead; do not draw it in WebGL.
10. Level intro text, if `levelTime.time < 5`. When `time > 2`: Title at `(240 - Measure(Title).X/2, 400)` and Subtitle at `(240 - Measure(Subtitle).X/2, 420)` with `Color.White * (1 - fadeInterpolationIndex)`; else in solid White. Font `debugFont` = Arial 10pt (≈13.3 px). Title = `"CONTINUUM"`, subtitle = `"finira prima o poi..."` (verbatim, sic, no accent).
11. `spriteBatch.End()`. The FPS counter math afterwards is debug only.

### 1.4 Time model: TimeMachine, TimeManager, rewind

**TimeMachine** (Management/TimeMachine.cs) has `time` (s), `continuum` (dtime/dt, default 1) and `elapsedContinuumTime`. `Update(dt){ elapsedContinuumTime = dt*continuum; time += elapsedContinuumTime; }`.

GameState holds three of them:
* `albertTime` is "Albert" (Einstein) real time. Its continuum is 1, or 0 while obscured.
* `playerTime` is the player's time. Its continuum is +1 forward and ramps to −1 in rewind.
* `levelTime` is world time. Its continuum is +1, or the tachyon slow-down 0.35..1, and ramps negative in rewind.

All weapons, Player snapshots, and the timeTank use playerTime. The enemy weapons and every TimeTraveler use levelTime.

**TimeManager.Update(e)** (TimeManager.cs:316-419):
1. `albertTime.Update(e.ElapsedTime.TotalSeconds)`. If `time_tank_timer_start`, then `time_tank_timer += albertTime.elapsedContinuumTime`.
2. Transition checks (switch 1):
   * BEGIN_REWIND→START_REWIND when `playerTime.continuum == 0`.
   * START_REWIND→REWIND when `playerTime.continuum == -1`.
   * REWIND→BEGIN_FORWARD when `timeTank <= Constants.TIME_TANK_CRITICAL_VALUE`.
   * BEGIN_FORWARD→START_FORWARD when `playerTime.continuum == 0`.
   * START_FORWARD→FORWARD when `playerTime.continuum == 1`.
   * ENTER_PGL→PGL, PGL→EXIT_PGL, and EXIT_PGL→FORWARD each when `NormalizedDelta > 1`.
   * The exact float equalities work because values are clamped with Math.Min/Max.
3. Per-state action (switch 2). The PGL states (ENTER/PGL/CALIB_TARGET/CALIB_CONTROL/EXIT) run `Forward()` first, then their own action.
4. `playerTime.Update(albertTime.elapsedContinuumTime); levelTime.Update(albertTime.elapsedContinuumTime)`.

`State` setter (:66-193) is a guarded state machine. **Disallowed transitions are silently ignored.** Allowed transitions, with the init each one runs:

| from | to | init |
|---|---|---|
| START_GAME_STATE | FORWARD | StartGameStateInit + ForwardInit (never used: ctor starts in FORWARD) |
| FORWARD | BEGIN_REWIND | BeginRewindInit |
| FORWARD | BOOSTER | BoosterInit → throws NotImplementedException (unreachable: ActivateBooster never called) |
| FORWARD | ENTER_PLASMA_GRANADE_LAUNCHER, **only if gs.PlayerGranadeCount > 0** | EnterPlasmaGranadeLauncherInit |
| BEGIN_REWIND | START_REWIND | StartRewindInit |
| START_REWIND | REWIND | RewindInit |
| REWIND | BEGIN_FORWARD | BeginForwardInit |
| BEGIN_FORWARD | START_FORWARD | StartForwardInit |
| START_FORWARD | FORWARD | ForwardInit |
| BOOSTER | FORWARD | ForwardInit |
| ENTER_PGL | PGL | PlasmaGranadeLauncherInit |
| PGL | EXIT_PGL | ExitPGLInit |
| PGL | CALIB_TARGET_POINT | CalibrationTargetPointInit |
| CALIB_TARGET_POINT | CALIB_CONTROL_POINT | CalibrationControlPointInit |
| CALIB_TARGET_POINT | PGL | PlasmaGranadeLauncherInit |
| CALIB_CONTROL_POINT | EXIT_PGL | `gs.newPlasmaGranade(path); gs.PlayerGranadeCount--;` ExitPGLInit |
| EXIT_PGL | FORWARD | ForwardInit |

Note: `Player.UpdatePlayerState` writes `gs.timeState = FORWARD` **directly**, bypassing the setter, when the player dies (Player.cs:170).

Inits and actions. `L` = CONTINUUM_LEAN = 1/s, MAX = 1, MIN = −1. `ResetTimer(d)` sets `timerStartTime = albertTime.time, elapsed = 0, target = d` (no arg means target = −1). `UpdateTimer()` sets `elapsed = albertTime.time - start`. `NormalizedDelta = elapsed/target`.
* **ForwardInit**: `playerTime.continuum = 1; levelTime.continuum = TachyonStreamSlowDown()`.
* **Forward()** (each frame in FORWARD and PGL states):
  * If `ElementRecords.Last != null && playerTime.time - Last.Time > timeTank`, then RemoveLast (only one per frame).
  * `playerTime.continuum = 1`.
  * `AddElementRecord(v => levelTime.continuum = playerTime.continuum * v, levelTime.continuum / playerTime.continuum)`. The record is added (AddFirst, timestamped with **playerTime.time**) only if `playerTime.continuum > 0`.
  * `levelTime.continuum = TachyonStreamSlowDown()`.
* **TachyonStreamSlowDown()**: if `gs.tachyonStream != null && lifeState == NORMAL` and `d = |playerPos.X - stream.CurrentPosition.X| <= 120/2` (int 60), returns `d*2*(1-0.35)/120 + 0.35`; else returns 1.
* **BeginRewindInit**: ResetTimer(); `beginRewindContinuumLevel = level.c; continuumLeanLevel = level.c/1*1; continuumMinLevel = level.c/1*(-1)`; play "rewindStart".
* **BeginRewind()**: UpdateTimer; `player.c = max(1 - t*L, 0)`; `level.c = max(beginRewindLevel - t*leanLevel, 0)`.
* **StartRewindInit**: `maxvaltimetank = timeTank` (unused); ResetTimer().
* **StartRewind()**: UpdateTimer; `player.c = max(0 - t*L, -1)`; `level.c = max(0 - t*leanLevel, minLevel)`; `timeTank += levelTime.elapsedContinuumTime` (negative); `time_tank_timer = 0; time_tank_timer_start = true`. The timer restarts every frame, so it effectively counts only from the last StartRewind frame.
* **RewindInit**: `player.c = -1; level.c = continuumMinLevel; time_tank_timer_start = false; Constants.TIME_TANK_CRITICAL_VALUE = time_tank_timer + 0.6f`. **This is a static mutation that persists across games in the same session**. Initial value 0.555; after the first rewind it becomes ≈0.6 (time_tank_timer is ≈ one frame). Keep it as a module-level mutable.
* **Rewind()**: `while (ElementRecords.First != null && First.Time > playerTime.time) { First.Rewind(); RemoveFirst(); }`, then `timeTank += playerTime.elapsedContinuumTime` (drains 1/s). Replaying the records reproduces the forward level/player continuum ratio backwards, so tachyon slow-downs replay.
* **BeginForwardInit**: ResetTimer(); `continuumMinLevel = level.c; continuumLeanLevel = level.c/(-1)*1`; play "rewindEnd".
* **BeginForward()**: `player.c = min(-1 + t*L, 0); level.c = min(minLevel + t*leanLevel, 0); timeTank += levelTime.elapsedContinuumTime`.
* **StartForwardInit**: ResetTimer().
* **StartForward()**:
  * Same RemoveLast prune as Forward.
  * UpdateTimer; `player.c = min(t*L, 1)`.
  * AddElementRecord(same lambda, `level.c/player.c`). The value expression is evaluated before the guard: 0/0 → NaN, but the record is not added when player.c == 0.
  * `level.c = min(t*L, TachyonStreamSlowDown())`.
* **EnterPGLInit**: ResetTimer(0.4). Grid setup with GRID_COLUMNS=5 and GRID_ROWS=10, so arrays of 6 and 11 lines:
  * Verticals: `x = (480/5f)*i`, with x ≤ 0 → 1. Even i: both points `(x,0)`. Odd i: both points `(x,800)`.
  * Horizontals: `y = (800/10f)*i`, with y ≥ 800 → 799. Even i: both points `(0,y)`. Odd i: both points `(480,y)`.
* **EnterPGL()**: UpdateTimer. `delta = ND*800`: for vertical i, `p[1].Y = (i%2==0) ? delta : 800-delta`. `delta = ND*480`: for horizontal i, `p[1].X = (i%2==0) ? delta : 480-delta`. The lines grow from alternating edges.
* **PlasmaGranadeLauncherInit**: `gs.firstFinger = gs.secondFinger = null; ResetTimer(5)` (5 s aim timeout → EXIT).
* **PGL()**: UpdateTimer.
* **CalibrationTargetPointInit**: ResetTimer() (target −1, so NormalizedDelta is negative and never exits by timeout).
* **CalibTarget()**: UpdateTimer; `rotation = t * 1` (SCOPE_ROTATION_SPEED).
* **CalibrationControlPointInit**: `path = new QuadraticBezierCurve(gs.playerPosition, gs.firstFingerPosition, gs.secondFingerPosition)` (start, target, control). The struct copies need clones in TS.
* **CalibControl()**: `path.startPoint = playerPosition; path.targetPoint = firstFingerPosition; path.controlPoint = secondFingerPosition` (all copies!); UpdateTimer; `rotation = t`.
* **ExitPGLInit**: ResetTimer(0.4).
* **ExitPGL()**: `delta = ND*800`: vertical `p[1].Y = (i odd) ? delta : 800-delta`. Horizontal `p[1].X = (i odd) ? delta : 480-delta`. The lines retract.

Public API called by input: `Back()` (if `timeTank > TIME_TANK_CRITICAL_VALUE` → BEGIN_REWIND), `Stop()` (→ BEGIN_FORWARD), `ActivatePlasmaGranadeLauncher()` (only if State == FORWARD → ENTER_PGL), `DeactivatePlasmaGranadeLauncher()` (unused), `ActivateBooster()` (unused), `FirstFinger()` (→ CALIB_TARGET), `UndoFirstFinger()` (if State != ENTER_PGL → PGL), `SecondFinger()` (→ CALIB_CONTROL), `LaunchPlasmaGranade()` / `UndoPlasmaGranade()` (→ EXIT_PGL). Properties: `Rotation`, `Path`, `NormalizedDelta`, `DrawLines`, `State`.

Rewind sequence (all ramps last 1 s at LEAN = 1):
```
FORWARD --(flick down, timeTank > crit)--> BEGIN_REWIND  [sfx rewindStart] player.c 1→0, level.c → 0
 --(player.c == 0)--> START_REWIND  player.c 0→−1, level.c 0→−levelC0; tank drains by level elapsed
 --(player.c == −1)--> REWIND  replay continuum records; tank −1/s; ends on tap (Stop) or tank <= crit
 --> BEGIN_FORWARD [sfx rewindEnd] player.c −1→0, level.c min→0; tank drains
 --(player.c == 0)--> START_FORWARD player.c 0→1, level.c 0→min(t, slowdown)
 --(player.c == 1)--> FORWARD
```

**Per-object rewind (TimeTraveler)** (Elements/TimeTraveler.cs):
* Position is a pure function: `EvaluateDelta(){ elapsedTime = levelTime.time - StartTime; delta = elapsedTime*speed; rotationDelta = elapsedTime*rotationSpeed; }`, then `currentPosition = EvaluatePosition(delta); Rotation = EvaluateRotation(rotationDelta)` (base: `startRotation + rotationDelta`, using the field, not the parameter).
* `Update()` (:251-279):
  ```
  if !blockUpdate:
      EvaluateDelta()
      if ElementRecords.Last && levelTime.time - Last.Time > timeTank: RemoveLast()     // one per frame
      while ElementRecords.First && First.Time > levelTime.time: First.Rewind(); RemoveFirst()
      currentPosition = EvaluatePosition(delta); Rotation = EvaluateRotation(rotationDelta)
      if lifeState == DEAD: deathCounter = levelTime.time - deathTime; if deathCounter > timeTank: lifeState = DELETING
  if levelTime.time < StartTime: lifeState = DELETING      // created in the "future" → gone forever (outside blockUpdate)
  ```
* `lifeState` setter (:122-143):
  ```
  if lifeS != DELETING && value != DELETING:
      if lifeS != DEAD && value == DEAD: deathTime = levelTime.time
      if levelTime.continuum > 0 && value != lifeS: AddElementRecord(v => lifeS = v, lifeS); lifeS = value
      // otherwise (continuum <= 0) the change is silently dropped
  else: lifeS = DELETING        // DELETING is sticky
  ```
* `AddElementRecord(fn, value)`: only if `levelTime.continuum > 0`, AddFirst `ElementRecord(levelTime.time, fn, value)`.
* Dead objects linger, drawn invisibly (draw skips DEAD), for `timeTank` seconds so that a rewind can resurrect them. Managers remove objects in state DELETING from their lists.
* Collections are journaled the same way by `BackgroundManager` (its own `elementRecords`, which always records regardless of continuum).

**LevelManager rewind** (LevelManager.cs:229-237): when `levelTime.continuum <= 0`, `while (Previous.timestamp != null && ToInt32(Previous.timestamp) >= levelTime.time) { isLevelFinished = false; MovePrevious(); }`. Scripted events then replay when time moves forward again. Randomizers are themselves TimeTravelers, so they are deleted if time goes before their creation.

**Player rewind** (Elements/Player.cs):
* Forward (playerTime.continuum >= 0): every frame where `playerTime.time*1000 - First.timeStamp*1000 >= 33` (or the list is empty), AddFirst `PlayerState(pos.X, pos.Y, PlayerLife, toggleGun, playerTime.time, gun.Level, rocket.Level, granades)`. If `playerTime.time - Last.timeStamp > timeTank`, RemoveLast (one per frame).
* Rewind (continuum < 0, only if `timeTank > 0`):
  * Weapons `Update` (to roll back lastShotTime).
  * If `playerTime.time <= First.timeStamp`: pop the state and restore pos/life/gun.Level/rocket.Level (via the `Level` setter, which does not touch levelStartTime)/toggleGun/granades; set up interpolation.
  * Else: `playerPosition = Vector2.Lerp(interpolationB, interpolationA, (time*1000 - First.timeStamp*1000)/timeinterpolation)`.

**timeTank**: starts 0, max 8. Each tachyon touched gives +0.01 (`MathHelper.Clamp(gs.timeTank += 0.01f, 0, 8)`). It drains during rewind as described. It also bounds journal retention: records and dead objects older than `timeTank` seconds are dropped. So with an empty tank nothing is kept, and dead objects are deleted at once.

### 1.5 Levels (XML)

* `LevelManager(gs, "RandomLevel.xml")` → `new LevelReader("Levels/RandomLevel.xml")` (XAP-relative file, `CopyToOutputDirectory`). **Only RandomLevel.xml is used.** `Level1.xml` references non-existent assets (`Backgrounds/background_roccia`, `Animations/animation`, `Animations/explosion`) and is dead. `LevelSchema.xsd` is documentation only.
* `LevelReader` (Utilities/LevelReader.cs) uses `XmlReader`. It flattens **every element** in document order, root `<level>` included, into `LevelElement[]`. Each element keeps its name and all its attributes, including `xmlns:xsi` and `xsi:noNamespaceSchemaLocation`. The reader is a cursor: `Current/Next/Previous`; `MoveNext` and `MovePrevious` clamp at the ends. `LevelElement.Attribute(name)` returns the value, or **null if absent** (the attribute lists are linked newest-first; order is irrelevant for lookup). **Web:** `DOMParser` + `querySelectorAll('*')` or a manual pre-order walk gives the same flat list. Fetch the XML text via Vite (`?raw` import or `fetch`). The file encoding is iso-8859-1, with ASCII content only.
* Header (ctor): `Title = attr("title")`, `Subtitle`, `Duration = ToInt32(duration)` (unused), `NumberOfBackgroundLevels = ToInt32(numlevels)`; then MoveNext.
* `getTextures(cm)`: if Current is `texturesDeclaration`, for each `<texture>` `cm.Load<Texture2D>(path)`; `textureIndices.Add(i, id)`; `gs.textures = list.ToArray(); gs.SetPlayerBounds()` (PlayerWidth/Height = playership texture size, 41×65).
* `getRandomVariables()`:
  * `<randomVariable id mean standardDeviation [meanIncrementPerMinute] [maxValue] [minValue]>` → `DynamicNormalRandomVariable`. Defaults: inc 0, max float.MaxValue, min 0.
  * `<timeDependentVar id initialValue [valueIncrementPerMinute] [valueDecrementPerMinute] [maxValue] [minValue]>` → `TimeDependentVar`. Defaults: max float.MaxValue, min 0.
  * Floats are parsed with `Single.Parse(s, InvariantInfo)`.
* `goToStartLevel()`: Current must be `startlevel` (else throw "Errore di sintassi nel file di livello"), then MoveNext.
* `Update()` with `levelTime.continuum > 0` and not finished: `while (!finished && (Current.timestamp == null || ToInt32(timestamp) <= levelTime.time))`, dispatch on the element name:
  * `backgroundTexture(level, speed, texture, [transitionTexture])` → `gs.newBackgroundTexture`
  * `asteroid(xposition, speed, life, texture)` → `gs.newAsteroid`
  * `endlevel` → finished = true (cursor stays on it)
  * `animation(x,y,texture,frames,rows,cols,fps,rotation,rotationspeed)` → `gs.newAnimation`
  * `enemy(x,y,speed(float),texture,weapon,life,[powerup "Gun"|"Rocket"])` → `gs.newEnemy`. Any other powerup value (e.g. "PlasmaGranade" from the XSD) throws InvalidCastException.
  * `tachyonStream(xposition,duration,texture)`
  * `asteroidRandomizer(launchProbabilityPerSecond,[probabilityIncrementPerMinute],[probabilityMax],speedRandomVariable,lifeRandomVariable,[maxSimultaneousAsteroids],[maxSecondsWithoutAsteroids],texture)`
  * `enemyRandomizer(... ,[powerUpProbabilityPerLaunch],[rocketPowerUpProbability],[granadePowerUpProbability], ..., [maxSimultaneousEnemies],[maxSecondsWithoutEnemies], weapon, texture)`
  * `tachyonStreamRandomizer(launchProbabilityPerSecond,[probabilityIncrementPerMinute],[probabilityMax],durationRandomVariable,texture)`
  * Then MoveNext unless finished.
  * Random-variable ids are looked up with `Dictionary.TryGetValue`; a missing id gives null.
  * Timestamps go through `Convert.ToInt32`, so they must be integer strings. Elements without a timestamp fire immediately.
* **QUIRK:** RandomLevel.xml spells the attribute `pobabilityMax` (as does the XSD), but the code reads `probabilityMax`, so it is always null and the max defaults to 1. Keep it.
* **RandomLevel.xml content** (the whole game; numlevels=3, title "CONTINUUM", subtitle "finira prima o poi...", duration 0):
  * textures (id → content path):
    * playership→Ships/ship (file is `Ships/Ship.png`: case mismatch!), stars0→Backgrounds/bgr0_0 (declared but **never used**), stars1→Backgrounds/bgr0_1, stars2→Backgrounds/bgr0_2
    * gunbullet→Weapons/gunBullet, enemybullet→Weapons/enemyBullet, shadow→Effects/shadowcorner, asteroid→Asteroids/asteroid
    * explosionChip1..3→Effects/explosionChip1..3, granadeChip1..3→Effects/grenadeChip1..3, asteroidChip1..3→Effects/asteroidChip1..3
    * enemyeasy→Enemies/easy, enemynormal→Enemies/normal, tachyonstream→Animations/TachyonStream, tachyon→Effects/tachyon
    * rocket→Weapons/rocket, followingrocket→Weapons/rocketfollower
    * gunpowerup→PowerUps/gunPowerUp, rocketpowerup→PowerUps/rocketPowerUp, granadepowerup→PowerUps/grenadePowerUp
    * void→Effects/void, plasmagranade→Weapons/plasmagranade, scope→Weapons/scope, blood→Effects/blood
    * Index order = declaration order (0 = playership).
  * random vars:
    * asteroidLife(mean 20, inc 2, sd 10, min 5, max 100)
    * asteroidSpeed(100, inc 20, sd 50, min 10, max 1000)
    * enemyEasyLife(5, inc 1, sd 5, min 1, max 30)
    * enemyEasySpeed(mean 1, inc .1, sd .2, min .01, **max .5**)
    * enemyNormalLife(7, 1, 7, 1, 40)
    * enemyNormalSpeed(1.3, .1, .4, .01, **max .6**)
    * tachyonStreamDuration(mean 5, sd 3, min 3, max 7)
    * The speed variables have mean > max, so enemy speed is mostly clamped to the max. Keep it.
  * time-dependent vars: maxSimultaneousEnemies(init 1, max 20, +1/min), maxSecondsWithoutEnemies(init 5, min 0, −0.5/min), maxSimultaneousAsteroids(init 1, max 10, +1/min).
  * startlevel:
    * t0: backgroundTexture stars1 level0 speed200; stars1 level1 speed280; stars2 level2 speed400.
    * t5: asteroidRandomizer(p .08, +.05/min, asteroidLife/asteroidSpeed, maxSimultaneousAsteroids).
    * t5: enemyRandomizer enemyeasy Gun (p .1, +.1/min, powerUp .1, granade .2, rocket .1, easy vars, maxSim/maxSec).
    * t5: enemyRandomizer enemynormal RocketLauncher (p .05, +.1/min, powerUp .2, granade .3, rocket .5, normal vars).
    * t20: tachyonStreamRandomizer (p .1, tachyonStreamDuration).
    * Then `<endlevel/>`.

### 1.6 Scores / persistence

* **The only persisted data** is IsolatedStorage file `scores.xml`, an XmlSerializer'd `Score[]`:
  ```xml
  <?xml version="1.0" encoding="utf-8"?>
  <ArrayOfScore xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <Score><Name>Player</Name><totalHours>0</totalHours><totalMinutes>1</totalMinutes><totalSeconds>23</totalSeconds><totalMilliseconds>456</totalMilliseconds><Day>4</Day><Month>10</Month><Year>2011</Year></Score>
  </ArrayOfScore>
  ```
  `IsolatedStorageSettings` is **not** used. `saved.xml` is write-only (§1.1).
  **Web:** `localStorage` key `"continuum.scores"` holding a JSON array of objects with exactly those 8 property names (deviation D1). Wrap access in try/catch.
* `Score(TimeSpan ts, string Name)` (Scores/Score.cs:78-89):
  * `totalHours = (int)ts.TotalHours; totalMinutes = ts.Minutes; totalSeconds = ts.Seconds; totalMilliseconds = ts.Milliseconds`.
  * `Day/Month/Year = DateTime.Now` (local).
  * `ts = TimeSpan.FromSeconds(gs.playerTime.time)`, which rounds to the nearest ms.
  * The score is **playerTime.time at save**. It includes the death wait time, because player time keeps running while dead.
* `ToString()`: `Name + " " + H + ":" + M + ":" + S + " " + D + "/" + Mo + "/" + YYYY`, no zero padding, ms not shown. Example: `Player 0:1:23 4/10/2011`.
* `CompareTo(other)`: `TimeSpan(0,o.h,o.m,o.s,o.ms).CompareTo(TimeSpan(0,h,m,s,ms))`, i.e. **descending** (longest first). `Array.Sort` is unstable; tie order is unspecified.
* `WriteScores(time, name)` (:138-187):
  * If the file exists: read it, delete it, append the new score, Sort; if `length > MAX_SCORES (10)`, drop the last; write. (It returns the old array; the return value is unused.)
  * Else: write a single-element array.
* `ReadScores()` exists but is unused (ScorePage reads the file itself).
* SaveButton (GamePage.xaml.cs:489-501):
  * `name = NameEndTextBox.Text`; truncate to MAX_NAME_LENGTH 15; if `name.Trim() == ""`, use "Player".
  * `Score.WriteScores(gs.playerTime.time, name)`; then `OnBackKeyPress(new CancelEventArgs(false))`, which leaves to MainPage (state is DELETING).
* CancelButton: same exit without saving.

### 1.7 Sounds & music

* `SoundManager` (static, Management/SoundManager.cs):
  * `LoadSound(name)` → `Content.Load<SoundEffect>("Sounds/"+name)`.
  * `PlaySound(name[, volume=1, isLooped=false, isMusic=false])` reuses the first instance in state `Stopped`, else `CreateInstance()` (sets IsLooped only on creation); sets Volume; `Play()`. Polyphony is unlimited.
  * `StopSound` / `StopAllSounds` are unused.
* Where sounds are actually played:
  * "bulletHit": `Bullet.HasCollided` base. Only GunBullet uses the base; Rocket, FollowingRocket and PlasmaGranade override it with no sound.
  * "explosion": `GameState.newExplosion` (enemy death, player death).
  * "powerUp": `PowerUp.HasCollided`.
  * "rewindStart": BeginRewindInit.
  * "rewindEnd": BeginForwardInit.
  * **"rocket", "gridStart", "gridEnd" are loaded but never played.**
* Music: `Sounds/continuum.mp3` (Song, 320 kbps 32 kHz) loops, as in §1.1. WAVs are PCM 16-bit (rewindEnd stereo 44.1k; rewindStart mono 16k; others mono 44.1k) and can be decoded with WebAudio `decodeAudioData`. Use a new `AudioBufferSourceNode` per play.
* Vibration: `VibrateController.Default.Start(TimeSpan(ms = damage*50))` in `GameState.PlayerHasCollided` (GameState.cs:473) → `navigator.vibrate?.(damage*50)`.

---

## 2. Class-by-class map (C# → TS)

Proposed layout:
* `src/game/**` mirrors the C# folders 1:1 and keeps the file/class names.
* `src/xna/**` is the XNA compat layer (Vector2, Vector3, Rectangle, Color, MathHelper, Matrix (optional), SpriteBatch, Texture2D, SpriteFont, ContentManager, SoundEffect/Song/MediaPlayer, TouchPanel, GameTimer).
* `src/platform/**` covers Accelerometer, IsolatedStorage (localStorage), Vibrate, WakeLock, LinkedList, CsRandom/Utility helpers, and Navigation.

| C# file | TS module | Purpose | Depends on |
|---|---|---|---|
| App.xaml(.cs) | src/game/App.ts | Bootstrap: content, music, SoundManager.Initialize, holds `gs`, visibility (Obscured) pause, navigation host | ContentManager, MediaPlayer, SoundManager, GameState, pages |
| AppServiceProvider.cs | (drop) or src/game/AppServiceProvider.ts | IServiceProvider dict for ContentManager | none |
| MainPage.xaml(.cs) | src/game/Pages/MainPage.ts (+ .css) | Main menu + intro animation | Navigation |
| GamePage.xaml(.cs) | src/game/Pages/GamePage.ts | Game host: creates managers, update/draw loop, overlay DOM (grenade button, tank bar, game-over form), back/pause | all Management, Player, Score, SpriteBatch, LineRenderer |
| ScorePage.xaml(.cs) | src/game/Pages/ScorePage.ts | Lists scores.xml | Score/IsolatedStorage |
| TutorialPage.xaml(.cs) (class `Tutorial`) | src/game/Pages/TutorialPage.ts | 4-pane panorama of static instructions | img assets |
| Credits.xaml(.cs) (class `Page1`) | src/game/Pages/Credits.ts | Credits + link | none |
| Scores/Score.cs | src/game/Scores/Score.ts | Score record, compare, Read/WriteScores | IsolatedStorage, Constants.MAX_SCORES |
| State/GameState.cs | src/game/State/GameState.ts | World state: entity lists, TimeMachines, player vars, factory methods `newXxx`, PlayerHasCollided | all Elements, Gun, RocketLauncher, Collisions, TextureList, TimeMachine, SoundManager, Vibrate |
| State/PlayerState.cs | src/game/State/PlayerState.ts | **struct** snapshot (life, positionX/Y, toggleGun, timeStamp, gunLevel, rocketLauncherLevel, granades) | none |
| Management/TimeMachine.cs | src/game/Management/TimeMachine.ts | time / continuum / elapsedContinuumTime | Constants |
| Management/TimeManager.cs | src/game/Management/TimeManager.ts | Time state machine, rewind, plasma-grenade aim mode, grid animation | GameState, ElementRecord, QuadraticBezierCurve, SoundManager, Constants |
| Management/InputManager.cs (namespace `Continuum`) | src/game/Management/InputManager.ts | Gestures, multitouch aim, accelerometer + calibration | TouchPanel, Accelerometer, TimeManager, GameState |
| Management/LevelManager.cs | src/game/Management/LevelManager.ts | Loads textures and random vars, spawns timeline events, rewinds cursor | LevelReader, GameState, DynamicNormalRandomVariable, TimeDependentVar, ContentManager |
| Management/BackgroundManager.cs | src/game/Management/BackgroundManager.ts | Background layer slots + replacement + own journal | BackgroundTexture, ElementRecord |
| Management/BulletsManager.cs | src/game/Management/BulletsManager.ts | Update/cull bullets (+ merges `gs.newBullets`, never cleared, always empty) | Bullet, Utility |
| Management/TachyonManager.cs | src/game/Management/TachyonManager.ts | Update/cull tachyons | Tachyon, Utility |
| Management/AnimationManager.cs | src/game/Management/AnimationManager.ts | Update/remove animations | Animation |
| Management/AsteroidsManager.cs (class `AsteroidManager`) | src/game/Management/AsteroidsManager.ts (export `AsteroidManager`) | Update/cull asteroids | Asteroid, Utility |
| Management/EnemyManager.cs | src/game/Management/EnemyManager.ts | Update/remove enemies | Enemy |
| Management/PowerUpManager.cs | src/game/Management/PowerUpManager.ts | Update/cull power-ups | PowerUp, Utility |
| Management/RandomizerManager.cs | src/game/Management/RandomizerManager.ts | Update randomizers | Randomizer |
| Management/ExplosionParticleManager.cs | src/game/Management/ExplosionParticleManager.ts | Update/cull chips | Chip, Utility |
| Management/CollisionDetector.cs | src/game/Management/CollisionDetector.ts | Sweep-and-prune collisions + responses | Collisions, all element types, GameState |
| Management/SoundManager.cs | src/game/Management/SoundManager.ts | static sfx pool | xna audio |
| Elements/TimeTraveler.cs | src/game/Elements/TimeTraveler.ts | abstract time-reversible entity | GameState (type), ElementRecord, Utilities |
| Elements/Animation.cs | src/game/Elements/Animation.ts | sprite-sheet animation TimeTraveler | TimeTraveler |
| Elements/TachyonStream.cs | src/game/Elements/TachyonStream.ts | Animation that emits Tachyons; slows level time | Animation, Tachyon, Utility |
| Elements/Tachyon.cs | src/game/Elements/Tachyon.ts | falling particle that fills the time tank | TimeTraveler |
| Elements/BackgroundTexture.cs | src/game/Elements/BackgroundTexture.ts | vertically scrolling 2-copy background | TimeTraveler |
| Elements/Asteroid.cs | src/game/Elements/Asteroid.ts | asteroid with life, damage → chips | TimeTraveler, GameState |
| Elements/Enemy.cs | src/game/Elements/Enemy.ts | enemy following a random Bezier path, owns weapon | TimeTraveler, BezierPath, IWeapons |
| Elements/Bullet.cs | src/game/Elements/Bullet.ts | abstract linear projectile | TimeTraveler, IWeapons, SoundManager |
| Elements/GunBullet.cs | src/game/Elements/GunBullet.ts | gun projectile (player: damage-scaled rect) | Bullet, Gun |
| Elements/Rocket.cs | src/game/Elements/Rocket.ts | straight rocket | Bullet, Utility |
| Elements/FollowingRocket.cs | src/game/Elements/FollowingRocket.ts | homing rocket (after 0.3 s) | Bullet, Utility, Enemy list |
| Elements/PlasmaGranade.cs | src/game/Elements/PlasmaGranade.ts | grenade along a quadratic Bezier; detonates | Bullet, QuadraticBezierCurve |
| Elements/AreaDamage.cs | src/game/Elements/AreaDamage.ts | **dead code** (newAreaDamage never called) | Bullet |
| Elements/ExplosionParticle.cs (class `Chip`) | src/game/Elements/ExplosionParticle.ts (export `Chip`) | explosion/asteroid/grenade fragments; grenade chips do damage | TimeTraveler |
| Elements/PowerUp.cs | src/game/Elements/PowerUp.ts | falling power-up | TimeTraveler, SoundManager |
| Elements/Player.cs | src/game/Elements/Player.ts | player movement, weapons, life regen, snapshots/rewind | GameState, InputManager, PlayerState |
| Elements/Randomizer.cs | src/game/Elements/Randomizer.ts | abstract probabilistic spawner (TimeTraveler) | TimeTraveler, TimeDependentVar |
| Elements/AsteroidRandomizer.cs | src/game/Elements/AsteroidRandomizer.ts | spawns asteroids | Randomizer, DynamicNormalRandomVariable |
| Elements/EnemyRandomizer.cs | src/game/Elements/EnemyRandomizer.ts | spawns enemies with power-ups | Randomizer |
| Elements/TachyonStreamRandomizer.cs | src/game/Elements/TachyonStreamRandomizer.ts | spawns tachyon streams | Randomizer |
| Weapons/IWeapons.cs | src/game/Weapons/IWeapons.ts | weapon interface | none |
| Weapons/Gun.cs | src/game/Weapons/Gun.ts | gun levels −1,1..6 | GameState, TimeMachine |
| Weapons/RocketLauncher.cs | src/game/Weapons/RocketLauncher.ts | rocket levels −1,0..6 | GameState |
| Utilities/Utilities.cs | src/game/Utilities/Utilities.ts | `Constants`, `Utility`, `TextureConstant`, enums `BezierPathTrajectory, TimeState, EnemyType, LifeState, PowerUpType`, `TextureList`, `type RewindMethod = (v:any)=>void` | Random, Rectangle, Vector2, Color |
| Utilities/ElementRecord.cs | src/game/Utilities/ElementRecord.ts | undo record (Time, rewind fn, Value) | none |
| Utilities/TimeDependentVar.cs | src/game/Utilities/TimeDependentVar.ts | linear-in-time clamped value | none |
| Utilities/NormalRandomVariable.cs | src/game/Utilities/NormalRandomVariable.ts | Box–Muller normal | Utility |
| Utilities/DynamicNormalRandomVariable.cs | src/game/Utilities/DynamicNormalRandomVariable.ts | normal with drifting mean, clamped | NormalRandomVariable |
| Utilities/QuadraticBezierCurve.cs | src/game/Utilities/QuadraticBezierCurve.ts | quadratic Bezier (start, target, control) | Vector2 |
| Utilities/BezierPath.cs | src/game/Utilities/BezierPath.ts | chain of N random Bezier curves | QuadraticBezierCurve, Utility |
| Utilities/Collisions.cs | src/game/Utilities/Collisions.ts | sortable TimeTraveler array for collisions | TimeTraveler |
| Utilities/LevelReader.cs | src/game/Utilities/LevelReader.ts | flat XML element cursor | DOMParser |
| Utilities/LevelElement.cs | src/game/Utilities/LevelElement.ts | element name + attributes | LevelElementAttribute |
| Utilities/LevelElementAttribute.cs | src/game/Utilities/LevelElementAttribute.ts | attribute linked-list node (can be a Map) | none |
| Utilities/LineRenderer.cs | src/game/Utilities/LineRenderer.ts | line via stretched 2×3 white texture | SpriteBatch |

Circular imports: GameState ↔ Elements ↔ Weapons. Use `import type` for type-only references. Do not instantiate subclasses or run `extends` against a not-yet-initialized import at module top level. Keep `TimeTraveler` free of runtime imports of GameState.

### 2.1 Behavioural details per class (needed to port exactly)

* **GameState ctor**:
  * playerPosition = `(480/2, 3*800/4)` = (240,600); PlayerLife = 20 (MAX_PLAYER_LIFE); PlayerGranadeCount = 0; damageTimer 0; timeTank 0; playerLifeState NORMAL; toggleGun true; granadeNumber = 100 (only used by grenade-button guard, never decremented).
  * playerGun = `new Gun(true)`, playerRocketLauncher = `new RocketLauncher(true)` (level 0 = none).
  * grid arrays `[6][2]`, `[11][2]` of Vector2.
  * `PlayerLife` setter: if value < old, `damageTimer = 5`; clamp [0,20]. `PlayerGranadeCount` setter: clamp ≥ 0.
  * Factories:
    * `newGunBullet` / `newRocket` / `newFollowingRocket`: `bullets.AddFirst` + collisions.Insert.
    * `newAsteroid(x, speed, life, tex)`: consumes `NextRandom(0,50)/NextRandom(1,100)` (int overloads, result unused). dirX = 0.5 if x<20, −0.5 if x>460, else 0. `Asteroid((x,0),(dirX,1) /*not normalized*/, speed, life)`; asteroids.AddFirst + collisions.
    * `newBackgroundTexture`: backgrounds.AddLast.
    * `newAnimation`: animations.AddLast.
    * `newPlasmaGranade(path)`: collisions + `bullets.AddLast`.
    * `newTachyonStream`: animations.AddLast and `gs.tachyonStream = ts`.
    * `newExplosion(pos)`: sfx explosion + 15 × `Chip(pos, Zero, NextRandom(50f,200f), 100, 0, 0, "explosionChip")`. Not collidable.
    * `newGranadeExplosion(pos)`: 30 × `Chip(pos, Zero, NextRandom(150f,300f), 200, 10, 10, "granadeChip")`, inserted into collisions.
    * `newAsteroidChip(pos, dir)`: `Chip(pos, dir, 300, 100, 0, 0, "asteroidChip")`.
    * `newAsteroidExplosion(pos)`: 7 × `Chip(pos, Zero, NextRandom(50,250) /*int*/, 100, 0, 0, "asteroidChip")`.
    * `newEnemy(...)`: weapon "Gun" → `Gun(false)`, "RocketLauncher" → `RocketLauncher(false)`, else throw. enemies.AddLast + collisions.
    * `newPowerUp(pos, type)`: GUN→gunpowerup, ROCKET→rocketpowerup, GRANADE→granadepowerup textures.
  * `PlayerHasCollided(damage, gunDown, rocketDown)`: if player != DEAD, `PlayerLife -= damage` plus vibration (the weapon downgrades are commented out).
* **Player.Update(input)**:
  * `UpdatePlayerState()`, unless DELETING: life > 13 → NORMAL; 0 < life ≤ 13 → DAMAGED; life == 0 and not DEAD → `newExplosion(pos)`, DEAD, `gs.timeState = FORWARD` (raw write).
  * If `playerTime.continuum >= 0`:
    * DEAD: if `deathTime > timeTank` → `playerLifeState = DELETING` (game over); else `deathTime += playerTime.elapsedContinuumTime`.
    * Else:
      * `deathTime = 0`. If `damageTimer >= 0`, `damageTimer -= elapsed`; else `PlayerLife += elapsed*0.5` (regen).
      * `X = Clamp(X + accCorrected.X*800*elapsed, 0, 480)`; `Y = Clamp(Y - accCorrected.Y*800*elapsed, 0, 800)`.
      * If toggleGun (always true): `playerGun.Update(pos); playerRocketLauncher.Update(pos)`.
    * Snapshot logic (§1.4).
  * Rewind branch as in §1.4.
* **Gun**:
  * `level`: player starts at 1; enemy is −1 (`isPlayerWeapon = level >= 0`). `ownerTime`: player → playerTime, enemy → levelTime. `lastShotTime = startTime` *before* startTime is assigned, so 0: enemies fire on their first update.
  * Update(pos), when `!pause && ownerTime.continuum > 0`:
    * If `time - levelStartTime > GetLevelDuration(Level)` → `Upgrade(-1)` (power-up decays).
    * If `time - lastShotTime >= GetTimeForShooting(Level)`, fire with dir y = −1 (player) / +1 (enemy):
      * levels −1, 1–3: 1 bullet `(0,y)`.
      * levels 4–6: 3 bullets, `normalize(-0.4,y)`, `(0,y)`, `normalize(0.4,y)`.
      * Then `lastShotTime = time`.
  * When `continuum < 0`: if `time - lastShotTime < 0`, `lastShotTime -= GetTimeForShooting(Level)`.
  * Per level (−1, 1, 2, 3, 4, 5, 6):
    * Damage: 1, 1, 1, 2, 2, 2, 3.
    * Speed: 500, 500, 550, 600, 650, 700, 750.
    * Interval: 1.5, .4, .3, .25, .2, .18, .15.
    * Duration: Max, Max, 30, 25, 20, 15, 10.
  * `Upgrade(n)`: `level += n; levelStartTime = time;` clamp [1,6]. `Level` setter sets only if value ≤ 6.
* **RocketLauncher**: same shape. MinLevel 0 (0 = no launcher; `Update` does nothing when level == 0).
  * Fire patterns:
    * levels −1, 1, 2: 1 Rocket.
    * level 3: 3 Rockets at ±0.3.
    * levels 4, 5: 1 FollowingRocket.
    * level 6: 3 FollowingRockets at ±0.3.
  * Per level (−1, 1, 2, 3, 4, 5, 6):
    * Damage: 4, 4, 5, 5, 6, 7, 7.
    * Speed: 300, 300, 400, 400, 500, 600, 600.
    * Interval: 3, 2, 1.6, 1.6, 1.6, 1.3, 1.3 (level 0 → 0).
    * Duration: Max, Max, 30, 25, 20, 15, 10 (level 0 throws, guarded).
  * Enemy weapons never upgrade.
* **Bullet.InitializeBullet**: TimeTraveler with speed `gun.GetSpeed(gun.Level)`, `direction = Normalize(Direction)`, `damage = GetDamage(Level)`, `isPlayerBullet = gun.isPlayerWeapon`. Position is `start + direction*delta`. `HasCollided`: if not DEAD → DEAD + sfx bulletHit. Textures: player gunbullet, enemy enemybullet, rocket, followingrocket.
* **GunBullet.DestinationRectangle** (player only): `newRectangleFromCenterPosition((int)X,(int)Y, W*damage/4 + 8, H*damage/4 + 8)` with **int division** (10×13 tex, dmg1 → 10×11). This is combined with Origin (W/2,H/2) scaled, so the sprite is drawn offset up-left by half its size (**QUIRK**, see §3 Draw semantics). Enemy bullets use the base rect.
* **Rocket**: `EvaluateRotation = CalculateXAngleFromVector(direction) + π/2`; HasCollided: `if (!(arg is GunBullet))` → DEAD. arg is never a GunBullet, so it always dies, with no sound.
* **FollowingRocket** (FOLLOW_TIME_OUT 0.3 s of elapsedTime):
  * Before the timeout: base linear position; rotation from direction.
  * After the timeout, if `levelTime.continuum > 0`:
    * `target = NearestEnemy()`: player bullet → nearest non-DEAD enemy by `Vector2.Distance`, else (−1,−1); enemy bullet → playerPosition.
    * If target != (−1,−1), `TravelToTarget(target, Delta)`:
      * `td = normalize(target - cur)`; `angle = min(0.0003*Delta, CalculateAngleBetweenVectors(direction, td))`.
      * If `(level.c >= 0 && TowardsClockwise(dir, td)) || (level.c < 0 && !TowardsClockwise(...))`, `angle = -angle`.
      * New direction via the Matrix product T·R·T⁻¹ (FollowingRocket.cs:77-79). Expanded with XNA row-vector semantics (translations sit in M14/M24 and are ignored by `Vector2.Transform`), it is exactly **`newDir = (x*cos a + y*sin a, -x*sin a + y*cos a)`**.
      * Record and set direction; record and set `Rotation = XAngle(dir) + π/2`.
    * `evaluate = Current + direction * levelTime.elapsedContinuumTime * speed` (incremental integration, not pure). Record `currentPosition` with the evaluate value; return evaluate.
  * After the timeout with continuum ≤ 0: return CurrentPosition (rewind of the homing path happens via the records).
  * HasCollided as Rocket.
* **PlasmaGranade**: speed 1, start = path.startPoint, damage 0, isPlayerBullet. Position = `Path.Evaluate(Delta)` (Delta = seconds; the curve completes in 1 s); `Delta >= 1` → Detonate. `HasCollided(arg is Bullet ? ignore : Detonate)`, and arg is always null or Vector2, so it always detonates. `Detonate`: if not DEAD, `gs.newGranadeExplosion(CurrentPosition)`; DEAD.
* **Chip**:
  * If Direction == Zero, `Direction = (NextRandom(0,2f)-1, NextRandom(0,2f)-1)`; Normalize (on the local copy!).
  * `a = -(Damage)/(DeltaDuration²)`; `rotationSpeed = NextRandom(-20f,20f)`; texture `group + (NextRandom(0,3)+1)` (int → "1".."3").
  * Speed in px/s, start rotation 0.
  * Position = `start + Direction*Delta`. While not DEAD, `Alpha = (q - |q - Delta|)/q` with `q = DeltaDuration/2` (triangle 0→1→0). DEAD when `Delta > DeltaDuration`.
  * `Damage` getter: `(int)max(0, a*delta² + 10) + 1`, memoized per delta. Note the hardcoded GRANADE_DAMAGE rather than the ctor damage.
  * HasCollided: `life -= Value`; DEAD if ≤ 0.
* **Asteroid**:
  * Start rotation `NextRandom(0, 2π)` (float); rotationSpeed `NextRandom(-1f,1f)`.
  * Position `start + direction*Delta` (speed px/s).
  * `DestinationRectangle = (int X, int Y, (W*life+2000)/50, (H*life+2000)/50)` (int div; drawn size shrinks as life drops). Collision uses the texture W/H.
  * `Damage(v, dir)`: if life > 0, record life, `life -= v`, `newAsteroidChip(Current, dir)`. If life ≤ 0, DEAD + `newAsteroidExplosion`. HasCollided(v, arg) → `Damage(v, (Vector2)arg - CurrentPosition)`.
* **Enemy**:
  * Trajectory `BezierPath(RANDOM, 25 curves, bounds Rect(0,0,480,500), start, end (0,0))`. Created **before** InitializeTimeTraveler, so the RNG order is path first.
  * `BoundDamaged = (int)(life/3f)`; LifeColor White.
  * `EvaluatePosition(Delta)`:
    * `trajectory.CurveIndex = (int)Delta` (speed = curves per second); `if IsFinished` (CurveIndex >= 25) → DEAD.
    * If not DEAD: `pos = trajectory.NextPosition(Delta)` (= `curves[idx].Evaluate(Delta - idx)`), else (0,0). Then `Weapon.Update(pos)`.
    * If DAMAGED: `LifeColor = new Color(new Vector3(1, life/(float)BoundDamaged, same))`.
    * Returns pos. **QUIRK:** a DEAD enemy's position becomes (0,0).
  * `Damaging(n)`: record life; `life -= n`. If `life <= 0 && != DEAD` → DEAD + `newExplosion` + (powerUpType != NONE → `newPowerUp(Current, type)`). Else if `life <= BoundDamaged` → DAMAGED.
* **BezierPath(RANDOM)** (Utilities/BezierPath.cs:42-59). `r()` = `NextRandom(100,200)` **int**; random points use `NextRandom(bounds.Left, Right)` and `NextRandom(Top, Bottom)`, **int**.
  ```
  sp = start
  cp = normalize((rx,ry) - sp)*r() + sp
  tp = normalize((rx,ry) - cp)*r() + cp
  curve[0] = (sp, tp, cp)
  for i in 1..N-2:
      sp = curve[i-1].target
      cp = normalize(curve[i-1].target - curve[i-1].control)*r() + curve[i-1].target
      tp = normalize((rx,ry) - sp)*r() + sp
      curve[i] = (sp, tp, cp)
  last: sp = curve[N-2].target; cp likewise; tp = end
  ```
  Ctor arg order is (start, target, control). `Evaluate(t) = Lerp(Lerp(s,c,t), Lerp(c,tg,t), t)`.
* **PowerUp**: speed 60, rotation 0; position `(start.X, start.Y + Delta)`. HasCollided: DEAD + sfx powerUp (only the player triggers it).
* **Tachyon**: `scale = NextRandom(0.5f,1f)`; start `(X, 0)`; speed given; position `(start.X, start.Y + Delta)`, computed on a **copy** of startPosition. Dest = center rect `((int)X,(int)Y, (int)(W*scale), (int)(H*scale))`. HasCollided → DEAD.
* **TachyonStream**:
  * `base Animation(pos (X, 800/2), seq, 40 frames, 2 rows, 20 cols, fps (int)(40*3/Duration), Cycles 3, rot 0, 0)`.
  * The texture is 2000×1600, so a frame is 100×800. `StretchRatio = 120f/100`, giving a dest of 120×960. Origin = frame center (50,400), so it is centered on (X,400).
  * `EvaluatePosition`, if not DEAD and `playerTime.continuum > 0`:
    * If `Wait <= 0`:
      * `Falloff = (D/2 - |D/2 - elapsedTime|)/(D/2)`.
      * Spawn `Tachyon((int)(X + NextRandom(-60,60)/*int*/ * Falloff), NextRandom(1000f,2000f), "tachyon")`; tachyons.AddFirst + collisions.
      * `Wait = NextRandom(0.001f,0.001f)/(Falloff + 0.001)`. At elapsedTime 0 this is 1 s; otherwise it is tiny, so ~1 tachyon per frame.
    * `Wait -= playerTime.elapsedContinuumTime`.
  * Then base Animation.EvaluatePosition.
* **Animation**:
  * Ctor: `Width = SeqW/Cols, Height = SeqH/Rows` (int div); `SourceRectangle = (0,0,W,H)`; `Origin = (Src.Center.X, Src.Center.Y)` (Point, int div); StretchRatio 1; Cycles 1 default; cycleCounter 1; speed = fps.
  * `EvaluatePosition(Delta)`, if `levelTime.continuum != 0`:
    * `Index = (int)Delta % Length; Row = Index / Cols; Col = Index % Cols`; Src = `(Col*W, Row*H, W, H)`.
    * `Index < 0` → DELETING.
    * If `Delta >= Length*cycleCounter`: record, `cycleCounter++`; if `> Cycles` → DEAD.
    * Returns startPosition.
  * `DestinationRectangle = ((int)X,(int)Y,(int)(Stretch*W),(int)(Stretch*H))`.
* **BackgroundTexture(level, speed, tex, transTex)**:
  * `TransitionTextureIndex` is an int? (null if no attribute); InitializeTimeTraveler(Zero, speed, tex).
  * `stretch = 480f/Width; Width = (int)(stretch*W); Height = (int)(stretch*H)`, giving 480×1600.
  * `startPosition = (0, 800 - Height)` = (0,−800); `CurrentPosition2 = start - (0, rawTexHeight)`; `StartTime2 = 0`; **blockUpdate = true** until `Start()`.
  * `EvaluateDelta` override: `elapsed = levelTime - StartTime2; delta = elapsed*speed`, both clamped ≥ 0.
  * `EvaluatePosition`: for NORMAL, TRANSITIONING and BEINGREPLACED, `Y = startY + Delta - Height*loops; Pos2.Y = Y - Height` (X stays 0 because evaluate starts from Zero; for other states it returns (0,0)). If `levelTime.continuum > 0 && Y > 800`: record loops, `loops++`; TRANSITIONING → NORMAL; BEINGREPLACED → DEAD.
  * `Start()`: record and set `StartTime2 = levelTime.time`, `loops = 0`, TRANSITIONING if it has a transition; record and set `blockUpdate = false`.
  * `Replacing(tex)`: BEINGREPLACED, `ReplacingTextureIndex = tex`.
* **BackgroundManager.Update**: foreach background:
  * `x.Update()`. If `levelTime.continuum > 0`, look at `target = BackgroundLevels[x.Level]`; when `target != x`:
    * If the target exists and is not DEAD: when it is not BEINGREPLACED and `x.StartTime >= target.StartTime`, `target.Replacing(x.TransitionTextureIndex ?? x.TextureIndex)`.
    * Else: record and set `BackgroundLevels[x.Level] = x`; `x.Start(); x.Update()`.
  * Remove DELETING; prune and replay its own records like a TimeTraveler.
* **Randomizer** (TimeTraveler, speed 1, so Delta = seconds since creation, texture = the spawned texture):
  * `EvaluatePosition(Delta)`:
    * Update the TDVars with Delta.
    * If `Delta > second && levelTime.continuum > 0`:
      * `probability = min(initial + inc*Delta/60, max)`.
      * `launches = TestLaunch()`: `r = NextRandom(0f,1f)`; with MAX_RANDOMIZER_LAUNCHES = 1 → 1 if `r < probability`, else 0.
      * Each launch happens only if `maxSim == null || AliveCount < maxSim.Value`.
    * `second = (int)Delta + 1` (every frame). So the test runs once per new integer second.
    * maxSecondsWithout logic: `if (alive > 0) foundAt = Delta; if (foundAt > Delta + maxSec.Value) { Launch(); foundAt = Delta; }`. **QUIRK:** this can never be true, so the feature is dead. Keep it as is.
  * Subclasses update their RVs with Delta before calling base.
  * AsteroidRandomizer: `Launch = newAsteroid(NextRandom(0,480), (int)speedRV.Next(), (int)lifeRV.Next(), texture)`; alive = asteroids with NORMAL/DAMAGED.
  * EnemyRandomizer: `Launch`:
    * `r = NextRandom(0d,1d)`. If `r < powerUpP`: `r2 = NextRandom(0d,1d)`; r2 < rocketP → ROCKET; r2 < granadeP+rocketP → GRANADE; else GUN.
    * `newEnemy((NextRandom(-30, 510), -50), speedRV.Next(), texture, weapon, (int)lifeRV.Next(), t)`.
  * TachyonStreamRandomizer: maxSim = `TimeDependentVar(1, null, null, null, null)` (value 1); maxSecondsWithout = null. Launch, only if the current stream is null/DEAD/DELETING: `newTachyonStream(NextRandom(60, 420), durationRV.Next(), texture)`. alive = stream NORMAL/DAMAGED ? 1 : 0.
* **NormalRandomVariable.Next**: `u1 = NextRandom(0d,1d); u2 = NextRandom(0d,1d); mean + sd*sqrt(-2 ln u1)*sin(2π u2)`, as a float. Dynamic: `mean = initialMean + inc*Delta/60`, clamped to [min,max].
* **TimeDependentVar.Value** = `clamp(initial + (inc - dec)*delta/60, min, max)`.
* **Managers**: each `Update()` is `if (!gs.pause)` (pause is never true) over its list:
  * `x.Update()`.
  * Asteroids, bullets, tachyons, powerUps and chips go DEAD if `!IsInScreenSpace(newRectangleFromCenterPosition(pos, 30, 30))`.
  * Collect DELETING into a temp array; after the loop `list.Remove(each)`.
  * BulletsManager first `AddLast`s all of `gs.newBullets` (never cleared; always empty in practice).
* **Collisions** (Utilities/Collisions.cs): array (initially 1000, doubles when full) plus `Count` (**never decreases**) and `AliveCount`. Port it verbatim:
  * `Sort() = InsertionSort(Flag())`.
  * `Flag` partitions in place: `i` = alive end, `j` = scan, `k = Count`.
    * null → `a[j] = a[k-1]; a[k-1] = null; k--`.
    * DELETING → `a[j] = null; swap(j, k-1); k--`.
    * DEAD → `j++`.
    * alive → `swap(j,i); i++; j++`.
    * `AliveCount = i`.
  * InsertionSort sorts `[0, AliveCount)` by `Top` ascending (stable).
* **CollisionDetector.Update**, only if `playerTime.continuum > 0`:
  * Sort, then for i in [0, AliveCount):
    * Player test: `TryPlayerCollision(e)` (e not DEAD/DELETING; centered rects `newRectangleFromCenterPosition(playerPos, PlayerW, PlayerH)` vs `(e.pos, e.Width, e.Height)` Intersects). This **does not check whether the player is dead** (QUIRK: a dead player still picks things up). Responses:
      * Asteroid: `temp = (int)PlayerLife; PlayerHasCollided(ast.life,1,2); ast.HasCollided(temp, playerPosition)`.
      * Enemy: `temp = (int)PlayerLife; PlayerHasCollided(enemy.life,1,1); enemy.HasCollided(temp, null)`.
      * Bullet: if not a player bullet, `PlayerHasCollided(b.damage,0,1); b.HasCollided(0,null)`. This includes enemy Rockets and FollowingRockets.
      * Tachyon: if `timeTank <= 8`, `timeTank = Clamp(timeTank += 0.01, 0, 8); t.HasCollided`.
      * PowerUp: GUN → `playerGun.Upgrade(1)`; ROCKET → `playerRocketLauncher.Upgrade(1)`; GRANADE → `PlayerGranadeCount += 1`; then `p.HasCollided(0,null)`.
    * Pair sweep: `j = i+1; while (j < AliveCount && a[j].Top <= a[i].Bottom)`. Top/Bottom come from **DestinationRectangle** (not centered; Asteroid/GunBullet/Tachyon/Animation have their own rects), but `TryCollision` uses **centered** rects of texture Width/Height (QUIRK, keep).
  * Pair responses (A = a[i], B = a[j]):
    * A Asteroid × B Enemy → `A.Hit(B.life, B.pos); B.Hit(A.lifeBefore, null)`.
    * A Asteroid × B Bullet → `A.Hit(B.damage, B.pos); B.Hit(0)`.
    * A Asteroid × B Chip → `B.Hit(A.life); A.Hit(B.Damage, B.pos)`.
    * A Enemy × B Asteroid → `A.Hit(B.life); B.Hit(A.lifeBefore, B.pos /*own pos → zero dir → random chip*/)`.
    * A Enemy × B Bullet (player bullet only) → `A.Hit(B.damage); B.Hit(0)`.
    * A Enemy × B Chip → `B.Hit(A.life); A.Hit(B.Damage)`.
    * A Chip × B Asteroid → `A.Hit(B.life); B.Hit(A.Damage, B.pos)`.
    * A Chip × B Enemy → `A.Hit(B.life); B.Hit(A.Damage)`.
    * A Bullet × B Asteroid → `A.Hit(0); B.Hit(A.damage, B.pos)` (any owner's bullet damages asteroids).
    * A Bullet × B Enemy (player bullet only) → `A.Hit(0); B.Hit(A.damage)`.
    * There are no asteroid–asteroid, enemy–enemy, bullet–bullet or tachyon/powerup–non-player pairs. Here `Hit` = `HasCollided`.
  * Rectangle.Intersects is strict: `a.Left < b.Right && b.Left < a.Right && a.Top < b.Bottom && b.Top < a.Bottom`.

---

## 3. Platform API inventory (spec for the compat layer)

Unless noted, the file is under `Continuum/Continuum/`.

### 3.1 XNA math (Microsoft.Xna.Framework). **All are structs: copy on assignment** (see §7)
* **Vector2**
  * Members used: `new Vector2()`, `new Vector2(x,y)`, fields `X/Y` (mutated in place: Player.cs:73-74,97-98,127-128,141-142; TimeManager.cs:450-500; BackgroundTexture.cs:100-109; Asteroid.cs:71-72; Bullet.cs:31-32; FollowingRocket.cs:50-51; PowerUp.cs:36-37; Tachyon.cs:30).
  * Operators: `+`, `-` (binary), `*` (Vector2*float: BezierPath.cs:45-52, QuadraticBezierCurve.cs:53, ExplosionParticle.cs:87), `==`/`!=` (FollowingRocket.cs:44 `!= new Vector2(-1,-1)`; ExplosionParticle.cs:62 `== Vector2.Zero`).
  * Instance `Normalize()` (mutating: ExplosionParticle.cs:64, FollowingRocket.cs:70, Utilities.cs:330, Gun.cs:76,81, RocketLauncher.cs:74,79,90,95); `Length()` (LineRenderer.cs:20).
  * Static `Vector2.Zero` (must NOT be a shared mutable instance), `Vector2.Normalize(v)` (Bullet.cs:16, BezierPath.cs:45,46,52, QuadraticBezierCurve.cs:53), `Vector2.Lerp(a,b,t)` (Player.cs:150, QuadraticBezierCurve.cs:48, unclamped), `Vector2.Distance` (FollowingRocket.cs:111), `Vector2.Transform(Vector2, Matrix)` (FollowingRocket.cs:79).
  * Normalize of a zero vector gives NaN (XNA divides by length 0); keep that.
* **Vector3**: `Vector3.Zero` (InputManager.cs:53,108); fields X/Y/Z (InputManager.cs:54-79); `new Vector3(x,y,z)` (GamePage.xaml.cs:267, Enemy.cs:79); component-wise `Vector3 * Vector3` (GamePage.xaml.cs:347,376); `Color.ToVector3()`.
* **Matrix**: 16-float ctor + `operator *` (FollowingRocket.cs:77) and `Vector2.Transform` (:79). It can be replaced by the closed form in §2.1. If implemented, use XNA row-major/row-vector semantics: `Transform(v,m) = (v.X*M11 + v.Y*M21 + M41, v.X*M12 + v.Y*M22 + M42)`.
* **Rectangle** (int x,y,w,h): ctor (TimeTraveler.cs:95, Animation.cs:34,91,104, AreaDamage.cs:24, Asteroid.cs:20, BackgroundTexture.cs:22, Enemy.cs:37, GamePage.xaml.cs:190,265,277,406,412,413,426-429,435-438, Utilities.cs:292); `X, Y, Width, Height`, `Top`, `Bottom` (TimeTraveler.cs:160,171), `Left/Right/Top/Bottom` (BezierPath.cs:45,46,52); `Center` → Point(X+W/2, Y+H/2) int (Animation.cs:92); `Intersects` (CollisionDetector.cs:186,195); `Rectangle?` nullable (TimeTraveler.cs:102 SourceRectangle; null = whole texture).
* **Color** (packed RGBA bytes, used premultiplied):
  * Named: `Black`, `White`, `Yellow` (255,255,0), `LightGreen` (144,238,144), `Azure` (240,255,255).
  * Ctors: `new Color(r,g,b)` int (Utilities.cs:179 BACK_IN_TIME_COLOR = (143,193,209); GamePage.xaml.cs:435-438), `new Color(Vector3)` (floats 0..1 → bytes, alpha 255, clamped; GamePage.xaml.cs:267,347,376, Enemy.cs:79).
  * `Color * float` (GamePage.xaml.cs:217,383,435-438,449-450). This scales **all 4 channels**: XNA `Color.Multiply`, i.e. `(byte)clamp(c*scale)`, truncating.
  * `Color.Lerp(a,b,amount)` (GamePage.xaml.cs:255,259,390,393): amount **clamped to [0,1]**, per-channel integer lerp.
  * `ToVector3()` (GamePage.xaml.cs:347,376).
* **MathHelper.Clamp** (Player.cs:73-74, CollisionDetector.cs:59). (`MathHelper.Pi` only in a comment.)
* System.Math used: Abs, Acos, Atan2 (LineRenderer.cs:20), Cos/Sin (FollowingRocket.cs:77), Log/Sqrt/Sin/PI (NormalRandomVariable.cs:32), Min/Max (TimeManager.cs:517-555, TimeDependentVar.cs:42, ExplosionParticle.cs:42, FollowingRocket.cs:72). `float.MaxValue` (= 3.4028235e38: FollowingRocket.cs:104, DynamicNormalRandomVariable.cs:38, TimeDependentVar.cs:30, Gun.cs/RocketLauncher.cs GetLevelDuration).

### 3.2 Graphics
* `SharedGraphicsDeviceManager.DefaultBackBufferWidth/Height` (GamePage.xaml.cs:102-103) = 480/800; `.Current.PreferredBackBufferWidth/Height` (:183-184); `.Current.GraphicsDevice.SetSharingMode(bool)` (:197,236); `.PresentationParameters.PresentationInterval = PresentInterval.One` (:198); `GraphicsDevice.Clear(Color.Black)` (:312).
* `UIElementRenderer(page, w, h)`, `.Render()`, `.Texture` (GamePage.xaml.cs:189,313,441) → replaced by the DOM overlay.
* `SpriteBatch(gd)` (:200); **`Begin()` with no args** (:314) = SpriteSortMode.Deferred, BlendState.AlphaBlend (**premultiplied**: src ONE, dst ONE_MINUS_SRC_ALPHA), SamplerState.LinearClamp, DepthStencilState.None, RasterizerState.CullCounterClockwise, no matrix; `End()` (:460). Deferred means draw order = call order; depth is always 0.
* Draw overloads used:
  1. `Draw(Texture2D, Rectangle dest, Color)`: GamePage.xaml.cs:324-333 (backgrounds).
  2. `Draw(Texture2D, Vector2 pos, Color)`: GamePage.xaml.cs:347 (player).
  3. `Draw(Texture2D, Rectangle dest, Rectangle? src, Color, float rotation, Vector2 origin, SpriteEffects, float depth)`: GamePage.xaml.cs:343,352,358,364,370,377,383,406,412,413,426-429,435-438. `SpriteEffects.None | FlipHorizontally | FlipVertically` (combined with `|`).
  4. `Draw(Texture2D, Rectangle, Rectangle, Color)`: GamePage.xaml.cs:441 (UI texture; skip on web).
  5. `Draw(Texture2D, Vector2 pos, Rectangle? src=null, Color, float rot, Vector2 origin, Vector2 scale, SpriteEffects, float depth)`: LineRenderer.cs:20-23.
* **Draw semantics to replicate** (XNA 4):
  * **Overload 3:** `origin` is in **source-texel space** and is scaled by `dest.size/src.size` (src = whole texture if null). The point `origin` lands on `(dest.X, dest.Y)`, and rotation (radians, clockwise on screen since y is down) pivots around it. So `TimeTraveler.DestinationRectangle = (X,Y,W,H)` with `Origin = (W/2,H/2)` draws the sprite **centered** on its position.
    * Asteroid: centered, scaled by life.
    * Tachyon, player GunBullet: their dest rect is already top-left = center−size/2, and the origin offset is applied again, so they draw **shifted up-left by half their size** (QUIRK, keep).
    * Scope: dest `(fingerX, fingerY, w, h)` + origin (w/2,h/2) → centered on the finger.
    * Flips mirror the sampled source region.
  * **Overload 5:** `origin` in texels and `scale` multiplies the texture size. LineRenderer draws a 2×3 texture with origin (0,1) and scale (len/2, thickness/3), so the quad is `len × thickness`, starts at point1, and is offset by `thickness/3` above the line axis, rotated by atan2(dy,dx).
  * **Overload 2:** top-left at pos (pos already has int-div half-size subtracted).
* `RenderTarget2D(gd, 2, 3)`, `gd.SetRenderTarget(rt|null)`, `gd.Clear(Color.White)` (LineRenderer.cs:12-15) → web: a 2×3 (or 1×1) white texture, keeping the 2×3 geometry math.
* `Texture2D.Width/Height` (GameState.cs:464-465, TimeTraveler.cs:207-208,240-241, Animation.cs:87-88, BackgroundTexture.cs:77, GamePage.xaml.cs:347,405-413).
* `SpriteFont` via `contentManager.Load<SpriteFont>("debugFont")` (GamePage.xaml.cs:213); `SpriteBatch.DrawString(font, string, Vector2 topLeft, Color)` (:449-455); `font.MeasureString(s).X` (:449-455). debugFont = **Arial, 10 pt (≈13.33 px at 96 dpi), Regular, kerning on, spacing 0, chars 32–126** (ContinuumLibContent/debugFont.spritefont). Web: canvas-2D text rendered to a texture or a small bitmap font; measure with `ctx.measureText`.

### 3.3 Content (ContentManager, root "Content")
* `new ContentManager(Services, "Content")` (App.xaml.cs:280).
* `Load<Song>("Sounds/continuum")` (App.xaml.cs:95); `Load<SoundEffect>("Sounds/" + name)` (SoundManager.cs:261); `Load<Texture2D>(path)` for each level texture (LevelManager.cs:67); `Load<SpriteFont>("debugFont")` (GamePage.xaml.cs:213). Load caches by asset name.
* Asset names have **no extension** and are matched **case-insensitively** (Windows): `"Ships/ship"` → `Ships/Ship.png`. Web: build a manifest map `lower(path) → url` (Vite `import.meta.glob('/content/**/*.{png,wav,mp3}', {eager:true, query:'?url'})`).

### 3.4 Audio (Microsoft.Xna.Framework.Audio / Media)
* `SoundEffect` (SoundManager.cs:217,261), `.CreateInstance()` (:287); `SoundEffectInstance.State == SoundState.Stopped` (:279), `.IsLooped` (:289), `.Volume` (:291), `.Play()` (:292), `.Stop()` (:324,348).
* `Song`, `MediaPlayer.GameHasControl`, `MediaPlayer.IsRepeating = true`, `MediaPlayer.Play(song)` (App.xaml.cs:93-98); `FrameworkDispatcher.Update()` (App.xaml.cs:96,293).

### 3.5 Input
* **TouchPanel** (Microsoft.Xna.Framework.Input.Touch), all in Management/InputManager.cs:
  * `TouchPanel.GetCapabilities()` → `.IsConnected`, `.MaximumTouchCount` (:94-101).
  * `TouchPanel.EnabledGestures = GestureType.Tap | GestureType.FreeDrag | GestureType.Flick` (:99).
  * `TouchPanel.IsGestureAvailable` / `ReadGesture()` → `GestureSample.GestureType`, `.Position` (Tap/FreeDrag), `.Delta` (Flick velocity px/s) (:154-170).
  * `TouchPanel.GetState()` → `TouchCollection.Count`, indexer, `FindById(int id, out TouchLocation)` (:195-198,234,250,299); `TouchLocation.Id`, `.Position` (:206-282).
  * **XNA GetState includes touches in Pressed, Moved, AND Released state.** A released touch appears once in the frame it was released, and the code does not check `.State`, so the compat layer should report a released pointer for one more frame.
* **Accelerometer** (Microsoft.Devices.Sensors), InputManager.cs:107-145: `new Accelerometer()`, `.CurrentValueChanged += (s, SensorReadingEventArgs<AccelerometerReading> e)`, `e.SensorReading.Acceleration` (Vector3 in g), `.Start()`, `.Stop()` (AccelerometerStop/Start helpers are unused).

### 3.6 Timing
* `GameTimer` (Microsoft.Xna.Framework): `new GameTimer()`, `.UpdateInterval = TimeSpan.Zero`, `.Update +=`, `.Draw +=`, `.FrameAction +=`, `.Start()`, `.Stop()` (GamePage.xaml.cs:92-95,220,233; App.xaml.cs:283-285). `GameTimerEventArgs.ElapsedTime.TotalSeconds` (TimeManager.cs:318) and `.TotalTime.Milliseconds` (GamePage.xaml.cs:462,467, debug only). **Web:** `requestAnimationFrame` → `update(dt)` then `draw()`.

### 3.7 Storage / serialization / XML
* `IsolatedStorageFile.GetUserStoreForApplication()` (App.xaml.cs:159, ScorePage.xaml.cs:20, Score.cs:123,141); `.FileExists("scores.xml")` (ScorePage.xaml.cs:23, Score.cs:125,144); `.OpenFile(name, FileMode.Open|OpenOrCreate|Create[, FileAccess.Read|Write])` (ScorePage.xaml.cs:25, Score.cs:128,147,156,178, App.xaml.cs:159); `.DeleteFile` (Score.cs:153).
* `XmlSerializer(typeof(Score[]))`, `.Serialize`/`.Deserialize` (ScorePage.xaml.cs:26-28, Score.cs:129-182); `XmlSerializer(typeof(GameState), extraTypes)` (App.xaml.cs:161-162, dead).
* `System.Threading.Mutex("SAVEMUTEX")` (App.xaml.cs:156-165, dead).
* `XmlReader.Create(url)`, `.Read()`, `.NodeType == XmlNodeType.Element`, `.Name`, `.NamespaceURI`, `.AttributeCount`, `.MoveToNextAttribute()`, `.Value`, `.Dispose()` (LevelReader.cs:19-37).
* **No XDocument/XElement/LINQ is used anywhere.** `using System.Linq` appears but no LINQ operator is called; `List<T>.ToArray()` is the only collection conversion.
* `IsolatedStorageSettings` and `Dispatcher` are **not used**.

### 3.8 BCL helpers
* `System.Random` (unseeded): `Next(int max)`, `Next(int min, int max)` (max exclusive), `NextDouble()` (Utilities.cs:234-281).
* `Single.Parse(s, NumberFormatInfo.InvariantInfo)` (Utilities.cs:238); `Convert.ToInt32(string)` (LevelManager.cs:47-48,140,145,148,154,172,175,231). Note `Convert.ToInt32(null) == 0`; it throws on a non-integer string.
* `TimeSpan.FromSeconds(float)` (Score.cs:162,181; rounds to ms), `.TotalHours/.Minutes/.Seconds/.Milliseconds` (Score.cs:63-66,80-83), `new TimeSpan(d,h,m,s,ms).CompareTo` (Score.cs:111), `new TimeSpan(0,0,0,0,ms)` (GameState.cs:473).
* `DateTime.Now.Day/Month/Year` (Score.cs:68-70,85-87).
* `Array.Sort(IComparable[])`, `Array.Copy` (Score.cs:160-170).
* `LinkedList<T>`: `AddFirst`, `AddLast`, `RemoveFirst`, `RemoveLast`, `Remove(T)` (first match by reference), `.First`, `.Last`, `.Count`, `node.Value`, `node.Next` (Player.cs:124-125), foreach. `Dictionary.Add/TryGetValue/ContainsKey`. `List<T>`. Nullable `float?`, `int?`, `Vector2?`.

### 3.9 Silverlight / Windows Phone
* `PhoneApplicationService` events Launching/Activated/Deactivated/Closing (App.xaml:15-17); `PhoneApplicationService.Current.UserIdleDetectionMode = Disabled/Enabled` (App.xaml.cs:90, GamePage.xaml.cs:223,238) → Wake Lock API.
* `RootFrame.Obscured` / `Unobscured` (App.xaml.cs:68-71) → visibilitychange.
* `NavigationService.Navigate(new Uri("/X.xaml", Relative))` (MainPage.xaml.cs:44,49,54,59), `.GoBack()` (GamePage.xaml.cs:148,156); `OnNavigatedTo/From` overrides; `OnBackKeyPress(CancelEventArgs)` with `e.Cancel` (GamePage.xaml.cs:140-173).
* `MessageBox.Show(text, caption, MessageBoxButton.OKCancel) == MessageBoxResult.OK` (GamePage.xaml.cs:153); `MessageBox.Show(text)` (ScorePage.xaml.cs:39).
* `Storyboard` `.Begin()` (MainPage.xaml.cs:24 via `Resources["Apertura"]`; GamePage.xaml.cs:225), `.Pause()` (:144), `.Resume()` (:161) → CSS animations / Web Animations API (`animation.pause()/play()`).
* `UIElement.Visibility` (GamePage.xaml.cs:297-300), `ProgressBar.Value` (:247), `TextBox.Text` (:491), `new TextBlock{Text}` + `StackPanel.Children.Add` + `UpdateLayout` (ScorePage.xaml.cs:30-34).
* `WebBrowserTask { Uri = "http://www.xteamdimension.com" }.Show()` (Credits.xaml.cs:26-28) → `window.open(url, '_blank')`.
* `VibrateController.Default.Start(TimeSpan)` (GameState.cs:473) → `navigator.vibrate`.
* `Application.Current.Host.Settings.EnableFrameRateCounter` (App.xaml.cs:77, debug only).

---

## 4. UI pages (480×800 portrait, WP7 **dark theme** assumed: black background, white foreground)

WP7 theme constants referenced:
* Fonts: PhoneFontFamilyNormal = Segoe WP (use "Segoe UI", system-ui, sans-serif); PhoneFontFamilySemiBold = Segoe WP Semibold.
* Sizes: PhoneFontSizeNormal = 20 px; PhoneFontSizeMediumLarge = 25.333 px.
* PhoneTextNormalStyle = 20 px, margin-left 12. PhoneTextTitle1Style = Segoe WP SemiLight 72 px (PhoneFontSizeExtraExtraLarge), margin-left 12.
* Brushes: PhoneForegroundBrush = #FFFFFF; PhoneBackgroundBrush = #000000.
* Metrics: PhoneBorderThickness = 3; PhoneTouchTargetOverhang = 12 px margin on every side inside Button/TextBox templates.
* Default WP7 Button: 3 px white border, transparent fill, white text. **Pressed**: fill white, text black.
* The system tray, when visible, takes the top 32 px (page content height 768).

App.xaml `Application.Resources` is **empty** (no app-level styles/brushes).

Fonts shipped: `Continuum/Fonts/Squared Display.ttf` (embedded via Blend as `/Continuum;component/Fonts/Fonts.zip#Squared Display`, used by MainPage) → `@font-face { font-family: "Squared Display"; src: url(.../Squared Display.ttf) }`. `Continuum/Font/QUARTZMS.TTF` is included as a Resource but **referenced nowhere**.

### 4.1 MainPage (MainPage.xaml)
* Page `FontFamily="Squared Display"`, `SystemTray.IsVisible=False`, Portrait. Black background (theme).
* Children of `Grid LayoutRoot` (z-order = document order):
  1. **Logo**: `Image Source="logo.png"` (480×264), Left/Top, Width 480, Height 264, Margin `0,80,0,0` → box (0,80)-(480,344). `RenderTransformOrigin 0.5,0.5`, CompositeTransform (TranslateY animated).
  2. **StackPanel `stack`**: Stretch horizontally, `VerticalAlignment=Bottom` (bottom of the stack at y=800). Top→bottom:
     * `button` "Start", Foreground **#7CC6FF**, Click → GamePage.
     * `line`: Line X1=0 X2=480 Y=0, Stroke **#202F3C**, StrokeThickness 5.
     * `button1` "Instructions", **#63BBFF** → TutorialPage.
     * `line1` (same line).
     * `button2` "Scores", **#41ACFE** → ScorePage.
     * `line2`.
     * `button3` "Credits", **#189BFF** → Credits.
     * `line3`.
     * `button4` "Other Games", **#0090FF**, **no Click handler**.
     * All buttons: Stretch, FontFamily Squared Display, FontSize 40, BorderThickness 0, BorderBrush null, Padding `10,10,10,2`, content centered. With the default template (12 px overhang margin) each button is ≈ 12+10+(line height ≈ 48)+2+12 ≈ 84 px tall. The 5 buttons plus 4 lines give a stack ≈ 430 px, occupying y ≈ 370..800. These are approximations; tune visually.
     * Pressed visual (default template): white rectangle inside the 12 px margin, black text.
  3. **SplashScreen**: `Image Source="/SplashScreenImage.jpg"`, Stretch Fill (full 480×800), with PlaneProjection (GlobalOffsetX animated) and a CompositeTransform. It sits on top of everything at start.
* **Storyboard "Apertura"** starts in the ctor; all keyframes are linear (EasingDoubleKeyFrame without an EasingFunction). Times are in seconds (opacity, or the property named):

  | target | keyframes |
  |---|---|
  | SplashScreen opacity | 0:1 → 0.8:0 |
  | SplashScreen GlobalOffsetX | 0:0 → 0.8:0 → 1.0:480 (slides right) |
  | Logo opacity | 0:0 → 0.8:0 → 1.6:1 |
  | Logo TranslateY | 0:145 → 0.8:145 → 1.6:145 → 2.8:0 (rises from y=225 to y=80) |
  | button4 "Other Games" | 0, 0.8:0, 1.6:0 → 2.0:1 |
  | line3 | 1.7:0 → 2.1:1 |
  | button3 "Credits" | 1.8:0 → 2.2:1 |
  | line2 | 1.9:0 → 2.3:1 |
  | button2 "Scores" | 2.0:0 → 2.4:1 |
  | line1 | 2.1:0 → 2.5:1 |
  | button1 "Instructions" | 2.2:0 → 2.6:1 |
  | line | 0:0 → 0.8:0.005 → 2.3:0 → 2.7:1 |
  | button "Start" | 2.4:0 → 2.8:1 |

  The cascade fades in bottom-up. After the end all values hold (FillBehavior HoldEnd). The animation runs only once per app launch.
* Back on MainPage exits the app (web: nothing).

### 4.2 GamePage (GamePage.xaml): XAML overlay above the XNA canvas
* `SystemTray.IsVisible=False`. Root `Grid grid1` rows: [0] Auto (empty → 0 px), [1] `388*` → y 0..388, [2] `412*` → y 388..800.
* **TimeTankBar** (ProgressBar): Grid.Row 1, Left/Top, Width 480, Height 14, Margin `0,-5,0,0` → box y −5..9.
  * WP7 ProgressBar template: a 4 px high indicator vertically centered, so the **visible bar is y≈0..4** at the very top, width = 480 × Value/100.
  * Value = 100·timeTank/8.
  * Background `#4DA6D1` at Opacity 0 (invisible track).
  * Foreground = LinearGradientBrush StartPoint (0,0) → EndPoint (1,1) relative to the indicator box: stop 0 **#0043B8** → stop 1 **#A8D6F5**.
* **buttonLastChance** (grenade button): Grid.Row 2, Height 69, Margin `0,343,247,0`, VerticalAlignment Top, Stretch horizontally.
  * Box = x 0..233, y 731..800. Content "", BorderBrush null, Foreground null.
  * Custom template ButtonStyle1: an outer `Grid` (transparent) contains a `Border` with Margin 12 (PhoneTouchTargetOverhang), so the border box is x 12..221, y 743..788 (209×45). The border has BorderThickness 3 (brush null → invisible) and Background = `grenade_button.png` (102×21) stretched. Inside it, a `ContentControl` has Background = `grenade_button.png` Stretch Fill as well (inner area ≈ 203×39 at x 15..218, y 746..785).
  * **Pressed state**: the Border's BorderBrush becomes **#FF259E35** (3 px green frame), the ContentControl background becomes an empty ImageBrush (inner image disappears), and the Foreground becomes #00FF0000.
  * Click → `if (gs.granadeNumber > 0 /*always 100*/) timeManager.ActivatePlasmaGranadeLauncher()` (effective only in FORWARD with PlayerGranadeCount > 0).
  * Storyboard **granadebutton_initialfade**: opacity 0:0 → 2.0:0 → 5.0:1 (linear). It starts in OnNavigatedTo, pauses while the PAUSED dialog is open, and resumes on Cancel. The button is always enabled and clickable even at opacity 0.
* **EndRectangle**: Fill **#7F000000**, Stroke Black (1 px), (0,0) 480×800, RowSpan 3, Collapsed until game over.
* **NameEndTextBox**: RowSpan 2, Left/Top, Margin `0,143,0,0`, Width 480, Height 72, Text "Player", TextWrapping Wrap, Collapsed.
  * WP7 TextBox look: 12 px overhang, so the visible box is x 12..468, y 155..203, with a white (#BFFFFFFF) background, black text at 25.333 px and a 3 px border.
  * Focus brings up the soft keyboard.
* **SaveButton** "Save": Left/Top Margin `295,202,0,0`, 185×70 (visible frame x 307..468, y 214..260), Collapsed. Click → save score (§1.6) and leave.
* **CancelButton** "Back": Margin `10,202,0,0`, 185×70 (visible x 22..183, y 214..260), Collapsed. Click → leave without saving.
* The four game-over controls become Visible once, the first Update in which `playerLifeState == DELETING`.
* Back key: PAUSED dialog (§1.2). The text is verbatim `"Press OK to Exit\nPress CANCEL to Continue"` with caption `"PAUSED"`.

### 4.3 ScorePage (ScorePage.xaml), SystemTray visible
* Standard template, **untranslated placeholders**: TitlePanel (Row 0, Margin `12,17,0,28`) with `ApplicationTitle` Text **"APPLICAZIONE"** (PhoneTextNormalStyle) and `PageTitle` Text **"nome pagina"** (PhoneTextTitle1Style, Margin `9,-7,0,0`). These are faithful to what shipped; flag them to the lead.
* `ContentPanel` (Row 1, Margin `12,0,12,0`) is empty. `stackPanel1` (Row 1) sits at Left/Top Margin `21,0,0,0`, 447×607.
* The content top is ≈ y 193 on screen: tray 32 + title panel ≈ 161, approximate.
* OnNavigatedTo: if `scores.xml` exists, add one TextBlock per score in stored order (already sorted descending), text `Score.ToString()`, default 20 px white Segoe.
  * Else `MessageBox.Show("SUCA ROFL NO PUNTEGGI STERRO FROCETTO")`. **This is a vulgar/homophobic placeholder.** Do not ship it verbatim: show a neutral message such as "Nessun punteggio" / "No scores yet" (deviation D2; confirm with the lead).

### 4.4 TutorialPage (TutorialPage.xaml, class `Tutorial`), SystemTray hidden
* `controls:Panorama Title="Tutorial"` with 4 `PanoramaItem`s, swiped horizontally and wrapping around: Headers **"movimento"**, **"fuoco"**, **"granate"**, **"tachioni"**. Each holds a vertical `ScrollViewer`.
* WP7 Panorama look:
  * Huge title (Segoe WP Light ≈ 140–187 px, partly clipped, parallax).
  * Item headers Segoe WP SemiLight ≈ 66 px.
  * Item content width ≈ 420–432 px with ~12 px left margin; content starts around y ≈ 270.
  * Web: a horizontal scroll-snap strip with a slower-moving title. Exact panorama metrics are approximate.
* Text color white, 20 px Segoe, wrapping. `TextAlignment=Center` where stated. All texts are **verbatim Italian**.
* Positions below are (x,y) inside the item grid. Images use natural size unless stated (Stretch None).

**Item 1 "movimento"**: Grid rows 140/140/96/122 (y 0,140,280,376,498); cols 170/78/170/2* (x 0,170,248,418).
* T1 (row0, cols 0-1, Left/Top, wrap, centered): "Inclina il cellulare per muovere la navicella. Ogni volta che accedi al gioco il dispositivo si calibra automaticamente."
* Ship img/Ship.png at (311,30). Four `es:BlockArrow` (Fill **#0056EB**, Stroke Black) around it:
  * Right 50×25 at (331,49).
  * Left 50×25 at (281,49).
  * Up 25×50 at (319,12).
  * Down 25×50 at (319,62).
* T2 (row1, cols 0-2, margin 41,30, width 332, centered) at (41,170): "Per calibrare nuovamente il dispositivo mentre giochi basta che metti in pausa e torni subito al gioco."
* img/easy.png in a 66×64 box at (94,264).
* T3 (row2, cols 1-2, 227×83, centered) at (179,289): "Evita di urtare gli asteroidi e i nemici che incontri per non morire."
* img/asteroid.png (41×27 box) at (20,343). img/enemyBullet.png (20×20 box) at (113,353).
* T4 (row3, cols 1-2, 227×83, centered) at (179,393): "Più a lungo sopravviverai, più alto sarà il tuo punteggio!"
* img/Ship.png centered in box (59,402)-(108,466).

**Item 2 "fuoco"**: Grid Height 600; rows 140/140/127/91/rest (y 0,140,280,407,498,600); same cols.
* T5 (13,5) w223 centered: "La navicella spara i suoi proiettili automaticamente. L'unica cosa che devi fare è mirare il bersaglio!"
* Ship in box (295,85)-(344,149). gunBullet 15×15 at (314,60) and (314,8).
* T6 (183,155) w223 centered: "Raccogli i power-up lasciati dalle navicelle nemiche per potenziare la tua arma principale"
* Ship box (67,220)-(116,284). gunBullets 15×15 at (82,201), (82,148), (105,201), (64,201), (26,148), (141,148) (3-way spread).
* gunPowerUp 32×42 at (13,301). Text (60,302) w140: "Arma principale".
* rocketPowerUp 32×45 at (13,362). Text (60,372) w221: "Arma secondaria (missili)".
* rocket 17×40 at (342,319).
* granadePowerUp (`/img/granadePowerUp.png`) 32×45 at (13,429). Text (60,440) w160: "Granata al plasma".
* Ship box (327,434)-(376,498).
* T8 (29,516) w372 centered: "Non farti colpire, altrimenti tutte le tue armi automatiche saranno depotenziate!" The game no longer downgrades weapons on hit (that code is commented out); keep the text anyway.

**Item 3 "granate"**: Grid with auto height (≈ 565 px).
* T10 at (5,7), height 92, wrap, made of Runs: "Durante il gioco puoi " · "lanciare delle granate" · ". Premi il pulsante " · 22 spaces · "per entrare in modalità di" · " mira." The rendered text is "Durante il gioco puoi lanciare delle granate. Premi il pulsante [gap] per entrare in modalità di mira." **grenade_button.png** (102×21) is placed at (164,38) to sit in the gap.
* Text (7,104) w407: "Comparirà una griglia verde. A questo punto:"
* Text (38,160) w206: "1. Punta il tuo bersaglio mantenendo un dito sullo schermo"
* Text (191,287) w227: "2. Sempre mantenendo il primo dito, curva la traiettoria della granata toccando lo schermo con un altro dito."
* Text (29,478) w190: "3. Stacca le dita dallo schermo per far partire la granata!"
* img/Ship.png at bottom-right (right 33, bottom 21).
* img/scope.png at 128×128 (Fill), top-right at (right 34, y 149).
* img/easy.png 74×64 at (right 66, y 186).
* img/scope.png 128×128 at bottom-left (x 7, bottom 131).
* img/plasmagranade.png 32×32 at (right 127, bottom 69).
* A white `es:Arc` (heavily transformed: Rotation −139, scale 4.7×4.35, skew −30/−29) draws the curved grenade trajectory from the ship up to the bottom-left scope. Approximate it with an SVG quadratic curve, stroke white.

**Item 4 "tachioni"**:
* Text (98,5) w318: "Durante il gioco compariranno dei fasci di tachioni. Raccoglili per riempire il tuo serbatoio temporale!"
* ProgressBar demo at (98,104) 247×12, Value 65, same gradient as TimeTankBar.
* Blue BlockArrow (Right, #0056EB) 28.8×14.8 at (235,87), pointing at the bar.
* Text (98,144) w217: "Quando entri nel fascio, il tempo rallenterà per tutti... ma non per te!"
* Text (15,240) w285: "Questo ti permetterà di schivare proiettili più facilmente e compiere più uccisioni, ma funziona solo finchè stai nel raggio di azione dei tachioni!"
* Text (3,399) w416: "Puoi riavvolgere il tempo in qualsiasi momento con un flick verso il basso, e interrompere il riavvolgimento toccando lo schermo. Questo farà scaricare il tuo serbatoio temporale."
* Text (3,511) w418: "Infine, se vieni distrutto non è finita! Puoi sempre riavvolgere il tempo, ma attenzione a non rimanere a secco di tachioni!"
* Decorations:
  * img/Tachyon.png 10×10 at (30,16).
  * Three 36×151 clusters of twelve 10×10 Tachyon.png (same internal pattern) at (28,20), at right 17 / y 104, and at right 15 / y 193.
  * img/Ship.png at (28,167) and at bottom-right (right 75, bottom 198).
  * img/easy.png 65×64 at (right 58, y 191).
  * img/asteroid.png (width 28) at right 127 / y 278.
  * Blue BlockArrow 66×36 at (333,307) rotated −31.7°.
  * Red (#EB0000) BlockArrows 26×17 at (301,263) rotated 108.5° and at (266,313) rotated 92°.

### 4.5 Credits (Credits.xaml, class `Page1`), SystemTray visible
* TitlePanel (Margin `12,17,0,28`): "CONTINUUM" (PhoneTextNormalStyle) and "riconoscimenti" (PhoneTextTitle1Style, Margin `9,-7,0,0`).
* ContentPanel (Row 1, Margin `12,0,12,0`, top ≈ y 193 on screen). Coordinates below are relative to it; all TextBlocks are 282 wide at x=86 with TextAlignment Center.
  * y 104, h 33: "Continuum v. 1.0.0.0"
  * y 171, h 39: "Sviluppato da XTeam"
  * y 252, h 111: "Programmatori:" / "Ruben Caliandro" / "Stefano Nada" / "Stefano Ordine" (LineBreaks)
  * HyperlinkButton "xteamdimension.com" at (107,459), default style (white, underlined, ≈ 22.7 px). Click → open `http://www.xteamdimension.com`.

---

## 5. Asset inventory

### 5.1 ContinuumLibContent (XNA content; copy to e.g. `public/content/` keeping paths)

| Asset (path, size) | Loaded as / id | Referenced by | Used at runtime? |
|---|---|---|---|
| Ships/Ship.png 41×65 | "Ships/ship" → `playership` (index 0) | RandomLevel.xml, GamePage, GameState.SetPlayerBounds | yes |
| Backgrounds/bgr0_0.png 480×1600 (RGB, opaque) | `stars0` | RandomLevel.xml | loaded, **never drawn** |
| Backgrounds/bgr0_1.png 480×1600 | `stars1` | levels 0 & 1 | yes |
| Backgrounds/bgr0_2.png 480×1600 | `stars2` | level 2 | yes |
| Weapons/gunBullet.png 10×13 | `gunbullet` | GunBullet (player) | yes |
| Weapons/enemyBullet.png 10×13 | `enemybullet` | GunBullet (enemy) | yes |
| Effects/shadowcorner.png 240×400 | `shadow` | rewind vignette | yes |
| Asteroids/asteroid.png 30×29 | `asteroid` | asteroids, AsteroidRandomizer | yes |
| Effects/explosionChip1..3.png (21×20, 9×20, 7×20) | `explosionChip1..3` | newExplosion | yes |
| Effects/grenadeChip1..3.png | `granadeChip1..3` | newGranadeExplosion | yes |
| Effects/asteroidChip1..3.png | `asteroidChip1..3` | asteroid hits/explosion | yes |
| Enemies/easy.png 64×56 | `enemyeasy` | EnemyRandomizer (Gun) | yes |
| Enemies/normal.png 64×52 | `enemynormal` | EnemyRandomizer (RocketLauncher) | yes |
| Animations/TachyonStream.png 2000×1600 (9.5 MB; 2 rows × 20 cols of 100×800) | `tachyonstream` | TachyonStream | yes |
| Effects/tachyon.png 14×12 | `tachyon` | Tachyon | yes |
| Weapons/rocket.png 17×40 | `rocket` | Rocket | yes |
| Weapons/rocketfollower.png 19×40 | `followingrocket` | FollowingRocket | yes |
| PowerUps/gunPowerUp.png 32×37 | `gunpowerup` | PowerUp | yes |
| PowerUps/rocketPowerUp.png 32×37 | `rocketpowerup` | PowerUp | yes |
| PowerUps/grenadePowerUp.png 32×37 | `granadepowerup` | PowerUp | yes |
| Effects/void.png 32×32 (fully transparent) | `void` | AreaDamage (dead code) | loaded only |
| Weapons/plasmagranade.png 32×32 | `plasmagranade` | PlasmaGranade | yes |
| Weapons/scope.png 180×177 | `scope` | aim reticle | yes |
| Effects/blood.png 240×400 | `blood` | low-life overlay | yes |
| debugFont.spritefont | `debugFont` (Arial 10) | level title text | yes |
| Sounds/continuum.mp3 | Song | App music | yes |
| Sounds/bulletHit.wav, explosion.wav, powerUp.wav, rewindStart.wav, rewindEnd.wav | SoundEffect | see §1.7 | yes |
| Sounds/rocket.wav, gridStart.wav, gridEnd.wav | SoundEffect | loaded in GamePage | **never played** |
| Animations/Sparks.png 680×218, Effects/bound.png 64×64 | none | not in .contentproj; `TextureConstant.ANIMATION_SPARKS` unused | **unused** |

* The .contentproj also lists `Animations/animation.png` and `Animations/explosion.png`, which **do not exist** in the repo (removed in commit "removed unused assets"). They are only referenced by the dead Level1.xml.
* **Content-pipeline processing**:
  * All textures use `TextureImporter`/`TextureProcessor` with **no ProcessorParameters**, so the XNA 4 defaults apply: `ColorKeyEnabled = true` with ColorKeyColor = magenta (255,0,255) → transparent; **`PremultiplyAlpha = true`**; `GenerateMipmaps = false`; `ResizeToPowerOfTwo = false`; `TextureFormat = Color`.
  * I verified that no shipped PNG (except the unchecked 2000×1600 TachyonStream) contains pure magenta pixels, so the color key is effectively a no-op. Applying it is cheap and safe.
  * **Premultiplication matters.** Many sprites have semi-transparent edges. Upload with `gl.pixelStorei(UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)` and blend `ONE, ONE_MINUS_SRC_ALPHA`. Tint = vertex color multiplied in the shader (the Color is already "premultiplied" by the `Color*float` semantics).
  * Sampling: LINEAR, CLAMP_TO_EDGE, no mipmaps. All textures are NPOT, which is fine in WebGL1 with these settings.
  * Audio: `WavImporter`/`SoundEffectProcessor`; `Mp3Importer`/`SongProcessor`. `XnaCompressContent=false`.
* Asset paths are case-insensitive in the original: `Ships/ship` vs the file `Ships/Ship.png`.

### 5.2 Continuum/ (Silverlight content, copy to e.g. `public/`)

| File | Used by |
|---|---|
| logo.png 480×264 | MainPage logo |
| SplashScreenImage.jpg 480×800 | OS splash + MainPage SplashScreen image (fade/slide out) |
| grenade_button.png 102×21 | GamePage grenade button (both template layers), TutorialPage item 3 |
| img/Ship.png 41×64, img/easy.png 64×57, img/asteroid.png 30×28, img/enemyBullet.png 10×13, img/gunBullet.png 10×13, img/gunPowerUp.png 32×37, img/rocketPowerUp.png 32×37, img/granadePowerUp.png 32×37, img/rocket.png 17×40, img/scope.png 180×177, img/plasmagranade.png 32×32, img/Tachyon.png 14×12 | TutorialPage only (all 12 used). These are slightly different exports of the game sprites (no premultiplication; plain `<img>`). |
| Fonts/Squared Display.ttf | MainPage buttons |
| Font/QUARTZMS.TTF | unreferenced |
| ApplicationIcon.png 62×62 | app icon → favicon |
| Background.png 173×173 | start-screen tile → optional PWA icon |
| Levels/RandomLevel.xml | the level (load as text) |
| Levels/Level1.xml, Levels/LevelSchema.xsd | unused / docs |

---

## 6. Input model

### 6.1 Accelerometer → ship movement
* Each `CurrentValueChanged` event stores `AccelerometerReading = e.SensorReading.Acceleration` (WP7 units: g; device axes +X right, +Y toward the top of the screen, +Z out of the screen; the reading is the gravity vector, so flat face-up is (0,0,−1)).
* The **first** reading after the InputManager is created triggers `RecalibrateAccelerometer()` → `accelerometerCurrentZero = AccelerometerReading`. This is the automatic calibration on each new game.
* `RecalibrateAccelerometer()` is also called when the user cancels the PAUSED dialog. `RecalibrateAccelerometer(Vector3)` is unused.
* `AccelerometerReadingCorrected` (InputManager.cs:49-83) maps each axis piecewise-linearly so that the zero maps to 0 and ±1 g map to ±1:
  ```
  c = (r > z) ? (r - z)/(1 - z) : (r - z)/(1 + z)          // per axis X, Y, Z
  ```
* Player.Update (Player.cs:73-74): `X = clamp(X + c.X*800*dtp, 0, 480)` and `Y = clamp(Y - c.Y*800*dtp, 0, 800)`, with `dtp = playerTime.elapsedContinuumTime`. Movement happens only when the player is alive and `playerTime.continuum >= 0`. Tilting the right edge down moves right; tilting the top edge down/away moves up.
* **Web mapping**: use `devicemotion.accelerationIncludingGravity` (m/s²). Spec-compliant browsers (Chrome/Android) report flat face-up as (0,0,+9.81), so `wp = -aig / 9.81`. iOS Safari reports the opposite sign, so `wp = +aig / 9.81` there. Detect it with the sign of z at calibration (face-up-ish → WP z should be negative) or use a platform check.
  * iOS 13+ needs `DeviceMotionEvent.requestPermission()` from a user gesture (call it on the "Start" click).
  * Lock portrait.
  * For desktop, add a fallback that synthesizes a reading, e.g. arrow keys/WASD give ±0.35 g on X/Y (deviation D4). Feed it through the same calibration path.

### 6.2 Touch gestures (InputManager.Update, called each frame after Player.Update)
* Gestures read: `Tap → tapVector = Position`, `FreeDrag → freeDragVector = Position`, `Flick → flickVector = Delta` (velocity). They are stored as nullable "sticky" values: only the `Tap()` / `FreeDrag()` / `FlickDown()` readers clear them, and each reader clears **all three**.
* `if (gs.PerformMultitouchPlasmaGranade)` (timeState ∈ ENTER/PGL/CALIB_TARGET/CALIB_CONTROL/EXIT), run `UpdateMultitouchPlasmaGranade()`.
* `if (gs.PerformGestureFlickDownRewindTime)` (timeState == FORWARD): `if (isFlickReadable() && FlickDown()) timeManager.Back()`. `FlickDown()` returns `flick.Y > 0` (any flick with a downward component) and clears all three. So any flick in FORWARD consumes everything, but only a downward one rewinds (when `timeTank > critical`).
* `if (gs.PerformGestureFlickDownStopRewind)` (timeState == REWIND): `if (isTapReadable()) timeManager.Stop()`. **The tap is NOT consumed** (`Tap()` is never called). A tap made earlier, e.g. during BEGIN_REWIND/START_REWIND or while aiming, so stays pending until a flick clears it, and it stops the rewind the moment REWIND is reached (QUIRK, keep).
* FreeDrag is enabled and recorded but never used for gameplay.
* Note: the player is also dead-able while rewinding. Flick-rewind works while dead, because player death writes `timeState = FORWARD`. That is the "rewind after death" feature.
* **Gesture recognition in the compat layer**: XNA's thresholds are undocumented; the MonoGame equivalents are approximate:
  * Tap = press + release with movement < ~35 px and short duration.
  * FreeDrag = emitted each frame while a single touch moves beyond the tap tolerance.
  * Flick = release after a drag with release velocity above a threshold (~ 500–1000 px/s); `Delta` = velocity vector in px/s (screen coords, +Y down).
* Silverlight vs XNA input: on WP7 the TouchPanel also sees touches that land on Silverlight buttons. Faithful behaviour would let a tap on the grenade button also register as a Tap gesture. That is harmless except for the sticky-tap quirk; either way is acceptable, but document the choice.

### 6.3 Plasma-grenade aiming (multitouch; InputManager.cs:193-313)
* Enter: grenade button Click → `ActivatePlasmaGranadeLauncher()`. This needs State == FORWARD **and** `PlayerGranadeCount > 0` (count starts at 0; +1 per GRANADE power-up). The grid animates in for 0.4 s (green tint). The aim mode times out after 5 s idle (PGL state only).
* Each frame in aim states, `locations` = all current touches (incl. just-released, §3.5):
  * **No finger tracked** (`firstFinger == null && secondFinger == null`): if ≥ 1 touch, `firstFinger = loc[0].Id`, `firstFingerPosition = loc[0].Position`, `FirstFinger()` (→ CALIB_TARGET: scope shown at finger 1, spinning 1 rad/s). If ≥ 2 touches, also `secondFinger = loc[1]` and `SecondFinger()` (→ CALIB_CONTROL).
  * **Then (same frame) one finger tracked** (`first != null && second == null`):
    * 0 touches → `firstFinger = null; UndoFirstFinger()` (→ PGL, which restarts the 5 s timeout).
    * 1 touch → if it's the same id, update position; else adopt the new touch as first.
    * ≥ 2 touches → if first is still present, pick the first other touch as second and update both positions; else take loc[0], loc[1]. Then `SecondFinger()` (→ CALIB_CONTROL: path = Bezier(start = playerPosition, target = finger1, control = finger2), scopes on both fingers, Azure polyline of 9 segments, thickness 2).
  * **else-if both tracked**: < 2 touches, or either id missing → `LaunchPlasmaGranade()` (→ EXIT_PGL; spawns `PlasmaGranade(path)`, `PlayerGranadeCount--`), fingers = null. Otherwise update both positions.
* Ids are `int?`; compare against `null` explicitly, never by truthiness.
* Transitions requested in the wrong state are ignored by the TimeManager setter, e.g. FirstFinger during ENTER. Input still records the finger ids; `PlasmaGranadeLauncherInit` clears them on entering PGL.
* The grenade flies along the curve in 1 s of level time, then detonates (30 damaging chips), or detonates earlier on contact with an asteroid or enemy.

---

## 7. Pitfalls for the JS/TS port

1. **Struct (value-type) semantics: Vector2, Vector3, Rectangle, Color, Point, PlayerState, TouchLocation, Nullable<T>, TimeSpan.** Make `Vector2`/`Rectangle`/`Color` classes with `clone()`/`equals()`, and **clone on every store** that C# copies. Critical sites:
   * `TimeTraveler.InitializeTimeTraveler`: `startPosition = StartPosition; currentPosition = StartPosition` need two independent copies. Weapons pass `gs.playerPosition` / the enemy position straight into `newGunBullet(position, ...)`, so without a clone **bullets would follow the ship**.
   * `QuadraticBezierCurve` ctor and the `path.startPoint/targetPoint/controlPoint = gs.playerPosition/firstFingerPosition/...` assignments (TimeManager.cs:209,429-431). Without clones the in-flight grenade's path follows the player and fingers.
   * `gs.firstFingerPosition = locations[i].Position`; `Player.interpolationA = gs.playerPosition` (then `gs.playerPosition.X = ...` mutates in place, which must not alter interpolationA).
   * `Tachyon.EvaluatePosition`: `Vector2 evaluate = startPosition; evaluate.Y = ...` mutates a COPY.
   * `Utility.CalculateXAngleFromVector(Vector)` calls `Vector.Normalize()` on its by-value parameter; callers pass `direction`. Clone inside.
   * `Chip` ctor normalizes its parameter; `Vector2.Zero` is passed. **`Vector2.Zero` must return a fresh instance (or be frozen).**
   * Value equality: `target != new Vector2(-1,-1)` (FollowingRocket), `Direction == Vector2.Zero` (Chip). Use `.equals()`.
   * `gridVerticalPoints[i][1].Y = delta`: each slot must hold its own instance (the init creates new ones per slot; keep it that way).
   * Boxed record values (`AddElementRecord(v => currentPosition = (Vector2)v, evaluate)`): clone when storing and when restoring.
   * `FollowingRocket` `nearest = x.CurrentPosition`: clone.
   * `PlayerState` is a struct stored in a LinkedList; plain object with primitive fields is fine.
2. **Integer division and int casts.** C# `int/int` truncates toward zero (also for negatives); `(int)float` truncates. Use `Math.trunc` (or `|0`), **not** `Math.floor`. Sites:
   * `SCREEN_WIDTH/2`, `3*SCREEN_HEIGHT/4`, `Origin = (Width/2, Height/2)` (TimeTraveler).
   * `Animation Width = SeqW/Cols`, `Row = Index/Cols`, `Index = (int)Delta % Length` (`%` keeps the dividend sign in both languages).
   * `Rectangle.Center`.
   * Asteroid `(W*life+2000)/50`; GunBullet `W*damage/4 + 8`.
   * `Utility.newRectangleFromCenterPosition: (int)X - W/2`.
   * Player draw `textures[0].Width/2`; scope origin `tx.Width/2`; `TACHYON_STREAM_WIDTH/2`.
   * `shadowSource (int)(...)`; `(int)PlayerLife` in collisions; `(int)speedRV.Next()`; `Enemy.BoundDamaged = (int)(life/3f)`.
   * `PLAYER_LIFE_CRITICAL_VALUE = (int)((20/3f)*2) = 13`; `(int)(40*3/Duration)` (float division then trunc); `Chip.Damage (int)lastDamage + 1`; `trajectory.CurveIndex = (int)Delta`; Randomizer `second = (int)Delta + 1`.
   * Rectangles store ints: truncate in the Rectangle ctor.
3. **float32 vs double.** The game uses `float`; JS uses double. Usually harmless, but:
   * The Bezier preview loop `for (float i=0.1f; i<=1; i+=0.1f)` runs **9** times in float32 vs 10 in double (verified). Replicate it with `Math.fround` or a fixed count of 9.
   * Exact equality transitions (`continuum == 0`, `== -1`, `== 1`) are safe because of Math.Min/Max clamping. Don't "optimize" the clamps away.
   * `float.MaxValue` is 3.4028235e38, not `Number.MAX_VALUE`/Infinity. Comparisons behave the same, but keep the constant.
   * Float division by zero gives ±Infinity/NaN in both languages (e.g. `StartForward` ratio 0/0). **(int)NaN in C#** is `int.MinValue`, in JS trunc(NaN) is NaN; these paths are guarded/clamped in practice.
4. **Random.** `Utility.NextRandom` overloads are picked **by static argument types**:
   * `(int,int)` → integer in `[min, max)` (exclusive max), e.g. `NextRandom(0,3)`, `NextRandom(0,480)`, `NextRandom(-30,510)`, `NextRandom(60,420)`, `NextRandom(-60,60)`, `NextRandom(100,200)`, `NextRandom(50,250)`, `NextRandom(0,50)`, `NextRandom(1,100)`, and the BezierPath bounds.
   * `(float,float)`, including mixed `(0, 2f)` and `(0,(float)Math.PI*2)` → float in `[min,max)`.
   * `(double,double)` → double.
   * Port them as distinct functions (`nextRandomInt`, `nextRandomFloat`, `nextRandomDouble`) and pick per call site as listed. The "rflush" loop (discarding 0–19 values) only burns entropy; with `Math.random` it can be dropped (the RNG is unseeded, so there is no determinism to preserve).
   * `NextRandom(0d,1d)` can return 0 → `Math.log(0) = -Infinity` in Box–Muller; the result is clamped by min/max.
5. **Properties with side effects.** These must stay accessors, not plain fields:
   * `TimeTraveler.lifeState` setter: journaling, deathTime, ignored when `levelTime.continuum <= 0`, DELETING sticky.
   * `GameState.PlayerLife` (damageTimer + clamp); `PlayerGranadeCount` (clamp ≥ 0).
   * `Gun/RocketLauncher.Level` setter (only if ≤ 6, no levelStartTime change) vs `Upgrade()` (clamps, resets levelStartTime).
   * `TimeManager.State` setter (guarded state machine).
   * `BezierPath.IsFinished` getter writes `isFinished`.
   * `Chip.Damage` getter memoizes.
   * `TimeTraveler.Top/Bottom` derive from the virtual `DestinationRectangle`, so overrides matter.
6. **Virtual dispatch.** `DestinationRectangle` (TimeTraveler/Animation/AreaDamage/Asteroid/GunBullet/Tachyon), `EvaluateDelta` (BackgroundTexture), `EvaluateRotation` (Rocket/FollowingRocket) and `EvaluatePosition`/`HasCollided` (abstract) are all virtual. TS getters/methods are virtual by default; just keep the overrides. Collision responses use `is` type tests → `instanceof`, and the **order of the checks matters** (Asteroid, Enemy, Bullet, Tachyon, PowerUp, Chip).
7. **Collections.**
   * C# `LinkedList<T>` with AddFirst/RemoveLast is used as a time-ordered journal (newest first). Implement a real doubly-linked list (O(1) both ends), or a deque; `Array.unshift` per frame on thousands of records is too slow.
   * `Remove(T)` removes the first node whose value is the same reference.
   * Enumeration while modifying throws in C#; the original avoids it with temp arrays. Keep the "collect then remove" pattern. Spawns during an update go to *other* lists (e.g. TachyonStream (in animations) → tachyons).
   * `Collisions.Count` never shrinks (§2.1). Port verbatim; its per-frame cost grows linearly over a session, which is acceptable.
   * Only one stale journal record is pruned per frame (RemoveLast). Don't "fix" it to a while-loop.
8. **Nullable types.** `int?` finger ids and `TransitionTextureIndex`, plus `float?` continuum backups: use `null` and test with `=== null`/`!== null`, because id/index **0 is valid**. `Rectangle? SourceRectangle` null = whole texture.
9. **Static mutable state.** `Constants.SCREEN_WIDTH/HEIGHT` (set in GamePage ctor), `Constants.TIME_TANK_CRITICAL_VALUE` (mutated in RewindInit; persists across games in a session; initial 0.555) and the static `SoundManager`. Keep them module-level `let`s, not `const`.
10. **Parsing.** `Convert.ToInt32(string)` is strict integer parsing (use `parseInt` + validation, or `Number`), and `Convert.ToInt32(null) == 0`. `Single.Parse` is invariant culture (`Number(s)`). Attribute lookup returns `null` when missing (not `undefined`/"").
11. **Events and threads.**
    * The accelerometer event arrives asynchronously, so the latest reading is used at Player.Update.
    * `LayoutUpdated` and UIElementRenderer are irrelevant on the web.
    * Storyboards → CSS/WAAPI with linear keyframes and fill-forwards.
    * The modal `MessageBox` blocks the loop; emulate it with an explicit pause flag and a dt reset.
    * Obscured/Unobscured → visibilitychange (sets continuums to 0 and restores them).
    * RAF stops in background tabs anyway; on return clamp or reset dt.
12. **No LINQ, no XDocument.** Just a flat XML element walk (DOMParser).
13. **Exceptions.** Several `throw`s are unreachable in practice (BoosterInit, StartGameState, Animation/BackgroundTexture.HasCollided, AreaDamage paths, unknown weapon/powerup). Keep them as `throw new Error(...)` so that bugs surface.
14. **Draw-time state leak.** `timeColor` is modified inside Draw and not reset by Update outside the intro or a rewind. This is the source of the aim-mode green tint; preserve it.
15. **Coordinate system.** Y is down and rotation is in radians, clockwise on screen. Render to a 480×800 canvas backing store; scale it with CSS to fit the viewport (letterbox, aspect 0.6). Map pointer coordinates back to logical pixels, and scale the DOM overlay with the same transform.
16. **Case-sensitive asset URLs** (see §5).

---

## 8. Deliberate deviations (agreed web-only changes; everything else stays faithful)

* **D1** Scores are stored in `localStorage["continuum.scores"]` as JSON (same fields/semantics as `Score[]` XML).
* **D2** Replace the offensive "no scores" MessageBox text with a neutral one — wording: "No scores yet. Play a game to set one!" (lead decision).
* **D3** On resume from pause, dialog or tab switch, reset the frame clock (dt = 0) instead of applying the elapsed wall time.
* **D4** Keyboard/mouse fallback: synthesize the accelerometer vector from keys. The flick-down/tap gestures come from pointer events (mouse drag works). Back/pause = Escape plus the browser back button.
* **D5** Music/sfx start after the first user gesture (autoplay policy). Use the Wake Lock API instead of UserIdleDetectionMode.
* **D6** Skip tombstoning (`saved.xml`), FrameworkDispatcher, AppServiceProvider and the UIElementRenderer (DOM overlay instead).
