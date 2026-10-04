/**
 * System.Windows.MessageBox on the DOM, with the WP7 (dark theme) look: a full-width chrome
 * panel at the top of the screen, caption, message, "ok" / "cancel" buttons, the rest of the
 * screen dimmed. Silverlight's MessageBox.Show blocks the UI thread; here show() returns a
 * Promise and callers that relied on the blocking (GamePage pause) stop their loop themselves.
 */
import { createWpButton } from './Controls';

export enum MessageBoxButton {
  OK = 0,
  OKCancel = 1,
}

export enum MessageBoxResult {
  None = 0,
  OK = 1,
  Cancel = 2,
}

interface OpenBox {
  element: HTMLDivElement;
  close: (result: MessageBoxResult) => void;
}

export class MessageBox {
  private static host: HTMLElement | null = null;
  private static current: OpenBox | null = null;

  /** Element the message boxes are added to (the stage overlay). */
  static setHost(host: HTMLElement): void {
    MessageBox.host = host;
  }

  static get isOpen(): boolean {
    return MessageBox.current !== null;
  }

  /** Back key on an open message box: closes it with Cancel (None for an OK-only box). */
  static dismiss(): void {
    const c = MessageBox.current;
    if (!c) return;
    c.close(c.element.dataset.buttons === String(MessageBoxButton.OKCancel) ? MessageBoxResult.Cancel : MessageBoxResult.None);
  }

  static show(messageBoxText: string, caption = '', button: MessageBoxButton = MessageBoxButton.OK): Promise<MessageBoxResult> {
    const host = MessageBox.host ?? document.body;
    // only one at a time (Silverlight would block anyway)
    if (MessageBox.current) MessageBox.current.close(MessageBoxResult.None);

    return new Promise<MessageBoxResult>((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'wp-messagebox-overlay';
      overlay.dataset.buttons = String(button);

      const panel = document.createElement('div');
      panel.className = 'wp-messagebox';
      panel.setAttribute('role', 'alertdialog');

      if (caption !== '') {
        const cap = document.createElement('div');
        cap.className = 'wp-messagebox-caption';
        cap.textContent = caption;
        panel.append(cap);
      }
      const msg = document.createElement('div');
      msg.className = 'wp-messagebox-text';
      msg.textContent = messageBoxText;
      panel.append(msg);

      const buttons = document.createElement('div');
      buttons.className = 'wp-messagebox-buttons';
      const makeButton = (label: string, result: MessageBoxResult): HTMLButtonElement => {
        const b = createWpButton(label, 'wp-messagebox-button', () => close(result));
        buttons.append(b);
        return b;
      };
      makeButton('ok', MessageBoxResult.OK);
      if (button === MessageBoxButton.OKCancel) makeButton('cancel', MessageBoxResult.Cancel);
      else buttons.classList.add('single');
      panel.append(buttons);
      overlay.append(panel);

      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Enter') {
          e.preventDefault();
          close(MessageBoxResult.OK);
        }
      };

      const close = (result: MessageBoxResult): void => {
        if (MessageBox.current?.element !== overlay) return;
        MessageBox.current = null;
        window.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(result);
      };

      MessageBox.current = { element: overlay, close };
      window.addEventListener('keydown', onKey);
      host.append(overlay);
    });
  }
}
