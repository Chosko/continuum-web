/**
 * Standard WP7 page template TitlePanel (StackPanel Margin 12,17,0,28):
 * ApplicationTitle (PhoneTextNormalStyle) + PageTitle (PhoneTextTitle1Style, Margin 9,-7,0,0).
 */
export function createTitlePanel(applicationTitle: string, pageTitle: string): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'wp-titlepanel';
  const app = document.createElement('div');
  app.className = 'wp-text-normal wp-apptitle';
  app.textContent = applicationTitle;
  const title = document.createElement('div');
  title.className = 'wp-text-title1 wp-pagetitle';
  title.textContent = pageTitle;
  panel.append(app, title);
  return panel;
}
