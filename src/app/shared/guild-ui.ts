import { Component, DestroyRef, computed, inject, input } from '@angular/core';

// Shared pieces of the guild pages (bank, follow): coins, avatars, durations, live refresh.

// Copper as gold / silver / copper coins: « 9 ● 63 ● 2 ● » (zeros left out)
@Component({
  selector: 'app-money',
  template: `<span class="money" [class.neg]="copper() < 0" [class.big]="big()">
    @for (p of parts(); track $index) {
      <span class="coin-amount"
        >{{ p.text }}<i class="coin {{ p.kind }}" [attr.title]="p.title"></i
      ></span>
    }
  </span>`,
})
export class MoneyComponent {
  readonly copper = input(0);
  readonly sign = input(false);
  readonly big = input(false);

  readonly parts = computed(() => {
    const c = this.copper();
    const abs = Math.abs(c);
    const out: { text: string; kind: string; title: string }[] = [];
    if (abs >= 10000)
      out.push({ text: String(Math.floor(abs / 10000)), kind: 'gold', title: 'po' });
    if (abs % 10000 >= 100)
      out.push({ text: String(Math.floor((abs % 10000) / 100)), kind: 'silver', title: 'a' });
    if (abs % 100 || !out.length) out.push({ text: String(abs % 100), kind: 'copper', title: 'c' });
    if (this.sign() && c !== 0) out[0].text = (c > 0 ? '+' : '−') + out[0].text;
    return out;
  });
}

// Discord avatar, or the first letter on a dark coin
@Component({
  selector: 'app-avatar',
  template: `
    @if (src()) {
      <img
        class="avatar"
        [src]="src()"
        alt=""
        [style.width.px]="size()"
        [style.height.px]="size()"
      />
    } @else {
      <span class="avatar letter" [style.width.px]="size()" [style.height.px]="size()">{{
        letter()
      }}</span>
    }
  `,
})
export class AvatarComponent {
  readonly src = input<string | null | undefined>(null);
  readonly name = input('');
  readonly size = input(28);
  readonly letter = computed(() => (this.name() || '?').charAt(0).toUpperCase());
}

// 3725 -> « 1 h 02 min », 754 -> « 12 min », 45 -> « 45 s »
export function duration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m) return `${m} min`;
  return `${seconds} s`;
}

export const frDate = (at: number) =>
  new Date(at * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
export const frDateTime = (at: number) =>
  new Date(at * 1000).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

// Reloads a page's data when the bot signals a change (/api/events, event name), on coming back to the
// tab, and every 5 minutes as a fallback. Call from a component's constructor.
export function liveRefresh(event: string, load: () => void) {
  const stream = typeof EventSource === 'function' ? new EventSource('/api/events') : null;
  stream?.addEventListener(event, load);
  const onVisible = () => {
    if (document.visibilityState === 'visible') load();
  };
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(onVisible, 5 * 60_000);
  inject(DestroyRef).onDestroy(() => {
    stream?.close();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  });
}
