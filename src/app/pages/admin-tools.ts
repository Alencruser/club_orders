import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { AdminReleaseEntry, AdminTools } from '../core/models';
import { ToastService } from '../core/toast.service';

// 🛠️ Outils tab of /admin (pages/admin.ts): companion filters, professions board, recipes, Wowhead
// cache, update announcements, channel tests, redraw and purge (the Discord dashboard's 🛠️ Outils).
@Component({
  selector: 'app-admin-tools',
  imports: [DatePipe, FormsModule],
  template: `
    @if (tools(); as t) {
      <div class="admin-grid">
        <section class="tooltip admin-card">
          <h2>🎯 Filtres du compagnon</h2>
          <label class="field">
            Guilde (vide : toutes)
            <input [(ngModel)]="guild" maxlength="60" placeholder="ex. Bagarre club" />
          </label>
          <label class="field">
            Royaume, début du nom (vide : tous)
            <input [(ngModel)]="realm" maxlength="60" />
          </label>
          <div class="admin-actions">
            <button type="button" class="btn gold" (click)="saveFilters()">Enregistrer</button>
          </div>
          <p class="muted small">
            Avec une guilde, seuls ses événements (ou ceux sans guilde) sont acceptés, et un officier
            fait <code>/wos code</code> une fois pour tous.
          </p>
        </section>

        <section class="tooltip admin-card">
          <h2>📖 Recettes et 🖼️ Wowhead</h2>
          <p>
            @if (t.recipes; as r) {
              WoW Forever {{ r.build }} · {{ r.recipes }} recettes, {{ r.items }} objets
              @if (r.importedAt) {
                <span class="muted small">(importées le {{ r.importedAt * 1000 | date: 'd MMM, HH:mm' }})</span>
              }
            } @else {
              ❌ pas encore importées
            }
          </p>
          <p>
            @if (t.wowhead; as w) {
              Cache Wowhead : {{ w.cached }}/{{ w.total }} objets
              {{ w.warming ? '· ⏳ remplissage en cours' : w.cached >= w.total ? '· ✅ complet' : '' }}
            }
          </p>
          <div class="admin-actions">
            <button type="button" class="btn ghost" [disabled]="t.importing" (click)="recipes()">
              {{ t.importing ? '⏳ Import en cours…' : '⬇️ Mettre à jour les recettes' }}
            </button>
            <button type="button" class="btn ghost" [disabled]="!t.recipes || t.wowhead?.warming" (click)="wowhead()">
              ▶️ Relancer Wowhead
            </button>
          </div>
        </section>

        <section class="tooltip admin-card wide">
          <h2>⚒️ Carte des métiers</h2>
          <div class="admin-board">
            @for (b of t.blocks; track b.key) {
              <fieldset>
                <legend>{{ b.title }}</legend>
                @for (p of b.skills; track p.skill) {
                  <label><input type="checkbox" [checked]="!hidden().has(p.skill)" (change)="toggleSkill(p.skill)" /> {{ p.name }}</label>
                }
                <label class="field small">
                  Niveau minimum
                  <input type="number" min="0" max="450" [(ngModel)]="minLevel[b.key]" />
                </label>
              </fieldset>
            }
          </div>
          <div class="admin-actions">
            <label><input type="radio" name="per-player" [checked]="!onePerPlayer" (change)="onePerPlayer = false" /> Tous les persos</label>
            <label><input type="radio" name="per-player" [checked]="onePerPlayer" (change)="onePerPlayer = true" /> 1 perso par joueur</label>
            <label>
              Artisans par page
              <select [(ngModel)]="perPage">
                @for (n of t.perPageChoices; track n) {
                  <option [ngValue]="n">{{ n }}</option>
                }
              </select>
            </label>
            <span class="grow"></span>
            <button type="button" class="btn gold" (click)="saveBoard()">Enregistrer la carte</button>
          </div>
        </section>

        <section class="tooltip admin-card wide">
          <h2>📢 Annonces des mises à jour</h2>
          <p>
            Salon : {{ t.releases.channelId ? 'lié (🔗 Salons)' : '❌ non lié (🔗 Salons)' }} ·
            Dernière :
            @if (t.releases.last; as l) {
              <b>{{ l.title }}</b> · <span class="muted small">{{ l.at | date: 'd MMM, HH:mm' }}</span>
            } @else {
              aucune
            }
          </p>
          @for (p of t.releases.pending; track p.title) {
            <p class="small" [class.bad]="p.stale">
              ⏳ en attente : <b>{{ p.title }}</b> ({{ p.missing.join(', ') || 'prête' }}){{ p.stale ? ' · plus de 24 h : pas d’annonce automatique' : '' }}
            </p>
          }
          @if (t.releases.error) {
            <p class="bad small">⚠️ notes illisibles : {{ t.releases.error }}</p>
          }
          <div class="admin-actions">
            <label>
              Mention
              <select [ngModel]="t.releases.mention" (ngModelChange)="setMention($event)">
                @for (m of mentionKeys(t); track m) {
                  <option [value]="m">{{ t.releases.mentions[m] }}</option>
                }
              </select>
            </label>
            <button type="button" class="btn ghost" (click)="loadReleases()">📋 Voir les annonces</button>
          </div>
          @if (releases(); as list) {
            @for (e of list; track e.key) {
              <article class="admin-release">
                <div class="admin-release-head">
                  <b>{{ e.title }}</b>
                  <span class="small" [class.good]="e.ready" [class.bad]="!e.ready">
                    {{ e.ready ? '✅ prête' : '⏳ ' + e.missing.join(', ') }}
                  </span>
                  @if (e.announced) {
                    <span class="muted small">· déjà annoncée</span>
                  }
                  <span class="grow"></span>
                  <button type="button" class="btn ghost" (click)="openRelease.set(openRelease() === e.key ? null : e.key)">
                    {{ openRelease() === e.key ? 'Masquer' : 'Aperçu' }}
                  </button>
                  <button type="button" class="btn gold" (click)="publish(e)">📢 Publier</button>
                </div>
                @if (openRelease() === e.key) {
                  <pre class="admin-pre">{{ e.body }}</pre>
                }
              </article>
            } @empty {
              <p class="muted">Aucune entrée dans docs/annonces.md.</p>
            }
          }
        </section>

        <section class="tooltip admin-card wide">
          <h2>🧪 Salons et tableaux</h2>
          <div class="admin-actions">
            <button type="button" class="btn ghost" (click)="test()">🧪 Tester les salons</button>
            <button type="button" class="btn ghost" (click)="redraw()">♻️ Redessiner les tableaux</button>
            <button type="button" class="btn danger" (click)="purge()">🗑️ Vider le salon battletags</button>
          </div>
          <p class="muted small">
            🧪 une carte TEST dans chaque salon Wall of Shame lié (supprimée après 1 minute, ne compte
            pas) · ♻️ battletags, classement, métiers, activités et tableau de bord redessinés sur place
            · 🗑️ tous les messages du salon des battletags supprimés, bannière et tableau repostés.
          </p>
          @if (testLines(); as lines) {
            <ul class="small">
              @for (l of lines; track $index) {
                <li>{{ l }}</li>
              }
            </ul>
          }
        </section>
      </div>
    } @else {
      <p class="center muted">Chargement…</p>
    }
  `,
})
export class AdminToolsComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly changed = output<void>();

  readonly tools = signal<AdminTools | null>(null);
  readonly hidden = signal(new Set<number>());
  readonly releases = signal<AdminReleaseEntry[] | null>(null);
  readonly openRelease = signal<string | null>(null);
  readonly testLines = signal<string[] | null>(null);
  guild = '';
  realm = '';
  onePerPlayer = false;
  perPage = 6;
  minLevel: Record<string, number> = {};
  private polling: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load(true);
    inject(DestroyRef).onDestroy(() => this.polling && clearTimeout(this.polling));
  }

  async load(fillForms = false) {
    try {
      const t = await this.api.adminTools();
      this.tools.set(t);
      if (fillForms) {
        this.guild = t.filters.guild ?? '';
        this.realm = t.filters.realm ?? '';
        this.hidden.set(new Set(t.board.hidden));
        this.onePerPlayer = t.board.onePerPlayer;
        this.perPage = t.board.perPage;
        this.minLevel = { ...t.board.minLevel };
      }
      // recipes import / Wowhead cache running: check again in a few seconds
      if (this.polling) clearTimeout(this.polling);
      if (t.importing || t.wowhead?.warming) this.polling = setTimeout(() => this.load(), 5000);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  mentionKeys(t: AdminTools) {
    return Object.keys(t.releases.mentions);
  }

  private async run(action: () => Promise<string>) {
    try {
      this.toast.ok(await action());
      await this.load();
      this.changed.emit();
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  saveFilters() {
    return this.run(async () => {
      await this.api.adminTool('filters', { guild: this.guild, realm: this.realm });
      return '✅ Filtres du compagnon enregistrés.';
    });
  }

  toggleSkill(skill: number) {
    this.hidden.update((s) => {
      const next = new Set(s);
      if (!next.delete(skill)) next.add(skill);
      return next;
    });
  }

  saveBoard() {
    return this.run(async () => {
      const r = await this.api.adminTool<{ summary: string }>('board', {
        hidden: [...this.hidden()],
        onePerPlayer: this.onePerPlayer,
        perPage: this.perPage,
        minLevel: this.minLevel,
      });
      return `✅ Carte des métiers : ${r.summary}.`;
    });
  }

  recipes() {
    if (!confirm('Réimporter les recettes de WoW Forever ? Quelques dizaines de secondes ; la carte des métiers est redessinée.')) return;
    return this.run(async () => {
      await this.api.adminTool('recipes');
      return '⬇️ Import lancé : la carte se met à jour toute seule.';
    });
  }

  wowhead() {
    return this.run(async () => {
      const r = await this.api.adminTool<{ left: number }>('wowhead');
      return `▶️ Cache Wowhead relancé (${r.left} objet(s) à récupérer).`;
    });
  }

  async setMention(mention: string) {
    await this.run(async () => {
      await this.api.adminSetMention(mention);
      return '✅ Mention des annonces enregistrée.';
    });
  }

  async loadReleases() {
    try {
      this.releases.set(await this.api.adminReleases());
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  async publish(e: AdminReleaseEntry) {
    const warn = [e.announced ? 'Elle a déjà été annoncée.' : '', e.ready ? '' : `Pas prête : ${e.missing.join(', ')}.`].filter(Boolean).join(' ');
    if (!confirm(`Publier « ${e.title} » dans le salon des annonces ?${warn ? `\n\n⚠️ ${warn}` : ''}`)) return;
    await this.run(async () => {
      const r = await this.api.adminPublishRelease(e.key);
      await this.loadReleases();
      return `📢 ${r.title} publiée${r.channel ? ` dans #${r.channel}` : ''}.`;
    });
  }

  async test() {
    try {
      const r = await this.api.adminTool<{ lines: string[] }>('test');
      this.testLines.set(r.lines);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  redraw() {
    return this.run(async () => {
      await this.api.adminTool('redraw');
      return '♻️ Tableaux redessinés.';
    });
  }

  purge() {
    if (!confirm('Vider le salon des battletags ? Tous ses messages sont supprimés (même épinglés), les messages privés du bot fermés, puis la bannière et le tableau repostés. Les battletags enregistrés ne sont pas touchés.')) return;
    return this.run(async () => {
      const r = await this.api.adminTool<{ removed: number; channel: string }>('purge');
      return `🗑️ ${r.removed} message(s) supprimé(s) dans #${r.channel}, tableau reposté.`;
    });
  }
}
