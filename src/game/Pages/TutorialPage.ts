import { siteUrl } from '../../xna';
import { PhoneApplicationPage } from './Navigation';
import { createBlockArrow, createWpProgressBar } from './Controls';

/**
 * TutorialPage.xaml(.cs), class Tutorial: a WP7 Panorama ("Tutorial") with 4 PanoramaItems,
 * horizontally swipeable and wrapping around, each with a vertical ScrollViewer. Item contents
 * use the XAML grid coordinates resolved to absolute positions (see PORTING_NOTES §4.4).
 * All texts are verbatim Italian.
 */

/** Panorama metrics (WP7 Panorama template, approximate). */
const ITEM_WIDTH = 432; // 480 - 48: the next item peeks in on the right
const CONTENT_WIDTH = 420;
const TITLE_PAN_PER_ITEM = 110; // parallax: the title moves slower than the items
const SNAP_MS = 300;

type Stretch = 'None' | 'Fill';

interface ImgOpts {
  x: number;
  y: number;
  /** layout box (defaults to the natural image size) */
  w?: number;
  h?: number;
  stretch?: Stretch;
}

/** Natural sizes of the Silverlight content images (img/*, grenade_button.png). */
const NATURAL: Record<string, [number, number]> = {
  'img/Ship.png': [41, 64],
  'img/easy.png': [64, 57],
  'img/asteroid.png': [30, 28],
  'img/enemyBullet.png': [10, 13],
  'img/gunBullet.png': [10, 13],
  'img/gunPowerUp.png': [32, 37],
  'img/rocketPowerUp.png': [32, 37],
  'img/granadePowerUp.png': [32, 37],
  'img/rocket.png': [17, 40],
  'img/scope.png': [180, 177],
  'img/plasmagranade.png': [32, 32],
  'img/Tachyon.png': [14, 12],
  'grenade_button.png': [102, 21],
};

function image(src: string, o: ImgOpts): HTMLDivElement {
  const [nw, nh] = NATURAL[src];
  const box = document.createElement('div');
  box.className = 'tut-img';
  box.style.left = `${o.x}px`;
  box.style.top = `${o.y}px`;
  box.style.width = `${o.w ?? nw}px`;
  box.style.height = `${o.h ?? nh}px`;
  const img = document.createElement('img');
  img.src = siteUrl(src);
  img.alt = '';
  img.draggable = false;
  // Stretch=None: natural size, centered in the box and clipped; Stretch=Fill: fills the box
  img.style.objectFit = (o.stretch ?? 'None') === 'Fill' ? 'fill' : 'none';
  box.append(img);
  return box;
}

function text(x: number, y: number, content: string, opts: { w?: number; h?: number; center?: boolean } = {}): HTMLDivElement {
  const t = document.createElement('div');
  t.className = 'wp-textblock tut-text';
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
  if (opts.w !== undefined) t.style.width = `${opts.w}px`;
  else t.style.maxWidth = `${CONTENT_WIDTH - x}px`;
  if (opts.h !== undefined) t.style.height = `${opts.h}px`;
  if (opts.center) t.style.textAlign = 'center';
  t.textContent = content;
  return t;
}

/** 12 Tachyon.png (10x10, Fill) in a 36x151 cluster (same pattern three times in item 4). */
function tachyonCluster(x: number, y: number): HTMLDivElement {
  const g = document.createElement('div');
  g.className = 'tut-cluster';
  g.style.left = `${x}px`;
  g.style.top = `${y}px`;
  const pts: Array<[number, number]> = [
    [24, 0], [0, 26], [16, 19], [24, 50], [7, 48], [0, 65],
    [16, 79], [26, 90], [5, 114], [11, 107], [25, 113], [9, 141],
  ];
  for (const [px, py] of pts) g.append(image('img/Tachyon.png', { x: px, y: py, w: 10, h: 10, stretch: 'Fill' }));
  return g;
}

