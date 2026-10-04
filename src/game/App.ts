import { MediaPlayer, XnaEvent, type ContentManager, type Song } from '../xna';
import type { Stage } from '../stage';
import type { GameState } from './State/GameState';
import { SoundManager } from './Management/SoundManager';
import { NavigationService } from './Pages/Navigation';
import { MessageBox } from './Pages/MessageBox';
import { MainPage } from './Pages/MainPage';
import { GamePage } from './Pages/GamePage';
import { Tutorial } from './Pages/TutorialPage';
import { ScorePage } from './Pages/ScorePage';
import { Page1 } from './Pages/Credits';

/**
 * App.xaml(.cs): application bootstrap. Holds the shared ContentManager, the single GameState
 * `gs`, starts the looping music and initializes the SoundManager. RootFrame.Obscured /
 * Unobscured map to document visibilitychange (hidden -> obscured).
 *
 * Dropped (deviation D6): tombstoning to saved.xml, AppServiceProvider, FrameworkDispatcher pump,
 * debug frame-rate counter.
 */
export class App {
  /** Application.Current as App */
  static current: App;

  /** The root frame / navigation service of the application. */
  readonly rootFrame: NavigationService;

  /** Provides access to a ContentManager for the application. */
  readonly content: ContentManager;

  /** The 480x800 stage (canvas + DOM overlay). */
  readonly stage: Stage;

  /** The GameState */
  gs: GameState | null;

  /** RootFrame.Obscured / Unobscured (page-level listeners, e.g. GamePage frame-clock reset). */
  readonly obscured = new XnaEvent<void>();
  readonly unobscured = new XnaEvent<void>();

  private isObscured = false;

  constructor(stage: Stage, content: ContentManager) {
    App.current = this;
    this.stage = stage;
    this.content = content;

    MessageBox.setHost(stage.overlay);
    this.rootFrame = new NavigationService(stage.overlay);
    this.rootFrame.register('/MainPage.xaml', () => new MainPage());
    this.rootFrame.register('/GamePage.xaml', () => new GamePage());
    this.rootFrame.register('/TutorialPage.xaml', () => new Tutorial());
    this.rootFrame.register('/ScorePage.xaml', () => new ScorePage());
    this.rootFrame.register('/Credits.xaml', () => new Page1());

    this.gs = null;

    // Obscured / Unobscured event handlers
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    // Music: starts once and loops over all pages (the shim retries on the first user gesture,
    // deviation D5).
    if (MediaPlayer.gameHasControl) {
      const music = this.content.load<Song>('Sounds/continuum');
      MediaPlayer.isRepeating = true;
      MediaPlayer.play(music);
    }
    SoundManager.initialize(this.content, 'Sounds/');
  }

  /** WMAppManifest DefaultTask NavigationPage="MainPage.xaml" */
  run(): void {
    this.rootFrame.navigate('/MainPage.xaml');
  }

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      if (!this.isObscured) {
        this.isObscured = true;
        this.rootFrame_Obscured();
      }
    } else if (this.isObscured) {
      this.isObscured = false;
      this.rootFrame_Unobscured();
    }
  };

  /** Called when the RootFrame is unobscured (back from a call / lock screen; tab visible again). */
  private rootFrame_Unobscured(): void {
    const gs = this.gs;
    if (gs !== null) {
      // C# reads .Value of the nullable backups; they are always set by a previous Obscured
      // unless gs was created while obscured (impossible on the web).
      if (gs.alberttimecontunuumbackup !== null) gs.albertTime.continuum = gs.alberttimecontunuumbackup;
      if (gs.playertimecontunuumbackup !== null) gs.playerTime.continuum = gs.playertimecontunuumbackup;
      if (gs.leveltimecontunuumbackup !== null) gs.levelTime.continuum = gs.leveltimecontunuumbackup;
    }
    this.unobscured.invoke(this, undefined);
  }

  /** Called when the RootFrame is obscured (incoming call / lock screen; tab hidden). */
  private rootFrame_Obscured(): void {
    const gs = this.gs;
    if (gs !== null) {
      gs.alberttimecontunuumbackup = gs.albertTime.continuum;
      gs.playertimecontunuumbackup = gs.playerTime.continuum;
      gs.leveltimecontunuumbackup = gs.levelTime.continuum;
      gs.albertTime.continuum = 0;
      gs.playerTime.continuum = 0;
      gs.levelTime.continuum = 0;
    }
    this.obscured.invoke(this, undefined);
  }
}
