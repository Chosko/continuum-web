import { DEBUG_FONT_DESCRIPTION, type ContentManifestEntry } from './xna';

/**
 * Every asset of ContinuumLibContent (public/Content/...). Names are the XNA asset names
 * (lookups are case-insensitive, so the level files' "Ships/ship" resolves to Ships/Ship.png).
 * All textures use the XNA TextureProcessor defaults (ColorKey magenta + PremultiplyAlpha);
 * the .contentproj overrides no processor parameter.
 */
const tex = (name: string): ContentManifestEntry => ({ name, type: 'Texture2D', file: `${name}.png` });
const sfx = (name: string): ContentManifestEntry => ({ name, type: 'SoundEffect', file: `${name}.wav` });

export const CONTENT_MANIFEST: ContentManifestEntry[] = [
  tex('Animations/Sparks'),
  tex('Animations/TachyonStream'),
  tex('Asteroids/asteroid'),
  tex('Backgrounds/bgr0_0'),
  tex('Backgrounds/bgr0_1'),
  tex('Backgrounds/bgr0_2'),
  tex('Effects/asteroidChip1'),
  tex('Effects/asteroidChip2'),
  tex('Effects/asteroidChip3'),
  tex('Effects/blood'),
  tex('Effects/bound'),
  tex('Effects/explosionChip1'),
  tex('Effects/explosionChip2'),
  tex('Effects/explosionChip3'),
  tex('Effects/grenadeChip1'),
  tex('Effects/grenadeChip2'),
  tex('Effects/grenadeChip3'),
  tex('Effects/shadowcorner'),
  tex('Effects/tachyon'),
  tex('Effects/void'),
  tex('Enemies/easy'),
  tex('Enemies/normal'),
  tex('PowerUps/grenadePowerUp'),
  tex('PowerUps/gunPowerUp'),
  tex('PowerUps/rocketPowerUp'),
  tex('Ships/Ship'),
  tex('Weapons/enemyBullet'),
  tex('Weapons/gunBullet'),
  tex('Weapons/plasmagranade'),
  tex('Weapons/rocket'),
  tex('Weapons/rocketfollower'),
  tex('Weapons/scope'),
  sfx('Sounds/bulletHit'),
  sfx('Sounds/explosion'),
  sfx('Sounds/gridEnd'),
  sfx('Sounds/gridStart'),
  sfx('Sounds/powerUp'),
  sfx('Sounds/rewindEnd'),
  sfx('Sounds/rewindStart'),
  sfx('Sounds/rocket'),
  { name: 'Sounds/continuum', type: 'Song', file: 'Sounds/continuum.mp3' },
  { name: 'debugFont', type: 'SpriteFont', font: DEBUG_FONT_DESCRIPTION },
];

/** Non-pipeline files read synchronously by the game (LevelReader). */
export const TEXT_MANIFEST: string[] = ['Levels/Level1.xml', 'Levels/RandomLevel.xml'];
