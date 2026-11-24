import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { AdminDirectory, AdminDirectoryPlayer, AdminMemberHit } from '../core/models';
import { ToastService } from '../core/toast.service';

// 📇 Annuaire tab of /admin (pages/admin.ts): every player (Discord member → battletag, class, known
// characters), add / edit / delete a battletag, characters deleted in game, characters nobody claims
// (seen in the bank or the follow log without a known battletag) linked to a player.
const IDLE_DAYS = 30; // 💤 after this long without anything received

@Component({
  selector: 'app-admin-directory',
  imports: [DatePipe, FormsModule],
  // only loaded with /admin (lazy chunk), not in the global stylesheet
  styles: `
.admin-search {
  width: 100%;
  margin: 0.3rem 0;
}
// 📇 Annuaire tab (pages/admin-directory.ts)
.admin-dir-head {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin-bottom: 1rem;
  .admin-search {
    flex: 1;
    margin: 0;
  }
}
.admin-dir-edit {
  margin-bottom: 1rem;
}
.admin-dir {
  list-style: none;
  margin: 0;
  padding: 0;
  > li {
    border-bottom: 1px solid rgba(240, 196, 110, 0.12);
    &.open {
      background: rgba(255, 209, 0, 0.05);
    }
  }
}
.admin-dir-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.45rem 0.3rem;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.admin-dir-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
}
.admin-dir-class {
  width: 22px;
  height: 22px;
}
.admin-dir-seen {
  text-align: right;
  &.idle {
    opacity: 0.7;
  }
}
.admin-dir-hit.idle .admin-dir-ago {
  color: #e0a040;
}
.admin-dir-detail {
  padding: 0.2rem 0.8rem 0.8rem 2.9rem;
}
.admin-dir-hit {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
@media (max-width: 600px) {
  .admin-dir-detail {
    padding-left: 0.4rem;
  }
}
`,
  template: `
    @if (dir(); as d) {
      <div class="admin-dir-head">
        <input class="admin-search" [(ngModel)]="search" placeholder="🔍 Membre, battletag ou perso…" />
        <button type="button" class="btn gold" (click)="adding.set(!adding())">
          {{ adding() ? 'Fermer' : '➕ Ajouter un membre' }}
        </button>
      </div>

      @if (adding()) {
        <section class="tooltip admin-card">
          <h2>➕ Ajouter un membre</h2>
          <div class="admin-actions">
            <input
              [(ngModel)]="memberQuery"
              [placeholder]="d.members ? 'Pseudo Discord' : 'Pseudo Discord (2 lettres min.)'"
              (keyup.enter)="findMembers()"
              (input)="d.members && findMembers()"
            />
            <button type="button" class="btn ghost" (click)="findMembers()">Chercher</button>
          </div>
          <ul class="admin-list">
            @for (m of hits(); track m.userId) {
              <li class="admin-dir-hit">
                <span class="grow"
                  ><b>{{ m.name }}</b> <span class="muted small">@{{ m.username }}</span>
                  @if (m.registered) {
                    <span class="muted small">· déjà dans l'annuaire</span>
                  }
                </span>
                <button type="button" class="btn ghost" (click)="startEdit(m.userId, m.name)">Choisir</button>
              </li>
            }
          </ul>
        </section>
      }

      @if (edit(); as e) {
        <section class="tooltip admin-card admin-dir-edit">
          <h2>✏️ {{ e.name }}</h2>
          <label class="field">
            Battletag
            <input [(ngModel)]="e.battletag" maxlength="20" placeholder="Nom#1234" />
          </label>
          <label class="field">
            Classe
            <select [(ngModel)]="e.classId">
              <option [ngValue]="null">—</option>
              @for (c of d.classes; track c.id) {
                <option [ngValue]="c.id">{{ c.label }}</option>
              }
            </select>
          </label>
          <div class="admin-actions">
            <button type="button" class="btn gold" [disabled]="busy()" (click)="savePlayer(e)">Enregistrer</button>
            <button type="button" class="btn ghost" (click)="edit.set(null)">Annuler</button>
          </div>
        </section>
      }

      @if (idleList().length) {
        <section class="tooltip admin-card wide">
          <h2>💤 Persos inactifs ({{ idleList().length }})</h2>
          <p class="muted small">
            Rien reçu depuis plus de {{ idleDays }} jours (ni connexion, ni banque, ni suivi, ni métiers), le plus ancien
            d'abord : peut-être supprimés en jeu. Les connexions ne sont suivies que depuis le 24/11 : un perso juste pas joué
            depuis apparaît aussi, vérifie avec son joueur. Coche ceux à mettre à la corbeille ; ils restent rétablissables, et
            leur historique compte toujours pour leur joueur.
          </p>
          <ul class="admin-list">
            @for (c of idleList(); track c.key) {
              <li class="admin-dir-hit">
                <label class="grow">
                  <input type="checkbox" [checked]="idlePicked().has(c.key)" (change)="toggleIdle(c.key)" />
                  <b>{{ c.name }}</b>
                  <span class="muted small">{{ c.classLabel ? c.classLabel + (c.level ? ' niv. ' + c.level : '') : 'relié à la main' }} · à {{ c.player }} · {{ ago(c.lastSeen) }}</span>
                </label>
              </li>
            }
          </ul>
          <div class="admin-actions">
            <button type="button" class="btn ghost" (click)="pickAllIdle()">
              {{ idlePicked().size === idleList().length ? 'Tout décocher' : 'Tout cocher' }}
            </button>
            <button type="button" class="btn danger" [disabled]="busy() || !idlePicked().size" (click)="forgetIdle()">
              🪦 Mettre à la corbeille ({{ idlePicked().size }})
            </button>
          </div>
        </section>
      }

      <section class="tooltip admin-card wide">
        <h2>📇 Joueurs ({{ shown().length }}/{{ d.players.length }})</h2>
        <div class="admin-actions">
          <label class="small"
            >Trier par
            <select [ngModel]="sortBy()" (ngModelChange)="sortBy.set($event)">
              <option value="name">nom</option>
              <option value="recent">activité la plus récente</option>
              <option value="old">activité la plus ancienne</option>
            </select>
          </label>
        </div>
        <ul class="admin-dir">
          @for (p of shown(); track p.userId) {
            <li [class.open]="open() === p.userId">
              <button type="button" class="admin-dir-row" (click)="toggle(p.userId)">
                @if (p.avatar) {
                  <img class="admin-dir-avatar" [src]="p.avatar" alt="" />
                } @else {
                  <span class="admin-dir-avatar">{{ p.name.charAt(0) }}</span>
                }
                <span class="grow">
                  <b>{{ p.name }}</b>
                  @if (!p.inGuild) {
                    <span class="bad small"> · plus sur le serveur</span>
                  }
                  <br /><span class="muted small">{{ p.noBattletag ? 'sans battletag' : p.battletag }}</span>
                </span>
                @if (p.classIcon) {
                  <img class="admin-dir-class" [src]="p.classIcon" [alt]="p.classLabel ?? ''" [title]="p.classLabel ?? ''" />
                }
                <span class="muted small admin-dir-seen" [class.idle]="idle(p.lastSeen)">
                  {{ p.characters.length }} perso(s)<br />{{ ago(p.lastSeen) }}
                </span>
              </button>
              @if (open() === p.userId) {
                <div class="admin-dir-detail">
                  <div class="admin-actions">
                    <button type="button" class="btn ghost" (click)="startEdit(p.userId, p.name, p)">
                      {{ p.noBattletag ? '➕ Battletag' : '✏️ Modifier' }}
                    </button>
                    @if (!p.noBattletag) {
                      <label><input type="checkbox" [(ngModel)]="cascade" /> avec ses niveaux, persos et classement</label>
                      <button type="button" class="btn danger" [disabled]="busy()" (click)="removePlayer(p)">🗑️ Supprimer</button>
                    }
                  </div>
                  @if (p.noBattletag) {
                    <p class="muted small">
                      Relié à la main, sans battletag : il garde ses persos le jour où il donne son battletag. Pour le retirer,
                      délie ses persos ✂️.
                    </p>
                  }
                  <h4>Ses persos <span class="muted small">(le plus récemment actif d'abord)</span></h4>
                  <ul class="admin-list">
                    @for (c of p.characters; track c.key) {
                      <li class="admin-dir-hit" [class.idle]="idle(c.lastSeen)">
                        <span class="grow">
                          <b>{{ c.name }}</b>
                          <span class="muted small">
                            @if (c.known) {
                              {{ c.classLabel }}{{ c.level ? ' niv. ' + c.level : '' }}
                            } @else {
                              relié à la main
                            }
                          </span>
                          <br /><span class="small admin-dir-ago">{{ idle(c.lastSeen) ? '💤 ' : '' }}{{ ago(c.lastSeen) }}</span>
                        </span>
                        <button type="button" class="btn ghost" title="Ce n'est pas son perso : le délier" [disabled]="busy()" (click)="link(c.key, null)">✂️ Délier</button>
                        <button type="button" class="btn ghost" title="Supprimé en jeu : à la corbeille" [disabled]="busy()" (click)="forget(c)">🪦 Corbeille</button>
                      </li>
                    } @empty {
                      <li class="muted small">Aucun perso.</li>
                    }
                  </ul>
                  <p class="muted small">
                    💤 : rien reçu depuis plus de {{ idleDays }} jours (ni connexion, ni banque, ni suivi, ni métiers) : peut-être supprimé en
                    jeu. ✂️ délie un perso qui n'est pas à lui, 🪦 met à la corbeille un perso supprimé en jeu (rétablissable).
                  </p>
                </div>
              }
            </li>
          } @empty {
            <li class="muted">Personne.</li>
          }
        </ul>
      </section>

      <div class="admin-grid">
        <section class="tooltip admin-card wide">
          <h2>🧭 Persos sans joueur ({{ d.unlinked.length }})</h2>
          <p class="muted small">
            Vus dans la banque ou le suivi, mais le bot ne sait pas à qui ils sont : leurs dépôts et leur
            temps de suivi ne comptent pour personne. Relie-les à un membre Discord, même sans battletag : le lien
            reste quand il donnera le sien.
            @if (!d.members) {
              <br />Seuls les joueurs de l'annuaire sont proposés : active la liste complète des membres
              (MEMBERS_INTENT) pour choisir n'importe qui, avec des suggestions.
            }
          </p>
          <ul class="admin-list">
            @for (u of d.unlinked; track u.key) {
              <li class="admin-dir-hit">
                <span class="grow"
                  ><b>{{ u.name }}</b> <span class="muted small">{{ u.realm }}
                  @if (u.bank) { · {{ u.bank }} ligne(s) de banque }
                  @if (u.follow) { · {{ u.follow }} suivi(s) }
                  @if (u.waiting) { · attend le battletag {{ u.waiting }} (personne ne l'a dans l'annuaire) }
                  · {{ ago(u.last || null) }}</span></span
                >
                <select [(ngModel)]="linkTo[u.key]">
                  <option [ngValue]="undefined">Membre…</option>
                  @if (u.suggest?.length) {
                    <optgroup label="⭐ Ressemble à">
                      @for (id of u.suggest; track id) {
                        <option [ngValue]="id">{{ memberName(id) }}</option>
                      }
                    </optgroup>
                  }
                  <optgroup label="Annuaire">
                    @for (p of d.players; track p.userId) {
                      <option [ngValue]="p.userId">{{ p.name }}{{ p.noBattletag ? ' (sans battletag)' : '' }}</option>
                    }
                  </optgroup>
                  @if (others().length) {
                    <optgroup label="Autres membres du serveur">
                      @for (m of others(); track m.userId) {
                        <option [ngValue]="m.userId">{{ m.name }} · @{{ m.username }}</option>
                      }
                    </optgroup>
                  }
                </select>
                <button type="button" class="btn ghost" [disabled]="busy() || !linkTo[u.key]" (click)="link(u.key, linkTo[u.key]!)">
                  Relier
                </button>
              </li>
            } @empty {
              <li class="muted small">Tous les persos ont leur joueur 🎉</li>
            }
          </ul>
        </section>

        <section class="tooltip admin-card">
          <h2>🪦 Corbeille ({{ d.forgotten.length }})</h2>
          <p class="muted small">
            Persos supprimés, gardés avec leurs données : l'addon les renvoie, le bot les ignore. Leurs dépôts et suivis
            passés comptent toujours pour leur joueur. Rétablir les remet exactement à leur place.
          </p>
          <ul class="admin-list">
            @for (f of d.forgotten; track f.key) {
              <li class="admin-dir-hit">
                <span class="grow"
                  >{{ f.name }} <span class="muted small">{{ f.realm }} · le {{ f.at | date: 'd MMM y' }}{{ f.by ? ' par ' + f.by : '' }}</span></span
                >
                <button type="button" class="btn ghost" [disabled]="busy()" (click)="restore(f.key, f.name)">↩ Rétablir</button>
              </li>
            } @empty {
              <li class="muted small">Aucun.</li>
            }
          </ul>
        </section>
      </div>
    } @else if (error(); as e) {
      <p class="refused">❌ {{ e }}</p>
    } @else {
      <p class="center muted">Chargement…</p>
    }
  `,
})
export class AdminDirectoryComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly dir = signal<AdminDirectory | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly open = signal<string | null>(null);
  readonly adding = signal(false);
  readonly hits = signal<AdminMemberHit[]>([]);
  readonly edit = signal<{ userId: string; name: string; battletag: string; classId: string | null } | null>(null);
  readonly query = signal('');
  memberQuery = '';
  cascade = false;
  linkTo: Record<string, string | undefined> = {};

  get search() {
    return this.query();
  }
  set search(v: string) {
    this.query.set(v);
  }

  readonly sortBy = signal<'name' | 'recent' | 'old'>('name');
  readonly idlePicked = signal<Set<string>>(new Set());

  // every inactive character of every player, the oldest first (never seen: first of all)
  readonly idleList = computed(() =>
    (this.dir()?.players ?? [])
      .flatMap((p) => p.characters.filter((c) => this.idle(c.lastSeen)).map((c) => ({ ...c, player: p.name })))
      .sort((a, b) => (a.lastSeen ?? 0) - (b.lastSeen ?? 0) || a.name.localeCompare(b.name)),
  );

  readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const sort = this.sortBy();
    const players = [...(this.dir()?.players ?? [])].sort((a, b) =>
      sort === 'recent'
        ? (b.lastSeen ?? 0) - (a.lastSeen ?? 0)
        : sort === 'old'
          ? (a.lastSeen ?? 0) - (b.lastSeen ?? 0)
          : a.name.localeCompare(b.name),
    );
    if (!q) return players;
    return players.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.battletag.toLowerCase().includes(q) ||
        p.characters.some((c) => c.name.toLowerCase().includes(q)) ||
        p.links.some((k) => k.includes(q)),
    );
  });

  // members of the server not in the directory yet (only with the full member list)
  readonly others = computed(() => {
    const d = this.dir();
    const known = new Set((d?.players ?? []).map((p) => p.userId));
    return (d?.members ?? []).filter((m) => !known.has(m.userId));
  });

  constructor() {
    this.load();
  }

  readonly idleDays = IDLE_DAYS;

  toggleIdle(key: string) {
    const next = new Set(this.idlePicked());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.idlePicked.set(next);
  }

  pickAllIdle() {
    const all = this.idleList();
    this.idlePicked.set(this.idlePicked().size === all.length ? new Set() : new Set(all.map((c) => c.key)));
  }

  async forgetIdle() {
    const picked = this.idleList().filter((c) => this.idlePicked().has(c.key));
    if (!picked.length) return;
    const names = picked.map((c) => c.name);
    if (!confirm(`Mettre ${names.length} perso(s) à la corbeille ?\n\n${names.join(', ')}\n\nRétablissables depuis 🪦 Corbeille.`)) return;
    const ok = await this.run(() => this.api.adminDirectoryAction('forget-many', { names }), `🪦 ${names.length} perso(s) à la corbeille.`);
    if (ok) this.idlePicked.set(new Set());
  }

  // « il y a 3 j », from a date in seconds
  ago(at: number | null) {
    if (!at) return 'pas vu depuis le 24/11 (début du suivi des connexions)';
    const s = Math.max(0, Date.now() / 1000 - at);
    if (s < 3600) return 'actif il y a moins d’une heure';
    if (s < 86400) return `actif il y a ${Math.floor(s / 3600)} h`;
    return `actif il y a ${Math.floor(s / 86400)} j`;
  }

  idle(at: number | null) {
    return !at || Date.now() / 1000 - at > IDLE_DAYS * 86400;
  }

  memberName(userId: string) {
    const d = this.dir();
    return d?.members?.find((m) => m.userId === userId)?.name ?? d?.players.find((p) => p.userId === userId)?.name ?? userId;
  }

  async load() {
    try {
      this.dir.set(await this.api.adminDirectory());
      this.error.set(null);
    } catch (err) {
      this.error.set(errorText(err));
    }
  }

  toggle(userId: string) {
    this.open.set(this.open() === userId ? null : userId);
    this.cascade = false;
  }

  async findMembers() {
    const all = this.dir()?.members;
    if (all) {
      // full list: filtered here, no call to the bot
      const q = this.memberQuery.trim().toLowerCase();
      this.hits.set(q ? all.filter((m) => m.name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)).slice(0, 15) : []);
      return;
    }
    if (this.memberQuery.trim().length < 2) return;
    try {
      this.hits.set(await this.api.adminDirectoryMembers(this.memberQuery.trim()));
      if (!this.hits().length) this.toast.warn('Personne trouvé avec ce nom.');
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  startEdit(userId: string, name: string, p?: AdminDirectoryPlayer) {
    const known = p ?? this.dir()?.players.find((x) => x.userId === userId);
    this.edit.set({ userId, name, battletag: known?.battletag ?? '', classId: known?.classId ?? null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async savePlayer(e: { userId: string; battletag: string; classId: string | null }) {
    const ok = await this.run(
      () => this.api.adminDirectoryAction('player', { userId: e.userId, battletag: e.battletag.trim(), classId: e.classId }),
      '✅ Annuaire mis à jour.',
    );
    if (ok) {
      this.edit.set(null);
      this.adding.set(false);
      this.hits.set([]);
    }
  }

  async removePlayer(p: AdminDirectoryPlayer) {
    const what = this.cascade ? ' avec ses niveaux, persos et scores' : '';
    if (!confirm(`Supprimer ${p.name} (${p.battletag}) de l'annuaire${what} ?`)) return;
    await this.run(() => this.api.adminDirectoryAction('remove', { userId: p.userId, cascade: this.cascade }), `🗑️ ${p.name} supprimé.`);
  }

  async forget(c: { name: string; realm: string }) {
    // à la corbeille : rétablissable depuis 🪦 Corbeille
    if (!confirm(`${c.name} a été supprimé en jeu ?\n\nIl disparaît de l'annuaire et des métiers, et l'addon ne le fera plus revenir. Rétablissable.`)) return;
    await this.run(() => this.api.adminDirectoryAction('forget', { name: c.name, realm: c.realm }), `🪦 ${c.name} supprimé pour de bon.`);
  }

  async restore(key: string, name: string) {
    await this.run(() => this.api.adminDirectoryAction('restore', { key }), `↩ ${name} rétabli.`);
  }

  async link(key: string, userId: string | null) {
    if (!userId && !confirm(`Délier ${key} ? Ses dépôts et son suivi ne compteront plus pour ce joueur.`)) return;
    const done = userId ? `🧭 ${key} relié à ${this.memberName(userId)}.` : `✂️ ${key} délié.`;
    await this.run(() => this.api.adminDirectoryAction('link', { key, userId }), done);
    delete this.linkTo[key];
  }

  // true when the bot accepted the change
  private async run(call: () => Promise<{ directory: AdminDirectory }>, done: string) {
    this.busy.set(true);
    try {
      const { directory } = await call();
      this.dir.set(directory);
      this.toast.ok(done);
      return true;
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
