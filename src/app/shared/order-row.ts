import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { DataService } from '../core/data.service';
import { Order } from '../core/models';
import { isReady, OrdersService } from '../core/orders.service';
import { ToastService } from '../core/toast.service';
import { IconComponent, MaterialsComponent, classColor } from './ui';

export const STATUS: Record<string, { icon: string; text: string }> = {
  pending: { icon: '⏳', text: 'En attente' },
  done: { icon: '✅', text: 'Faite' },
  refused: { icon: '❌', text: 'Refusée' },
  cancelled: { icon: '🚫', text: 'Annulée' },
};

// One order: item, quantity, who, status, notes; buyer side (cancel) or artisan side (done, refuse,
// reply). Its materials fold out.
@Component({
  selector: 'app-order',
  imports: [DatePipe, FormsModule, IconComponent, MaterialsComponent],
  template: `
    @let o = order();
    <article class="order tooltip" [class.closed]="o.status !== 'pending'">
      <div class="order-main">
        <app-icon [itemId]="o.item.itemId ?? 's' + o.item.spellId" [size]="36" [count]="o.qty" />
        <div class="order-text">
          <div>
            <strong class="q{{ data.quality(o.item.spellId) }}"
              >{{ o.qty }} × {{ o.item.name }}</strong
            >
            <span class="status s-{{ o.status }}">{{ status().icon }} {{ status().text }}</span>
            @if (o.status === 'done' && o.received) {
              <span class="status s-done" [title]="receivedTitle()">📬 Reçue</span>
            } @else if (ready()) {
              <span class="status s-pending">📦 {{ side() === 'buyer' ? 'À récupérer' : 'À remettre' }}</span>
            }
            @if (fresh()) {
              <span class="fresh" title="Commande passée il y a moins de 24 heures"
                >🔥 Nouvelle</span
              >
            }
            @if (o.archived) {
              <span
                class="muted small"
                title="Gardée dans ce navigateur : le bot l’avait oubliée (avant novembre 2026)"
                >archivée</span
              >
            }
          </div>
          <div class="small muted">
            @if (side() === 'buyer') {
              chez <span [style.color]="classColor(artisanClass())">{{ o.artisan.name }}</span> ·
              pour {{ o.buyer.name }}
            } @else {
              pour <span [style.color]="classColor(o.buyer.class)">{{ o.buyer.name }}</span> · ton
              perso {{ o.artisan.name }}
            }
            · {{ (o.status === 'pending' ? o.createdAt : (o.received?.at ?? o.updatedAt)) | date: 'd MMM, HH:mm' }}
          </div>
          @if (o.note) {
            <div class="small">✉️ « {{ o.note }} »</div>
          }
          @if (o.reply && !editing()) {
            <div class="small reply">
              💬 {{ side() === 'buyer' ? 'Artisan' : 'Ta réponse' }} : « {{ o.reply }} »
            </div>
          }
          @if (o.status === 'refused' && o.reason) {
            <div class="small refused">Raison : « {{ o.reason }} »</div>
          }
        </div>
        <div class="order-actions">
          <button type="button" class="btn ghost" (click)="open.set(!open())">
            {{ open() ? 'Masquer' : 'Composants' }}
          </button>
          @if (ready()) {
            <button
              type="button"
              class="btn gold"
              [disabled]="busy()"
              [title]="side() === 'buyer' ? 'Tu as l’objet : la commande est terminée' : 'Tu l’as donné à l’acheteur (courrier ou échange)'"
              (click)="markReceived(true)"
            >
              📬 {{ side() === 'buyer' ? 'J’ai reçu' : 'Remise' }}
            </button>
          }
          @if (o.status === 'pending' && !o.archived) {
            @if (side() === 'buyer') {
              <button type="button" class="btn danger" [disabled]="busy()" (click)="cancel()">
                Annuler
              </button>
            } @else {
              <button
                type="button"
                class="btn ghost"
                title="Répondre à l’acheteur"
                (click)="startReply()"
              >
                💬 Répondre
              </button>
              <button type="button" class="btn gold" [disabled]="busy()" (click)="settle('done')">
                Faite
              </button>
              <button
                type="button"
                class="btn danger"
                [disabled]="busy()"
                (click)="refusing.set(!refusing())"
              >
                Refuser
              </button>
            }
          }
        </div>
      </div>

      @if (editing()) {
        <form class="inline-form" (ngSubmit)="saveReply()">
          <input
            name="reply"
            maxlength="200"
            placeholder="Réponse à l’acheteur (ex. prête vendredi) ; vide : retirée"
            [(ngModel)]="replyText"
          />
          <button class="btn gold" [disabled]="busy()">Enregistrer</button>
          <button type="button" class="btn ghost" (click)="editing.set(false)">Fermer</button>
        </form>
      }
      @if (refusing()) {
        <form class="inline-form" (ngSubmit)="settle('refused')">
          <input
            name="reason"
            maxlength="200"
            placeholder="Raison (facultatif), montrée à l’acheteur"
            [(ngModel)]="reasonText"
          />
          <button class="btn danger" [disabled]="busy()">Refuser la commande</button>
        </form>
      }
      @if (open()) {
        <app-materials [list]="materials()" [compact]="true" />
      }
    </article>
  `,
})
export class OrderRowComponent {
  protected data = inject(DataService);
  private api = inject(ApiService);
  private orders = inject(OrdersService);
  private toast = inject(ToastService);
  protected readonly classColor = classColor;

