import {
  Accelerometer,
  GestureType,
  TouchLocation,
  TouchLocationState,
  TouchPanel,
  Vector2,
  Vector3,
  type AccelerometerReading as AccelerometerReadingType,
  type SensorReadingEventArgs,
} from '../../xna';
import type { GameState } from '../State/GameState';
import type { TimeManager } from './TimeManager';

/**
 * Gestures, multitouch plasma-grenade aiming and accelerometer (Management/InputManager.cs,
 * namespace Continuum).
 *
 * Note: as on WP7 (where the XNA TouchPanel also sees touches landing on Silverlight buttons),
 * touches on the DOM overlay controls are also fed to the TouchPanel.
 */
export class InputManager {
  maxTouchPoints = 0;

  private tapVector: Vector2 | null;
  private freeDragVector: Vector2 | null;
  private flickVector: Vector2 | null;

  private gs: GameState;
  private timeManager: TimeManager;

  /** Positions currently touched on the screen */
  locations: TouchLocation[];

  // Accelerometer
  private accelerometer: Accelerometer;

  /** Accelerometer data */
  accelerometerReading: Vector3;

  /** Reference coordinates of the current accelerometer zero */
  accelerometerCurrentZero: Vector3 = new Vector3();

  private firstValueAccelerometer: boolean;

  /** Correction of the accelerometer coordinates (calibrated reading, per-axis piecewise linear). */
  get accelerometerReadingCorrected(): Vector3 {
    const v = Vector3.Zero;
    const r = this.accelerometerReading;
    const z = this.accelerometerCurrentZero;
    if (r.x > z.x) {
      v.x = (r.x - z.x) / (1 - z.x);
    } else {
      v.x = (r.x - z.x) / (1 + z.x);
    }

    if (r.y > z.y) {
      v.y = (r.y - z.y) / (1 - z.y);
    } else {
      v.y = (r.y - z.y) / (1 + z.y);
    }

    if (r.z > z.z) {
      v.z = (r.z - z.z) / (1 - z.z);
    } else {
      v.z = (r.z - z.z) / (1 + z.z);
    }
    return v;
  }

  constructor(gs: GameState, tm: TimeManager) {
    this.gs = gs;
    this.timeManager = tm;

    gs.firstFinger = null;
    gs.secondFinger = null;

    const panelCapabilities = TouchPanel.getCapabilities();

    if (!panelCapabilities.isConnected) throw new Error('This is not supposed to happen. Screen is not connected!');

    TouchPanel.enabledGestures = GestureType.Tap | GestureType.FreeDrag | GestureType.Flick;

    this.locations = [];
    for (let i = 0; i < panelCapabilities.maximumTouchCount; i++) {
      this.locations.push(new TouchLocation(0, TouchLocationState.Invalid, Vector2.Zero));
    }

    this.tapVector = null;
    this.freeDragVector = null;
    this.flickVector = null;

    this.accelerometer = new Accelerometer();
    this.accelerometerReading = Vector3.Zero;
    this.accelerometer.currentValueChanged.add(this.accelerometer_CurrentValueChanged);
    this.accelerometer.start();
    this.firstValueAccelerometer = false;
  }

  /** C# overloads RecalibrateAccelerometer(Vector3) / RecalibrateAccelerometer(). */
  recalibrateAccelerometer(newCoordinates?: Vector3): void {
    if (newCoordinates !== undefined) {
      this.accelerometerCurrentZero = newCoordinates.clone();
    } else {
      this.accelerometerCurrentZero = this.accelerometerReading.clone();
    }
  }

  private accelerometer_CurrentValueChanged = (
    _sender: unknown,
    e: SensorReadingEventArgs<AccelerometerReadingType>,
  ): void => {
    this.accelerometerReading = e.sensorReading.acceleration.clone();
    if (!this.firstValueAccelerometer) {
      this.firstValueAccelerometer = true;
      this.recalibrateAccelerometer();
    }
  };

  /** Stops the accelerometer (pause) */
  accelerometerStop(): void {
    this.accelerometer.stop();
  }

  /** Starts the accelerometer */
  accelerometerStart(): void {
    this.accelerometer.start();
  }

  /** Updates the readings. Call this before checking anything else. */
  update(): void {
    // Update predefined gestures
    while (TouchPanel.isGestureAvailable) {
      const gestSample = TouchPanel.readGesture();

      switch (gestSample.gestureType) {
        case GestureType.Tap:
          this.tapVector = gestSample.position.clone();
          break;
        case GestureType.FreeDrag:
          this.freeDragVector = gestSample.position.clone();
          break;
        case GestureType.Flick:
          this.flickVector = gestSample.delta.clone();
          break;
      }
    }

    if (this.gs.performMultitouchPlasmaGranade) this.updateMultitouchPlasmaGranade();

    if (this.gs.performGestureFlickDownRewindTime) {
      if (this.isFlickReadable()) {
        if (this.flickDown()) this.timeManager.back();
      }
    }

    if (this.gs.performGestureFlickDownStopRewind) {
      if (this.isTapReadable()) {
        this.timeManager.stop();
      }
    }
  }

