import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { AdminScore, AdminScoreMember, ScoreRolesSync, ScoreWeights } from '../core/models';
import { ToastService } from '../core/toast.service';

// One weight of the score: the bot's key, its label, and how it is stored (tenths, percent, points)
interface WeightField {
  key: keyof ScoreWeights;
  label: string;
  unit: 'tenth' | 'pct' | 'pts' | 'min' | 'n';
}
const WEIGHT_GROUPS: { title: string; hint: string; fields: WeightField[] }[] = [
  {
    title: '🎁 Objets donnés : valeur par qualité',
    hint: 'Points d’un objet avant la quantité (√quantité) et l’effort.',
    fields: [
      { key: 'qGrey', label: 'Gris', unit: 'tenth' },
      { key: 'qWhite', label: 'Blanc', unit: 'tenth' },
      { key: 'qGreen', label: 'Vert', unit: 'tenth' },
      { key: 'qBlue', label: 'Bleu', unit: 'tenth' },
      { key: 'qEpic', label: 'Violet et +', unit: 'tenth' },
      { key: 'itemsCapPct', label: 'Plafond', unit: 'pct' },
      { key: 'itemsFloor', label: 'Plancher', unit: 'pts' },
    ],
  },
  {
    title: '⚖️ Effort (niveau de l’objet ÷ niveau du donneur)',
    hint: 'Borné entre ces deux valeurs. 100 % : un niveau 30 qui donne un objet de niveau 30.',
    fields: [
      { key: 'effortMinPct', label: 'Minimum', unit: 'pct' },
      { key: 'effortMaxPct', label: 'Maximum', unit: 'pct' },
      { key: 'autoPct', label: 'Don reçu d’office (14 j)', unit: 'pct' },
    ],
  },
  {
    title: '💰 Or : points par pièce d’or selon le niveau',
    hint: 'Dépôts moins retraits : peut être négatif.',
    fields: [
      { key: 'b1', label: 'Niv 1-19', unit: 'tenth' },
      { key: 'b20', label: 'Niv 20-39', unit: 'tenth' },
      { key: 'b40', label: 'Niv 40-49', unit: 'tenth' },
      { key: 'b50', label: 'Niv 50+', unit: 'tenth' },
      { key: 'goldCapPct', label: 'Plafond', unit: 'pct' },
      { key: 'goldFloor', label: 'Plancher', unit: 'pts' },
    ],
  },
  {
    title: '🔨 Fabrications',
    hint: 'Par commande reçue par l’acheteur, quelle que soit la quantité.',
    fields: [
      { key: 'craft', label: 'Par commande', unit: 'tenth' },
      { key: 'craftsCapPct', label: 'Plafond', unit: 'pct' },
      { key: 'craftsFloor', label: 'Plancher', unit: 'pts' },
    ],
  },
  {
    title: '🧭 Suivi : le suiveur donne ses points au suivi',
    hint: 'À chaque tranche : base × (1 + n ÷ pas), n = tranches déjà suivies dans les 24 h, au plus le maximum. Le suiveur perd tout, le suivi reçoit au plus le plafond par jour. Sans plancher : un score peut devenir négatif.',
    fields: [
      { key: 'followEveryMin', label: 'Tranche (minutes)', unit: 'min' },
      { key: 'followBase', label: 'Base par tranche', unit: 'tenth' },
      { key: 'followStep', label: 'Pas (+100 % toutes les n tranches)', unit: 'n' },
      { key: 'followMaxPct', label: 'Maximum (% de la base)', unit: 'pct' },
      { key: 'followDailyCap', label: 'Reçu au plus par jour', unit: 'pts' },
    ],
  },
];
const CATS: Record<string, string> = { items: '🎁', gold: '💰', crafts: '🔨', follow: '🧭' };
const CAT_NAMES: Record<string, string> = { items: 'objets', gold: 'or', crafts: 'fabrications' };

