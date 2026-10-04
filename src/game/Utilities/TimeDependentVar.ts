import { FLOAT_MAX_VALUE } from './Utilities';

/** A value that changes linearly with time, clamped to [min, max]. */
export class TimeDependentVar {
  private initialValue: number;
  private delta = 0;
  private maxValue: number;
  private minValue: number;
  private incrementPerMinute: number;

  constructor(
    initialValue: number,
    maxValue: number | null,
    minValue: number | null,
    incrementPerMinute: number | null,
    decrementPerMinute: number | null,
  ) {
    this.initialValue = initialValue;
    this.maxValue = maxValue !== null ? maxValue : FLOAT_MAX_VALUE;
    this.minValue = minValue !== null ? minValue : 0;
    this.incrementPerMinute =
      (incrementPerMinute !== null ? incrementPerMinute : 0) - (decrementPerMinute !== null ? decrementPerMinute : 0);
  }

  get value(): number {
    return Math.min(Math.max(this.initialValue + (this.incrementPerMinute * this.delta) / 60, this.minValue), this.maxValue);
  }

  update(delta: number): void {
    this.delta = delta;
  }
}