  private updateMultitouchPlasmaGranade(): void {
    const gs = this.gs;
    const collection = TouchPanel.getState();
    this.locations = [];
    for (let counter = 0; counter < collection.count; counter++) this.locations.push(collection.get(counter).clone());
    const locations = this.locations;

    // No finger pressed yet
    if (gs.firstFinger === null && gs.secondFinger === null) {
      // The first finger was just pressed
      if (locations.length > 0) {
        gs.firstFinger = locations[0].id;
        gs.firstFingerPosition = locations[0].position.clone(); // Save the position
        this.timeManager.firstFinger(); // Signal the first finger

        // The second finger was pressed at the same time
        if (locations.length > 1) {
          gs.secondFinger = locations[1].id;
          gs.secondFingerPosition = locations[1].position.clone(); // Save the position
          this.timeManager.secondFinger(); // Signal the second finger
        }
      }
    }

    // First finger already pressed, second finger not yet
    if (gs.firstFinger !== null && gs.secondFinger === null) {
      // The first finger was released
      if (locations.length === 0) {
        gs.firstFinger = null;
        this.timeManager.undoFirstFinger(); // Undo the first finger
      }
      // Only one finger pressed
      else if (locations.length === 1) {
        const loc = collection.findById(gs.firstFinger);
        // Same finger as before
        if (loc !== null) {
          gs.firstFingerPosition = loc.position.clone(); // Update the position
        }
        // Not the same finger as before
        else {
          gs.firstFinger = locations[0].id;
          gs.firstFingerPosition = locations[0].position.clone(); // Save the position
        }
      }
      // At least one more finger was pressed
      else if (locations.length > 1) {
        const loc = collection.findById(gs.firstFinger);
        // The first finger is among the pressed ones
        if (loc !== null) {
          let firstFingerLocationsIndex = -1;
          let secondFingerLocationsIndex = -1;
          for (let i = 0; i < locations.length; i++) {
            if (locations[i].id === gs.firstFinger) {
              // Index of the first finger in the touch array
              firstFingerLocationsIndex = i;
              if (secondFingerLocationsIndex !== -1) break;
            } else {
              secondFingerLocationsIndex = i;
              if (firstFingerLocationsIndex !== -1) break; // second finger = first touch != first finger
            }
          }
          gs.firstFinger = locations[firstFingerLocationsIndex].id;
          gs.secondFinger = locations[secondFingerLocationsIndex].id;
          gs.firstFingerPosition = locations[firstFingerLocationsIndex].position.clone(); // Update first finger position
          gs.secondFingerPosition = locations[secondFingerLocationsIndex].position.clone(); // Save second finger position
          this.timeManager.secondFinger(); // Signal the second finger
        }
        // The first finger is not among the pressed ones
        else {
          gs.firstFinger = locations[0].id;
          gs.secondFinger = locations[1].id;
          gs.firstFingerPosition = locations[0].position.clone();
          gs.secondFingerPosition = locations[1].position.clone();
          this.timeManager.secondFinger(); // Signal the second finger
        }
      }
    }
    // Both fingers already pressed
    else if (gs.firstFinger !== null && gs.secondFinger !== null) {
      // Fewer than two fingers pressed
      if (locations.length < 2) {
        this.timeManager.launchPlasmaGranade(); // Launch the grenade
        gs.firstFinger = null;
        gs.secondFinger = null;
      } else if (locations.length >= 2) {
        const loc1 = collection.findById(gs.firstFinger);
        const loc2 = loc1 !== null ? collection.findById(gs.secondFinger) : null;
        // Both fingers are still pressed
        if (loc1 !== null && loc2 !== null) {
          gs.firstFingerPosition = loc1.position.clone(); // Update the first finger position
          gs.secondFingerPosition = loc2.position.clone(); // Update the second finger position
        }
        // At least one previously pressed finger is no longer pressed
        else {
          this.timeManager.launchPlasmaGranade(); // Launch the grenade
          gs.firstFinger = null;
          gs.secondFinger = null;
        }
      }
    }
  }

  /** Whether a TAP happened and its data can be read. */
  isTapReadable(): boolean {
    return this.tapVector !== null ? true : false;
  }

  /** Reads the TAP data. Call only if isTapReadable() returns true. */
  tap(): Vector2 {
    if (this.tapVector === null)
      throw new Error('Tap non disponibile. Richiamare isTapReadable prima di acquisire il dato');
    const returnValue = this.tapVector;
    this.flickVector = null;
    this.freeDragVector = null;
    this.tapVector = null;
    return returnValue;
  }

  /** Whether a FREEDRAG happened and its data can be read. */
  isFreeDragReadable(): boolean {
    return this.freeDragVector !== null ? true : false;
  }

  /** Reads the FREEDRAG data. Call only if isFreeDragReadable() returns true. */
  freeDrag(): Vector2 {
    if (this.freeDragVector === null)
      throw new Error('FreeDrag non disponibile. Richiamare isFreeDragReadable prima di acquisire il dato');
    const returnValue = this.freeDragVector;
    this.flickVector = null;
    this.freeDragVector = null;
    this.tapVector = null;
    return returnValue;
  }

  /** Whether a Flick happened. */
  isFlickReadable(): boolean {
    return this.flickVector !== null ? true : false;
  }

  /** Recognizes the Flick Down gesture (any flick with a downward component); clears all gestures. */
  flickDown(): boolean {
    const retval = this.flickVector!.y > 0;
    this.flickVector = null;
    this.freeDragVector = null;
    this.tapVector = null;
    return retval;
  }
}
