/** XNA / WP7 compatibility layer. See ./README.md for C# -> TS translation rules. */
export { MathHelper, Vector2, Vector3, Point, Rectangle, Matrix, ieeeRemainder } from './math';
export { Color, type Vector4Like } from './color';
export { TimeSpan } from './timespan';
export { XnaEvent, type EventHandler } from './event';
export { Random } from './random';
export {
  VIRTUAL_WIDTH,
  VIRTUAL_HEIGHT,
  SpriteSortMode,
  SpriteEffects,
  BlendState,
  SamplerState,
  TextureFilter,
  TextureAddressMode,
  DepthStencilState,
  RasterizerState,
  Viewport,
  Texture2D,
  RenderTarget2D,
  PresentationParameters,
  GraphicsDevice,
  SharedGraphicsDeviceManager,
  type TextureProcessorOptions,
} from './graphics';
export { SpriteBatch } from './spritebatch';
export { SpriteFont, DEBUG_FONT_DESCRIPTION, type FontDescription } from './spritefont';
export {
  ContentManager,
  TitleContainer,
  baseUrl,
  siteUrl,
  type ContentManifestEntry,
  type ContentType,
} from './content';
export {
  SoundEffect,
  SoundEffectInstance,
  SoundState,
  Song,
  MediaPlayer,
  MediaState,
  getAudioContext,
  unlockAudio,
  installAudioUnlock,
  isAudioUnlocked,
} from './audio';
export {
  TouchPanel,
  GestureType,
  GestureSample,
  TouchLocation,
  TouchLocationState,
  TouchCollection,
  type TouchPanelCapabilities,
} from './touch';
export {
  Accelerometer,
  AccelerometerReading,
  AccelerometerReadingEventArgs,
  SensorReadingEventArgs,
  SensorState,
  requestMotionPermission,
} from './accelerometer';
export { GameTimer, GameTimerEventArgs } from './gametimer';
export { IsolatedStorageSettings, IsolatedStorageFile } from './storage';
