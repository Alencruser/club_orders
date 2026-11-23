import { Component, computed, inject, signal } from '@angular/core';
import { ApiService, errorText } from '../core/api.service';
import { AchievementDef, AchievementsSummary, TitleProgress } from '../core/models';
import { SessionService } from '../core/session.service';
import { AvatarComponent, MoneyComponent, duration, frDate, liveRefresh } from '../shared/guild-ui';

type Player = AchievementsSummary['players'][number];

const CATEGORIES: { key: AchievementDef['cat']; label: string }[] = [
  { key: 'bank', label: 'Banque' },
  { key: 'follow', label: 'Suivi' },
  { key: 'craft', label: 'Atelier' },
];
const ICONS: Record<string, string> = {
  'first-coin': '🪙',
  penny: '🟡',
  'big-fish': '🐟',
  loyal: '🤝',
  'streak-3': '🔥',
  'streak-7': '☄️',
  repentant: '🐀',
  patron: '👑',
  record: '🏆',
  'first-step': '👣',
  'long-road': '🛤️',
  'eternal-shadow': '🌑',
  'first-work': '🔨',
  craftsman: '⚒️',
  master: '🏅',
};
const RARITY: Record<string, string> = {
  common: 'Commun',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
};
const MONEY = new Set(['big-fish']);
const TIME = new Set(['long-road', 'eternal-shadow']);
const YES_NO = new Set(['penny', 'repentant']);

// Titles and trophies of the members: who has what, on a page of its own (the bank and follow pages
// stay short). Left: the members, most trophies first. Right: the chosen member's showcase.
@Component({
  selector: 'app-trophies',
  imports: [AvatarComponent, MoneyComponent],
  template: `
    <div class="page-head">
      <div>
        <h1 class="page-banner"><img src="/titles/hauts-faits.webp" alt="Hauts faits" /></h1>
        <p class="muted small">
          Titres et trophées des membres, gagnés à la banque, en suivi et à l’atelier
        </p>
      </div>
      <div class="tabs">
        <button type="button" [class.active]="tab() === 'showcase'" (click)="tab.set('showcase')">
          Vitrines
        </button>
        <button type="button" [class.active]="tab() === 'gallery'" (click)="tab.set('gallery')">
          Galerie de la semaine
        </button>
      </div>
    </div>
    @if (error(); as e) {
      <p class="refused">{{ e }}</p>
    }
    @if (data(); as d) {
      @if (tab() === 'gallery') {
        <p class="muted small">
          Chaque semaine, du lundi au dimanche, a ses vainqueurs : ils restent accrochés ici.
        </p>
        <div class="gallery">
          @for (s of d.seasons; track s.week) {
            <article class="tooltip season">
              <h3>Semaine du {{ date(s.start) }} au {{ date(s.end - 1) }}</h3>
              <div class="season-winners">
                <div class="season-winner">
                  <span class="season-icon">👑</span>
                  <h4>Mécène</h4>
                  @if (s.bank; as w) {
                    <strong>{{ w.name }}</strong>
                    <app-money [copper]="w.value" [sign]="true" />
                  } @else {
                    <span class="muted">Personne</span>
                  }
                </div>
                <div class="season-winner">
                  <span class="season-icon">🚶</span>
                  <h4>Champion du suivi</h4>
                  @if (s.follow; as w) {
                    <strong>{{ w.name }}</strong>
                    <span>{{ fmt(w.value) }}</span>
                  } @else {
                    <span class="muted">Personne</span>
                  }
                </div>
                <div class="season-winner">
                  <span class="season-icon">⚒️</span>
                  <h4>Artisan de la semaine</h4>
                  @if (s.craft; as w) {
                    <strong>{{ w.name }}</strong>
                    <span>{{ w.value }} commande(s)</span>
                  } @else {
                    <span class="muted">Personne</span>
                  }
                </div>
              </div>
            </article>
          } @empty {
            <div class="tooltip empty">
              <p>Aucune semaine terminée pour l’instant : la première se clôt dimanche soir.</p>
            </div>
          }
        </div>
      } @else {
        <div class="trophy-layout">
          <aside class="tooltip trophy-players">
            <h4>Membres</h4>
            @for (p of d.players; track p.userId) {
              <button
                type="button"
                class="trophy-player"
                [class.active]="selected()?.userId === p.userId"
                (click)="chosen.set(p.userId)"
              >
                <app-avatar [src]="p.avatar" [name]="p.name" />
                <span class="grow">
                  {{ p.name }}
                  @if (p.titles.bank.current; as t) {
                    <span class="rank-title">{{ t.name }}</span>
                  }
                </span>
                <span class="trophy-count">{{ unlocked(p) }}/{{ d.definitions.length }}</span>
              </button>
            }
          </aside>

          @if (selected(); as p) {
            <section class="trophy-showcase">
              <div class="tooltip showcase-head">
                <app-avatar [src]="p.avatar" [name]="p.name" [size]="56" />
                <div class="grow">
                  <h2>{{ p.name }}</h2>
                  <p class="muted small">
                    {{ unlocked(p) }} trophée(s) sur {{ d.definitions.length }}
                  </p>
                </div>
                <div class="title-plaques">
                  <div class="title-plaque">
                    <h4>Banque</h4>
                    <strong>{{ p.titles.bank.current?.name ?? 'Sans titre' }}</strong>
                    @if (p.titles.bank.next; as next) {
                      <span class="title-bar"
                        ><span [style.width.%]="titleShare(p.titles.bank)"></span
                      ></span>
                      <span class="muted small"
                        >{{ next.name }} à <app-money [copper]="next.min"
                      /></span>
                    }
                  </div>
                  <div class="title-plaque">
                    <h4>Suivi</h4>
                    <strong>{{ p.titles.follow.current?.name ?? 'Sans titre' }}</strong>
                    @if (p.titles.follow.next; as next) {
                      <span class="title-bar"
                        ><span [style.width.%]="titleShare(p.titles.follow)"></span
                      ></span>
                      <span class="muted small">{{ next.name }} à {{ fmt(next.min) }}</span>
                    }
                  </div>
                  <div class="title-plaque">
                    <h4>Atelier</h4>
                    <strong>{{ p.titles.craft.current?.name ?? 'Sans titre' }}</strong>
                    @if (p.titles.craft.next; as next) {
                      <span class="title-bar"
                        ><span [style.width.%]="titleShare(p.titles.craft)"></span
                      ></span>
                      <span class="muted small">{{ next.name }} à {{ next.min }} commande(s)</span>
                    }
                  </div>
                </div>
              </div>

              @for (c of categories; track c.key) {
                <h3 class="trophy-cat">{{ c.label }}</h3>
                <div class="trophy-grid">
                  @for (a of defsOf(c.key); track a.id) {
                    @let got = progress(p, a.id);
                    <article
                      class="trophy r-{{ a.rarity }}"
                      [class.locked]="!got?.done"
                      [attr.title]="a.desc"
                    >
                      <span class="trophy-icon">{{ icon(a) }}</span>
                      <div class="trophy-text">
                        <strong>{{ a.name }}</strong>
                        <span class="trophy-rarity">{{ rarity(a.rarity) }}</span>
                        <span class="small">{{ a.desc }}</span>
                        @if (got?.done) {
                          <span class="small trophy-date">{{
                            got?.unlockedAt
                              ? 'Débloqué le ' + date(got?.unlockedAt ?? 0)
                              : 'Débloqué'
                          }}</span>
                        } @else if (got && unit(a) !== 'bool') {
                          <span class="title-bar"
                            ><span [style.width.%]="share(got.value, got.target)"></span
                          ></span>
                          <span class="small muted">
                            @if (unit(a) === 'copper') {
                              <app-money [copper]="got.value" /> /
                              <app-money [copper]="got.target" />
                            } @else if (unit(a) === 'seconds') {
                              {{ fmt(got.value) }} / {{ fmt(got.target) }}
                            } @else {
                              {{ got.value }} / {{ got.target }}
                            }
                          </span>
                        }
                      </div>
                    </article>
                  }
                </div>
              }
            </section>
          }
        </div>
      }
    } @else if (!error()) {
      <p class="center muted">Ouverture de la salle des trophées…</p>
    }
  `,
})
export class TrophiesPage {
  private api = inject(ApiService);
  private session = inject(SessionService);