/**
 * The es:Arc of item 3 (StartAngle 0 -> EndAngle 90, ArcThickness 0: a quarter-ellipse
 * outline) with its CompositeTransform (Scale 4.724x4.35, Skew -30/-29.188, Rotation -139,
 * Translate 373.289/-19.019, around the element center), as an SVG path with the same matrix.
 */
function grenadeArc(contentHeight: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const w = 183.228;
  const h = contentHeight - 259.349 - 113.837;
  const left = CONTENT_WIDTH + 79.437 - w; // HorizontalAlignment Right, Margin right -79.437
  const top = 259.349;
  const rad = Math.PI / 180;
  const sx = 4.724;
  const sy = 4.35;
  const kx = Math.tan(-30 * rad);
  const ky = Math.tan(-29.188 * rad);
  const r = -139 * rad;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  // M = R * K * S  (Silverlight CompositeTransform order: scale, skew, rotate, translate)
  const ks = [sx, ky * sx, kx * sy, sy]; // [a b c d] of K*S: a=sx, b=ky*sx, c=kx*sy, d=sy
  const a = cos * ks[0] - sin * ks[1];
  const b = sin * ks[0] + cos * ks[1];
  const c = cos * ks[2] - sin * ks[3];
  const d = sin * ks[2] + cos * ks[3];
  const ox = left + w / 2;
  const oy = top + h / 2;
  const tx = 373.289;
  const ty = -19.019;
  // p' = O + T + M (p - O),  with p in content coordinates (p = left/top + local)
  const e = ox + tx - (a * ox + c * oy);
  const f = oy + ty - (b * ox + d * oy);

  const cx = left + w / 2;
  const cy = top + h / 2;
  const rx = w / 2 - 0.5;
  const ry = h / 2 - 0.5;
  // angle 0 = top, clockwise
  const p0 = [cx, cy - ry];
  const p1 = [cx + rx, cy];
  const pathD = `M ${p0[0]} ${p0[1]} A ${rx} ${ry} 0 0 1 ${p1[0]} ${p1[1]}`;

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'tut-arc');
  svg.setAttribute('width', String(CONTENT_WIDTH));
  svg.setAttribute('height', String(contentHeight));
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', pathD);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#fff');
  path.setAttribute('stroke-width', '1');
  path.setAttribute('transform', `matrix(${a} ${b} ${c} ${d} ${e} ${f})`);
  svg.append(path);
  return svg;
}

function grid(height: number, children: Element[]): HTMLDivElement {
  const g = document.createElement('div');
  g.className = 'tut-grid';
  g.style.height = `${height}px`;
  g.append(...children);
  return g;
}

function item1(): HTMLDivElement {
  // rows y 0,140,280,376,498 ; cols x 0,170,248,418
  return grid(498, [
    text(0, 0, 'Inclina il cellulare per muovere la navicella. Ogni volta che accedi al gioco il dispositivo si calibra automaticamente.', { w: 248, center: true }),
    text(41, 170, 'Per calibrare nuovamente il dispositivo mentre giochi basta che metti in pausa e torni subito al gioco.', { w: 332, center: true }),
    text(179, 289, 'Evita di urtare gli asteroidi e i nemici che incontri per non morire.', { w: 227, h: 83, center: true }),
    text(179, 393, 'Più a lungo sopravviverai, più alto sarà il tuo punteggio!', { w: 227, h: 83, center: true }),
    createBlockArrow(331, 49, 50, 25, 'Right', '#0056EB'),
    createBlockArrow(281, 49, 50, 25, 'Left', '#0056EB'),
    createBlockArrow(319, 12, 25, 50, 'Up', '#0056EB'),
    createBlockArrow(319, 62, 25, 50, 'Down', '#0056EB'),
    image('img/Ship.png', { x: 311, y: 30 }),
    image('img/easy.png', { x: 94, y: 264, w: 66, h: 64 }),
    image('img/asteroid.png', { x: 20, y: 343, w: 41, h: 27 }),
    image('img/Ship.png', { x: 59, y: 402, w: 49, h: 64 }),
    image('img/enemyBullet.png', { x: 113, y: 353, w: 20, h: 20 }),
  ]);
}

