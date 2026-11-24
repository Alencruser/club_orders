import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { AdminDirectory, AdminDirectoryPlayer, AdminMemberHit } from '../core/models';
import { ToastService } from '../core/toast.service';

// 📇 Annuaire tab of /admin (pages/admin.ts): every player (Discord member → battletag, class, known
// characters), add / edit / delete a battletag, characters deleted in game, characters nobody claims
// (seen in the bank or the follow log without a known battletag) linked to a player.
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

      <section class="tooltip admin-card wide">
        <h2>📇 Joueurs ({{ shown().length }}/{{ d.players.length }})</h2>
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
                <span class="muted small">{{ p.characters.length }} perso(s)</span>
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
                  <h4>Persos connus (addon)</h4>
                  <ul class="admin-list">
                    @for (c of p.characters; track c.name + c.realm) {
                      <li class="admin-dir-hit">
                        <span class="grow"
                          >{{ c.name }} <span class="muted small">{{ c.classLabel }} niv. {{ c.level }} · {{ c.realm }}</span></span
                        >
                        <button type="button" class="btn ghost" title="Supprimé en jeu : retiré pour de bon" [disabled]="busy()" (click)="forget(c)">
                          🪦
                        </button>
                      </li>
                    } @empty {
                      <li class="muted small">Aucun perso connu.</li>
                    }
                  </ul>
                  <h4>Persos reliés (banque, suivi, duels)</h4>
                  <ul class="admin-list">
                    @for (k of p.links; track k) {
                      <li class="admin-dir-hit">
                        <span class="grow">{{ k }}</span>
                        <button type="button" class="btn ghost" title="Délier" [disabled]="busy()" (click)="link(k, null)">✂️</button>
                      </li>
                    } @empty {
                      <li class="muted small">Aucun.</li>
                    }
                  </ul>
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
                  @if (u.follow) { · {{ u.follow }} suivi(s) }</span></span
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
          <h2>🪦 Persos supprimés ({{ d.forgotten.length }})</h2>
          <p class="muted small">Supprimés en jeu : l'addon les renvoie, le bot les ignore. Rétablir pour les accepter à nouveau.</p>
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

  readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const players = this.dir()?.players ?? [];
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
