import { requestMotionPermission, siteUrl } from '../../xna';
import { PhoneApplicationPage } from './Navigation';
import { Storyboard } from './Storyboard';
import { createWpButton } from './Controls';

/**
 * MainPage.xaml(.cs): main menu with the "Apertura" intro storyboard (run once, in the ctor;
 * the page stays alive in the back stack so returning to it does not replay it).
 */
export class MainPage extends PhoneApplicationPage {
  private readonly apertura: Storyboard;

  constructor() {
    super('main-page', false);
    const root = this.root;

    const logo = document.createElement('img');
    logo.className = 'main-logo';
    logo.src = siteUrl('logo.png');
    logo.alt = '';
    logo.draggable = false;

    const stack = document.createElement('div');
    stack.className = 'main-stack';

    const button = createWpButton('Start', 'main-button', () => this.gamePage_Click());
    button.style.color = '#7CC6FF';
    const line = MainPage.createLine();
    const button1 = createWpButton('Instructions', 'main-button', () => this.tutorial_Click());
    button1.style.color = '#63BBFF';
    const line1 = MainPage.createLine();
    const button2 = createWpButton('Scores', 'main-button', () => this.scores_Click());
    button2.style.color = '#41ACFE';
    const line2 = MainPage.createLine();
    const button3 = createWpButton('Credits', 'main-button', () => this.credits_Click());
    button3.style.color = '#189BFF';
    const line3 = MainPage.createLine();
    // "Other Games": no Click handler in the original
    const button4 = createWpButton('Other Games', 'main-button', null);
    button4.style.color = '#0090FF';
    stack.append(button, line, button1, line1, button2, line2, button3, line3, button4);

    const splash = document.createElement('img');
    splash.className = 'main-splash';
    splash.src = siteUrl('SplashScreenImage.jpg');
    splash.alt = '';
    splash.draggable = false;

    root.append(logo, stack, splash);

    const kf = (...pairs: number[]): Array<{ t: number; value: number }> => {
      const out: Array<{ t: number; value: number }> = [];
      for (let i = 0; i < pairs.length; i += 2) out.push({ t: pairs[i], value: pairs[i + 1] });
      return out;
    };
    this.apertura = new Storyboard()
      .add(button, 'opacity', kf(0, 0, 0.8, 0, 2.4, 0, 2.8, 1))
      .add(line, 'opacity', kf(0, 0, 0.8, 0.005, 2.3, 0, 2.7, 1))
      .add(button1, 'opacity', kf(0, 0, 0.8, 0, 2.2, 0, 2.6, 1))
      .add(line1, 'opacity', kf(0, 0, 0.8, 0, 2.1, 0, 2.5, 1))
      .add(button2, 'opacity', kf(0, 0, 0.8, 0, 2.0, 0, 2.4, 1))
      .add(line2, 'opacity', kf(0, 0, 0.8, 0, 1.9, 0, 2.3, 1))
      .add(button3, 'opacity', kf(0, 0, 0.8, 0, 1.8, 0, 2.2, 1))
      .add(line3, 'opacity', kf(0, 0, 0.8, 0, 1.7, 0, 2.1, 1))
      .add(button4, 'opacity', kf(0, 0, 0.8, 0, 1.6, 0, 2.0, 1))
      .add(logo, 'translateY', kf(0, 145, 0.8, 145, 1.6, 145, 2.8, 0))
      .add(logo, 'opacity', kf(0, 0, 0.8, 0, 1.6, 1))
      .add(splash, 'opacity', kf(0, 1, 0.8, 0))
      .add(splash, 'translateX', kf(0, 0, 0.8, 0, 1.0, 480));
    this.apertura.begin();
  }

  private static createLine(): HTMLDivElement {
    const l = document.createElement('div');
    l.className = 'main-line';
    return l;
  }

  private gamePage_Click(): void {
    // iOS 13+: motion permission must be requested from a user gesture
    void requestMotionPermission();
    this.navigationService.navigate('/GamePage.xaml');
  }

  private tutorial_Click(): void {
    this.navigationService.navigate('/TutorialPage.xaml');
  }

  private scores_Click(): void {
    this.navigationService.navigate('/ScorePage.xaml');
  }

  private credits_Click(): void {
    this.navigationService.navigate('/Credits.xaml');
  }
}
