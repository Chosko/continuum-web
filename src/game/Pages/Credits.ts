import { PhoneApplicationPage } from './Navigation';
import { createTitlePanel } from './TitlePanel';

/** Credits.xaml(.cs), class Page1. */
export class Page1 extends PhoneApplicationPage {
  constructor() {
    super('credits-page', true);
    const layoutRoot = document.createElement('div');
    layoutRoot.className = 'wp-layoutroot';
    layoutRoot.append(createTitlePanel('CONTINUUM', 'riconoscimenti'));

    const row1 = document.createElement('div');
    row1.className = 'wp-contentrow';
    const contentPanel = document.createElement('div');
    contentPanel.className = 'wp-contentpanel';

    const text = (top: number, height: number, lines: string[]): HTMLDivElement => {
      const t = document.createElement('div');
      t.className = 'wp-textblock credits-text';
      t.style.top = `${top}px`;
      t.style.height = `${height}px`;
      lines.forEach((l, i) => {
        if (i > 0) t.append(document.createElement('br'));
        t.append(l);
      });
      return t;
    };
    contentPanel.append(
      text(104, 33, ['Continuum v. 1.0.0.0']),
      text(171, 39, ['Sviluppato da XTeam']),
      text(252, 111, ['Programmatori:', 'Ruben Caliandro', 'Stefano Nada', 'Stefano Ordine']),
    );

    const link = document.createElement('a');
    link.className = 'wp-hyperlinkbutton credits-link';
    link.href = 'http://www.xteamdimension.com';
    link.textContent = 'xteamdimension.com';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      this.hyperlinkButton_Click_1();
    });
    contentPanel.append(link);

    row1.append(contentPanel);
    layoutRoot.append(row1);
    this.root.append(layoutRoot);
  }

  private hyperlinkButton_Click_1(): void {
    // WebBrowserTask { Uri = "http://www.xteamdimension.com" }.Show()
    window.open('http://www.xteamdimension.com', '_blank', 'noopener');
  }
}
