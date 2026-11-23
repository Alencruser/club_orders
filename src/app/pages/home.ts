import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorText } from '../core/api.service';
import { OrdersService } from '../core/orders.service';
import { HomeData, HomeEvent, HomePerson } from '../core/models';
import { AvatarComponent, MoneyComponent, duration, frDate, liveRefresh } from '../shared/guild-ui';
import { classColor } from '../shared/ui';
import { ToastService } from '../core/toast.service';

const RARITY: Record<string, string> = {
  common: 'commun',
  rare: 'rare',
  epic: 'épique',
  legendary: 'légendaire',
};

// Home: the club at a glance (welcome, bank goal, challenge, the week), the news feed, my orders and
// workshop, my next achievements, upcoming outings, latest versions, how to start, the members.
@Component({
  selector: 'app-home',
  imports: [RouterLink, AvatarComponent, MoneyComponent],
  template: `
    @if (error(); as e) {
      <p class="refused">{{ e }}</p>
    }
    @if (data(); as d) {
      <section class="tooltip home-hero">
        <img class="home-logo" src="/bagarre-club.webp" alt="" />
        <div class="grow">
          <h2>Salut {{ d.me.name }} !</h2>
          <p class="home-titles">
            @for (t of myTitles(); track t) {
              <span class="chip">{{ t }}</span>
            } @empty {
              <span class="muted"
                >Pas encore de titre : un dépôt, un suivi ou une commande livrée, et ça vient.</span
              >
            }
          </p>
          <a routerLink="/hauts-faits" class="home-trophies"
            >🏆 {{ d.me.trophies }} / {{ d.me.trophiesTotal }} hauts faits</a
          >
        </div>
      </section>

      <div class="home-top">
        <a routerLink="/banque" class="tooltip home-card">
          <h4>💰 Objectif de la banque</h4>
          @if (d.bank.money !== null) {
            <p class="home-big">
              <app-money [copper]="d.bank.money" /> / <app-money [copper]="d.bank.goal" />
            </p>
            <span class="home-bar"><span [style.width.%]="goalShare()"></span></span>
            <p class="muted small">
              {{ goalShare() }} %
              @for (m of d.bank.milestones; track m.percent) {
                @if (m.percent < 100) {
                  {{ m.at ? '💰' : '🔒' }}
                }
              }
            </p>
          } @else {
            <p class="muted">Pas encore de lecture de la banque.</p>
          }
        </a>

        <a routerLink="/defis" class="tooltip home-card">
          <h4>⚔️ Défi de guilde</h4>
          @if (d.challenges[0]; as c) {
            <p class="home-big">{{ c.title }}</p>
            <span class="home-bar"
              ><span [style.width.%]="challengeShare(c.progress, c.target)"></span
            ></span>
            <p class="muted small">
              {{ challengeShare(c.progress, c.target) }} % ·
              {{
                c.status === 'upcoming'
                  ? 'commence le ' + date(c.start)
                  : 'jusqu’au ' + date(c.end - 1)
              }}
              @if (c.reward) {
                · 🎁 {{ c.reward }}
              }
            </p>
          } @else {
            <p class="muted">Aucun défi en cours.</p>
          }
        </a>

        <a routerLink="/hauts-faits" class="tooltip home-card">
          <h4>🏛️ Cette semaine</h4>
          <p class="muted small">Fin dans {{ left(d.season.end) }}</p>
          <div class="home-leaders">
            <span>👑 {{ d.season.bank?.name ?? '—' }}</span>
            <span>🚶 {{ d.season.follow?.name ?? '—' }}</span>
            <span>⚒️ {{ d.season.craft?.name ?? '—' }}</span>
          </div>
        </a>
      </div>

      <div class="home-grid">
        <div class="home-main">
          <section class="tooltip home-feed">
            <h2>Dans la guilde</h2>
            <ul>
              @for (e of d.feed; track e.id) {
                <li [class]="'feed-' + e.type">
                  <span class="feed-icon">{{ icon(e) }}</span>
                  <span class="grow">
                    @switch (e.type) {
                      @case ('achievement') {
                        <b>{{ person(e) }}</b> débloque
                        <b class="r-{{ e.rarity }}">{{ e.title }}</b>
                        <span class="muted small">{{ rarity(e.rarity) }}</span>
                      }
                      @case ('title') {
                        <b>{{ person(e) }}</b> devient <b class="gold">{{ e.title }}</b>
                      }
                      @case ('level') {
                        <b [style.color]="color(e.class)">{{ e.name }}</b> passe niveau
                        <b>{{ e.level }}</b>
                        @if (e.zone) {
                          <span class="muted small">· {{ e.zone }}</span>
                        }
                      }
                      @case ('death') {
                        <b [style.color]="color(e.class)">{{ e.name }}</b>
                        @if (e.level) {
                          <span class="muted small">(niv. {{ e.level }})</span>
                        }
                        est mort{{ e.killer ? ' face à ' : '' }}<b>{{ e.killer ?? '' }}</b>
                        @if (e.zone) {
                          <span class="muted small">· {{ e.zone }}</span>
                        }
                      }
                      @case ('duel') {
                        <b [style.color]="color(e.class)">{{ e.name }}</b> bat
                        <b>{{ e.opponent }}</b> en duel
                      }
                      @case ('kill') {
                        <b [style.color]="color(e.class)">{{ e.name }}</b>
                        {{
                          e.opponent && e.opponent !== '?'
                            ? 'achève ' + e.opponent
                            : 'porte un coup fatal'
                        }}
                      }
                      @case ('deposit') {
                        <b>{{ person(e) }}</b> dépose <app-money [copper]="e.copper ?? 0" /> à la
                        banque
                      }
                      @case ('milestone') {
                        Palier <b>{{ e.percent }} %</b> de l’objectif de la banque atteint
                      }
                      @case ('season') {
                        Fin de la semaine du {{ date(e.start ?? 0) }} : 👑
                        {{ e.bank?.name ?? '—' }} · 🚶 {{ e.follow?.name ?? '—' }} · ⚒️
                        {{ e.craft?.name ?? '—' }}
                      }
                      @case ('challenge') {
                        Défi réussi : <b>{{ e.title }}</b>
                      }
                    }
                  </span>
                  <span class="muted small feed-when">{{ ago(e.at) }}</span>
                </li>
              } @empty {
                <li class="muted">
                  Rien pour l’instant : les prochains exploits de la guilde s’afficheront ici.
                </li>
              }
            </ul>
          </section>
          <section class="tooltip home-members">
            <h2>Les membres ({{ d.members.length }})</h2>
            <div class="members-grid">
              @for (m of d.members; track m.userId) {
                <div class="member">
                  <app-avatar [src]="m.avatar" [name]="m.name" [size]="32" />
                  <div class="grow">
                    <b>{{ m.name }}</b>
                    <span class="member-chars">
                      @for (c of m.characters.slice(0, 3); track c.name) {
                        <span [style.color]="color(c.class)">{{ c.name }} {{ c.level }}</span>
                      } @empty {
                        <span class="muted small">aucun perso connu</span>
                      }
                    </span>
                  </div>
                </div>
              }
            </div>
          </section>
        </div>

        <aside class="home-side">
          <a routerLink="/commandes" class="tooltip home-card">
            <h4>📦 Mes commandes</h4>
            <p>
              <b>{{ orders.placedPending().length }}</b> en attente
              @if (ready(); as r) {
                · <b class="ok">{{ r }}</b> prête(s) à récupérer
              }
            </p>
          </a>
          <a routerLink="/atelier" class="tooltip home-card">
            <h4>⚒️ Mon atelier</h4>
            <p>
              <b>{{ orders.receivedPending().length }}</b> à faire
              @if (fresh()) {
                · <span class="fresh">🔥 {{ fresh() }} nouvelle(s)</span>
              }
            </p>
          </a>

          @if (d.me.next.length) {
            <section class="tooltip">
              <h4>🎯 Mes prochains hauts faits</h4>
              @for (n of d.me.next; track n.id) {
                <div class="home-next">
                  <span
                    >{{ n.name }} <span class="muted small">{{ n.desc }}</span></span
                  >
                  <span class="home-bar"><span [style.width.%]="n.share * 100"></span></span>
                </div>
              }
            </section>
          }

          <section class="tooltip">
            <h4>📅 Sorties à venir</h4>
            @for (a of d.activities; track a.id) {
              <div class="home-activity">
                <span
                  >{{ a.emoji }} <b>{{ a.title || a.label }}</b></span
                >
                <span class="muted small"
                  >{{ when(a.at) }} · {{ a.members }} inscrit(s) · par {{ a.organizer.name }}</span
                >
              </div>
            } @empty {
              <p class="muted small">
                Aucune sortie prévue. Lance-en une avec <code>/activite</code> sur Discord.
              </p>
            }
          </section>

          @if (d.versions; as v) {
            <section class="tooltip">
              <h4>🧩 Dernières versions</h4>
              @if (v.addon) {
                <p>
                  Addon <b>v{{ v.addon.version }}</b> ·
                  <a [href]="v.curseforge" target="_blank" rel="noopener">CurseForge</a>
                </p>
              }
              @if (v.companion; as c) {
                <p>
                  Compagnon <b>{{ c.version }}</b> ·
                  @if (c.windows) {
                    <a [href]="c.windows">Windows</a>
                  }
                  @if (c.mac) {
                    · <a [href]="c.mac">Mac</a>
                  }
                  @if (c.macIntel) {
                    · <a [href]="c.macIntel">Mac Intel</a>
                  }
                </p>
              }
            </section>
          }

          @if (d.me.characters.length) {
            <section class="tooltip home-mychars">
              <h4>🧝 Mes persos</h4>
              <ul>
                @for (c of d.me.characters; track c.name + c.realm) {
                  <li>
                    <span class="grow">
                      <b [style.color]="color(c.class)">{{ c.name }}</b>
                      <span class="muted small">{{ c.realm }} · niv. {{ c.level }}</span>
                    </span>
                    <button
                      type="button"
                      class="btn ghost"
                      title="Supprimé en jeu ? Le retirer pour de bon (l'addon ne le fera plus revenir)"
                      [disabled]="forgetting() === c.name"
                      (click)="forget(c)"
                    >
                      🗑️
                    </button>
                  </li>
                }
              </ul>
              <p class="muted small">🗑️ : un perso supprimé en jeu, retiré pour de bon.</p>
            </section>
          }

          <section class="tooltip">
            <h4>🚀 Bien démarrer</h4>
            <ol class="home-steps">
              <li>Installe l’addon <b>Wall of Shame Forever</b> depuis CurseForge</li>
              <li>
                Installe le <b>compagnon</b> (lien ci-dessus) et laisse-le tourner pendant que tu
                joues
              </li>
              <li>
                Ajoute ton <b>battletag</b> dans le salon de l’annuaire sur Discord : tes persos
                sont reliés à ton compte
              </li>
            </ol>
            <p class="muted small">
              Sur Discord : <code>/banque</code> · <code>/suivi</code> · <code>/artisan</code> ·
              <code>/activite</code>
            </p>
          </section>
        </aside>
      </div>
    } @else if (!error()) {
      <p class="center muted">Ouverture de la taverne…</p>
    }
  `,
})
export class HomePage {
  private api = inject(ApiService);
  private router = inject(Router);
  protected orders = inject(OrdersService);
  private toast = inject(ToastService);
  readonly forgetting = signal<string | null>(null);

