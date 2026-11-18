import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../core/data.service';
import { OrdersService } from '../core/orders.service';
import { OrderRowComponent } from '../shared/order-row';
import { MaterialsComponent } from '../shared/ui';

// Orders placed: current ones (cancel) with the total of their materials, and past ones.
@Component({
  selector: 'app-my-orders',
  imports: [RouterLink, OrderRowComponent, MaterialsComponent],
  template: `
    <div class="page-head">
      <h1>Mes commandes</h1>
      <div class="tabs">
        <button type="button" [class.active]="tab() === 'current'" (click)="tab.set('current')">
          En cours ({{ orders.placedPending().length }})
        </button>
        <button type="button" [class.active]="tab() === 'past'" (click)="tab.set('past')">
          Historique ({{ orders.placedPast().length }})
        </button>
      </div>
    </div>
    @if (orders.error(); as error) {
      <p class="refused">{{ error }}</p>
    }
    @if (tab() === 'current') {
      @if (orders.placedPending().length) {
        <div class="two-cols">
          <section>
            @for (o of orders.placedPending(); track o.id) {
              <app-order [order]="o" side="buyer" />
            }
          </section>
          <aside class="tooltip">
            <h2>Composants de tes commandes</h2>
            <p class="muted small">Total de toutes tes commandes en cours.</p>
            <app-materials [list]="materials()" />
          </aside>
        </div>
      } @else if (orders.loaded()) {
        <div class="tooltip empty">
          <p>Aucune commande en cours.</p>
          <a routerLink="/" class="btn gold">Ouvrir le grimoire</a>
        </div>
      }
    } @else {
      @for (o of orders.placedPast(); track o.id) {
        <app-order [order]="o" side="buyer" />
      } @empty {
        <p class="muted">Pas encore d’historique.</p>
      }
      <p class="muted small">
        Le bot oublie les commandes terminées après 30 jours ; ce navigateur les garde (« archivée
        »).
      </p>
    }
  `,
})
export class MyOrdersPage {
  protected orders = inject(OrdersService);
  private data = inject(DataService);

  readonly tab = signal<'current' | 'past'>('current');
  readonly materials = computed(() =>
    this.data.materials(
      this.orders.placedPending().map((o) => ({ spell: o.item.spellId, qty: o.qty })),
    ),
  );
}