// 🏅 Score (test) tab of /admin (pages/admin.ts): the guild help score, admins only, to judge the weights
// before players see anything. The bot recomputes it from the history at each load (score.js): ranking,
// each member's counted lines with their calculation, lines left out and why, and the weights to tune.
@Component({
  selector: 'app-admin-score',
  imports: [DatePipe, FormsModule],
  // only loaded with /admin (lazy chunk), not in the global stylesheet
  styles: `
    .sc-head {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      align-items: center;
      margin-bottom: 0.6rem;
    }
    .sc-table {
      width: 100%;
      border-collapse: collapse;
      th,
      td {
        padding: 0.3rem 0.4rem;
        text-align: right;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      th:nth-child(2),
      td:nth-child(2) {
        text-align: left;
      }
      tbody tr {
        cursor: pointer;
      }
      tbody tr.open,
      tbody tr:hover {
        background: rgba(255, 255, 255, 0.05);
      }
    }
    .sc-lines {
      list-style: none;
      margin: 0.3rem 0 0.6rem;
      padding: 0;
      li {
        display: grid;
        grid-template-columns: 4.5rem 1.5rem minmax(0, 1fr) 3.5rem;
        gap: 0.2rem 0.5rem;
        padding: 0.25rem 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }
      .calc {
        grid-column: 3 / 5;
        opacity: 0.75;
      }
      .pts {
        text-align: right;
        font-weight: 700;
      }
    }
    .sc-enable {
      display: flex;
      gap: 0.4rem;
      align-items: center;
      margin: 0.4rem 0;
      cursor: pointer;
    }
    .sc-roles {
      tbody tr {
        cursor: default;
      }
      th,
      td {
        text-align: left !important;
      }
      input {
        width: 6rem;
      }
      select {
        max-width: 100%;
      }
    }
    .sc-weights {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
      gap: 0.8rem;
      fieldset {
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 0.5rem 0.7rem;
      }
      label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        margin: 0.25rem 0;
      }
      input {
        width: 5.5rem;
        text-align: right;
      }
    }
  `,
  template: `
    <section class="tooltip admin-card">
      <h2>🏅 Score d’entraide (test)</h2>
      <p class="muted small">
        Visible des admins seulement : rien n’est montré aux joueurs (hors rôles Discord, s’ils sont actifs).
        Recalculé à chaque chargement depuis l’historique (dons des demandes, banque, commandes, suivi). Les
        activités ne comptent pas. Un score négatif (en rouge) : à voir pour les droits en jeu.
        Garde-fous : rien entre les persos d’un même compte, un don « Pas reçu » vaut 0, un perso relié à
        personne ne compte pas.
      </p>
      <div class="sc-head">
        <div class="tabs">
          <button type="button" [class.active]="period() === 'all'" (click)="setPeriod('all')">Depuis toujours</button>
          <button type="button" [class.active]="period() === 'month'" (click)="setPeriod('month')">Mois en cours</button>
        </div>
        <button type="button" class="btn ghost" [disabled]="busy()" (click)="load()">🔄 Recalculer</button>
      </div>
      @if (data(); as d) {
        @if (d.members.length) {
          <table class="sc-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Membre</th>
                <th title="Objets donnés, après plafond">🎁</th>
                <th title="Or à la banque, après plafond">💰</th>
                <th title="Fabrications reçues, après plafond">🔨</th>
                <th title="Suivi : reçu moins donné">🧭</th>
                <th>Total</th>
                <th title="Rôle Discord, d’après le score depuis toujours">Rôle</th>
              </tr>
            </thead>
            <tbody>
              @for (m of d.members; track m.userId; let i = $index) {
                <tr [class.open]="open() === m.userId" (click)="toggle(m)">
                  <td>{{ i + 1 }}</td>
                  <td>{{ m.name }}</td>
                  <td [title]="capTitle(m, 'items')">{{ n(m.items) }}{{ m.capped.includes('items') ? ' ⛔' : '' }}</td>
                  <td [title]="capTitle(m, 'gold')">{{ n(m.gold) }}{{ m.capped.includes('gold') ? ' ⛔' : '' }}</td>
                  <td [title]="capTitle(m, 'crafts')">{{ n(m.crafts) }}{{ m.capped.includes('crafts') ? ' ⛔' : '' }}</td>
                  <td>{{ n(m.follow) }}</td>
                  <td [class.refused]="m.total < 0"><b>{{ n(m.total) }}</b></td>
                  <td class="small">{{ m.role ?? '—' }}</td>
                </tr>
                @if (open() === m.userId) {
                  <tr>
                    <td colspan="8" style="text-align: left">
                      <ul class="sc-lines small">
                        @for (l of m.lines; track $index) {
                          <li>
                            <span class="muted">{{ l.at | date: 'dd/MM/yy' }}</span>
                            <span>{{ cat(l.cat) }}</span>
                            <span>{{ l.text }}</span>
                            <span class="pts">{{ n(l.points) }}</span>
                            <span class="calc">{{ l.calc }}</span>
                          </li>
                        }
                      </ul>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        } @else {
          <p class="muted">Rien à compter sur cette période.</p>
        }
        @if (d.excluded.length) {
          <details style="margin-top: 0.8rem">
            <summary>🚫 Non comptés ({{ d.excluded.length }})</summary>
            <ul class="sc-lines small">
              @for (x of d.excluded; track $index) {
                <li>
                  <span class="muted">{{ x.at | date: 'dd/MM/yy' }}</span>
                  <span></span>
                  <span>{{ x.text }}</span>
                  <span></span>
                  <span class="calc">{{ x.reason }}</span>
                </li>
              }
            </ul>
          </details>
        }
      } @else if (error(); as e) {
        <p class="refused">❌ {{ e }}</p>
      } @else {
        <p class="center muted">Calcul…</p>
      }
    </section>

    @if (data(); as d) {
      @if (rolesDraft(); as r) {
        <section class="tooltip admin-card">
          <h2>🎭 Rôles Discord</h2>
          <p class="muted small">
            Pour le fun, sans aucune permission : chaque membre reçoit le rôle du plus haut palier atteint par son
            score depuis toujours, et perd les autres. Reposés chaque jour, après chaque enregistrement et avec
            « Reposer maintenant ». Crée les rôles dans Discord (nom, couleur), puis choisis-les ici. Le bot a besoin
            de « Gérer les rôles », et son propre rôle doit être au-dessus de ceux-ci.
          </p>
          <label class="sc-enable">
            <input type="checkbox" [checked]="r.enabled" (change)="setRolesEnabled($any($event.target).checked)" />
            Rôles actifs (décoché : le bot retire ceux qu’il a posés)
          </label>
          <table class="sc-table sc-roles">
            <thead>
              <tr>
                <th>Palier</th>
                <th>Dès (points)</th>
                <th>Rôle Discord</th>
              </tr>
            </thead>
            <tbody>
              @for (t of r.tiers; track t.key) {
                <tr>
                  <td>{{ t.name }}</td>
                  <td><input type="number" step="1" [ngModel]="t.min" (ngModelChange)="editTier(t.key, 'min', $event)" /></td>
                  <td>
                    <select [ngModel]="t.roleId ?? ''" (ngModelChange)="editTier(t.key, 'roleId', $event)">
                      <option value="">— aucun —</option>
                      @for (g of d.roles.guildRoles; track g.id) {
                        <option [value]="g.id" [disabled]="!g.editable">
                          {{ g.name }}{{ g.editable ? '' : ' (au-dessus du bot)' }}{{ g.dangerous ? ' ⚠️ a des permissions' : '' }}
                        </option>
                      }
                    </select>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <div class="admin-actions">
            <button type="button" class="btn gold" [disabled]="busy()" (click)="saveRoles()">💾 Enregistrer les rôles</button>
            <button type="button" class="btn ghost" [disabled]="busy() || !d.roles.enabled" (click)="syncRoles()">🔄 Reposer maintenant</button>
          </div>
        </section>
      }
      <section class="tooltip admin-card">
        <h2>⚙️ Pondération</h2>
        <p class="muted small">Change une valeur, enregistre : le classement se recalcule. « Défaut » remet la valeur d’origine.</p>
        <div class="sc-weights">
          @for (g of groups; track g.title) {
            <fieldset>
              <legend>{{ g.title }}</legend>
              <p class="muted small">{{ g.hint }}</p>
              @for (f of g.fields; track f.key) {
                <label>
                  <span>
                    {{ f.label }}
                    <span class="muted small">(défaut {{ shown(f, d.defaults[f.key]) }})</span>
                  </span>
                  <span>
                    <input type="number" min="0" [step]="f.unit === 'tenth' ? 0.1 : 1" [ngModel]="draft()[f.key]" (ngModelChange)="edit(f.key, $event)" />
                    {{ f.unit === 'pct' ? '%' : f.unit === 'pts' ? 'pts' : f.unit === 'min' ? 'min' : '' }}
                  </span>
                </label>
              }
            </fieldset>
          }
        </div>
        <div class="admin-actions">
          <button type="button" class="btn gold" [disabled]="busy() || !dirty()" (click)="save()">💾 Enregistrer</button>
          <button type="button" class="btn ghost" [disabled]="busy()" (click)="reset()">↩️ Défaut</button>
        </div>
      </section>
    }
  `,
})
export class AdminScoreComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly groups = WEIGHT_GROUPS;
  readonly data = signal<AdminScore | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly period = signal<'month' | 'all'>('all');
  // Discord roles of the tiers, as edited (saved with « Enregistrer les rôles »)
  readonly rolesDraft = signal<{ enabled: boolean; tiers: { key: string; name: string; min: number; roleId: string | null }[] } | null>(null);
  readonly open = signal<string | null>(null);
  // the weights as shown (tenths as decimals), keyed like the bot's
  readonly draft = signal<Record<string, number>>({});

  private readonly fields = WEIGHT_GROUPS.flatMap((g) => g.fields);
  readonly dirty = computed(() => {
    const d = this.data();
    if (!d) return false;
    return this.fields.some((f) => this.stored(f, this.draft()[f.key]) !== d.weights[f.key]);
  });

  constructor() {
    this.load();
  }

  async load() {
    this.busy.set(true);
    try {
      const d = await this.api.adminScore(this.period());
      this.data.set(d);
      this.draft.set(Object.fromEntries(this.fields.map((f) => [f.key, this.shown(f, d.weights[f.key])])));
      this.rolesDraft.set({ enabled: d.roles.enabled, tiers: d.roles.tiers.map((t) => ({ ...t })) });
      this.error.set(null);
    } catch (err) {
      this.error.set(errorText(err));
    } finally {
      this.busy.set(false);
    }
  }

  setPeriod(p: 'month' | 'all') {
    this.period.set(p);
    this.load();
  }

  toggle(m: AdminScoreMember) {
    this.open.set(this.open() === m.userId ? null : m.userId);
  }

  edit(key: string, value: number) {
    this.draft.update((d) => ({ ...d, [key]: Number(value) }));
  }

  // tenths are stored as integers (1,5 → 15)
  shown(f: WeightField, v: number) {
    return f.unit === 'tenth' ? v / 10 : v;
  }
  private stored(f: WeightField, v: number) {
    return Math.round(f.unit === 'tenth' ? v * 10 : v);
  }

  async save(values?: Record<string, number>) {
    const d = this.data();
    if (!d) return;
    values ??= Object.fromEntries(this.fields.map((f) => [f.key, this.stored(f, this.draft()[f.key])]));
    this.busy.set(true);
    try {
      await this.api.adminScoreWeights(values);
      this.toast.ok('💾 Pondération enregistrée, score recalculé.');
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.busy.set(false);
    }
    await this.load();
  }

  reset() {
    const d = this.data();
    if (d) this.save({ ...d.defaults });
  }

  capTitle(m: AdminScoreMember, c: 'items' | 'gold' | 'crafts') {
    const raw = c === 'items' ? m.itemsRaw : c === 'gold' ? m.goldRaw : m.craftsRaw;
    return m.capped.includes(c) ? `Plafonné : ${this.n(raw)} avant le plafond des ${CAT_NAMES[c]}` : '';
  }

  editTier(key: string, field: 'min' | 'roleId', value: number | string | null) {
    this.rolesDraft.update(
      (r) =>
        r && {
          ...r,
          tiers: r.tiers.map((t) => (t.key === key ? { ...t, [field]: field === 'min' ? Math.round(Number(value)) : value || null } : t)),
        },
    );
  }
  setRolesEnabled(enabled: boolean) {
    this.rolesDraft.update((r) => r && { ...r, enabled });
  }

  async saveRoles() {
    const r = this.rolesDraft();
    if (!r) return;
    const tiers = r.tiers.map(({ key, min, roleId }) => ({ key, min, roleId }));
    await this.rolesCall(() => this.api.adminScoreRoles({ enabled: r.enabled, tiers }), '💾 Rôles enregistrés');
  }
  async syncRoles() {
    await this.rolesCall(() => this.api.adminScoreRolesSync(), '🔄 Rôles reposés');
  }
  private async rolesCall(call: () => Promise<{ sync: ScoreRolesSync }>, done: string) {
    this.busy.set(true);
    try {
      const { sync } = await call();
      this.toast.ok(`${done} : ${sync.added} posé(s), ${sync.removed} retiré(s).`);
      if (sync.errors.length) this.toast.error(`❌ ${sync.errors.length} erreur(s), dont ${sync.errors[0]}`);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.busy.set(false);
    }
    await this.load();
  }

  n(v: number) {
    return String(Math.round(v * 10) / 10).replace('.', ',');
  }
  cat(c: string) {
    return CATS[c] ?? '';
  }
}