  readonly data = signal<HomeData | null>(null);
  readonly error = signal<string | null>(null);
  readonly date = frDate;

  readonly myTitles = computed(() => {
    const t = this.data()?.me.titles ?? {};
    return [t.bank, t.follow, t.craft].filter((x): x is string => Boolean(x));
  });
  readonly goalShare = computed(() => {
    const b = this.data()?.bank;
    return b?.money ? Math.min(100, Math.floor((100 * b.money) / b.goal)) : 0;
  });
  // placed orders done in the last 7 days: ready to pick up
  readonly ready = computed(() => this.orders.placedReady().length);
  readonly fresh = computed(
    () => this.orders.receivedPending().filter((o) => Date.now() - o.createdAt < 86400000).length,
  );

  async forget(c: { name: string; realm: string }) {
    if (
      !confirm(
        `Supprimer ${c.name} pour de bon ?\n\nÀ faire seulement si ce perso a été supprimé en jeu : il disparaît de l'annuaire et des métiers, et l'addon ne le fera plus revenir. Un admin peut le rétablir.`,
      )
    )
      return;
    this.forgetting.set(c.name);
    try {
      await this.api.forgetMyCharacter(c.name, c.realm);
      this.toast.ok(`🗑️ ${c.name} supprimé pour de bon.`);
      this.load();
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.forgetting.set(null);
    }
  }

