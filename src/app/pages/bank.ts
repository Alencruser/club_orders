import { Component, computed, inject, signal } from '@angular/core';
import { ApiService, errorText } from '../core/api.service';
import { BankMember, BankSummary } from '../core/models';
import { ShareButtonComponent } from '../shared/share-button';
import {
  AvatarComponent,
  MoneyComponent,
  frDate,
  frDateTime,
  liveRefresh,
} from '../shared/guild-ui';

type Ranking = 'season' | 'net' | 'dep' | 'maxDep' | 'maxWd' | 'streak' | 'deposits' | 'minDep';

const RANKINGS: { key: Ranking; label: string; value: (m: BankMember) => number | null }[] = [
  { key: 'season', label: 'Cette semaine', value: (m) => m.seasonNet || null },
  { key: 'net', label: 'Solde net', value: (m) => m.net },
  { key: 'dep', label: 'Total déposé', value: (m) => m.dep || null },
  { key: 'maxDep', label: 'Plus gros dépôt', value: (m) => m.maxDep?.copper ?? null },
  { key: 'maxWd', label: 'Plus gros retrait', value: (m) => m.maxWd?.copper ?? null },
  { key: 'streak', label: 'Série', value: (m) => m.streak || null },
  { key: 'deposits', label: 'Fidèle', value: (m) => m.deposits || null },
  // smallest deposit first
  { key: 'minDep', label: 'Pièce jaune', value: (m) => (m.minDep ? -m.minDep.copper : null) },
];

