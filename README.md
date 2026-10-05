# Continuum (web)

A TypeScript/HTML5 port of **Continuum Arena**, a Windows Phone 7 game written in C# with XNA 4.0.
The game logic is translated statement by statement. A small compatibility layer (`src/xna/`) stands in for
SpriteBatch, the TouchPanel, the Accelerometer, the sounds and the other parts of XNA the game uses. The porting
rules and every deliberate deviation are documented in [docs/PORTING_NOTES.md](docs/PORTING_NOTES.md).

Play it at **https://continuum.chosko.com** or **https://chosko.github.io/continuum-web/**.

## Development

```sh
npm install
npm run dev       # Vite dev server
npm run build     # type-check (tsc --noEmit) + production build into dist/
npm run preview   # serve the production build
```

## Controls (web)

### Desktop

- **Tilt:** arrow keys or WASD. They stand in for the accelerometer, which is zeroed at the start of the game.
- **Rewind time:** drag the mouse quickly downward (a flick down). This only works when the time tank has something in it.
- **Tap:** click. During a rewind, a tap stops it.
- **Plasma grenade:** press the grenade button (shown when you hold a grenade) to enter aim mode. Then:
  1. Hold the **left** button where the grenade should land. This sets the target point.
  2. While still holding left, press the **right** button. This adds a second finger for the curve's control point. The target stays where it was, and moving the mouse now moves the control point.
  3. Release either button to launch.

  If you release the left button before pressing the right one, the target is cancelled. Aim mode closes by itself after 5 s without a launch.
- **Back key:** Esc or the browser's back button. It pauses the game (the PAUSED dialog) or goes back one page.

### Mobile

- **Tilt:** tilt the device. The real accelerometer is used and is calibrated to how you hold the phone when the game starts.
- **Touch:** works as on the original:
  - Flick down to rewind.
  - Tap to stop a rewind.
  - Use two fingers to aim a grenade (first finger = target, second finger = control point). Lift a finger to launch.
- **iOS:** when you press Start, the browser asks for permission to use motion sensors.

## Deployment

Every push to `master` builds the site and deploys it to GitHub Pages through the workflow in
`.github/workflows/deploy.yml` (Pages source: **GitHub Actions**). `public/CNAME` sets the custom domain `continuum.chosko.com`.

## Credits

The original game, Continuum v1.0, was developed by **XTeam** ([xteamdimension.com](http://www.xteamdimension.com)).
Its programmers were Ruben Caliandro, Stefano Nada and Stefano Ordine.
This web version is a port of their code and assets.
