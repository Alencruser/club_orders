import { Injectable, computed, signal } from '@angular/core';
import { readStore, writeStore } from './storage';

export interface CartLine {
  spell: string;
  artisan: string; // artisan key "name-realm"
  qty: number;
  note: string;
}

// Cart kept in this browser until the orders are sent.
@Injectable({ providedIn: 'root' })
export class CartService {
  readonly lines = signal<CartLine[]>(readStore('co.cart', []));
  readonly count = computed(() => this.lines().reduce((n, l) => n + l.qty, 0));

  add(spell: string, artisan: string, qty: number) {
    this.save(
      this.lines().some((l) => l.spell === spell && l.artisan === artisan)
        ? this.lines().map((l) =>
            l.spell === spell && l.artisan === artisan
              ? { ...l, qty: Math.min(99, l.qty + qty) }
              : l,
          )
        : [...this.lines(), { spell, artisan, qty, note: '' }],
    );
  }

  update(index: number, change: Partial<CartLine>) {
    this.save(this.lines().map((l, i) => (i === index ? { ...l, ...change } : l)));
  }

  remove(index: number) {
    this.save(this.lines().filter((_, i) => i !== index));
  }

  removeLines(lines: CartLine[]) {
    this.save(this.lines().filter((l) => !lines.includes(l)));
  }

  private save(lines: CartLine[]) {
    this.lines.set(lines);
    writeStore('co.cart', lines);
  }
}