// Guild bank: goal, net balances (all characters of a member together), records, patron and rat of
// the month, who never gave, deposits per day, latest transactions. Read only, live from the bot.
@Component({
  selector: 'app-bank',
  imports: [MoneyComponent, AvatarComponent, ShareButtonComponent],
  template: `
    <div class="page-head">
      <div>
        <h1>Banque de guilde</h1>
        <p class="muted small">
          Dépôts et retraits d’argent, tous les persos d’un membre réunis · réparations non comptées
        </p>
      </div>
      @if (data(); as d) {
        @if (d.last) {
          <p class="small cartel">
            Dernière lecture le {{ dateTime(d.last.at) }} par {{ d.last.name }}
            @if (d.since) {
              · suivi depuis le {{ date(d.since) }}
            }
          </p>
        }
      }
    </div>

    @if (error(); as e) {
      <p class="refused">{{ e }}</p>
    }
    @if (data(); as d) {
      @if (d.money !== null) {
        <section class="tooltip goal">
          <div class="goal-head">
            <div>
              <h2>Objectif : onglet de banque <app-share card="goal" /></h2>
              <p class="muted small">
                @if (left() > 0) {
                  Encore <app-money [copper]="left()" /> pour atteindre
                  <app-money [copper]="d.goal" />
                } @else {
                  Objectif atteint, bravo à tous !
                }
              </p>
            </div>
            <app-money [copper]="d.money" [big]="true" />
          </div>
          <div
            class="goal-bar"
            role="progressbar"
            [attr.aria-valuenow]="percent()"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div class="goal-fill" [style.width.%]="shown() ? percent() : 0"></div>
            @for (t of ticks; track t) {
              <span class="goal-tick" [style.left.%]="t"></span>
            }
            @for (ms of d.milestones; track ms.percent) {
              @if (ms.percent < 100) {
                <span
                  class="goal-chest"
                  [class.open]="ms.at"
                  [style.left.%]="ms.percent"
                  [attr.title]="ms.percent + ' % ' + (ms.at ? 'atteint' : 'à atteindre')"
                  >{{ ms.at ? '💰' : '🔒' }}</span
                >
              }
            }
            <span class="goal-percent">{{ percent() }} %</span>
          </div>
        </section>
      }

      <div class="bank-grid">
        <section class="tooltip">
          <div class="section-head">
            <h2>Classement <app-share [card]="'ranking:' + ranking()" /></h2>
            <div class="tabs small-tabs">
              @for (r of rankings; track r.key) {
                <button
                  type="button"
                  [class.active]="ranking() === r.key"
                  (click)="ranking.set(r.key)"
                >
                  {{ r.label }}
                </button>
              }
            </div>
          </div>
          <ol class="ranking">
            @for (m of ranked(); track m.id; let i = $index) {
              <li [class.open]="open() === m.id" [class.unlinked]="!m.linked">
                <button type="button" class="rank-row" (click)="toggle(m.id)">
                  <span class="medal m{{ i }}"
                    >{{ i + 1 }}
                    @if (ranking() === 'net' && m.move) {
                      <i class="move" [class.down]="m.move < 0"
                        >{{ m.move > 0 ? '▲' : '▼' }}{{ m.move > 0 ? m.move : -m.move }}</i
                      >
                    }
                  </span>
                  <app-avatar [src]="m.avatar" [name]="m.name" />
                  <span class="rank-name">
                    {{ m.name }}
                    @if (m.title) {
                      <span class="rank-title">{{ m.title }}</span>
                    }
                    @if (!m.linked) {
                      <span class="muted small">sans battletag</span>
                    }
                  </span>
                  <span class="rank-gauge"
                    ><span [style.width.%]="gauge(m)" [class.neg]="(value(m) ?? 0) < 0"></span
                  ></span>
                  <span class="rank-value">
                    @switch (ranking()) {
                      @case ('streak') {
                        {{ m.streak }} j
                        <span class="muted small">(record {{ m.bestStreak }})</span>
                      }
                      @case ('deposits') {
                        {{ m.deposits }} dépôt{{ m.deposits > 1 ? 's' : '' }}
                      }
                      @case ('season') {
                        <app-money [copper]="m.seasonNet" [sign]="true" />
                      }
                      @case ('dep') {
                        <app-money [copper]="m.dep" />
                      }
                      @case ('maxDep') {
                        <app-money [copper]="m.maxDep?.copper ?? 0" />
                      }
                      @case ('maxWd') {
                        <app-money [copper]="m.maxWd?.copper ?? 0" />
                      }
                      @case ('minDep') {
                        <app-money [copper]="m.minDep?.copper ?? 0" />
                      }
                      @default {
                        <app-money [copper]="m.net" [sign]="true" />
                      }
                    }
                  </span>
                </button>
                @if (open() === m.id) {
                  <div class="rank-detail">
                    <div class="detail-share"><app-share [card]="'player:' + m.id" /></div>
                    <div>
                      <span class="muted">Déposé</span> <app-money [copper]="m.dep" />
                      <span class="muted small">({{ m.deposits }})</span>
                    </div>
                    <div>
                      <span class="muted">Retiré</span> <app-money [copper]="m.wd" />
                      <span class="muted small">({{ m.withdrawals }})</span>
                    </div>
                    <div>
                      <span class="muted">Solde net</span>
                      <app-money [copper]="m.net" [sign]="true" />
                    </div>
                    <div>
                      <span class="muted">Plus gros dépôt</span>
                      @if (m.maxDep) {
                        <app-money [copper]="m.maxDep.copper" />
                        <span class="muted small">{{ date(m.maxDep.at) }}</span>
                      } @else {
                        —
                      }
                    </div>
                    <div>
                      <span class="muted">Plus gros retrait</span>
                      @if (m.maxWd) {
                        <app-money [copper]="m.maxWd.copper" />
                        <span class="muted small">{{ date(m.maxWd.at) }}</span>
                      } @else {
                        —
                      }
                    </div>
                    <div>
                      <span class="muted">Série de dépôts</span> {{ m.streak }} j
                      <span class="muted small">(record {{ m.bestStreak }} j)</span>
                    </div>
                    <div class="chars">
                      <span class="muted">Persos</span> {{ m.characters.join(', ') }}
                    </div>
                  </div>
                }
              </li>
            } @empty {
              <li class="muted">Personne pour l’instant.</li>
            }
          </ol>
        </section>

        <aside class="bank-side">
          <div class="tooltip highlight patron">
            <h4>👑 Mécène · {{ d.monthName }}</h4>
            <div class="card-share"><app-share card="patron" /></div>
            @if (d.patron; as p) {
              <div class="highlight-who">
                <app-avatar [src]="p.avatar" [name]="p.name" [size]="36" /> {{ p.name }}
              </div>
              <app-money [copper]="p.net" [sign]="true" [big]="true" />
            } @else {
              <p class="muted">Personne encore ce mois-ci.</p>
            }
          </div>
          <div class="tooltip highlight rat">
            <h4>🐀 Rat de banque</h4>
            <div class="card-share"><app-share card="rat" /></div>
            @if (d.rat; as r) {
              <div class="highlight-who">
                <app-avatar [src]="r.avatar" [name]="r.name" [size]="36" /> {{ r.name }}
              </div>
              <app-money [copper]="r.net" [sign]="true" [big]="true" />
              <p class="muted small">le plus petit solde net</p>
            } @else {
              <p class="muted">Personne pour l’instant.</p>
            }
          </div>
          <div class="tooltip">
            <h4>🏆 Records <app-share card="records" /></h4>
            <div class="record">
              <span class="muted">Plus gros dépôt</span>
              @if (d.records.deposit; as r) {
                <span
                  >{{ r.name }} <app-money [copper]="r.copper" />
                  <span class="muted small">{{ date(r.at) }}</span></span
                >
              } @else {
                —
              }
            </div>
            <div class="record">
              <span class="muted">Plus gros retrait</span>
              @if (d.records.withdraw; as r) {
                <span
                  >{{ r.name }} <app-money [copper]="r.copper" />
                  <span class="muted small">{{ date(r.at) }}</span></span
                >
              } @else {
                —
              }
            </div>
            @if (d.war.count) {
              <h4>🛡️ Effort de guilde</h4>
              @if (d.war.out) {
                <div class="record">
                  <span class="muted">Sorties de guilde</span> <app-money [copper]="d.war.out" />
                </div>
              }
              @if (d.war.in) {
                <div class="record">
                  <span class="muted">Entrées de guilde</span> <app-money [copper]="d.war.in" />
                </div>
              }
            }
          </div>
          <div class="tooltip">
            <h4>🙈 Jamais donné ({{ d.neverGave.length }}) <app-share card="never" /></h4>
            @if (d.neverGave.length) {
              <div class="never">
                @for (p of d.neverGave; track p.userId) {
                  <span class="chip"
                    ><app-avatar [src]="p.avatar" [name]="p.name ?? '?'" [size]="20" />
                    {{ p.name ?? 'membre' }}</span
                  >
                }
              </div>
              <p class="muted small">Un dépôt, même une pièce de cuivre, et tu sors de la liste.</p>
            } @else {
              <p class="muted">Tout le monde a déjà donné 🎉</p>
            }
          </div>
        </aside>
      </div>

      <div class="bank-grid">
        <section class="tooltip">
          <h2>30 derniers jours</h2>
          <div class="days">
            @for (day of d.days; track day.day) {
              <div class="day" [attr.title]="dayTitle(day)">
                <span class="day-dep" [style.height.%]="dayHeight(day.dep)"></span>
                <span class="day-wd" [style.height.%]="dayHeight(day.wd)"></span>
              </div>
            }
          </div>
          <p class="muted small">
            <span class="key dep"></span> dépôts <span class="key wd"></span> retraits
          </p>
        </section>
        <section class="tooltip">
          <h2>Dernières transactions</h2>
          <ul class="tx-list">
            @for (t of d.recent.slice(0, 15); track t.id) {
              <li [class.war]="t.guild">
                <span
                  class="tx-arrow"
                  [class.dep]="t.type === 'deposit'"
                  [class.wd]="t.type !== 'deposit'"
                  >{{ t.guild ? '🛡️' : t.type === 'deposit' ? '▲' : '▼' }}</span
                >
                <span class="grow"
                  >{{ t.name }} <span class="muted small">{{ t.character }}</span></span
                >
                <app-money [copper]="t.type === 'deposit' ? t.copper : -t.copper" [sign]="true" />
                <span class="muted small">{{ dateTime(t.at) }}</span>
              </li>
            } @empty {
              <li class="muted">Aucune transaction.</li>
            }
          </ul>
        </section>
      </div>
    } @else if (!error()) {
      <p class="center muted">Ouverture du coffre…</p>
    }
  `,
})
export class BankPage {
  private api = inject(ApiService);

