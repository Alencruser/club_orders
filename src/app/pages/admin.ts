import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, errorText } from '../core/api.service';
import { AdminAnomaly, AdminChannel, AdminSlot, AdminState } from '../core/models';
import { ToastService } from '../core/toast.service';

type Tab = 'status' | 'channels' | 'anomalies';
const TABS: Tab[] = ['status', 'channels', 'anomalies'];
const SEVERITY = { red: '🔴', orange: '🟠', benign: '⚪' } as const;
const AUTO_REFRESH_MS = 60 * 1000;

// Hidden page /admin: the bot's admin dashboard (the five messages of #bot-admin), easier to read.
// Linked from the top bar for SITE_ADMINS accounts only; the bot answers 404 to anyone else, who is
// sent back home. Step 1: status, channels, anomalies (data and tools come next).
@Component({
  selector: 'app-admin',
  imports: [DatePipe, FormsModule],
  template: `
    @if (state(); as s) {
      <div class="page-head">
        <h1>Tableau de bord</h1>
        <div class="tabs admin-tabs">
          <button type="button" [class.active]="tab() === 'status'" (click)="go('status')">
            🛰️ État
            @if (s.warnings.length) {
              <span class="badge">{{ s.warnings.length }}</span>
            }
          </button>
          <button type="button" [class.active]="tab() === 'channels'" (click)="go('channels')">
            🔗 Salons
            @if (slotProblems()) {
              <span class="badge">{{ slotProblems() }}</span>
            }
          </button>
          <button type="button" [class.active]="tab() === 'anomalies'" (click)="go('anomalies')">
            🚨 Anomalies
            @if (s.anomalies.items.length) {
              <span class="badge" [class.dim]="!s.anomalies.counts.red">{{
                s.anomalies.items.length
              }}</span>
            }
          </button>
          <button type="button" disabled title="Bientôt : prochaine étape">🗂️ Données</button>
          <button type="button" disabled title="Bientôt : prochaine étape">🛠️ Outils</button>
        </div>
        <button type="button" class="btn ghost" [disabled]="loading()" (click)="load()">
          🔄 {{ loading() ? 'Lecture…' : 'Actualiser' }}
        </button>
      </div>
      <p class="muted small admin-updated">
        Mis à jour à {{ s.now | date: 'HH:mm:ss' }} · actualisé toutes les minutes. Le tableau de
        bord Discord (#bot-admin) reste à jour lui aussi.
      </p>

      <!-- 🛰️ État -->
      @if (tab() === 'status') {
        @if (s.warnings.length) {
          <section class="tooltip admin-alerts">
            <h2>⚠️ À régler</h2>
            <ul>
              @for (w of s.warnings; track w) {
                <li>{{ w }}</li>
              }
            </ul>
          </section>
        } @else {
          <p class="admin-ok">✅ Rien à signaler</p>
        }
        <div class="admin-grid">
          <section class="tooltip admin-card">
            <h2>🤖 Le bot</h2>
            <dl>
              <dt>Version</dt>
              <dd>
                @if (s.version; as v) {
                  <code>{{ v.hash }}</code> {{ v.subject }}
                  @if (v.date) {
                    <span class="muted small">({{ v.date * 1000 | date: 'd MMM, HH:mm' }})</span>
                  }
                } @else {
                  <span class="muted">inconnue (git absent ?)</span>
                }
              </dd>
              <dt>Démarré</dt>
              <dd>{{ s.startedAt | date: 'd MMM, HH:mm' }} · depuis {{ since(s.startedAt, s.now) }}</dd>
              <dt>Ping</dt>
              <dd [class.bad]="s.ping > 400">{{ s.ping >= 0 ? s.ping + ' ms' : '?' }}</dd>
              <dt>Mémoire</dt>
              <dd>{{ s.memoryMb }} Mo</dd>
            </dl>
          </section>

          <section class="tooltip admin-card">
            <h2>📡 Compagnons</h2>
            <dl>
              <dt>Serveur</dt>
              <dd>
                @if (!s.receiver.port) {
                  <span class="bad">❌ SHAMEWALL_PORT manquant dans .env</span>
                } @else if (s.receiver.listening) {
                  <span class="good">✅ à l'écoute</span>
                  <span class="muted small"> · port {{ s.receiver.port }}</span>
                } @else {
                  <span class="bad">❌ pas à l'écoute sur le port {{ s.receiver.port }}</span>
                }
              </dd>
              <dt>Adresse</dt>
              <dd>
                @if (s.receiver.url) {
                  <code class="small">{{ s.receiver.url }}</code>
                } @else {
                  <span class="bad">❌ SHAMEWALL_PUBLIC_URL manquant</span>
                }
              </dd>
              <dt>Clé</dt>
              <dd>{{ s.keyPresent ? '✅ définie' : '❌ aucune' }}</dd>
              <dt>Filtres</dt>
              <dd>
                {{ s.filters.guild ? 'guilde ' + s.filters.guild : 'toutes les guildes' }} ·
                {{ s.filters.realm ? 'royaumes ' + s.filters.realm + '…' : 'tous les royaumes' }}
              </dd>
            </dl>
            @if (code(); as c) {
              <div class="admin-code">
                <code>{{ c }}</code>
                <button type="button" class="btn ghost" (click)="copy(c)">📋 Copier</button>
              </div>
              <p class="muted small">
                En jeu : <code>/wos code &lt;ce code&gt;</code>. Ne le partage qu'avec les membres.
              </p>
            }
            <div class="admin-actions">
              <button type="button" class="btn ghost" [disabled]="!s.receiver.url" (click)="showCode()">
                🔑 {{ code() ? 'Masquer le code' : 'Afficher le code' }}
              </button>
              <button type="button" class="btn danger" [disabled]="!s.receiver.url" (click)="newKey()">
                ♻️ Nouvelle clé
              </button>
            </div>
          </section>

          <section class="tooltip admin-card wide">
            <h2>📨 Dernières requêtes des compagnons</h2>
            @if (s.receiver.requests.length) {
              <table class="admin-table">
                <tbody>
                  @for (q of s.receiver.requests; track q.type) {
                    <tr>
                      <td>{{ q.label }}{{ q.test ? ' (test)' : '' }}</td>
                      <td class="muted">{{ since(q.at, s.now) }}</td>
                      <td [class.good]="q.status < 300" [class.bad]="q.status >= 400">{{ q.status }}</td>
                      <td>{{ q.text }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="muted">Aucune depuis le démarrage.</p>
            }
          </section>

          <section class="tooltip admin-card">
            <h2>⏳ En cours</h2>
            <p>
              {{ s.pending.prompts }} demande(s) en attente (battletag, annonce) ·
              {{ s.pending.privates }} message(s) privé(s) ouvert(s)
            </p>
            <div class="admin-actions">
              <button type="button" class="btn ghost" (click)="closePrivates()">
                🧹 Fermer les messages privés
              </button>
            </div>
          </section>

          <section class="tooltip admin-card">
            <h2>🗂️ Données</h2>
            <ul class="admin-counts">
              @for (c of s.counts; track c.key) {
                <li>
                  <span>{{ c.emoji }} {{ c.label }}</span><b>{{ c.count }}</b>
                </li>
              }
            </ul>
          </section>
        </div>
      }

      <!-- 🔗 Salons -->
      @if (tab() === 'channels') {
        <section class="tooltip">
          <p class="muted small">
            Choisis un salon puis <b>Enregistrer</b> : le tableau ou la bannière suit, l'ancien est
            supprimé. Choisir « aucun » délie l'usage quand c'est possible.
          </p>
          <table class="admin-table admin-slots">
            <tbody>
              @for (slot of editableSlots(); track slot.key) {
                <tr [class.problem]="slot.problem" [class.unset]="!slot.channelId">
                  <td class="slot-name">
                    <b>{{ slot.emoji }} {{ slot.label }}</b>
                    <span class="muted small">{{ slot.what }}</span>
                  </td>
                  <td class="slot-status">
                    @if (slot.problem) {
                      <span class="bad">⚠️ #{{ slot.channelName ?? '?' }} : {{ slot.problem }}</span>
                    } @else if (slot.channelId) {
                      <span class="good">✅ #{{ slot.channelName ?? '?' }}</span>
                    } @else {
                      <span class="muted">❌ non lié{{ slot.missing ? ' : ' + slot.missing : '' }}</span>
                    }
                  </td>
                  <td class="slot-pick">
                    <select [ngModel]="choice(slot)" (ngModelChange)="pick(slot, $event)">
                      <option value="">— aucun —</option>
                      @for (g of channelGroups(); track g.name) {
                        <optgroup [label]="g.name">
                          @for (c of g.channels; track c.id) {
                            <option [value]="c.id">#{{ c.name }}{{ c.botCanWrite ? '' : ' (bot sans accès)' }}</option>
                          }
                        </optgroup>
                      }
                    </select>
                  </td>
                  <td class="slot-actions">
                    @if (changed(slot)) {
                      <button type="button" class="btn gold" [disabled]="saving() === slot.key" (click)="save(slot)">
                        {{ saving() === slot.key ? '…' : choice(slot) ? 'Enregistrer' : 'Délier' }}
                      </button>
                      <button type="button" class="btn ghost" (click)="reset(slot)">Annuler</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          @for (slot of readOnlySlots(); track slot.key) {
            <p class="muted small">
              {{ slot.emoji }} <b>{{ slot.label }}</b> : #{{ slot.channelName ?? 'aucun' }} ·
              {{ slot.note }}
            </p>
          }
        </section>
      }

      <!-- 🚨 Anomalies -->
      @if (tab() === 'anomalies') {
        <div class="admin-anomaly-head">
          <div class="tabs admin-tabs">
            <button type="button" [class.active]="severity() === 'all'" (click)="severity.set('all')">
              Tout ({{ s.anomalies.items.length }})
            </button>
            <button type="button" [class.active]="severity() === 'red'" (click)="severity.set('red')">
              🔴 Bloquantes ({{ s.anomalies.counts.red }})
            </button>
            <button type="button" [class.active]="severity() === 'orange'" (click)="severity.set('orange')">
              🟠 À surveiller ({{ s.anomalies.counts.orange }})
            </button>
          </div>
          <button type="button" class="btn danger" [disabled]="!recordedCount()" (click)="clearAll()">
            🧹 Vider les erreurs ({{ recordedCount() }})
          </button>
        </div>
        @if (s.anomalies.benign.length) {
          <p class="muted small">
            ⚪ Bénignes :
            @for (b of s.anomalies.benign; track b.key; let last = $last) {
              ×{{ b.count }} {{ b.label }} ({{ since(b.last, s.now) }}){{ last ? '' : ' · ' }}
            }
          </p>
        }
        @for (a of shownAnomalies(); track a.id) {
          <article class="tooltip admin-anomaly" [class.red]="a.severity === 'red'">
            <button type="button" class="admin-anomaly-title" (click)="toggle(a.id)">
              <span>{{ icon(a) }}</span>
              <b>{{ a.title }}</b>
              <span class="muted small">
                {{ a.kindLabel }}{{ a.feature ? ' · ' + a.feature : '' }}{{
                  a.count ? ' · ×' + a.count : ''
                }}{{ a.last ? ' · ' + since(a.last, s.now) : '' }}
              </span>
              <span class="grow"></span>
              <span class="muted">{{ open().has(a.id) ? '▲' : '▼' }}</span>
            </button>
            @if (open().has(a.id)) {
              <div class="admin-anomaly-body">
                @if (a.hint) {
                  <p><b>Que faire :</b> {{ a.hint }}</p>
                }
                @if (a.kind === 'orphan') {
                  <p>
                    <code>{{ a.battletag }}</code> n'est pas dans l'annuaire des battletags. Rangé
                    dessous :
                  </p>
                  <ul>
                    @for (i of a.items ?? []; track $index) {
                      <li>{{ i }}</li>
                    }
                  </ul>
                  <p class="muted small">
                    Ces données reviendraient si le joueur se réinscrivait avec ce battletag.
                  </p>
                  <button type="button" class="btn danger" (click)="deleteOrphan(a)">
                    🗑️ Supprimer ces données
                  </button>
                } @else if (a.kind === 'integrity') {
                  <p class="muted small">Disparaît tout seul une fois le problème réglé.</p>
                } @else {
                  <dl>
                    @if (a.where) {
                      <dt>Où</dt>
                      <dd><code>{{ a.where }}</code></dd>
                    }
                    @if (a.code != null) {
                      <dt>Code</dt>
                      <dd><code>{{ a.code }}</code></dd>
                    }
                    <dt>Première</dt>
                    <dd>{{ a.first | date: 'd MMM, HH:mm:ss' }}</dd>
                    <dt>Dernière</dt>
                    <dd>{{ a.last | date: 'd MMM, HH:mm:ss' }}</dd>
                    @if (a.context; as c) {
                      <dt>Contexte</dt>
                      <dd>
                        <code>{{ c.action ?? '?' }}</code>{{ c.user ? ' · @' + c.user : ''
                        }}{{ c.channel ? ' · #' + c.channel : '' }}
                      </dd>
                    }
                  </dl>
                  @if (a.message) {
                    <pre class="admin-pre">{{ a.message }}</pre>
                  }
                  @if (a.stack) {
                    <details>
                      <summary>Pile d'appels</summary>
                      <pre class="admin-pre">{{ a.stack }}</pre>
                    </details>
                  }
                  <button type="button" class="btn gold" (click)="resolve(a)">
                    ✅ Marquer comme réglée
                  </button>
                }
              </div>
            }
          </article>
        } @empty {
          <p class="admin-ok">✅ Rien à signaler</p>
        }
      }
    } @else if (error(); as e) {
      <section class="tooltip center">
        <p>❌ Le bot n'a pas pu lire le tableau de bord : {{ e }}</p>
        <button type="button" class="btn gold" [disabled]="loading()" (click)="load()">
          🔄 Réessayer
        </button>
      </section>
    } @else {
      <p class="center muted">Chargement…</p>
    }
  `,
})
export class AdminPage {
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly state = signal<AdminState | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly tab = signal<Tab>(this.tabFromHash());
  readonly channels = signal<AdminChannel[]>([]);
  readonly picks = signal<Record<string, string>>({}); // slot key → chosen channel (not saved yet)
  readonly saving = signal<string | null>(null);
  readonly code = signal<string | null>(null);
  readonly severity = signal<'all' | 'red' | 'orange'>('all');
  readonly open = signal(new Set<string>());