function item2(): HTMLDivElement {
  // Height 600; rows y 0,140,280,407,498,600 ; cols x 0,170,248,418
  return grid(600, [
    text(13, 5, "La navicella spara i suoi proiettili automaticamente. L'unica cosa che devi fare è mirare il bersaglio!", { w: 223, center: true }),
    text(183, 155, 'Raccogli i power-up lasciati dalle navicelle nemiche per potenziare la tua arma principale', { w: 223, center: true }),
    text(29, 516, 'Non farti colpire, altrimenti tutte le tue armi automatiche saranno depotenziate!', { w: 372, center: true }),
    image('img/Ship.png', { x: 295, y: 85, w: 49, h: 64 }),
    image('img/gunBullet.png', { x: 314, y: 60, w: 15, h: 15 }),
    image('img/gunBullet.png', { x: 314, y: 8, w: 15, h: 15 }),
    image('img/gunPowerUp.png', { x: 13, y: 301, w: 32, h: 42 }),
    image('img/Ship.png', { x: 67, y: 220, w: 49, h: 64 }),
    image('img/gunBullet.png', { x: 82, y: 201, w: 15, h: 15 }),
    image('img/gunBullet.png', { x: 82, y: 148, w: 15, h: 15 }),
    image('img/gunBullet.png', { x: 105, y: 201, w: 15, h: 15 }),
    image('img/gunBullet.png', { x: 64, y: 201, w: 15, h: 15 }),
    image('img/gunBullet.png', { x: 26, y: 148, w: 15, h: 15 }),
    image('img/gunBullet.png', { x: 141, y: 148, w: 15, h: 15 }),
    image('img/rocketPowerUp.png', { x: 13, y: 362, w: 32, h: 45 }),
    image('img/Ship.png', { x: 327, y: 434, w: 49, h: 64 }),
    image('img/rocket.png', { x: 342, y: 319, w: 17, h: 40 }),
    image('img/granadePowerUp.png', { x: 13, y: 429, w: 32, h: 45 }),
    text(60, 302, 'Arma principale', { w: 140, center: true }),
    text(60, 372, 'Arma secondaria (missili)', { w: 221, h: 27, center: true }),
    text(60, 440, 'Granata al plasma', { w: 160, h: 27, center: true }),
  ]);
}

function item3(): HTMLDivElement {
  const H = 565;
  const t10 = document.createElement('div');
  t10.className = 'wp-textblock tut-text';
  t10.style.left = '5px';
  t10.style.top = '7px';
  t10.style.height = '92px';
  t10.style.maxWidth = `${CONTENT_WIDTH - 5}px`;
  const runs = ['Durante il gioco puoi ', 'lanciare delle granate', '. Premi il pulsante ', '                      ', 'per entrare in modalità di', ' mira.'];
  for (const r of runs) {
    const s = document.createElement('span');
    if (r.trim() === '') {
      // The 22-space run is the gap where grenade_button.png sits (XAML: Image at 164,38 over the
      // gap). The image is placed inside the gap so it stays aligned whatever the font metrics.
      s.className = 'tut-gap';
      const img = document.createElement('img');
      img.src = siteUrl('grenade_button.png');
      img.alt = '';
      img.draggable = false;
      s.append(img);
    } else {
      s.className = 'tut-run';
      s.textContent = r;
    }
    t10.append(s);
  }
  return grid(H, [
    t10,
    text(7, 104, 'Comparirà una griglia verde. A questo punto:', { w: 407, h: 31 }),
    text(38, 160, '1. Punta il tuo bersaglio mantenendo un dito sullo schermo', { w: 206, h: 84 }),
    text(191, 287, '2. Sempre mantenendo il primo dito, curva la traiettoria della granata toccando lo schermo con un altro dito.', { w: 227, h: 141 }),
    text(29, 478, '3. Stacca le dita dallo schermo per far partire la granata!', { w: 190, h: 87 }),
    image('img/Ship.png', { x: CONTENT_WIDTH - 33 - 49, y: H - 21 - 64, w: 49, h: 64 }),
    image('img/scope.png', { x: CONTENT_WIDTH - 34 - 128, y: 149, w: 128, h: 128, stretch: 'Fill' }),
    image('img/easy.png', { x: CONTENT_WIDTH - 66 - 74, y: 186, w: 74, h: 64 }),
    image('img/scope.png', { x: 7, y: H - 131 - 128, w: 128, h: 128, stretch: 'Fill' }),
    grenadeArc(H),
    image('img/plasmagranade.png', { x: CONTENT_WIDTH - 127 - 32, y: H - 69 - 32, w: 32, h: 32 }),
  ]);
}

