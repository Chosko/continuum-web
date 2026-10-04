/**
 * The 480x800 "phone screen" stage.
 *
 *   #app (fills the viewport, black)
 *     .stage  (absolutely positioned 480x800 CSS px, uniformly scaled with transform to fit,
 *              centered -> letterboxed with black bars)
 *       canvas.stage-canvas   WebGL, backing store 480x800 * devicePixelRatio
 *       div.stage-overlay     HTML layer for the Silverlight pages (XAML -> DOM), 480x800 CSS px
 *
 * Everything inside .stage is laid out in VIRTUAL pixels (480x800) because the transform does
 * the scaling; HTML overlays can therefore use the XAML coordinates/margins directly.
 */
import { GraphicsDevice, SharedGraphicsDeviceManager, TouchPanel, Vector2, installAudioUnlock } from './xna';

export const STAGE_WIDTH = 480;
export const STAGE_HEIGHT = 800;

export interface Stage {
  root: HTMLElement;
  stage: HTMLDivElement;
  canvas: HTMLCanvasElement;
  overlay: HTMLDivElement;
  graphicsDevice: GraphicsDevice;
  /** Current CSS scale factor of the stage. */
  readonly scale: number;
  /** Maps client (viewport) coordinates to virtual 480x800 coordinates. */
  clientToVirtual(clientX: number, clientY: number): Vector2;
}

export function createStage(root: HTMLElement): Stage {
  root.classList.add('app-root');
  const stage = document.createElement('div');
  stage.className = 'stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  canvas.width = STAGE_WIDTH;
  canvas.height = STAGE_HEIGHT;
  const overlay = document.createElement('div');
  overlay.className = 'stage-overlay';
  stage.append(canvas, overlay);
  root.append(stage);

  const graphicsDevice = new GraphicsDevice(canvas, STAGE_WIDTH, STAGE_HEIGHT);
  SharedGraphicsDeviceManager.initialize(graphicsDevice);

  let scale = 1;

  const layout = (): void => {
    const vw = root.clientWidth || window.innerWidth;
    const vh = root.clientHeight || window.innerHeight;
    scale = Math.min(vw / STAGE_WIDTH, vh / STAGE_HEIGHT);
    const w = STAGE_WIDTH * scale;
    const h = STAGE_HEIGHT * scale;
    // snap the stage's top-left to whole device pixels for crisp edges
    const dpr = window.devicePixelRatio || 1;
    const left = Math.round(((vw - w) / 2) * dpr) / dpr;
    const top = Math.round(((vh - h) / 2) * dpr) / dpr;
    stage.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
    graphicsDevice.setDrawingBufferSize(Math.round(STAGE_WIDTH * dpr), Math.round(STAGE_HEIGHT * dpr));
  };

  layout();
  window.addEventListener('resize', layout);
  window.visualViewport?.addEventListener('resize', layout);
  // devicePixelRatio changes (zoom / moving between monitors)
  const watchDpr = (): void => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => {
      layout();
      watchDpr();
    }, { once: true });
  };
  watchDpr();

  const clientToVirtual = (clientX: number, clientY: number): Vector2 => {
    const r = canvas.getBoundingClientRect();
    return new Vector2(
      ((clientX - r.left) * STAGE_WIDTH) / r.width,
      ((clientY - r.top) * STAGE_HEIGHT) / r.height,
    );
  };

  TouchPanel.displayWidth = STAGE_WIDTH;
  TouchPanel.displayHeight = STAGE_HEIGHT;
  TouchPanel.attach(stage, clientToVirtual);
  installAudioUnlock();

  // No context menu / long-press callout on the game surface
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    root,
    stage,
    canvas,
    overlay,
    graphicsDevice,
    get scale() {
      return scale;
    },
    clientToVirtual,
  };
}
