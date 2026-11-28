import { Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { ToastService } from '../core/toast.service';

// « Partager sur Discord » on a card of the guild pages, for the bot's admins only (the bot answers
// 404 to anyone else). The card is captured as it is on screen (html-to-image, loaded on the click), so
// the image always follows the site's CSS; the bot posts it in the chosen channel with the players of
// the card mentioned. card: see the bot's share.js (goal, ranking:net, player:u:123…). If the capture
// fails, the bot draws its own image.
@Component({
  selector: 'app-share',
  imports: [FormsModule],
  template: `
    @if (admin()) {
      <button
        type="button"
        class="btn ghost share-btn"
        title="Partager cette carte sur Discord"
        (click)="openDialog($event)"
      >
        📤 Partager
      </button>
    }
    @if (open()) {
      <div class="overlay" (click)="open.set(false)">
        <form class="tooltip dialog" (click)="$event.stopPropagation()" (ngSubmit)="send()">
          <h2>Partager sur Discord</h2>
          <p class="muted small">
            @if (textOnly()) {
              Le bot poste un message de remerciement dans le salon choisi : chaque participant y est
              mentionné avec ce qu'il a déposé.
            } @else {
              Le bot poste cette carte en image, telle qu'elle est à l'écran, dans le salon choisi,
              avec les joueurs de la carte mentionnés.
            }
          </p>
          @if (channels(); as list) {
            <label class="field">
              Salon
              <select name="channel" [(ngModel)]="channelId" required>
                @for (c of list; track c.id) {
                  <option [value]="c.id">
                    #{{ c.name }}{{ c.parent ? ' · ' + c.parent : '' }}
                  </option>
                }
              </select>
            </label>
          } @else {
            <p class="muted">Chargement des salons…</p>
          }
          <label class="field">
            Message (facultatif)
            <textarea name="text" rows="3" maxlength="500" [(ngModel)]="text"></textarea>
          </label>
          <div class="dialog-actions">
            <button type="button" class="btn ghost" (click)="open.set(false)">Annuler</button>
            <button class="btn gold" [disabled]="sending() || !channelId">
              {{ sending() ? (capturing() ? 'Capture…' : 'Envoi…') : 'Partager' }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
})
export class ShareButtonComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private session = inject(SessionService);
  private host = inject(ElementRef<HTMLElement>);
  readonly card = input.required<string>();
  // a text message from the bot (thanks:<key>): no picture captured
  readonly textOnly = input(false);
  readonly capturing = signal(false);

  readonly admin = computed(() => Boolean(this.session.me()?.admin));
  readonly open = signal(false);
  readonly sending = signal(false);
  readonly channels = signal<{ id: string; name: string; parent: string | null }[] | null>(null);
  channelId = '';
  text = '';

  async openDialog(event: Event) {
    event.stopPropagation(); // the card's row would open or close too
    this.open.set(true);
    if (this.channels()) return;
    try {
      const list = await this.api.shareChannels();
      this.channels.set(list);
      this.channelId ||= list.find((c) => /banque|bank/i.test(c.name))?.id ?? list[0]?.id ?? '';
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
      this.open.set(false);
    }
  }

  // The card around the button: a player's row (ranking detail) or the whole panel
  private target(): HTMLElement | null {
    const el = this.host.nativeElement as HTMLElement;
    return (el.closest('.rank-detail')?.closest('li') as HTMLElement | null) ?? (el.closest('.tooltip') as HTMLElement | null);
  }

  // html-to-image loses a whole background when one of its layers is an SVG written as text in a data
  // URL (the forge frames and ribbons): those are re-encoded in base64 for the capture, then put back.
  private inlineSvgBackgrounds(root: HTMLElement): () => void {
    const undo: (() => void)[] = [];
    for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg.includes('data:image/svg+xml,')) continue;
      const fixed = bg.replace(/url\("data:image\/svg\+xml,([^"]*)"\)/g, (_m, svg: string) => {
        const text = decodeURIComponent(svg.replace(/\\(.)/g, '$1'));
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        return `url("data:image/svg+xml;base64,${btoa(binary)}")`;
      });
      const before = el.style.backgroundImage;
      el.style.backgroundImage = fixed;
      undo.push(() => (el.style.backgroundImage = before));
    }
    return () => undo.forEach((f) => f());
  }

  private async capture(): Promise<string | null> {
    const node = this.target();
    if (!node) return null;
    this.capturing.set(true);
    const restore = this.inlineSvgBackgrounds(node);
    try {
      const { toPng } = await import('html-to-image');
      const options = {
        pixelRatio: 2,
        backgroundColor: '#1a0804',
        // the share buttons themselves stay out of the picture
        filter: (n: HTMLElement) => !n.classList?.contains('share-btn') && n.tagName !== 'APP-SHARE',
      };
      try {
        return await toPng(node, options);
      } catch {
        return await toPng(node, { ...options, skipFonts: true }); // fonts unreadable: system fonts
      }
    } catch {
      return null; // the bot draws its own image
    } finally {
      restore();
      this.capturing.set(false);
    }
  }

  async send() {
    this.sending.set(true);
    try {
      const image = this.textOnly() ? null : await this.capture();
      await this.api.share(this.card(), this.channelId, this.text, image);
      this.toast.ok(this.textOnly() ? '📤 Message posté sur Discord' : '📤 Carte partagée sur Discord');
      this.text = '';
      this.open.set(false);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.sending.set(false);
    }
  }
}