function item4(): HTMLDivElement {
  const H = 595;
  const bar = createWpProgressBar('tut-progress');
  bar.root.style.left = '98px';
  bar.root.style.top = '104px';
  bar.setValue(65);
  return grid(H, [
    text(98, 5, 'Durante il gioco compariranno dei fasci di tachioni. Raccoglili per riempire il tuo serbatoio temporale!', { w: 318, h: 94 }),
    text(98, 144, 'Quando entri nel fascio, il tempo rallenterà per tutti... ma non per te!', { w: 217, h: 94 }),
    text(15, 240, 'Questo ti permetterà di schivare proiettili più facilmente e compiere più uccisioni, ma funziona solo finchè stai nel raggio di azione dei tachioni!', { w: 285, h: 137 }),
    text(3, 399, 'Puoi riavvolgere il tempo in qualsiasi momento con un flick verso il basso, e interrompere il riavvolgimento toccando lo schermo. Questo farà scaricare il tuo serbatoio temporale.', { w: 416, h: 110 }),
    text(3, 511, 'Infine, se vieni distrutto non è finita! Puoi sempre riavvolgere il tempo, ma attenzione a non rimanere a secco di tachioni!', { w: 418, h: 83 }),
    image('img/Tachyon.png', { x: 30, y: 16, w: 10, h: 10, stretch: 'Fill' }),
    image('img/Ship.png', { x: 28, y: 167, w: 49, h: 64 }),
    tachyonCluster(28, 20),
    tachyonCluster(CONTENT_WIDTH - 17 - 36, 104),
    tachyonCluster(CONTENT_WIDTH - 15 - 36, 193),
    image('img/Ship.png', { x: CONTENT_WIDTH - 75 - 49, y: H - 198 - 64, w: 49, h: 64 }),
    image('img/easy.png', { x: CONTENT_WIDTH - 58 - 65, y: 191, w: 65, h: 64 }),
    createBlockArrow(333.352, 307.398, 66.264, 35.95, 'Right', '#0056EB', -31.692),
    createBlockArrow(301.233, 262.94, 26.252, 16.841, 'Right', '#EB0000', 108.539),
    image('img/asteroid.png', { x: CONTENT_WIDTH - 127 - 28, y: 278, w: 28, h: H - 278 - 289 }),
    createBlockArrow(266.233, 312.94, 26.252, 16.841, 'Right', '#EB0000', 92.039),
    bar.root,
    createBlockArrow(234.995, 86.977, 28.849, 14.844, 'Right', '#0056EB', -0.815),
  ]);
}

export class Tutorial extends PhoneApplicationPage {
  private readonly items: HTMLDivElement[] = [];
  private readonly title: HTMLDivElement;
  private current = 0;
  private offset = 0;
  private animating = 0;
  private drag: { pointerId: number; startX: number; startY: number; lastX: number; lastT: number; vx: number; horizontal: boolean | null } | null = null;

