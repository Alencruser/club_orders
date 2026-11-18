import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { ApiService } from './api.service';
import { DataService } from './data.service';
import { Order } from './models';
import { SessionService } from './session.service';
import { readStore, writeStore } from './storage';

const FALLBACK_MS = 5 * 60_000;

// Called once by the app (constructor): loads orders and catalog once logged in, then keeps them live.
// The bot signals every change on /api/events (an order placed, done, cancelled… from the site, Discord
// or the game; an artisan's professions or note): the orders or the artisans are asked again at once.
// The browser reconnects by itself if the stream drops; a check every 5 minutes and on coming back to
// the tab covers what a dropped stream may have missed.
export function refreshOrders(session: SessionService, orders: OrdersService, data: DataService) {
  let stream: EventSource | null = null;
  const refresh = () => {
    const id = session.userId();
    if (id) orders.refresh(id);
  };
  effect(() => {
    const id = session.userId();
    stream?.close();
    stream = null;
    if (!id) return;
    untracked(() => {
      orders.refresh(id);
      if (!data.catalog() && !data.loading()) data.load();
    });
    if (typeof EventSource === 'function') {
      stream = new EventSource('/api/events');
      stream.addEventListener('orders', refresh);
      stream.addEventListener('artisans', () => data.refreshArtisans().catch(() => {}));
    }
  });
  const onVisible = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') refresh();
  }, FALLBACK_MS);
  inject(DestroyRef).onDestroy(() => {
    stream?.close();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  });
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
