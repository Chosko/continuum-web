/**
 * The 480x800 "phone screen" stage.
 *
 *   #app (fills the viewport, black)
 *     .stage  (absolutely positioned 480x800 CSS px, uniformly scaled with transform to fit,
 *              centered -> letterboxed with black bars)
 *       canvas.stage-canvas   WebGL, backing store 480x800 * scale * devicePixelRatio, i.e. one
 *                             texel per DEVICE pixel actually covered (sharp when the stage is
 *                             scaled up, no oversampling when it is scaled down)
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

  // Largest backing store the GL implementation can present (renderbuffer / viewport limits).
  const gl = graphicsDevice.gl;
  const maxDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | null;
  const maxPixels = Math.min(
    (gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number) || 4096,
    (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) || 4096,
    maxDims?.[0] || 4096,
    maxDims?.[1] || 4096,
  );

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
    // Backing store = device pixels covered by the stage (the CSS transform maps the 480x800 CSS
    // canvas onto them 1:1). GraphicsDevice keeps the 480x800 virtual coordinate system and
    // stretches it over the whole drawing buffer, so game code is unaffected. Clamp uniformly
    // to the GL limits (the long side is the height).
    const pxScale = Math.min(scale * dpr, maxPixels / STAGE_HEIGHT);
    graphicsDevice.setDrawingBufferSize(
      Math.max(1, Math.round(STAGE_WIDTH * pxScale)),
      Math.max(1, Math.round(STAGE_HEIGHT * pxScale)),
    );
  };

  layout();
  window.addEventListener('resize', layout);
  window.visualViewport?.addEventListener('resize', layout);
  // Older iOS can report the pre-rotation size during the first resize after a rotation.
  window.addEventListener('orientationchange', () => setTimeout(layout, 300));
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
  // iOS Safari ignores user-scalable=no; block its proprietary pinch gesture events too.
  for (const t of ['gesturestart', 'gesturechange'])
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false });

  // WebGL context loss (iOS under memory pressure / backgrounding, GPU resets): every texture
  // and buffer is gone and assets are only loaded at boot, so ask for a restore and reload then.
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => window.location.reload());

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
