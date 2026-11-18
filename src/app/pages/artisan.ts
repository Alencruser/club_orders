import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { DataService } from '../core/data.service';
import { Order } from '../core/models';
import { OrdersService } from '../core/orders.service';
import { SessionService } from '../core/session.service';
import { ToastService } from '../core/toast.service';
import { OrderRowComponent } from '../shared/order-row';
import { MaterialsComponent, classColor } from '../shared/ui';

// Artisan side: orders received by my characters, grouped by buyer, with the materials per buyer and
// in total; my artisan note; the orders already handled.
@Component({
  selector: 'app-artisan',
  imports: [FormsModule, OrderRowComponent, MaterialsComponent],
  template: `
    <div class="page-head">
      <h1>Mon atelier</h1>
      <div class="tabs">
        <button type="button" [class.active]="tab() === 'current'" (click)="tab.set('current')">
          À faire ({{ orders.receivedPending().length }})
        </button>
        <button type="button" [class.active]="tab() === 'past'" (click)="tab.set('past')">
          Traitées ({{ orders.receivedPast().length }})
        </button>
      </div>
    </div>

    <form class="tooltip note-box" (ngSubmit)="saveNote()">
      <label class="field grow">
        <span>📝 Ma note d’artisan, montrée à ceux qui te commandent (tous tes persos)</span>
        <input
          name="note"
          maxlength="200"
          placeholder="Ex. : envoyez les composants par courrier, je fabrique le soir"
          [(ngModel)]="noteText"
        />
      </label>
      <button class="btn gold" [disabled]="savingNote()">Enregistrer</button>
    </form>

    @if (orders.error(); as error) {
      <p class="refused">{{ error }}</p>
    }
    @if (tab() === 'current') {
      @if (groups().length) {
        <div class="two-cols">
          <section>
            @for (g of groups(); track g.key) {
              <div class="buyer-group">
                <h2>
                  <span [style.color]="classColor(g.cls)">{{ g.name }}</span>
                  <span class="muted small">{{ g.orders.length }} commande(s)</span>
                </h2>
                @for (o of g.orders; track o.id) {
                  <app-order [order]="o" side="artisan" />
                }
                <details class="tooltip">
                  <summary>Composants pour {{ g.name }}</summary>
                  <app-materials [list]="g.materials" [compact]="true" />
                </details>
              </div>
            }
          </section>
          <aside class="tooltip">
            <h2>Total des composants</h2>
            <p class="muted small">Toutes les commandes à faire, tous acheteurs confondus.</p>
            <app-materials [list]="total()" />
          </aside>
        </div>
      } @else if (orders.loaded()) {
        <div class="tooltip empty"><p>Aucune commande à faire. 🎉</p></div>
      }
    } @else {
      @for (o of orders.receivedPast(); track o.id) {
        <app-order [order]="o" side="artisan" />
      } @empty {
        <p class="muted">Aucune commande traitée ces 30 derniers jours.</p>
      }
    }
  `,
})
export class ArtisanPage {
  protected orders = inject(OrdersService);
  private data = inject(DataService);
  private session = inject(SessionService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  protected readonly classColor = classColor;

  readonly tab = signal<'current' | 'past'>('current');
  readonly savingNote = signal(false);
  noteText = '';

  readonly groups = computed(() => {
    const map = new Map<
      string,
      { key: string; name: string; cls: string | null; orders: Order[] }
    >();
    for (const o of this.orders.receivedPending()) {
      const key = o.buyer.userId;
      const g = map.get(key) ?? { key, name: o.buyer.name, cls: o.buyer.class, orders: [] };
      g.orders.push(o);
      map.set(key, g);
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        orders: g.orders.sort((a, b) => a.createdAt - b.createdAt),
        materials: this.data.materials(
          g.orders.map((o) => ({ spell: o.item.spellId, qty: o.qty })),
        ),
      }))
      .sort((a, b) => a.orders[0].createdAt - b.orders[0].createdAt);
  });
  readonly total = computed(() =>
    this.data.materials(
      this.orders.receivedPending().map((o) => ({ spell: o.item.spellId, qty: o.qty })),
    ),
  );

  constructor() {
    effect(() => {
      if (this.session.userId()) this.noteText = untracked(this.session.me)?.note ?? '';
    });
  }

  async saveNote() {
    this.savingNote.set(true);
    try {
      const note = await this.api.setNote(this.noteText);
      this.session.me.update((me) => (me ? { ...me, note } : me));
      this.toast.ok(note ? 'Note enregistrée' : 'Note retirée');
      this.data.refreshArtisans().catch(() => {});
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.savingNote.set(false);
    }
  }
}
