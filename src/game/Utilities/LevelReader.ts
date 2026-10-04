import { TitleContainer } from '../../xna';
import { LevelElement } from './LevelElement';

/** Flat, document-order cursor over every XML element of a level file (root included). */
export class LevelReader {
  private elements: LevelElement[];
  private _count: number;
  private _current!: LevelElement;
  private _next: LevelElement | null = null;
  private _previous: LevelElement | null = null;

  get current(): LevelElement {
    return this._current;
  }
  get next(): LevelElement | null {
    return this._next;
  }
  get previous(): LevelElement | null {
    return this._previous;
  }

  /** url is relative to the site root (e.g. "Levels/RandomLevel.xml"); must be preloaded via TitleContainer. */
  constructor(url: string) {
    const text = TitleContainer.readAllText(url);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const err = doc.getElementsByTagName('parsererror');
    if (err.length > 0) throw new Error('XmlException: ' + url + ': ' + (err[0].textContent ?? ''));
    const nodelist: LevelElement[] = [];
    // Pre-order walk = XmlReader element order.
    const walk = (el: Element): void => {
      const le = new LevelElement(el.nodeName, el.namespaceURI);
      for (let i = 0; i < el.attributes.length; i++) {
        const at = el.attributes[i];
        le.add(at.name, at.value);
      }
      nodelist.push(le);
      for (let c = el.firstElementChild; c !== null; c = c.nextElementSibling) walk(c);
    };
    if (doc.documentElement) walk(doc.documentElement);
    this.elements = nodelist;
    this._count = 0;
    this.refreshElements();
  }

  moveNext(): void {
    if (this._count < this.elements.length - 1) this._count++;
    this.refreshElements();
  }

  movePrevious(): void {
    if (this._count > 0) this._count--;
    this.refreshElements();
  }

  private refreshElements(): void {
    this._current = this.elements[this._count];
    if (this._count + 1 < this.elements.length) this._next = this.elements[this._count + 1];
    else this._next = null;
    if (this._count - 1 >= 0) this._previous = this.elements[this._count - 1];
    else this._previous = null;
  }
}
