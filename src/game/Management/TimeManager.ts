import { Vector2, type GameTimerEventArgs } from '../../xna';
import type { GameState } from '../State/GameState';
import { ElementRecord } from '../Utilities/ElementRecord';
import { LinkedList } from '../Utilities/LinkedList';
import { QuadraticBezierCurve } from '../Utilities/QuadraticBezierCurve';
import { Constants, LifeState, TimeState, type RewindMethod } from '../Utilities/Utilities';
import { SoundManager } from './SoundManager';

/** Time state machine: rewind, plasma-grenade aim mode, grid animation. */
export class TimeManager {
  private gs: GameState;

  private beginRewindContinuumLevel = 0;
  private continuumLeanLevel = 0;
  private continuumMinLevel = 0;
  private timerStartTime = 0;
  private timerElapsedTime = 0;
  private timerTargetDuration = -1;
  private elementRecords: LinkedList<ElementRecord>;
  private maxvaltimetank = 0;
  private _path: QuadraticBezierCurve | null = null;
  private _rotation = 0;

  //DEBUG
  private time_tank_timer = 0;
  private time_tank_timer_start = false;

  get rotation(): number {
    return this._rotation;
  }

  get path(): QuadraticBezierCurve {
    return this._path!;
  }

  get normalizedDelta(): number {
    return this.timerElapsedTime / this.timerTargetDuration;
  }

  get drawLines(): boolean {
    return this.state === TimeState.CALIBRATION_PLASMA_GRANADE_PATH_CONTROL_POINT ||
      this.state === TimeState.CALIBRATION_PLASMA_GRANADE_PATH_TARGET_POINT ||
      this.state === TimeState.ENTER_PLASMA_GRANADE_LAUNCHER ||
      this.state === TimeState.EXIT_PLASMA_GRANADE_LAUNCHER ||
      this.state === TimeState.PLASMA_GRANADE_LAUNCHER
      ? true
      : false;
  }

  get state(): TimeState {
    return this.gs.timeState;
  }

  /** Guarded state machine: disallowed transitions are silently ignored. (Private setter in C#.) */
  set state(value: TimeState) {
    const gs = this.gs;
    switch (gs.timeState) {
      case TimeState.START_GAME_STATE:
        if (value === TimeState.FORWARD) {
          gs.timeState = value;
          this.startGameStateInit(); //da fare
          this.forwardInit();
        }
        break;
      case TimeState.FORWARD:
        if (value === TimeState.BEGIN_REWIND) {
          gs.timeState = value;
          this.beginRewindInit();
        } else if (value === TimeState.BOOSTER) {
          gs.timeState = value;
          this.boosterInit(); //da fare
        } else if (value === TimeState.ENTER_PLASMA_GRANADE_LAUNCHER && gs.playerGranadeCount > 0) {
          gs.timeState = value;
          this.enterPlasmaGranadeLauncherInit();
        }
        break;
      case TimeState.BEGIN_REWIND:
        if (value === TimeState.START_REWIND) {
          gs.timeState = value;
          this.startRewindInit();
        }
        break;
      case TimeState.START_REWIND:
        if (value === TimeState.REWIND) {
          gs.timeState = value;
          this.rewindInit();
        }
        break;
      case TimeState.REWIND:
        if (value === TimeState.BEGIN_FORWARD) {
          gs.timeState = value;
          this.beginForwardInit();
        }
        break;
      case TimeState.BEGIN_FORWARD:
        if (value === TimeState.START_FORWARD) {
          gs.timeState = value;
          this.startForwardInit();
        }
        break;
      case TimeState.START_FORWARD:
        if (value === TimeState.FORWARD) {
          gs.timeState = value;
          this.forwardInit();
        }
        break;
      case TimeState.BOOSTER:
        if (value === TimeState.FORWARD) {
          gs.timeState = value;
          this.forwardInit();
        }
        break;
      case TimeState.ENTER_PLASMA_GRANADE_LAUNCHER:
        if (value === TimeState.PLASMA_GRANADE_LAUNCHER) {
          gs.timeState = value;
          this.plasmaGranadeLauncherInit();
        }
        break;
      case TimeState.PLASMA_GRANADE_LAUNCHER:
        if (value === TimeState.EXIT_PLASMA_GRANADE_LAUNCHER) {
          gs.timeState = value;
          this.exitPlasmaGranadeLauncherInit();
        } else if (value === TimeState.CALIBRATION_PLASMA_GRANADE_PATH_TARGET_POINT) {
          gs.timeState = value;
          this.calibrationPlasmaGranadePathTargetPointInit();
        }
        break;
      case TimeState.CALIBRATION_PLASMA_GRANADE_PATH_TARGET_POINT:
        if (value === TimeState.CALIBRATION_PLASMA_GRANADE_PATH_CONTROL_POINT) {
          gs.timeState = value;
          this.calibrationPlasmaGranadePathControlPointInit();
        } else if (value === TimeState.PLASMA_GRANADE_LAUNCHER) {
          gs.timeState = value;
          this.plasmaGranadeLauncherInit();
        }
        break;
      case TimeState.CALIBRATION_PLASMA_GRANADE_PATH_CONTROL_POINT:
        if (value === TimeState.EXIT_PLASMA_GRANADE_LAUNCHER) {
          gs.timeState = value;
          gs.newPlasmaGranade(this._path!);
          gs.playerGranadeCount--;
          this.exitPlasmaGranadeLauncherInit();
        }
        break;
      case TimeState.EXIT_PLASMA_GRANADE_LAUNCHER:
        if (value === TimeState.FORWARD) {
          gs.timeState = value;
          this.forwardInit();
        }
        break;
    }
  }