  readonly data = signal<BankSummary | null>(null);
  readonly error = signal<string | null>(null);
  readonly ranking = signal<Ranking>('net');
  readonly open = signal<string | null>(null);
  readonly shown = signal(false); // the bar fills once, after the first paint
  readonly rankings = RANKINGS;
  readonly ticks = [10, 20, 30, 40, 60, 70, 80, 90];
  readonly date = frDate;
  readonly dateTime = frDateTime;

  readonly percent = computed(() => {
    const d = this.data();
    return d?.money ? Math.min(100, Math.floor((d.money / d.goal) * 100)) : 0;
  });
  readonly left = computed(() => {
    const d = this.data();
    return d && d.money !== null ? Math.max(0, d.goal - d.money) : 0;
  });
  private readonly rankingDef = computed(() => RANKINGS.find((r) => r.key === this.ranking())!);
  readonly ranked = computed(() => {
    const r = this.rankingDef();
    return (this.data()?.members ?? [])
      .filter((m) => r.value(m) !== null)
      .sort((a, b) => r.value(b)! - r.value(a)!);
  });
  private readonly gaugeMax = computed(() =>
    Math.max(1, ...this.ranked().map((m) => Math.abs(this.rankingDef().value(m) ?? 0))),
  );
  private readonly dayMax = computed(() =>
    Math.max(1, ...(this.data()?.days ?? []).map((d) => Math.max(d.dep, d.wd))),
  );

  constructor() {
    this.load();
    liveRefresh('bank', () => this.load());
  }

  load() {
    this.api
      .bank()
      .then((d) => {
        this.data.set(d);
        this.error.set(null);
        requestAnimationFrame(() => setTimeout(() => this.shown.set(true), 50));
      })
      .catch((err) => this.error.set(`Banque indisponible : ${errorText(err)}`));
  }

  value(m: BankMember) {
    return this.rankingDef().value(m);
  }
  gauge(m: BankMember) {
    // smallest deposit: the smallest (first) gets the full gauge
    if (this.ranking() === 'minDep') {
      const smallest = this.ranked()[0]?.minDep?.copper ?? 1;
      return (100 * smallest) / (m.minDep?.copper || smallest);
    }
    return (100 * Math.abs(this.value(m) ?? 0)) / this.gaugeMax();
  }
  toggle(id: string) {
    this.open.set(this.open() === id ? null : id);
  }
  dayHeight(copper: number) {
    return copper ? Math.max(4, (100 * copper) / this.dayMax()) : 0;
  }
  dayTitle(d: { day: string; dep: number; wd: number }) {
    const fmt = (c: number) => `${(c / 10000).toFixed(2).replace('.', ',')} po`;
    return `${d.day.split('-').reverse().join('/')} · déposé ${fmt(d.dep)} · retiré ${fmt(d.wd)}`;
  }
}
