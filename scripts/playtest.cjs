/*
 * Scripted playtest of the built game in headless Chromium (Playwright).
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/playtest.cjs [url] [outDir]
 *
 * Env: PW_CHROMIUM (Chromium executable), PLAY_SECONDS (game seconds before forcing the end, default 90).
 * Starts a game from the menu, plays with keyboard tilt (arrow keys -> accelerometer fallback),
 * flick-down rewind + tap stop (mouse), grenade button + two-finger aim (CDP touch events), lets the
 * player die (or, after PLAY_SECONDS, zeroes the life through window.__continuum to reach game over),
 * saves the score and checks the score page. Logs console errors, entity counts, frame times and heap.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:4173/';
const OUT = process.argv[3] || path.join(process.cwd(), 'playtest-out');
const PLAY_SECONDS = Number(process.env.PLAY_SECONDS || 90);
const EXE = process.env.PW_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

const TS = ['START_GAME', 'FORWARD', 'BEGIN_REWIND', 'START_REWIND', 'REWIND', 'BEGIN_FORWARD', 'START_FORWARD', 'BOOSTER', 'ENTER_PGL', 'PGL', 'CALIB_CONTROL', 'CALIB_TARGET', 'EXIT_PGL'];
const LS = ['NORMAL', 'DAMAGED', 'DEAD', 'TRANSITIONING', 'BEINGREPLACED', 'DELETING'];

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);
const problems = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'],
  });
  const context = await browser.newContext({ viewport: { width: 480, height: 800 }, deviceScaleFactor: 1, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      const t = `[${m.type()}] ${m.text()}`;
      log(t);
      if (m.type() === 'error') problems.push(t);
    }
  });
  page.on('pageerror', (e) => { const t = `[pageerror] ${e.message}\n${e.stack}`; log(t); problems.push(t); });
  page.on('requestfailed', (r) => { const t = `[requestfailed] ${r.url()} ${r.failure()?.errorText}`; log(t); problems.push(t); });

  // Frame-time probe (RAF deltas, collected in the page)
  await page.addInitScript(() => {
    const ft = (window.__ft = { deltas: [], last: 0 });
    const tick = (t) => { if (ft.last) ft.deltas.push(t - ft.last); ft.last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('.main-page', { timeout: 60000 });
  await page.waitForTimeout(4000); // intro storyboard
  await page.screenshot({ path: `${OUT}/00-menu.png` });
  await page.getByText('Start', { exact: true }).click();
  await page.waitForSelector('.game-page', { timeout: 10000 });

  const stats = () => page.evaluate(() => {
    const c = window.__continuum, gs = c.gs, p = c.page;
    if (!gs) return null;
    const n = (l) => { let k = 0; for (const x of l) if (x.lifeState !== 2) k++; return k; };
    return {
      t: +gs.levelTime.time.toFixed(2), pt: +gs.playerTime.time.toFixed(2), at: +gs.albertTime.time.toFixed(2),
      lc: +gs.levelTime.continuum.toFixed(2), pc: +gs.playerTime.continuum.toFixed(2),
      state: gs.timeState, life: +gs.playerLife.toFixed(1), ls: gs.playerLifeState,
      tank: +gs.timeTank.toFixed(2), gren: gs.playerGranadeCount,
      pos: [Math.round(gs.playerPosition.x), Math.round(gs.playerPosition.y)],
      en: n(gs.enemies), ast: n(gs.asteroids), bul: n(gs.bullets), tach: n(gs.tachyons), pu: n(gs.powerUps),
      chips: n(gs.explosionParticles), anim: n(gs.animations), stream: !!gs.tachyonStream,
      tot: gs.enemies.count + gs.asteroids.count + gs.bullets.count + gs.tachyons.count + gs.powerUps.count + gs.explosionParticles.count + gs.animations.count + gs.playerStates.count + gs.randomizers.count,
      pstates: gs.playerStates.count,
      bar: p && p.timeTankBar ? p.root.querySelector('.game-timetankbar')?.innerHTML.length : null,
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
    };
  });
  const frames = () => page.evaluate(() => { const d = window.__ft.deltas.splice(0); d.sort((a, b) => a - b); return d.length ? { n: d.length, p50: +d[d.length >> 1].toFixed(1), p99: +d[Math.floor(d.length * 0.99)].toFixed(1), max: +d[d.length - 1].toFixed(1) } : null; });
  const fmt = (s) => s && `t=${s.t} pt=${s.pt} ${TS[s.state]} lc=${s.lc} life=${s.life} ${LS[s.ls]} tank=${s.tank} gren=${s.gren} pos=${s.pos} en=${s.en} ast=${s.ast} bul=${s.bul} tach=${s.tach} pu=${s.pu} chips=${s.chips} anim=${s.anim} stream=${s.stream} tot=${s.tot} pst=${s.pstates} heap=${s.heap}MB`;
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const gameTime = async () => (await stats())?.t ?? 0;
  const waitGame = async (until, every = 3) => {
    let next = (await gameTime()) + every;
    for (;;) {
      const s = await stats();
      if (!s || s.t >= until || s.ls === 5) return s;
      if (s.t >= next) { log(fmt(s)); next = s.t + every; }
      await page.waitForTimeout(250);
    }
  };
  const flickDown = async () => { await page.mouse.move(240, 300); await page.mouse.down(); await page.mouse.move(240, 330, { steps: 1 }); await page.mouse.move(240, 520, { steps: 2 }); await page.mouse.up(); };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 1, radiusY: 1, force: 1 })) });
  // Autopilot: dodge the nearest threat (enemy/asteroid/enemy bullet), else seek tachyons, else go home.
  const held = new Set();
  const setKeys = async (want) => {
    for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const steer = async (ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = await page.evaluate(() => {
        const gs = window.__continuum.gs; if (!gs) return null;
        const p = gs.playerPosition; let fx = 0, fy = 0;
        const push = (o, r, w) => { const dx = p.x - o.currentPosition.x, dy = p.y - o.currentPosition.y, d = Math.hypot(dx, dy); if (d < r && d > 0.01) { fx += (dx / d) * w * (1 - d / r); fy += (dy / d) * w * (1 - d / r); } };
        for (const e of gs.enemies) if (e.lifeState !== 2) push(e, 220, 3);
        for (const a of gs.asteroids) if (a.lifeState !== 2) push(a, 160, 3);
        for (const b of gs.bullets) if (b.lifeState !== 2 && !b.isPlayerBullet) push(b, 90, 2);
        if (Math.hypot(fx, fy) < 0.3) {
          let best = null, bd = 1e9;
          for (const t of gs.tachyons) if (t.lifeState !== 2) { const d = Math.hypot(t.currentPosition.x - p.x, t.currentPosition.y - p.y); if (d < bd) { bd = d; best = t; } }
          const tx = best ? best.currentPosition.x : 240, ty = best ? Math.max(best.currentPosition.y, 450) : 620;
          fx += (tx - p.x) / 100; fy += (ty - p.y) / 100;
        }
        fx += (240 - p.x) / 400; fy += (600 - p.y) / 400; // keep away from the walls
        return [fx, fy];
      });
      if (!v) return;
      const want = [];
      if (v[0] > 0.15) want.push('ArrowRight'); else if (v[0] < -0.15) want.push('ArrowLeft');
      if (v[1] > 0.15) want.push('ArrowDown'); else if (v[1] < -0.15) want.push('ArrowUp');
      await setKeys(want);
      await page.waitForTimeout(80);
    }
  };

  // --- intro (black + fade) ---
  await page.waitForTimeout(1000); await shot('01-intro-black');
  await waitGame(3.5); await shot('02-intro-fade');
  await waitGame(6);
  log('frames(intro)', JSON.stringify(await frames()));

  // --- pause (Back/Escape -> PAUSED MessageBox stops the loop; Cancel resumes) ---
  {
    const t0 = await gameTime();
    await page.keyboard.press('Escape');
    await page.waitForSelector('.wp-messagebox', { timeout: 3000 }).catch(() => problems.push('Escape did not open the PAUSED dialog'));
    await page.waitForTimeout(1000);
    const t1 = await gameTime();
    await shot('03-paused');
    await page.getByText('cancel', { exact: true }).click();
    await page.waitForTimeout(600);
    const t2 = await gameTime();
    log(`pause: t ${t0} -> ${t1} (paused 1 s) -> ${t2} after cancel`);
    if (t1 - t0 > 0.2) problems.push(`game time advanced while paused (${t0} -> ${t1})`);
    if (!(t2 > t1)) problems.push('game did not resume after cancel');
  }

  // --- free play with tilt, screenshot every ~4 s ---
  let rewindDone = false, grenadeDone = false, shotN = 0, maxHeap = 0, firstHeap = null;
  const seen = { en: 0, ast: 0, bul: 0, tach: 0, pu: 0, chips: 0, stream: 0, rewind: 0, pgl: 0, launched: 0 };
  for (;;) {
    await steer(500);
    const s = await stats();
    if (!s) break;
    for (const k of ['en', 'ast', 'bul', 'tach', 'pu', 'chips']) seen[k] = Math.max(seen[k], s[k]);
    if (s.stream) seen.stream++;
    if (s.heap) { maxHeap = Math.max(maxHeap, s.heap); if (firstHeap === null) firstHeap = s.heap; }
    if (s.ls === 5) break;
    if (s.t > (shotN + 1) * 4) { shotN++; log(fmt(s), JSON.stringify(await frames())); await shot(`play-${String(shotN).padStart(2, '0')}`); }

    // Rewind once the tank has something in it
    if (!rewindDone && s.state === 1 && s.tank > 0.7) {
      await setKeys([]);
      log('>>> flick down (rewind)', fmt(s));
      await flickDown();
      await page.waitForTimeout(700);
      let r = await stats(); log('after flick', fmt(r)); await shot('rewind-1');
      await page.waitForTimeout(800);
      r = await stats(); log('rewinding', fmt(r)); await shot('rewind-2');
      if (r.state >= 2 && r.state <= 6) seen.rewind++; else problems.push('flick down did not start rewind: ' + fmt(r));
      if (r.state === 4) { await page.mouse.click(240, 400); await page.waitForTimeout(300); r = await stats(); log('after tap', fmt(r)); if (r.state === 4) problems.push('tap did not stop rewind'); }
      await page.waitForTimeout(1500); log('after rewind', fmt(await stats())); await shot('rewind-3-after');
      rewindDone = true;
    }

    // Grenade: needs a grenade power-up; after 45 s of game time grant one through the hook
    if (!grenadeDone && s.state === 1 && (s.gren > 0 || s.t > 45)) {
      await setKeys([]);
      if (s.gren === 0) { log('(no grenade picked up yet: granting one via __continuum)'); await page.evaluate(() => { window.__continuum.gs.playerGranadeCount = 1; }); }
      await page.locator('.game-lastchance').click({ force: true });
      await page.waitForTimeout(400); let g = await stats(); log('grenade btn', fmt(g)); await shot('grenade-1-enter');
      await page.waitForTimeout(700); g = await stats(); log('pgl', fmt(g));
      if (g.state >= 8) seen.pgl++; else problems.push('grenade button did not enter PGL: ' + fmt(g));
      await touch('touchStart', [[120, 200]]); await page.waitForTimeout(150);
      g = await stats(); log('1 finger', fmt(g)); await shot('grenade-2-target');
      await touch('touchStart', [[120, 200], [360, 500]]); await page.waitForTimeout(150);
      for (let i = 0; i < 6; i++) { await touch('touchMove', [[120 + i * 10, 200 - i * 10], [360 - i * 15, 500]]); await page.waitForTimeout(60); }
      g = await stats(); log('2 fingers', fmt(g)); await shot('grenade-3-aim');
      if (g.state !== 10) problems.push('two-finger aim did not reach CALIBRATION_CONTROL_POINT: ' + fmt(g));
      const before = await page.evaluate(() => window.__continuum.gs.bullets.count);
      await touch('touchEnd', []); await page.waitForTimeout(400);
      g = await stats(); log('released', fmt(g), 'bullets', before, '->', await page.evaluate(() => window.__continuum.gs.bullets.count));
      await shot('grenade-4-launch');
      if (g.state === 12 || g.state === 1) seen.launched++;
      await page.waitForTimeout(1200); await shot('grenade-5-after'); log('after grenade', fmt(await stats()));
      grenadeDone = true;
    }

    if (s.t > PLAY_SECONDS) {
      await setKeys([]);
      log('>>> forcing death via __continuum (playerLife = 0)');
      await page.evaluate(() => { window.__continuum.gs.playerLife = 0; });
      await page.waitForTimeout(500); await shot('dying');
      const end = await waitGame(1e9, 1);
      log('end', fmt(end));
      break;
    }
  }
  log('frames(play)', JSON.stringify(await frames()));
  log('seen max', JSON.stringify(seen), 'heap', firstHeap, '->', maxHeap, 'MB');
  for (const k of ['en', 'ast', 'bul', 'tach', 'pu', 'chips']) if (!seen[k]) problems.push(`never saw any ${k}`);

  // --- game over screen + save ---
  try {
    await page.waitForSelector('.game-savebutton', { state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500); await shot('gameover');
    await page.fill('.game-nametextbox', 'Playtest');
    await page.click('.game-savebutton');
    await page.waitForSelector('.main-page', { timeout: 5000 });
    const saved = await page.evaluate(() => localStorage.getItem('continuum.scores'));
    log('saved scores:', saved);
    if (!saved || !saved.includes('Playtest')) problems.push('score not saved');
    await page.getByText('Scores', { exact: true }).click();
    await page.waitForTimeout(1500); await shot('scores');
    // --- second game: must start fresh (new GameState) ---
    await page.keyboard.press('Escape');
    await page.waitForSelector('.main-page', { timeout: 5000 });
    await page.waitForTimeout(800);
    await page.getByText('Start', { exact: true }).click();
    await page.waitForSelector('.game-page', { timeout: 10000 });
    await page.waitForTimeout(500);
    const s0 = await stats(); log('2nd game start', fmt(s0));
    if (!s0 || s0.t > 1 || s0.life !== 20 || s0.ls !== 0 || s0.tank !== 0) problems.push('second game did not start fresh: ' + fmt(s0));
    await steer(12000);
    const s1 = await stats(); log('2nd game +12s', fmt(s1)); await shot('second-game');
    if (!s1 || s1.t < 8) problems.push('second game not running: ' + fmt(s1));
    await setKeys([]);
  } catch (e) { problems.push('game over flow failed: ' + e.message); await shot('gameover-fail'); }

  log('\n=== PROBLEMS ===\n' + (problems.length ? problems.join('\n') : 'none'));
  await browser.close();
  process.exitCode = problems.length ? 1 : 0;
})();
