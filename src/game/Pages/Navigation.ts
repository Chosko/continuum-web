/**
 * Minimal Silverlight/WP7 navigation model on the DOM:
 *  - PhoneApplicationPage: base class of the XAML pages (root element, OnNavigatedTo/From,
 *    OnBackKeyPress with CancelEventArgs, NavigationService).
 *  - NavigationService (the RootFrame): a back stack of page instances. Navigate("/X.xaml")
 *    creates a NEW page instance (like Silverlight); GoBack() pops it and re-shows the previous
 *    one (which keeps its state, e.g. MainPage's intro storyboard is not replayed).
 *  - The WP7 hardware Back key is mapped to Escape and to the browser back button (deviation D4).
 *    Back on the first page "exits the app": the browser leaves the page normally.
 */
import { MessageBox } from './MessageBox';

/** System.ComponentModel.CancelEventArgs */
export class CancelEventArgs {
  constructor(public cancel = false) {}
}

export enum NavigationMode {
  New = 0,
  Back = 1,
}

/** System.Windows.Navigation.NavigationEventArgs (subset) */
export class NavigationEventArgs {
  constructor(
    readonly uri: string,
    readonly navigationMode: NavigationMode,
  ) {}
}

export type PageFactory = () => PhoneApplicationPage;

export abstract class PhoneApplicationPage {
  /** Root element of the page (480x800, inside the stage overlay). */
  readonly root: HTMLDivElement;
  /** Set by the NavigationService before OnNavigatedTo. */
  navigationService!: NavigationService;
  /** shell:SystemTray.IsVisible */
  readonly systemTrayVisible: boolean;

  constructor(className: string, systemTrayVisible: boolean) {
    this.root = document.createElement('div');
    this.root.className = `wp-page ${className}`;
    this.systemTrayVisible = systemTrayVisible;
    if (systemTrayVisible) this.root.append(createSystemTray());
  }

  onNavigatedTo(_e: NavigationEventArgs): void {}
  onNavigatedFrom(_e: NavigationEventArgs): void {}
  onBackKeyPress(_e: CancelEventArgs): void {}
}

/** WP7 status bar (dark theme): 32 px black strip with the clock at the right. */
function createSystemTray(): HTMLDivElement {
  const tray = document.createElement('div');
  tray.className = 'wp-systemtray';
  const clock = document.createElement('span');
  clock.className = 'wp-systemtray-clock';
  const tick = (): void => {
    const d = new Date();
    clock.textContent = `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
  };
  tick();
  const id = window.setInterval(() => {
    if (!tray.isConnected) {
      window.clearInterval(id);
      return;
    }
    tick();
  }, 10000);
  tray.append(clock);
  return tray;
}

export class NavigationService {
  private readonly routes = new Map<string, PageFactory>();
  private readonly backStack: Array<{ uri: string; page: PhoneApplicationPage }> = [];
  private navigationCount = 0;
  private guardArmed = false;
  private ignoreNextPop = false;

  constructor(private readonly host: HTMLElement) {
    window.addEventListener('popstate', this.onPopState);
    window.addEventListener('keydown', this.onKeyDown);
  }

  register(uri: string, factory: PageFactory): void {
    this.routes.set(uri, factory);
  }

  get currentPage(): PhoneApplicationPage | null {
    return this.backStack.length > 0 ? this.backStack[this.backStack.length - 1].page : null;
  }

  get canGoBack(): boolean {
    return this.backStack.length > 1;
  }

  /** NavigationService.Navigate(new Uri(uri, UriKind.Relative)) */
  navigate(uri: string): boolean {
    const factory = this.routes.get(uri);
    if (!factory) throw new Error(`Navigation failed: no page for "${uri}"`);
    this.navigationCount++;
    const from = this.backStack[this.backStack.length - 1];
    if (from) {
      from.page.onNavigatedFrom(new NavigationEventArgs(uri, NavigationMode.New));
      from.page.root.style.display = 'none';
    }
    const page = factory();
    page.navigationService = this;
    this.backStack.push({ uri, page });
    this.host.append(page.root);
    page.onNavigatedTo(new NavigationEventArgs(uri, NavigationMode.New));
    this.syncHistory();
    return true;
  }

  /** NavigationService.GoBack() */
  goBack(): void {
    if (!this.canGoBack) return;
    this.navigationCount++;
    const from = this.backStack.pop()!;
    const to = this.backStack[this.backStack.length - 1];
    from.page.onNavigatedFrom(new NavigationEventArgs(to.uri, NavigationMode.Back));
    from.page.root.remove();
    to.page.root.style.display = '';
    to.page.onNavigatedTo(new NavigationEventArgs(to.uri, NavigationMode.Back));
    this.syncHistory();
  }

  /** The hardware Back key. */
  backKeyPress(): void {
    if (MessageBox.isOpen) {
      // Back on a MessageBox dismisses it (result Cancel)
      MessageBox.dismiss();
      this.syncHistory();
      return;
    }
    const page = this.currentPage;
    if (!page) return;
    const before = this.navigationCount;
    const e = new CancelEventArgs(false);
    page.onBackKeyPress(e);
    // If the page already navigated inside the handler, the frame doesn't navigate again
    if (!e.cancel && this.navigationCount === before && this.canGoBack) this.goBack();
    // Back on the first page exits the app: nothing to do on the web (Escape) or the browser
    // leaves the page (browser back button).
    this.syncHistory();
  }

  // ---------------------------------------------------------------- browser history mapping

  /** Keeps one "guard" history entry while a sub page is shown, so browser Back = WP7 Back. */
  private syncHistory(): void {
    try {
      if (this.canGoBack && !this.guardArmed) {
        history.pushState({ continuumGuard: true }, '');
        this.guardArmed = true;
      } else if (!this.canGoBack && this.guardArmed) {
        this.guardArmed = false;
        this.ignoreNextPop = true;
        history.back();
      }
    } catch {
      /* history API unavailable (sandboxed iframe): Escape still works */
    }
  }

  private onPopState = (): void => {
    this.guardArmed = false;
    if (this.ignoreNextPop) {
      this.ignoreNextPop = false;
      return;
    }
    this.backKeyPress();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      this.backKeyPress();
    }
  };
}
