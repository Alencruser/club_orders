import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Character, Me } from './models';
import { readStore, writeStore } from './storage';

export const charKey = (c: { name: string; realm: string }) =>
  `${c.name}-${c.realm}`.trim().toLowerCase();

// Who is logged in (Discord), and the character orders are placed for (remembered in this browser).
@Injectable({ providedIn: 'root' })
export class SessionService {
  private api = inject(ApiService);

  readonly status = signal<'loading' | 'in' | 'out' | 'error'>('loading');
  readonly me = signal<Me | null>(null);
  private readonly chosen = signal<string | null>(readStore('co.buyer', null));
  // Name typed when the bot knows none of this member's characters
  readonly typedName = signal<string>(readStore('co.buyerName', ''));

  readonly userId = computed(() => this.me()?.user.id ?? null);
  readonly characters = computed(() => this.me()?.characters ?? []);
  readonly buyer = computed<Character | null>(() => {
    const list = this.characters();
    return list.find((c) => charKey(c) === this.chosen()) ?? list[0] ?? null;
  });

  async load() {
    this.status.set('loading');
    try {
      this.me.set(await this.api.me());
      this.status.set('in');
    } catch (err) {
      this.me.set(null);
      this.status.set(err instanceof HttpErrorResponse && err.status === 401 ? 'out' : 'error');
    }
  }

  chooseBuyer(key: string) {
    this.chosen.set(key);
    writeStore('co.buyer', key);
  }

  setTypedName(name: string) {
    this.typedName.set(name);
    writeStore('co.buyerName', name);
  }

  // Buyer sent with an order: the chosen character, or the typed name (« Nom » or « Nom-Royaume »)
  buyerForOrder(): { name: string; realm: string } | null {
    const c = this.buyer();
    if (c) return { name: c.name, realm: c.realm };
    const [name, ...realm] = this.typedName().trim().split('-');
    return name ? { name: name.trim(), realm: realm.join('-').trim() } : null;
  }

  async logout() {
    await this.api.logout().catch(() => {});
    this.me.set(null);
    this.status.set('out');
  }
}
