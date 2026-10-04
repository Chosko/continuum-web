import { siteUrl } from './xna';

/**
 * Fonts shipped with the Silverlight app.
 *  - XAML FontFamily="/Continuum;component/Fonts/Fonts.zip#Squared Display": Blend packs the
 *    BlendEmbeddedFont "Fonts/Squared Display.ttf" into Fonts.zip at build time; on the web we
 *    use the TTF directly -> CSS font-family 'Squared Display'.
 *  - Font/QUARTZMS.TTF (Resource; not referenced by any XAML) -> 'Quartz MS'.
 */
export const FONT_FILES: Array<{ family: string; path: string }> = [
  { family: 'Squared Display', path: 'Fonts/Squared Display.ttf' },
  { family: 'Quartz MS', path: 'Font/QUARTZMS.TTF' },
];

export async function loadWebFonts(): Promise<void> {
  await Promise.all(
    FONT_FILES.map(async ({ family, path }) => {
      try {
        const face = new FontFace(family, `url("${siteUrl(path)}")`);
        await face.load();
        document.fonts.add(face);
      } catch (err) {
        console.warn(`Font ${family} failed to load`, err);
      }
    }),
  );
}