  constructor(gs: GameState) {
    this.gs = gs;
    this.elementRecords = new LinkedList<ElementRecord>();
    gs.timeState = TimeState.FORWARD;
  }

  private startGameStateInit(): void {
    this.resetTimer(Constants.INITIAL_BLACK_DURATION + Constants.INITIAL_FADE_DURATION);
  }

  private calibrationPlasmaGranadePathControlPointInit(): void {
    // The curve ctor clones its (struct) arguments.
    this._path = new QuadraticBezierCurve(this.gs.playerPosition, this.gs.firstFingerPosition, this.gs.secondFingerPosition);
  }

  private calibrationPlasmaGranadePathTargetPointInit(): void {
    this.resetTimer();
  }

  private enterPlasmaGranadeLauncherInit(): void {
    const gs = this.gs;
    this.resetTimer(Constants.PLASMA_GRANADE_LAUNCHER_ENTERING_EXITING_MODE_TIME);

    let lineDistance = Constants.SCREEN_WIDTH / Constants.GRID_COLUMNS;
    for (let i = 0; i < gs.gridVerticalPoints.length; i++) {
      let x = lineDistance * i;
      if (x <= 0) x = 1;
      if (i % 2 === 0) {
        gs.gridVerticalPoints[i][0] = new Vector2(x, 0);
        gs.gridVerticalPoints[i][1] = new Vector2(x, 0);
      } else {
        gs.gridVerticalPoints[i][0] = new Vector2(x, Constants.SCREEN_HEIGHT);
        gs.gridVerticalPoints[i][1] = new Vector2(x, Constants.SCREEN_HEIGHT);
      }
    }
    lineDistance = Constants.SCREEN_HEIGHT / Constants.GRID_ROWS;
    for (let i = 0; i < gs.gridHorizontalPoints.length; i++) {
      let y = lineDistance * i;
      if (y >= Constants.SCREEN_HEIGHT) y = Constants.SCREEN_HEIGHT - 1;
      if (i % 2 === 0) {
        gs.gridHorizontalPoints[i][0] = new Vector2(0, y);
        gs.gridHorizontalPoints[i][1] = new Vector2(0, y);
      } else {
        gs.gridHorizontalPoints[i][0] = new Vector2(Constants.SCREEN_WIDTH, y);
        gs.gridHorizontalPoints[i][1] = new Vector2(Constants.SCREEN_WIDTH, y);
      }
    }
  }

  private plasmaGranadeLauncherInit(): void {
    this.gs.firstFinger = null;
    this.gs.secondFinger = null;
    this.resetTimer(Constants.PLASMA_GRANADE_TIME_OUT);
  }

  private exitPlasmaGranadeLauncherInit(): void {
    this.resetTimer(Constants.PLASMA_GRANADE_LAUNCHER_ENTERING_EXITING_MODE_TIME);
  }

  private boosterInit(): void {
    throw new Error('NotImplementedException');
    //da fare
  }

  private forwardInit(): void {
    this.gs.playerTime.continuum = Constants.CONTINUUM_MAX;
    this.gs.levelTime.continuum = this.tachyonStreamSlowDown();
  }

  private startForwardInit(): void {
    this.resetTimer();
  }

  private beginForwardInit(): void {
    this.resetTimer();
    this.continuumMinLevel = this.gs.levelTime.continuum;
    this.continuumLeanLevel = (this.gs.levelTime.continuum / Constants.CONTINUUM_MIN) * Constants.CONTINUUM_LEAN;
    SoundManager.playSound('rewindEnd');
  }

