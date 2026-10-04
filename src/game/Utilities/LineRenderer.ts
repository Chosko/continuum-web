import { Color, GraphicsDevice, RenderTarget2D, SpriteBatch, SpriteEffects, Vector2 } from '../../xna';

/** Draws lines by stretching a 2x3 white texture. */
export class LineRenderer {
  private lineTexture: RenderTarget2D;

  constructor(graphicsDevice: GraphicsDevice) {
    this.lineTexture = new RenderTarget2D(graphicsDevice, 2, 3);
    graphicsDevice.setRenderTarget(this.lineTexture);
    graphicsDevice.clear(Color.White);
    graphicsDevice.setRenderTarget(null);
  }

  drawLine(spriteBatch: SpriteBatch, point1: Vector2, point2: Vector2, thickness: number, color: Color): void {
    const difference = Vector2.subtract(point2, point1);
    const length = difference.length();
    const angle = Math.atan2(difference.y, difference.x);
    spriteBatch.draw(
      this.lineTexture,
      point1,
      null,
      color,
      angle,
      new Vector2(0, 1),
      new Vector2(length / 2, thickness / 3),
      SpriteEffects.None,
      0,
    );
  }
}