  readonly order = input.required<Order>();
  readonly side = input<'buyer' | 'artisan'>('buyer');
  // artisan side: an order placed less than 24 hours ago, still to do
  readonly fresh = computed(
    () =>
      this.side() === 'artisan' &&
      this.order().status === 'pending' &&
      Date.now() - this.order().createdAt < 24 * 3600 * 1000,
  );

  readonly open = signal(false);
  readonly busy = signal(false);
  readonly editing = signal(false);
  readonly refusing = signal(false);
  replyText = '';
  reasonText = '';

  readonly status = computed(() => STATUS[this.order().status] ?? STATUS['pending']);
  readonly ready = computed(() => isReady(this.order()));
  readonly receivedTitle = computed(() => {
    const r = this.order().received;
    if (!r) return '';
    const who = r.by === 'auto' ? 'd’office, 14 jours après' : `confirmée par ${r.by === 'buyer' ? 'l’acheteur' : 'l’artisan'}${r.name ? ` (${r.name})` : ''}`;
    return `Reçue le ${new Date(r.at).toLocaleDateString('fr-FR')} : ${who}`;
  });
  readonly materials = computed(() =>
    this.data.materials([{ spell: this.order().item.spellId, qty: this.order().qty }]),
  );
  readonly artisanClass = computed(
    () => this.data.artisans().find((a) => a.key === this.order().artisan.key)?.class ?? null,
  );

  startReply() {
    this.replyText = this.order().reply ?? '';
    this.editing.set(true);
  }

  // remise confirmée, avec « ↩ Annuler » pendant 10 s
  async markReceived(received: boolean) {
    this.busy.set(true);
    try {
      this.orders.upsert(await this.api.received(this.order().id, received));
      if (received)
        this.toast.done(this.side() === 'buyer' ? '📬 Commande reçue : bien joué !' : '📬 Remise confirmée', () => void this.markReceived(false));
      else this.toast.ok('↩ Remise annulée : la commande est de nouveau à récupérer');
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.busy.set(false);
    }
  }

  async cancel() {
    await this.run(() => this.api.cancel(this.order().id), 'Commande annulée');
  }

  async settle(status: 'done' | 'refused') {
    const ok = await this.run(
      () => this.api.setStatus(this.order().id, status, this.reasonText),
      status === 'done'
        ? 'Commande faite : l’acheteur est prévenu'
        : 'Commande refusée : l’acheteur est prévenu',
    );
    if (ok) this.refusing.set(false);
  }

  async saveReply() {
    const ok = await this.run(
      () => this.api.reply(this.order().id, this.replyText),
      'Réponse enregistrée',
    );
    if (ok) this.editing.set(false);
  }

  private async run(call: () => Promise<Order>, done: string) {
    this.busy.set(true);
    try {
      this.orders.upsert(await call());
      this.toast.ok(done);
      return true;
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
