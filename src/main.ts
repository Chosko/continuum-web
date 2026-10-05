/**
 * Entry point: boots the 480x800 stage, shows the splash screen (SplashScreenImage.jpg, the WP7
 * OS splash) with a minimal progress indicator while fonts and content are preloaded (XNA's
 * synchronous ContentManager.Load needs everything cached), then starts the App (MainPage).
 */
import './style.css';
import './game/Pages/pages.css';
import { CONTENT_MANIFEST, TEXT_MANIFEST } from './contentManifest';
import { loadWebFonts } from './fonts';
import { createStage } from './stage';
import { ContentManager, TitleContainer, siteUrl } from './xna';
import { App } from './game/App';

async function main(): Promise<void> {
  const root = document.getElementById('app')!;
  const stage = createStage(root);

  const splash = document.createElement('div');
  splash.className = 'boot-splash';
  const img = document.createElement('img');
  img.src = siteUrl('SplashScreenImage.jpg');
  img.alt = '';
  img.draggable = false;
  const progress = document.createElement('div');
  progress.className = 'boot-progress';
  const bar = document.createElement('div');
  bar.className = 'boot-progress-bar';
  progress.append(bar);
  splash.append(img, progress);
  stage.overlay.append(splash);

  await loadWebFonts();
  const content = new ContentManager(stage.graphicsDevice, 'Content');
  await Promise.all([
    content.preload(CONTENT_MANIFEST, (done, total) => {
      bar.style.width = `${total > 0 ? (100 * done) / total : 100}%`;
    }),
    TitleContainer.preload(TEXT_MANIFEST),
  ]);

  const app = new App(stage, content);
  // Read-only debug/QA hook (scripts/playtest.cjs): exposes the app, its GameState and the current page.
  (window as unknown as { __continuum: unknown }).__continuum = {
    get app() {
      return app;
    },
    get gs() {
      return app.gs;
    },
    get page() {
      return app.rootFrame.currentPage;
    },
  };
  app.run();
  // MainPage starts with the same splash image on top (fading out), so the hand-off is seamless.
  splash.remove();
}

main().catch((err) => {
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;left:0;top:0;color:#f66;white-space:pre-wrap;z-index:1000';
  pre.textContent = String(err?.stack ?? err);
  document.body.append(pre);
});