  constructor() {
    super('tutorial-page', false);
    const panorama = document.createElement('div');
    panorama.className = 'panorama';

    this.title = document.createElement('div');
    this.title.className = 'panorama-title';
    this.title.textContent = 'Tutorial';
    panorama.append(this.title);

    const headers = ['movimento', 'fuoco', 'granate', 'tachioni'];
    const contents = [item1(), item2(), item3(), item4()];
    headers.forEach((h, i) => {
      const it = document.createElement('div');
      it.className = 'panorama-item';
      const header = document.createElement('div');
      header.className = 'panorama-header';
      header.textContent = h;
      const scroll = document.createElement('div');
      scroll.className = 'panorama-scroll';
      scroll.append(contents[i]);
      it.append(header, scroll);
      panorama.append(it);
      this.items.push(it);
    });
    this.root.append(panorama);

    panorama.addEventListener('pointerdown', this.onDown);
    panorama.addEventListener('pointermove', this.onMove);
    panorama.addEventListener('pointerup', this.onUp);
    panorama.addEventListener('pointercancel', this.onCancel);
    this.layout();
  }

  /** Positions every item relative to the current one (wrap-around), plus the title parallax. */
  private layout(): void {
    const n = this.items.length;
    this.items.forEach((it, i) => {
      let rel = (((i - this.current) % n) + n) % n; // 0..n-1
      if (rel === n - 1) rel = -1; // the previous item sits on the left
      it.style.transform = `translateX(${rel * ITEM_WIDTH + this.offset}px)`;
    });
    const progress = this.current - this.offset / ITEM_WIDTH;
    this.title.style.transform = `translateX(${-progress * TITLE_PAN_PER_ITEM}px)`;
  }

  private onDown = (e: PointerEvent): void => {
    if (this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cancelAnimationFrame(this.animating);
    this.animating = 0;
    this.drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastT: e.timeStamp, vx: 0, horizontal: null };
  };

  private scale(): number {
    const r = this.root.getBoundingClientRect();
    return r.width > 0 ? r.width / 480 : 1;
  }

  private onMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    const s = this.scale();
    const dx = (e.clientX - d.startX) / s;
    const dy = (e.clientY - d.startY) / s;
    if (d.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.horizontal = Math.abs(dx) > Math.abs(dy);
      if (d.horizontal) {
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    }
    if (!d.horizontal) return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.vx = (((e.clientX - d.lastX) / s) / dt) * 1000;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    this.offset = dx;
    this.layout();
  };

  private onUp = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    this.drag = null;
    if (!d.horizontal) return;
    let dir = 0;
    if (this.offset < -ITEM_WIDTH / 3 || d.vx < -400) dir = 1;
    else if (this.offset > ITEM_WIDTH / 3 || d.vx > 400) dir = -1;
    this.snap(dir);
  };

  private onCancel = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    this.drag = null;
    if (d.horizontal) this.snap(0);
  };

  /** Animates to the next (dir 1) / previous (dir -1) / same (0) item, then wraps the index. */
  private snap(dir: number): void {
    const from = this.offset;
    const to = -dir * ITEM_WIDTH;
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / SNAP_MS);
      const k = 1 - Math.pow(1 - t, 3); // ease-out
      this.offset = from + (to - from) * k;
      this.layout();
      if (t < 1) {
        this.animating = requestAnimationFrame(step);
      } else {
        this.animating = 0;
        const n = this.items.length;
        const next = this.current + dir;
        this.current = ((next % n) + n) % n;
        this.offset = 0;
        if (next !== this.current) {
          // wrapped around: the title slides back to the other end (like the WP7 Panorama)
          this.title.style.transition = `transform ${SNAP_MS * 2}ms ease-out`;
          window.setTimeout(() => (this.title.style.transition = ''), SNAP_MS * 2);
        }
        this.layout();
      }
    };
    this.animating = requestAnimationFrame(step);
  }
}
