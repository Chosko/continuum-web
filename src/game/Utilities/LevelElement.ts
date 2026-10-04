import { LevelElementAttribute } from './LevelElementAttribute';

/** An XML element of a level file: name plus attributes. */
export class LevelElement {
  name: string;
  /** Never assigned in the original (the ctor ignores its second argument). */
  xmlCode: string | null = null;
  attributeCount = 0;
  private first: LevelElementAttribute | null = null;

  constructor(name: string, _xmlCode: string | null) {
    this.name = name;
  }

  add(name: string, value: string): void {
    const node = new LevelElementAttribute(name, value);
    node.next = this.first;
    this.first = node;
    this.attributeCount++;
  }

  /** attribute(name): value, or null if absent. attribute(i): the i-th attribute (document order) or null. */
  attribute(name: string): string | null;
  attribute(i: number): LevelElementAttribute | null;
  attribute(a: string | number): string | LevelElementAttribute | null {
    if (typeof a === 'string') {
      if (this.first !== null) return this.first.attribute(a);
      else return null;
    }
    const i = this.attributeCount - a - 1;
    if (this.first !== null && i < this.attributeCount && i >= 0) return this.first.attribute(i, 0);
    else return null;
  }
}
