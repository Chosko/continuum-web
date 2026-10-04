/** Attribute node of a LevelElement (newest-first linked list). */
export class LevelElementAttribute {
  next: LevelElementAttribute | null = null;
  value: string;
  name: string;

  constructor(name: string, value: string) {
    this.value = value;
    this.name = name;
  }

  /** attribute(name): value or null; attribute(i, level): the i-th node from here, or null. */
  attribute(name: string): string | null;
  attribute(i: number, level: number): LevelElementAttribute | null;
  attribute(a: string | number, level?: number): string | LevelElementAttribute | null {
    if (typeof a === 'string') {
      for (let n: LevelElementAttribute | null = this; n !== null; n = n.next) {
        if (n.name === a) return n.value;
      }
      return null;
    }
    let lv = level!;
    for (let n: LevelElementAttribute | null = this; n !== null; n = n.next) {
      if (a === lv) return n;
      lv++;
    }
    return null;
  }
}
