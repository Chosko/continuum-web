import { Utility } from './Utilities';

/** Normal random variable (Box-Muller). */
export class NormalRandomVariable {
  mean: number;
  standardDeviation: number;

  constructor(mean?: number, standardDeviation?: number) {
    this.mean = mean ?? 0;
    this.standardDeviation = standardDeviation ?? 0;
  }

  next(): number {
    const u1 = Utility.nextRandomDouble(0, 1);
    const u2 = Utility.nextRandomDouble(0, 1);
    const randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
    const randNormal = this.mean + this.standardDeviation * randStdNormal;
    return Math.fround(randNormal);
  }
}