  private rewindInit(): void {
    this.gs.playerTime.continuum = Constants.CONTINUUM_MIN;
    this.gs.levelTime.continuum = this.continuumMinLevel;
    this.time_tank_timer_start = false;
    // Static mutation that persists across games in the same session (faithful).
    Constants.TIME_TANK_CRITICAL_VALUE = this.time_tank_timer + 0.6;
  }

  private startRewindInit(): void {
    this.maxvaltimetank = this.gs.timeTank; // unused
    void this.maxvaltimetank;
    this.resetTimer();
  }

  private beginRewindInit(): void {
    this.resetTimer();
    this.beginRewindContinuumLevel = this.gs.levelTime.continuum;
    this.continuumLeanLevel = (this.gs.levelTime.continuum / Constants.CONTINUUM_MAX) * Constants.CONTINUUM_LEAN;
    this.continuumMinLevel = (this.gs.levelTime.continuum / Constants.CONTINUUM_MAX) * Constants.CONTINUUM_MIN;
    SoundManager.playSound('rewindStart');
  }

  update(e: GameTimerEventArgs): void {
    const gs = this.gs;
    gs.albertTime.update(e.elapsedTime.totalSeconds);
    if (this.time_tank_timer_start) this.time_tank_timer += gs.albertTime.elapsedContinuumTime;
    // Transitions
    switch (this.state) {
      case TimeState.START_GAME_STATE:
        //da fare
        break;
      case TimeState.BEGIN_REWIND:
        if (gs.playerTime.continuum === 0) this.state = TimeState.START_REWIND;
        break;
      case TimeState.START_REWIND:
        if (gs.playerTime.continuum === Constants.CONTINUUM_MIN) this.state = TimeState.REWIND;
        break;
      case TimeState.REWIND:
        if (gs.timeTank <= Constants.TIME_TANK_CRITICAL_VALUE) this.state = TimeState.BEGIN_FORWARD;
        break;
      case TimeState.BEGIN_FORWARD:
        if (gs.playerTime.continuum === 0) this.state = TimeState.START_FORWARD;
        break;
      case TimeState.START_FORWARD:
        if (gs.playerTime.continuum === Constants.CONTINUUM_MAX) this.state = TimeState.FORWARD;
        break;
      case TimeState.BOOSTER:
        //da fare
        break;
      case TimeState.ENTER_PLASMA_GRANADE_LAUNCHER:
        if (this.normalizedDelta > 1) this.state = TimeState.PLASMA_GRANADE_LAUNCHER;
        break;
      case TimeState.PLASMA_GRANADE_LAUNCHER:
        if (this.normalizedDelta > 1) this.state = TimeState.EXIT_PLASMA_GRANADE_LAUNCHER;
        break;
      case TimeState.CALIBRATION_PLASMA_GRANADE_PATH_TARGET_POINT:
        //da fare
        break;
      case TimeState.CALIBRATION_PLASMA_GRANADE_PATH_CONTROL_POINT:
        //da fare
        break;
      case TimeState.EXIT_PLASMA_GRANADE_LAUNCHER:
        if (this.normalizedDelta > 1) this.state = TimeState.FORWARD;
        break;
    }
    switch (this.state) {
      case TimeState.START_GAME_STATE:
        this.startGameState(); //da fare
        break;
      case TimeState.FORWARD:
        this.forward();
        break;
      case TimeState.BEGIN_REWIND:
        this.beginRewind();
        break;
      case TimeState.START_REWIND:
        this.startRewind();
        break;
      case TimeState.REWIND:
        this.rewind();
        break;
      case TimeState.BEGIN_FORWARD:
        this.beginForward();
        break;
      case TimeState.START_FORWARD:
        this.startForward();
        break;
      case TimeState.BOOSTER:
        this.booster(); //da fare
        break;
      case TimeState.ENTER_PLASMA_GRANADE_LAUNCHER:
        this.forward();
        this.enterPlasmaGranadeLauncher();
        break;
      case TimeState.PLASMA_GRANADE_LAUNCHER:
        this.forward();
        this.plasmaGranadeLauncher();
        break;
      case TimeState.CALIBRATION_PLASMA_GRANADE_PATH_TARGET_POINT:
        this.forward();
        this.calibrationPlasmaGranadePathTargetPoint();
        break;
      case TimeState.CALIBRATION_PLASMA_GRANADE_PATH_CONTROL_POINT:
        this.forward();
        this.calibrationPlasmaGranadePathControlPoint();
        break;
      case TimeState.EXIT_PLASMA_GRANADE_LAUNCHER:
        this.forward();
        this.exitPlasmaGranadeLauncher();
        break;
    }
    gs.playerTime.update(gs.albertTime.elapsedContinuumTime);
    gs.levelTime.update(gs.albertTime.elapsedContinuumTime);
  }