  constructor() {
    // old links to the grimoire (/?metier=…): it moved to /grimoire
    if (new URLSearchParams(location.search).has('metier')) {
      this.router.navigate(['/grimoire'], { queryParamsHandling: 'preserve', replaceUrl: true });
      return;
    }
    this.load();
    for (const event of ['feed', 'bank', 'achievements', 'follow'])
      liveRefresh(event, () => this.load());
  }

  load() {
    this.api
      .home()
      .then((d) => {
        this.data.set(d);
        this.error.set(null);
      })
      .catch((err) => this.error.set(`Accueil indisponible : ${errorText(err)}`));
  }

  challengeShare(progress: number, target: number) {
    return Math.min(100, Math.floor((100 * progress) / (target || 1)));
  }
  person(e: HomeEvent) {
    return (e.player as HomePerson | undefined)?.name ?? e.name ?? '?';
  }
  color(cls?: string | null) {
    return classColor(cls);
  }
  rarity(r?: string) {
    return RARITY[r ?? ''] ?? r ?? '';
  }
  icon(e: HomeEvent) {
    return (
      {
        achievement: '🏆',
        title: '🎖️',
        level: '⬆️',
        death: '💀',
        duel: '⚔️',
        kill: '🗡️',
        deposit: '💰',
        milestone: '🗝️',
        season: '🏛️',
        challenge: '✅',
      }[e.type] ?? '•'
    );
  }
  ago(at: number) {
    const s = Math.max(0, Math.floor(Date.now() / 1000) - at);
    if (s < 60) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    return `il y a ${Math.floor(s / 86400)} j`;
  }
  left(end: number) {
    const s = Math.max(0, end - Math.floor(Date.now() / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    return d ? `${d} j ${h} h` : duration(s);
  }
  when(at: number) {
    return new Date(at * 1000).toLocaleString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
