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
        <h1>Hauts faits</h1>
        <p class="muted small">
          Titres et trophées des membres, gagnés à la banque, en suivi et à l’atelier
        </p>
      </div>
    </div>
    @if (error(); as e) {
      <p class="refused">{{ e }}</p>
    }
    @if (data(); as d) {
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
                    <span class="trophy-icon">{{ icon(a.id) }}</span>
                    <div class="trophy-text">
                      <strong>{{ a.name }}</strong>
                      <span class="trophy-rarity">{{ rarity(a.rarity) }}</span>
                      <span class="small">{{ a.desc }}</span>
                      @if (got?.done) {
                        <span class="small trophy-date">{{
                          got?.unlockedAt ? 'Débloqué le ' + date(got?.unlockedAt ?? 0) : 'Débloqué'
                        }}</span>
                      } @else if (got && !yesNo(a.id)) {
                        <span class="title-bar"
                          ><span [style.width.%]="share(got.value, got.target)"></span
                        ></span>
                        <span class="small muted">
                          @if (money(a.id)) {
                            <app-money [copper]="got.value" /> / <app-money [copper]="got.target" />
                          } @else if (time(a.id)) {
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
  icon(id: string) {
    return ICONS[id] ?? '🏆';
  }
  rarity(r: string) {
    return RARITY[r] ?? r;
  }
  money(id: string) {
    return MONEY.has(id);
  }
  time(id: string) {
    return TIME.has(id);
  }
  yesNo(id: string) {
    return YES_NO.has(id);
  }
}
