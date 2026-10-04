/**
 * DOM versions of the WP7 (dark theme) Silverlight controls used by the pages:
 * default Button template (12 px PhoneTouchTargetOverhang, 3 px border, pressed = white fill /
 * black text), ProgressBar (4 px indicator, vertically centered), Expression BlockArrow.
 */

/**
 * Default WP7 Button: outer box (layout slot) > border (margin 12) > content.
 * Click fires on release over the button (ClickMode.Release), like the native click event.
 * onClick null = no Click handler (still shows the pressed visual).
 */
export function createWpButton(text: string, className: string, onClick: (() => void) | null): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `wp-btn ${className}`;
  b.tabIndex = -1;
  const border = document.createElement('span');
  border.className = 'wp-btn-border';
  const content = document.createElement('span');
  content.className = 'wp-btn-content';
  content.textContent = text;
  border.append(content);
  b.append(border);
  attachPressedState(b);
  b.addEventListener('click', () => {
    b.blur();
    onClick?.();
  });
  return b;
}

/** VisualState "Pressed" while a pointer is down on the element. */
export function attachPressedState(el: HTMLElement): void {
  const on = (): void => el.classList.add('pressed');
  const off = (): void => el.classList.remove('pressed');
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}

/**
 * WP7 ProgressBar: invisible track (Background opacity 0), 4 px high indicator vertically centered
 * in the control box, LinearGradientBrush (0,0)->(1,1) relative to the indicator box
 * (= CSS "to bottom right"). Returns the root and a setter for Value (0..100).
 */
export function createWpProgressBar(className: string): { root: HTMLDivElement; setValue: (v: number) => void } {
  const root = document.createElement('div');
  root.className = `wp-progressbar ${className}`;
  const indicator = document.createElement('div');
  indicator.className = 'wp-progressbar-indicator';
  root.append(indicator);
  let last = -1;
  const setValue = (v: number): void => {
    const clamped = Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0));
    if (clamped === last) return;
    last = clamped;
    indicator.style.width = `${clamped}%`;
  };
  setValue(0);
  return { root, setValue };
}

export type ArrowOrientation = 'Left' | 'Right' | 'Up' | 'Down';

/**
 * Microsoft.Expression.Shapes.BlockArrow (defaults ArrowheadAngle 90, ShaftThickness 0.5) as SVG.
 * Position/size in the parent's coordinates; rotation (degrees) around the center
 * (RenderTransformOrigin 0.5,0.5).
 */
export function createBlockArrow(
  x: number,
  y: number,
  w: number,
  h: number,
  orientation: ArrowOrientation,
  fill: string,
  rotation = 0,
): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'wp-blockarrow');
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.style.left = `${x}px`;
  svg.style.top = `${y}px`;
  if (rotation !== 0) svg.style.transform = `rotate(${rotation}deg)`;

  // Build for "Right" in a (len x thick) box, then map.
  const horizontal = orientation === 'Left' || orientation === 'Right';
  const len = horizontal ? w : h;
  const thick = horizontal ? h : w;
  const head = Math.min(len, thick / 2);
  const s0 = thick / 4;
  const s1 = (thick * 3) / 4;
  const pts: Array<[number, number]> = [
    [0, s0], [len - head, s0], [len - head, 0], [len, thick / 2], [len - head, thick], [len - head, s1], [0, s1],
  ];
  const map = ([a, b]: [number, number]): [number, number] => {
    switch (orientation) {
      case 'Right':
        return [a, b];
      case 'Left':
        return [len - a, b];
      case 'Down':
        return [b, a];
      case 'Up':
        return [b, len - a];
    }
  };
  // inset by half the 1 px stroke so it stays inside the box
  const inset = 0.5;
  const sx = (w - 2 * inset) / w;
  const sy = (h - 2 * inset) / h;
  const poly = document.createElementNS(ns, 'polygon');
  poly.setAttribute(
    'points',
    pts
      .map(map)
      .map(([px, py]) => `${(inset + px * sx).toFixed(2)},${(inset + py * sy).toFixed(2)}`)
      .join(' '),
  );
  poly.setAttribute('fill', fill);
  poly.setAttribute('stroke', '#000');
  poly.setAttribute('stroke-width', '1');
  svg.append(poly);
  return svg;
}
