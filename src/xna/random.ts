/**
 * System.Random shim implementing the .NET Framework subtractive generator (Knuth), so a
 * given seed produces the same sequence as on WP7/.NET Framework.
 *
 *   new Random()          seeded from the clock (like Environment.TickCount)
 *   new Random(seed)
 *   next()                int in [0, Int32.MaxValue)
 *   next(maxValue)        int in [0, maxValue)
 *   next(min, max)        int in [min, max)   (returns min when min == max)
 *   nextDouble()          double in [0, 1)
 */
const MBIG = 2147483647;
const MSEED = 161803398;

export class Random {
  private inext = 0;
  private inextp = 21;
  private readonly seedArray = new Array<number>(56).fill(0);

  constructor(seed?: number) {
    if (seed === undefined) seed = (Date.now() + Math.floor(Math.random() * 1e6)) & 0x7fffffff;
    seed = Math.trunc(seed);
    const subtraction = seed === -2147483648 ? MBIG : Math.abs(seed);
    let mj = MSEED - subtraction;
    this.seedArray[55] = mj;
    let mk = 1;
    for (let i = 1; i < 55; i++) {
      const ii = (21 * i) % 55;
      this.seedArray[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = this.seedArray[ii];
    }
    for (let k = 1; k < 5; k++) {
      for (let i = 1; i < 56; i++) {
        this.seedArray[i] -= this.seedArray[1 + ((i + 30) % 55)];
        if (this.seedArray[i] < 0) this.seedArray[i] += MBIG;
      }
    }
    this.inext = 0;
    this.inextp = 21;
  }

  private internalSample(): number {
    let locINext = this.inext + 1;
    if (locINext >= 56) locINext = 1;
    let locINextp = this.inextp + 1;
    if (locINextp >= 56) locINextp = 1;
    let retVal = this.seedArray[locINext] - this.seedArray[locINextp];
    if (retVal === MBIG) retVal--;
    if (retVal < 0) retVal += MBIG;
    this.seedArray[locINext] = retVal;
    this.inext = locINext;
    this.inextp = locINextp;
    return retVal;
  }

  protected sample(): number {
    return this.internalSample() * (1.0 / MBIG);
  }

  private getSampleForLargeRange(): number {
    let result = this.internalSample();
    if (this.internalSample() % 2 === 0) result = -result;
    let d = result;
    d += MBIG - 1;
    d /= 2 * MBIG - 1;
    return d;
  }

  next(): number;
  next(maxValue: number): number;
  next(minValue: number, maxValue: number): number;
  next(a?: number, b?: number): number {
    if (a === undefined) return this.internalSample();
    if (b === undefined) {
      if (a < 0) throw new RangeError('maxValue must be >= 0');
      return Math.trunc(this.sample() * a);
    }
    if (a > b) throw new RangeError('minValue must be <= maxValue');
    const range = b - a;
    if (range <= MBIG) return Math.trunc(this.sample() * range) + a;
    return Math.trunc(this.getSampleForLargeRange() * range) + a;
  }

  nextDouble(): number {
    return this.sample();
  }
}
