import { Constants } from '../Utilities/Utilities';

/** A clock: time advances by dt * continuum. */
export class TimeMachine {
  time: number;
  continuum: number;
  elapsedContinuumTime = 0;

  constructor() {
    this.continuum = Constants.CONTINUUM_MAX;
    this.time = 0;
  }

  update(totalElapsedSeconds: number): void {
    this.elapsedContinuumTime = totalElapsedSeconds * this.continuum;
    this.time += this.elapsedContinuumTime;
  }
}
