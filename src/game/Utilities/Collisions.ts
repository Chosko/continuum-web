import type { TimeTraveler } from '../Elements/TimeTraveler';
import { Constants, LifeState } from './Utilities';

/** Sortable array of TimeTravelers used for collision detection (sweep and prune on Top). */
export class Collisions {
  array: (TimeTraveler | null)[];
  private _aliveCount: number;
  private _count: number;

  get aliveCount(): number {
    return this._aliveCount;
  }
  /** Never decreases (C# behaviour). */
  get count(): number {
    return this._count;
  }
  get length(): number {
    return this.array.length;
  }

  constructor() {
    this.array = new Array<TimeTraveler | null>(Constants.COLLISIONS_ARRAY_LENGTH).fill(null);
    this._aliveCount = 0;
    this._count = 0;
  }

  getElementAt(index: number): TimeTraveler {
    return this.array[index]!;
  }

  insert(c: TimeTraveler): void {
    if (this._count >= this.length) {
      const temp = this.array;
      this.array = new Array<TimeTraveler | null>(this.length * 2).fill(null);
      for (let i = 0; i < temp.length; i++) this.array[i] = temp[i];
    }
    this.array[this._count] = c;
    this._count++;
  }

  sort(): void {
    this.insertionSort(this.flag());
  }

  private flag(): number {
    const array = this.array;
    let i = 0;
    let j = 0;
    let k = this._count;
    while (k > j) {
      const aj = array[j];
      if (aj === null || aj === undefined) {
        array[j] = array[k - 1];
        array[k - 1] = null;
        k--;
      } else if (aj.lifeState === LifeState.DELETING) {
        array[j] = null;
        this.scambia(array, j, k - 1);
        k--;
      } else if (aj.lifeState === LifeState.DEAD) {
        j++;
      } else {
        this.scambia(array, j, i);
        i++;
        j++;
      }
    }
    this._aliveCount = i;
    return i;
  }

  private insertionSort(max: number): void {
    const array = this.array;
    for (let i = 1; i < max; i++) {
      const x = array[i]!;
      const xTop = x.top;
      let j = i;
      while (j > 0 && xTop < array[j - 1]!.top) {
        array[j] = array[j - 1];
        j--;
      }
      array[j] = x;
    }
  }

  private scambia(array: (TimeTraveler | null)[], a: number, b: number): void {
    const temp = array[a];
    array[a] = array[b];
    array[b] = temp;
  }
}
