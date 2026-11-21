import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { ToastService } from '../core/toast.service';

// « Partager sur Discord » on a card of the guild pages, for the bot's admins only (the bot answers
// 404 to anyone else). The bot draws the card as an image and posts it in the chosen channel, with the
// players of the card mentioned. card: see the bot's share.js (goal, ranking:net, player:u:123…).
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
            Le bot poste cette carte en image dans le salon choisi, avec les joueurs de la carte
            mentionnés.
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
              {{ sending() ? 'Envoi…' : 'Partager' }}
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
  readonly card = input.required<string>();

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

  async send() {
    this.sending.set(true);
    try {
      await this.api.share(this.card(), this.channelId, this.text);
      this.toast.ok('📤 Carte partagée sur Discord');
      this.text = '';
      this.open.set(false);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.sending.set(false);
    }
  }
}