  readonly data = signal<AchievementsSummary | null>(null);
  readonly error = signal<string | null>(null);
  readonly chosen = signal<string | null>(null);
  readonly tab = signal<'showcase' | 'gallery'>('showcase');
  readonly categories = CATEGORIES;
  readonly date = frDate;
  readonly fmt = duration;

  // the chosen member, else me, else the first one
  readonly selected = computed<Player | null>(() => {
    const players = this.data()?.players ?? [];
    const id = this.chosen() ?? this.session.me()?.user?.id;
    return players.find((p) => p.userId === id) ?? players[0] ?? null;
  });

  constructor() {
    this.load();
    liveRefresh('achievements', () => this.load());
  }

  load() {
    this.api
      .achievements()
      .then((d) => {
        this.data.set(d);
        this.error.set(null);
      })
      .catch((err) => this.error.set(`Hauts faits indisponibles : ${errorText(err)}`));
  }

  defsOf(cat: AchievementDef['cat']) {
    return (this.data()?.definitions ?? []).filter((a) => a.cat === cat);
  }
  progress(p: Player, id: string) {
    return p.achievements.find((a) => a.id === id) ?? null;
  }
  unlocked(p: Player) {
    return p.achievements.filter((a) => a.done).length;
  }
  share(value: number, target: number) {
    return Math.min(100, (100 * value) / (target || 1));
  }
  titleShare(t: TitleProgress) {
    if (!t.next) return 100;
    const from = t.current?.min ?? 0;
    return Math.min(100, (100 * (t.value - from)) / (t.next.min - from || 1));
  }
  icon(a: AchievementDef) {
    return a.icon || ICONS[a.id] || '🏆';
  }
  rarity(r: string) {
    return RARITY[r] ?? r;
  }
  // sent by the bot (tiers created on /admin); the lists below for an older bot
  unit(a: AchievementDef) {
    if (a.unit) return a.unit;
    return MONEY.has(a.id) ? 'copper' : TIME.has(a.id) ? 'seconds' : YES_NO.has(a.id) ? 'bool' : 'count';
  }
}
