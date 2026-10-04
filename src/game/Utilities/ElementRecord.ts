import type { RewindMethod } from './Utilities';

/** Undo record: restores a value when time is rewound past `time`. */
export class ElementRecord {
  time: number;
  private _rewind: RewindMethod;
  readonly value: any;

  constructor(time: number, rewind: RewindMethod, value: any) {
    this.time = time;
    this._rewind = rewind;
    this.value = value;
  }

  rewind(): void {
    this._rewind(this.value);
  }

  toString(): string {
    return String(this.value);
  }
}
