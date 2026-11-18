import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { ApiService } from './api.service';
import { DataService } from './data.service';
import { Order } from './models';
import { SessionService } from './session.service';
import { readStore, writeStore } from './storage';

// For a page showing orders (call from its constructor): loads them once logged in, then every minute
// while the page is open and the tab visible; loads the catalog too (names, materials).
export function refreshOrders(session: SessionService, orders: OrdersService, data: DataService) {
  effect(() => {
    const id = session.userId();
    if (!id) return;
    untracked(() => {
      orders.refresh(id);
      if (!data.catalog() && !data.loading()) data.load();
    });
  });
  const timer = setInterval(() => {
    const id = session.userId();
    if (id && document.visibilityState === 'visible') orders.refresh(id);
  }, 60_000);
  inject(DestroyRef).onDestroy(() => clearInterval(timer));
}

const HISTORY_MAX = 300;

// Orders placed and received. The bot forgets finished orders after 30 days: the ones placed are kept
// in this browser (history), marked "archived" once the bot no longer has them.
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private api = inject(ApiService);

  readonly placed = signal<Order[]>([]);
  readonly received = signal<Order[]>([]);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  private userId: string | null = null;

  readonly placedPending = computed(() => this.placed().filter((o) => o.status === 'pending'));
  readonly placedPast = computed(() => this.placed().filter((o) => o.status !== 'pending'));
  readonly receivedPending = computed(() => this.received().filter((o) => o.status === 'pending'));
  readonly receivedPast = computed(() => this.received().filter((o) => o.status !== 'pending'));

  async refresh(userId: string) {
    this.userId = userId;
    try {
      const { placed, received } = await this.api.orders();
      const history = readStore<Record<string, Order>>(this.historyKey(), {});
      const ids = new Set(placed.map((o) => o.id));
      const archived = Object.values(history)
        .filter((o) => !ids.has(o.id) && o.status !== 'pending')
        .map((o) => ({ ...o, archived: true }));
      this.placed.set([...placed, ...archived].sort((a, b) => b.createdAt - a.createdAt));
      this.received.set(received);
      this.saveHistory();
      this.error.set(null);
    } catch {
      this.error.set('Commandes indisponibles : le bot ne répond pas.');
    } finally {
      this.loaded.set(true);
    }
  }

  // An order changed (placed, cancelled, done…): replaced in the lists at once
  upsert(order: Order) {
    const put = (list: Order[]) => {
      const i = list.findIndex((o) => o.id === order.id);
      return i < 0 ? [order, ...list] : list.map((o) => (o.id === order.id ? order : o));
    };
    if (order.buyer.userId === this.userId) this.placed.update(put);
    if (this.received().some((o) => o.id === order.id)) this.received.update(put);
    this.saveHistory();
  }

  private historyKey() {
    return `co.history.${this.userId}`;
  }

  private saveHistory() {
    if (!this.userId) return;
    const list = this.placed().slice(0, HISTORY_MAX);
    writeStore(this.historyKey(), Object.fromEntries(list.map(({ archived, ...o }) => [o.id, o])));
  }
}
