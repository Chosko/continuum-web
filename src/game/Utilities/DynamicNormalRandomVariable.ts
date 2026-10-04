import { NormalRandomVariable } from './NormalRandomVariable';
import { FLOAT_MAX_VALUE } from './Utilities';

/** Normal random variable whose mean drifts with time, clamped to [min, max]. */
export class DynamicNormalRandomVariable extends NormalRandomVariable {
  initialMean: number;
  meanIncrementPerMinute: number;
  max: number;
  min: number;

  /** new DynamicNormalRandomVariable() or (initialMean, standardDeviation, meanIncrementPerMinute?, max?, min?) */
  constructor(
    initialMean?: number,
    standardDeviation?: number,
    meanIncrementPerMinute: number | null = null,
    max: number | null = null,
    min: number | null = null,
  ) {
    super(initialMean ?? 0, standardDeviation ?? 0);
    if (initialMean === undefined) {
      this.initialMean = 0;
      this.meanIncrementPerMinute = 0;
      this.max = 0;
      this.min = 0;
      return;
    }
    this.initialMean = initialMean;
    this.meanIncrementPerMinute = meanIncrementPerMinute === null ? 0 : meanIncrementPerMinute;
    this.max = max === null ? FLOAT_MAX_VALUE : max;
    this.min = min === null ? 0 : min;
  }

  update(delta: number): void {
    this.mean = this.initialMean + (this.meanIncrementPerMinute * delta) / 60;
  }

  override next(): number {
    let n = super.next();
    if (n > this.max) n = this.max;
    else if (n < this.min) n = this.min;
    return n;
  }
}