  readonly editableSlots = computed(() => (this.state()?.slots ?? []).filter((s) => !s.readOnly));
  readonly readOnlySlots = computed(() => (this.state()?.slots ?? []).filter((s) => s.readOnly));
  readonly slotProblems = computed(() => this.editableSlots().filter((s) => s.problem).length);
  readonly channelGroups = computed(() => {
    const groups = new Map<string, AdminChannel[]>();
    for (const c of this.channels()) {
      const name = c.parent ?? 'Sans catégorie';
      groups.set(name, [...(groups.get(name) ?? []), c]);
    }
    return [...groups.entries()].map(([name, channels]) => ({ name, channels }));
  });
  readonly shownAnomalies = computed(() =>
    (this.state()?.anomalies.items ?? []).filter(
      (a) => this.severity() === 'all' || a.severity === this.severity(),
    ),
  );
  readonly recordedCount = computed(
    () =>
      (this.state()?.anomalies.items ?? []).filter((a) => !['orphan', 'integrity'].includes(a.kind))
        .length + (this.state()?.anomalies.counts.benign ?? 0),
  );

  constructor() {
    this.load();
    this.api.adminChannels().then(
      (list) => this.channels.set(list),
      () => {},
    );
    const timer = setInterval(() => {
      if (!document.hidden) this.load(true);
    }, AUTO_REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private tabFromHash(): Tab {
    const hash = location.hash.slice(1) as Tab;
    return TABS.includes(hash) ? hash : 'status';
  }

  go(tab: Tab) {
    this.tab.set(tab);
    history.replaceState(null, '', `#${tab}`);
  }

  async load(quiet = false) {
    this.loading.set(true);
    try {
      this.state.set(await this.api.adminState());
      this.error.set(null);
    } catch (err) {
      this.error.set(errorText(err));
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.router.navigate([''], { replaceUrl: true });
      } else if (!quiet) this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.loading.set(false);
    }
  }

  since(at: number, now: number) {
    const s = Math.max(0, Math.round((now - at) / 1000));
    if (s < 60) return `il y a ${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 48) return `il y a ${h} h ${String(m % 60).padStart(2, '0')}`;
    return `il y a ${Math.floor(h / 24)} j`;
  }

  icon(a: AdminAnomaly) {
    return SEVERITY[a.severity];
  }

  // --- État ---

  async showCode() {
    if (this.code()) return this.code.set(null);
    try {
      this.code.set(await this.api.adminCode());
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  async newKey() {
    if (
      !confirm(
        'Nouvelle clé : tous les codes de connexion actuels seront refusés. Chaque officier (ou joueur sans guilde) devra recoller le nouveau code en jeu. Continuer ?',
      )
    )
      return;
    try {
      this.code.set(await this.api.adminCode(true));
      this.toast.ok('♻️ Nouvelle clé : les anciens codes sont refusés.');
      this.load(true);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.ok('📋 Copié');
    } catch {
      this.toast.error('❌ Copie impossible : sélectionne le code à la main.');
    }
  }

  async closePrivates() {
    if (!confirm('Fermer tous les messages privés du bot et annuler les demandes en cours ?')) return;
    try {
      const r = await this.api.adminClosePrivates();
      this.toast.ok(`🧹 ${r.privates} message(s) privé(s) fermé(s), ${r.prompts} demande(s) annulée(s).`);
      this.load(true);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  // --- Salons ---

  choice(slot: AdminSlot) {
    return this.picks()[slot.key] ?? slot.channelId ?? '';
  }

  pick(slot: AdminSlot, id: string) {
    this.picks.update((p) => ({ ...p, [slot.key]: id }));
  }

  changed(slot: AdminSlot) {
    const pick = this.picks()[slot.key];
    return pick !== undefined && pick !== (slot.channelId ?? '');
  }

  reset(slot: AdminSlot) {
    this.picks.update(({ [slot.key]: _, ...rest }) => rest);
  }

  async save(slot: AdminSlot) {
    const id = this.choice(slot) || null;
    if (!id && !slot.unlinkable) {
      this.toast.error(`❌ ${slot.label} peut être déplacé, pas délié.`);
      return;
    }
    if (!id && !confirm(`Délier ${slot.label} ? ${slot.missing ?? ''}`)) return;
    this.saving.set(slot.key);
    try {
      const r = await this.api.adminLink(slot.key, id);
      this.toast.ok(`✅ ${r.text}`);
      if (r.warning) this.toast.error(`⚠️ ${r.warning}`);
      this.reset(slot);
      await this.load(true);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.saving.set(null);
    }
  }

  // --- Anomalies ---

  toggle(id: string) {
    this.open.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async resolve(a: AdminAnomaly) {
    try {
      await this.api.adminResolve(a.id);
      this.toast.ok('✅ Marquée comme réglée : elle reviendra si elle se reproduit.');
      this.load(true);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  async deleteOrphan(a: AdminAnomaly) {
    if (!confirm(`Supprimer pour de bon les données rangées sous ${a.battletag} ?`)) return;
    try {
      const r = await this.api.adminDeleteOrphan(a.id);
      this.toast.ok(`🗑️ ${r.removed} élément(s) supprimé(s).`);
      this.load(true);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  async clearAll() {
    if (
      !confirm(
        'Oublier toutes les erreurs enregistrées ? Elles reviennent si elles se reproduisent. Les problèmes d’intégrité et les orphelins restent affichés.',
      )
    )
      return;
    try {
      const r = await this.api.adminClearAnomalies();
      this.toast.ok(`🧹 ${r.cleared} anomalie(s) oubliée(s).`);
      this.load(true);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }
}
