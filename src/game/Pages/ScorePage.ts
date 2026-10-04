import { Score } from '../Scores/Score';
import { PhoneApplicationPage, type NavigationEventArgs } from './Navigation';
import { MessageBox } from './MessageBox';
import { createTitlePanel } from './TitlePanel';

/**
 * ScorePage.xaml(.cs). The standard page template's placeholders ("APPLICAZIONE",
 * "nome pagina") shipped untranslated and are kept verbatim.
 */
export class ScorePage extends PhoneApplicationPage {
  private readonly stackPanel1: HTMLDivElement;

  constructor() {
    super('score-page', true);
    const layoutRoot = document.createElement('div');
    layoutRoot.className = 'wp-layoutroot';
    layoutRoot.append(createTitlePanel('APPLICAZIONE', 'nome pagina'));

    const row1 = document.createElement('div');
    row1.className = 'wp-contentrow';
    this.stackPanel1 = document.createElement('div');
    this.stackPanel1.className = 'score-stack';
    row1.append(this.stackPanel1);
    layoutRoot.append(row1);
    this.root.append(layoutRoot);
  }

  override onNavigatedTo(e: NavigationEventArgs): void {
    if (Score.scoresFileExists()) {
      const scores = Score.readScores() ?? [];
      for (const x of scores) {
        const temp = document.createElement('div');
        temp.className = 'wp-textblock';
        temp.textContent = x.toString();
        this.stackPanel1.append(temp);
      }
    } else {
      // Deviation D2: neutral replacement of the original placeholder message
      void MessageBox.show('No scores yet. Play a game to set one!');
    }
    super.onNavigatedTo(e);
  }
}