  private startGameState(): void {
    throw new Error('NotImplementedException');
    //da fare
  }

  private calibrationPlasmaGranadePathControlPoint(): void {
    // Struct copies: the property setters clone.
    this._path!.startPoint = this.gs.playerPosition;
    this._path!.targetPoint = this.gs.firstFingerPosition;
    this._path!.controlPoint = this.gs.secondFingerPosition;
    this.updateTimer();
    this._rotation = this.timerElapsedTime * Constants.SCOPE_ROTATION_SPEED;
  }

  private calibrationPlasmaGranadePathTargetPoint(): void {
    this.updateTimer();
    this._rotation = this.timerElapsedTime * Constants.SCOPE_ROTATION_SPEED;
  }

  private exitPlasmaGranadeLauncher(): void {
    const gs = this.gs;
    this.updateTimer();
    let delta = this.normalizedDelta * Constants.SCREEN_HEIGHT;
    for (let i = 0; i < gs.gridVerticalPoints.length; i++) {
      if (i % 2 !== 0) {
        gs.gridVerticalPoints[i][1].y = delta;
      } else {
        gs.gridVerticalPoints[i][1].y = Constants.SCREEN_HEIGHT - delta;
      }
    }
    delta = this.normalizedDelta * Constants.SCREEN_WIDTH;
    for (let i = 0; i < gs.gridHorizontalPoints.length; i++) {
      if (i % 2 !== 0) {
        gs.gridHorizontalPoints[i][1].x = delta;
      } else {
        gs.gridHorizontalPoints[i][1].x = Constants.SCREEN_WIDTH - delta;
      }
    }
  }

  private plasmaGranadeLauncher(): void {
    this.updateTimer();
  }

  private enterPlasmaGranadeLauncher(): void {
    const gs = this.gs;
    this.updateTimer();
    let delta = this.normalizedDelta * Constants.SCREEN_HEIGHT;
    for (let i = 0; i < gs.gridVerticalPoints.length; i++) {
      if (i % 2 === 0) {
        gs.gridVerticalPoints[i][1].y = delta;
      } else {
        gs.gridVerticalPoints[i][1].y = Constants.SCREEN_HEIGHT - delta;
      }
    }
    delta = this.normalizedDelta * Constants.SCREEN_WIDTH;
    for (let i = 0; i < gs.gridHorizontalPoints.length; i++) {
      if (i % 2 === 0) {
        gs.gridHorizontalPoints[i][1].x = delta;
      } else {
        gs.gridHorizontalPoints[i][1].x = Constants.SCREEN_WIDTH - delta;
      }
    }
  }

  private booster(): void {
    throw new Error('NotImplementedException');
    //da fare
  }

  private startForward(): void {
    const gs = this.gs;
    if (this.elementRecords.last !== null && gs.playerTime.time - this.elementRecords.last.value.time > gs.timeTank)
      this.elementRecords.removeLast();

    this.updateTimer();
    gs.playerTime.continuum = Math.min(0 + this.timerElapsedTime * Constants.CONTINUUM_LEAN, Constants.CONTINUUM_MAX);

    this.addElementRecord(
      (value) => (gs.levelTime.continuum = gs.playerTime.continuum * (value as number)),
      gs.levelTime.continuum / gs.playerTime.continuum,
    );
    gs.levelTime.continuum = Math.min(0 + this.timerElapsedTime * Constants.CONTINUUM_LEAN, this.tachyonStreamSlowDown());
  }

  private beginForward(): void {
    const gs = this.gs;
    this.updateTimer();
    gs.playerTime.continuum = Math.min(Constants.CONTINUUM_MIN + this.timerElapsedTime * Constants.CONTINUUM_LEAN, 0);
    gs.levelTime.continuum = Math.min(this.continuumMinLevel + this.timerElapsedTime * this.continuumLeanLevel, 0);
    gs.timeTank += gs.levelTime.elapsedContinuumTime;
  }

  private rewind(): void {
    const gs = this.gs;
    while (this.elementRecords.first !== null && this.elementRecords.first.value.time > gs.playerTime.time) {
      this.elementRecords.first.value.rewind();
      this.elementRecords.removeFirst();
    }
    gs.timeTank += gs.playerTime.elapsedContinuumTime;
  }

