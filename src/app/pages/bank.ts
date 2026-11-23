import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ApiService, errorText } from '../core/api.service';
import { BankLine, BankMember, BankSummary } from '../core/models';
import { SessionService } from '../core/session.service';
import { ToastService } from '../core/toast.service';
import { ShareButtonComponent } from '../shared/share-button';
import {
  AvatarComponent,
  MoneyComponent,
  frDate,
  frDateTime,
  liveRefresh,
} from '../shared/guild-ui';

type Ranking = 'net' | 'dep' | 'maxDep' | 'maxWd' | 'streak' | 'deposits' | 'minDep';

const RANKINGS: { key: Ranking; label: string; value: (m: BankMember) => number | null }[] = [
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
        <h1 class="page-banner"><img src="/titles/banque.webp" alt="Banque de guilde" /></h1>
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
              <p class="goal-have">Déjà en banque : <app-money [copper]="d.money" /></p>
            </div>
            <div class="goal-target">
              <span class="goal-target-label">Objectif</span>
              <app-money [copper]="d.goal" [big]="true" />
              <span class="goal-left">
                @if (left() > 0) {
                  encore <app-money [copper]="left()" />
                } @else {
                  atteint, bravo à tous !
                }
              </span>
            </div>
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

      <div class="bank-week">
        <section class="tooltip week-card">
          <div class="week-head">
            <h2>📅 Cette semaine</h2>
            <span class="week-left">fin dans {{ weekLeft() }}</span>
          </div>
          <p class="muted small week-dates">{{ weekDates() }} · saison hebdo</p>
          <div class="week-figures">
            <div class="week-figure">
              <span class="muted">Déposé</span>
              <app-money [copper]="d.week.dep" />
            </div>
            <div class="week-figure">
              <span class="muted">Retiré</span>
              <app-money [copper]="d.week.wd" />
            </div>
            <div class="week-figure net">
              <span class="muted">Solde</span>
              <app-money [copper]="d.week.dep - d.week.wd" [sign]="true" [big]="true" />
            </div>
          </div>
          @if (d.week.top.length) {
            <ol class="week-top">
              @for (m of d.week.top; track m.id; let i = $index) {
                <li>
                  <span class="week-medal">{{ medals[i] }}</span>
                  <!-- fixed slot left of the name: new (gave nothing last week), else places won / lost -->
                  <span class="week-move-slot">
                    @if (m.entered) {
                      <span class="week-new" title="N’avait rien donné la semaine dernière">Nouveau</span>
                    } @else if (m.move) {
                      <span
                        class="week-move"
                        [class.down]="m.move < 0"
                        [attr.title]="
                          (m.move > 0 ? 'gagné ' : 'perdu ') +
                          (m.move > 0 ? m.move : -m.move) +
                          ' place(s) depuis la semaine dernière'
                        "
                        >{{ m.move > 0 ? '▲' : '▼' }}{{ m.move > 0 ? m.move : -m.move }}</span
                      >
                    }
                  </span>
                  <app-avatar [src]="m.avatar" [name]="m.name" [size]="24" />
                  <span class="grow">{{ m.name }}</span>
                  <app-money [copper]="m.net" [sign]="true" />
                </li>
              }
            </ol>
          } @else {
            <p class="muted small">Personne n’a encore donné cette semaine : la première place est libre.</p>
          }
        </section>
        <section class="tooltip week-card all-time">
          <div class="week-head">
            <h2>🏦 Depuis le début</h2>
          </div>
          <p class="muted small week-dates">
            @if (d.since) {
              suivi depuis le {{ date(d.since) }}
            } @else {
              tout l’historique
            }
          </p>
          <p class="muted small">Top 5 en net : déposé moins retiré.</p>
          @if (d.topDonors.length) {
            <ol class="week-top">
              @for (m of d.topDonors; track m.id; let i = $index) {
                <li>
                  <span class="week-medal">{{ medals[i] }}</span>
                  <app-avatar [src]="m.avatar" [name]="m.name" [size]="24" />
                  <span class="grow">{{ m.name }}</span>
                  <app-money [copper]="m.net" [sign]="true" />
                </li>
              }
            </ol>
          } @else {
            <p class="muted small">Personne n’a encore donné.</p>
          }
        </section>
      </div>

      <div class="bank-grid">
        <div class="bank-main">
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
            <div class="tx-head">
              <h2>{{ manage() ? 'Toutes les lignes' : 'Dernières transactions' }}</h2>
              @if (siteAdmin()) {
                <button type="button" class="btn ghost" (click)="toggleManage()">
                  {{ manage() ? '✓ Terminé' : '⚙️ Gérer les lignes' }}
                </button>
              }
            </div>
            @if (manage()) {
              <p class="muted small">
                🛡️ Effort de guilde : compte pour la guilde, pas pour le joueur. 🚫 Ignorer : ne
                compte nulle part (soldes, records, séries, hauts faits). Recliquer annule.
              </p>
              <ul class="tx-list tx-manage">
                @for (t of lines()?.slice(0, linesShown()) ?? []; track t.id) {
                  <li [class.war]="t.guild" [class.ignored]="t.ignored">
                    <span class="muted small">#{{ t.id }}</span>
                    <span class="grow">{{ t.character }}</span>
                    <app-money [copper]="t.type === 'deposit' ? t.copper : -t.copper" [sign]="true" />
                    <span class="muted small">{{ dateTime(t.at) }}</span>
                    <button
                      type="button"
                      class="btn ghost tx-flag"
                      [class.on]="t.guild"
                      [disabled]="busy() === t.id"
                      [title]="t.guild ? 'Retirer « effort de guilde »' : 'Marquer « effort de guilde »'"
                      (click)="flag(t, { guild: !t.guild })"
                    >
                      🛡️
                    </button>
                    <button
                      type="button"
                      class="btn ghost tx-flag"
                      [class.on]="t.ignored"
                      [disabled]="busy() === t.id"
                      [title]="t.ignored ? 'Rétablir : la ligne compte de nouveau' : 'Ignorer : ne compte nulle part'"
                      (click)="flag(t, { ignored: !t.ignored })"
                    >
                      {{ t.ignored ? '↩' : '🚫' }}
                    </button>
                  </li>
                } @empty {
                  <li class="muted">{{ lines() ? 'Aucune transaction.' : 'Chargement…' }}</li>
                }
              </ul>
              @if ((lines()?.length ?? 0) > linesShown()) {
                <button type="button" class="btn ghost" (click)="linesShown.set(linesShown() + 50)">
                  Voir 50 de plus ({{ (lines()?.length ?? 0) - linesShown() }} restantes)
                </button>
              }
            } @else {
            <ul class="tx-list">
              @for (t of d.recent.slice(0, 15); track t.id) {
                <li [class.war]="t.guild" [class.ignored]="t.ignored">
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
            }
          </section>
        </div>

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
    } @else if (!error()) {
      <p class="center muted">Ouverture du coffre…</p>
    }
  `,
})
export class BankPage {
  private api = inject(ApiService);
  private session = inject(SessionService);
  private toast = inject(ToastService);

  readonly data = signal<BankSummary | null>(null);
  // SITE_ADMINS: every line, effort de guilde / ignored one by one
  readonly siteAdmin = computed(() => Boolean(this.session.me()?.siteAdmin));
  readonly manage = signal(false);
  readonly lines = signal<BankLine[] | null>(null);
  readonly linesShown = signal(50);
  readonly busy = signal<number | null>(null);
  readonly error = signal<string | null>(null);
  readonly ranking = signal<Ranking>('net'); // the current week has its own card
  readonly now = signal(Date.now()); // ticks every minute for the countdown
  readonly medals = ['🥇', '🥈', '🥉', '4', '5']; // top 5 cards
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

  // time left until the season ends (next Monday 0:00, Paris time)
  readonly weekLeft = computed(() => {
    const end = this.data()?.week.end;
    if (!end) return '—';
    const minutes = Math.max(0, Math.floor((end * 1000 - this.now()) / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    if (days) return `${days} j ${hours} h`;
    return hours ? `${hours} h ${minutes % 60} min` : `${minutes % 60} min`;
  });
  readonly weekDates = computed(() => {
    const w = this.data()?.week;
    if (!w) return '';
    const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short' });
    // end is next Monday 0:00: the last second belongs to Sunday
    return `${fmt.format(new Date(w.start * 1000))} → ${fmt.format(new Date((w.end - 1) * 1000))}`;
  });

  constructor() {
    this.load();
    liveRefresh('bank', () => this.load());
    const timer = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
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

  async toggleManage() {
    this.manage.set(!this.manage());
    if (!this.manage()) return;
    try {
      this.lines.set(await this.api.bankLines());
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
      this.manage.set(false);
    }
  }

  async flag(t: BankLine, flags: { guild?: boolean; ignored?: boolean }) {
    this.busy.set(t.id);
    try {
      const line = await this.api.bankLineFlags(t.id, flags);
      this.lines.update((list) => (list ?? []).map((x) => (x.id === line.id ? line : x)));
      this.load(); // balances, records…
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.busy.set(null);
    }
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