  private startRewind(): void {
    const gs = this.gs;
    this.updateTimer();
    gs.playerTime.continuum = Math.max(0 - this.timerElapsedTime * Constants.CONTINUUM_LEAN, Constants.CONTINUUM_MIN);
    gs.levelTime.continuum = Math.max(0 - this.timerElapsedTime * this.continuumLeanLevel, this.continuumMinLevel);
    gs.timeTank += gs.levelTime.elapsedContinuumTime;
    this.time_tank_timer = 0;
    this.time_tank_timer_start = true;
  }

  private beginRewind(): void {
    const gs = this.gs;
    this.updateTimer();
    gs.playerTime.continuum = Math.max(Constants.CONTINUUM_MAX - this.timerElapsedTime * Constants.CONTINUUM_LEAN, 0);
    gs.levelTime.continuum = Math.max(this.beginRewindContinuumLevel - this.timerElapsedTime * this.continuumLeanLevel, 0);
  }

  private forward(): void {
    const gs = this.gs;
    if (this.elementRecords.last !== null && gs.playerTime.time - this.elementRecords.last.value.time > gs.timeTank)
      this.elementRecords.removeLast();

    gs.playerTime.continuum = Constants.CONTINUUM_MAX;

    //if (TachyonStreamSlowDown() != gs.levelTime.continuum)
    this.addElementRecord(
      (value) => (gs.levelTime.continuum = gs.playerTime.continuum * (value as number)),
      gs.levelTime.continuum / gs.playerTime.continuum,
    );
    gs.levelTime.continuum = this.tachyonStreamSlowDown();
  }

  tachyonStreamSlowDown(): number {
    const gs = this.gs;
    if (gs.tachyonStream !== null && gs.tachyonStream.lifeState === LifeState.NORMAL) {
      const playerDistance = Math.abs(gs.playerPosition.x - gs.tachyonStream.currentPosition.x);
      if (playerDistance <= Math.trunc(Constants.TACHYON_STREAM_WIDTH / 2)) {
        return (
          (playerDistance * 2 * (Constants.CONTINUUM_MAX - Constants.MIN_CONTINUUM_SLOW_DOWN)) /
            Constants.TACHYON_STREAM_WIDTH +
          Constants.MIN_CONTINUUM_SLOW_DOWN
        );
      }
    }
    return Constants.CONTINUUM_MAX;
  }

  private addElementRecord(rewind: RewindMethod, value: unknown): void {
    if (this.gs.playerTime.continuum > 0)
      this.elementRecords.addFirst(new ElementRecord(this.gs.playerTime.time, rewind, value));
  }

  back(): void {
    if (this.gs.timeTank > Constants.TIME_TANK_CRITICAL_VALUE) this.state = TimeState.BEGIN_REWIND;
  }

  stop(): void {
    this.state = TimeState.BEGIN_FORWARD;
  }

  activateBooster(): void {
    if (this.state === TimeState.FORWARD && this.gs.timeTank === Constants.MAX_TIME_TANK_VALUE) {
      this.state = TimeState.BOOSTER;
    }
  }

  deactivatePlasmaGranadeLauncher(): void {
    if (this.state === TimeState.PLASMA_GRANADE_LAUNCHER) {
      this.state = TimeState.EXIT_PLASMA_GRANADE_LAUNCHER;
    }
  }

  activatePlasmaGranadeLauncher(): void {
    if (this.state === TimeState.FORWARD) {
      this.state = TimeState.ENTER_PLASMA_GRANADE_LAUNCHER;
    }
  }

  /** resetTimer() → target -1; resetTimer(duration) → target duration. */
  private resetTimer(duration?: number): void {
    this.timerStartTime = this.gs.albertTime.time;
    this.timerElapsedTime = 0;
    this.timerTargetDuration = duration === undefined ? -1 : duration;
  }

  private updateTimer(): void {
    this.timerElapsedTime = this.gs.albertTime.time - this.timerStartTime;
  }

  firstFinger(): void {
    this.state = TimeState.CALIBRATION_PLASMA_GRANADE_PATH_TARGET_POINT;
  }

  undoFirstFinger(): void {
    if (this.state !== TimeState.ENTER_PLASMA_GRANADE_LAUNCHER) this.state = TimeState.PLASMA_GRANADE_LAUNCHER;
  }

  secondFinger(): void {
    this.state = TimeState.CALIBRATION_PLASMA_GRANADE_PATH_CONTROL_POINT;
  }

  launchPlasmaGranade(): void {
    this.state = TimeState.EXIT_PLASMA_GRANADE_LAUNCHER;
  }

  undoPlasmaGranade(): void {
    this.state = TimeState.EXIT_PLASMA_GRANADE_LAUNCHER;
  }
}
