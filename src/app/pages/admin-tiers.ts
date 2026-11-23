import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { AchievementDef, AdminTierAchievement, AdminTierMeasure, AdminTiers } from '../core/models';
import { ToastService } from '../core/toast.service';
import { duration } from '../shared/guild-ui';

const CATS: { key: AchievementDef['cat']; label: string }[] = [
  { key: 'bank', label: 'Banque' },
  { key: 'follow', label: 'Suivi' },
  { key: 'craft', label: 'Atelier' },
];
const RARITIES: { key: AchievementDef['rarity']; label: string }[] = [
  { key: 'common', label: 'Commun' },
  { key: 'rare', label: 'Rare' },
  { key: 'epic', label: 'Épique' },
  { key: 'legendary', label: 'Légendaire' },
];

// « 1 po 63 a 2 c », like the bot
function money(copper: number) {
  const parts = [];
  if (copper >= 10000) parts.push(`${Math.floor(copper / 10000)} po`);
  if (copper % 10000 >= 100) parts.push(`${Math.floor((copper % 10000) / 100)} a`);
  if (copper % 100) parts.push(`${copper % 100} c`);
  return parts.join(' ') || '0';
}

// 🏆 Paliers tab of /admin (pages/admin.ts): new achievements on the measures the bot already follows
// (Gros poisson at 1 po → a 10 po tier). Members who already reach it unlock it at once, in one grouped
// announcement in the bank channel; later ones are announced one by one, like the other achievements.
@Component({
  selector: 'app-admin-tiers',
  imports: [DatePipe, FormsModule],
  // only loaded with /admin (lazy chunk), not in the global stylesheet
  styles: `
    .tier-list {
      list-style: none;
      margin: 0.3rem 0 0.6rem;
      padding: 0;
      li {
        display: flex;
        flex-wrap: wrap;
        gap: 0.2rem 0.5rem;
        align-items: baseline;
        padding: 0.25rem 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
      .tier-new {
        color: #ffd100;
      }
    }
    .tier-row {
      display: flex;
      gap: 0.4rem;
      align-items: end;
      flex-wrap: wrap;
      .field {
        flex: 1;
        min-width: 7rem;
      }
      .tier-icon {
        flex: 0 0 4.5rem;
        min-width: 0;
      }
    }
    .tier-edit {
      width: 100%;
      margin: 0.3rem 0 0.4rem;
    }
    .tier-rarity {
      font-style: italic;
    }
  `,
  template: `
    @if (tiers(); as t) {
      <div class="admin-grid">
        <section class="tooltip admin-card">
          <h2>➕ Nouveau palier</h2>
          <p class="muted small">
            Un nouveau haut fait sur une mesure que le bot suit déjà. Ceux qui l’ont déjà atteint le débloquent tout
            de suite, dans une seule annonce du salon de la banque.
          </p>
          <label class="field">
            <span>Mesure</span>
            <select [ngModel]="measureKey()" (ngModelChange)="pick($event)">
              @for (c of cats; track c.key) {
                <optgroup [label]="c.label">
                  @for (m of measuresOf(t, c.key); track m.key) {
                    <option [ngValue]="m.key">{{ m.label }}</option>
                  }
                </optgroup>
              }
            </select>
          </label>
          @if (measure(); as m) {
            <p class="small">Déjà sur cette mesure :</p>
            <ul class="tier-list small">
              @for (a of m.achievements; track a.id) {
                <li>
                  <span>{{ a.icon ?? '🏆' }} <b>{{ a.name }}</b></span>
                  <span>{{ fmt(m, a.target) }}</span>
                  <span class="muted">{{ a.holders }} membre(s){{ a.custom ? ' · palier' : '' }}</span>
                </li>
              } @empty {
                <li class="muted">Aucun haut fait pour l’instant.</li>
              }
            </ul>

            <div class="tier-row">
              <label class="field">
                <span>Objectif ({{ unitLabel(m) }})</span>
                <input type="number" min="0" [step]="m.unit === 'count' ? 1 : 'any'" [ngModel]="amount()" (ngModelChange)="amount.set($event)" />
              </label>
              <label class="field tier-icon">
                <span>Icône</span>
                <input [(ngModel)]="icon" maxlength="8" placeholder="🐋" />
              </label>
            </div>
            <p class="small">
              @if (target(); as goal) {
                @if (sameGoal(); as same) {
                  <span class="bad">⚠️ « {{ same }} » a déjà cet objectif.</span>
                } @else if (reached().length) {
                  🔓 Débloqué tout de suite par <b>{{ reached().length }}</b> membre(s) :
                  {{ reachedNames() }}
                } @else {
                  Personne ne l’a encore atteint ({{ fmt(m, goal) }}).
                }
              } @else {
                <span class="muted">Entre un objectif.</span>
              }
            </p>
            <div class="tier-row">
              <label class="field">
                <span>Nom</span>
                <input [(ngModel)]="name" maxlength="40" placeholder="ex. Baleine" />
              </label>
              <label class="field">
                <span>Rareté</span>
                <select [(ngModel)]="rarity">
                  @for (r of rarities; track r.key) {
                    <option [ngValue]="r.key">{{ r.label }}</option>
                  }
                </select>
              </label>
            </div>
            <label class="field">
              <span>Description <span class="muted small">(vide : celle proposée)</span></span>
              <input [(ngModel)]="desc" maxlength="140" [placeholder]="defaultDesc()" />
            </label>
            <div class="admin-actions">
              <button type="button" class="btn gold" [disabled]="busy() || !target() || !!sameGoal() || !name.trim()" (click)="create()">
                🆕 Créer et annoncer
              </button>
            </div>
          }
        </section>

        <section class="tooltip admin-card">
          <h2>🏆 Paliers créés</h2>
          <ul class="tier-list">
            @for (a of created(); track a.tier.id) {
              <li>
                @if (editing() === a.tier.id) {
                  <div class="tier-edit">
                    <div class="tier-row">
                      <label class="field tier-icon">
                        <span>Icône</span>
                        <input [(ngModel)]="edit.icon" maxlength="8" />
                      </label>
                      <label class="field">
                        <span>Nom</span>
                        <input [(ngModel)]="edit.name" maxlength="40" />
                      </label>
                      <label class="field">
                        <span>Rareté</span>
                        <select [(ngModel)]="edit.rarity">
                          @for (r of rarities; track r.key) {
                            <option [ngValue]="r.key">{{ r.label }}</option>
                          }
                        </select>
                      </label>
                    </div>
                    <label class="field">
                      <span>Description <span class="muted small">(vide : celle proposée)</span></span>
                      <input [(ngModel)]="edit.desc" maxlength="140" [placeholder]="descFor(a.measure, a.tier.target)" />
                    </label>
                    <p class="muted small">L’objectif ne change pas : supprime le palier et crée-en un autre.</p>
                    <div class="admin-actions">
                      <button type="button" class="btn gold" [disabled]="busy() || !edit.name.trim()" (click)="saveEdit(a.tier)">
                        Enregistrer
                      </button>
                      <button type="button" class="btn ghost" (click)="editing.set(null)">Annuler</button>
                    </div>
                  </div>
                } @else {
                  <span>{{ a.tier.icon ?? '🏆' }} <b>{{ a.tier.name }}</b></span>
                  <span class="small tier-rarity">{{ rarityLabel(a.tier.rarity) }}</span>
                  <span class="small">{{ a.measure.label }} : {{ fmt(a.measure, a.tier.target) }}</span>
                  <span class="small muted">
                    {{ a.tier.holders }} membre(s) · par {{ a.tier.createdBy }} le {{ (a.tier.createdAt ?? 0) * 1000 | date: 'dd/MM' }}
                  </span>
                  <span class="small">{{ a.tier.desc }}</span>
                  <span class="admin-actions">
                    <button type="button" class="btn ghost" [disabled]="busy()" (click)="startEdit(a.tier)">✏️ Modifier</button>
                    <button type="button" class="btn danger" [disabled]="busy()" (click)="remove(a.tier)">🗑️ Supprimer</button>
                  </span>
                }
              </li>
            } @empty {
              <li class="muted small">Aucun palier pour l’instant.</li>
            }
          </ul>
          <p class="muted small">
            Les paliers s’affichent sur la page Hauts faits, rangés après les hauts faits de leur mesure.
          </p>
        </section>
      </div>
    } @else if (error(); as e) {
      <p class="refused">❌ {{ e }}</p>
    } @else {
      <p class="center muted">Chargement…</p>
    }
  `,
})
export class AdminTiersComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly tiers = signal<AdminTiers | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly cats = CATS;
  readonly rarities = RARITIES;

  readonly measureKey = signal('maxDep');
  readonly amount = signal<number | null>(null);
  name = '';
  icon = '';
  desc = '';
  rarity: AchievementDef['rarity'] = 'epic';

  readonly editing = signal<string | null>(null);
  edit = { name: '', icon: '', desc: '', rarity: 'epic' as AchievementDef['rarity'] };

  readonly measure = computed(() => this.tiers()?.measures.find((m) => m.key === this.measureKey()) ?? null);

  // the goal in the bot's unit: copper, seconds or a count
  readonly target = computed(() => {
    const m = this.measure();
    const v = Number(this.amount());
    if (!m || !Number.isFinite(v) || v <= 0) return 0;
    if (m.unit === 'copper') return Math.round(v * 10000);
    if (m.unit === 'seconds') return Math.round(v * 60);
    return Number.isInteger(v) ? v : 0;
  });
  readonly sameGoal = computed(() => {
    const goal = this.target();
    return (goal && this.measure()?.achievements.find((a) => a.target === goal)?.name) || null;
  });
  readonly reached = computed(() => {
    const goal = this.target();
    return goal ? (this.measure()?.values ?? []).filter((v) => v.value >= goal) : [];
  });
  readonly reachedNames = computed(() => {
    const list = this.reached().map((v) => v.name);
    return list.length > 10 ? `${list.slice(0, 10).join(', ')}…` : list.join(', ');
  });
  readonly defaultDesc = computed(() => {
    const m = this.measure();
    return m ? this.descFor(m, this.target()) : '';
  });
  readonly created = computed(() =>
    (this.tiers()?.measures ?? []).flatMap((m) => m.achievements.filter((a) => a.custom).map((tier) => ({ tier, measure: m }))),
  );

  constructor() {
    this.load();
  }

  async load() {
    try {
      this.tiers.set(await this.api.adminTiers());
      this.error.set(null);
    } catch (err) {
      this.error.set(errorText(err));
    }
  }

  measuresOf(t: AdminTiers, cat: AchievementDef['cat']) {
    return t.measures.filter((m) => m.cat === cat);
  }

  pick(key: string) {
    this.measureKey.set(key);
    this.amount.set(null);
  }

  unitLabel(m: AdminTierMeasure) {
    return m.unit === 'copper' ? 'en po' : m.unit === 'seconds' ? 'en minutes' : 'nombre';
  }

  fmt(m: AdminTierMeasure, v: number) {
    return m.unit === 'copper' ? money(v) : m.unit === 'seconds' ? duration(v) : String(v);
  }

  descFor(m: AdminTierMeasure, target: number) {
    return target ? m.desc.replace('{v}', this.fmt(m, target)) : m.desc.replace('{v}', '…');
  }

  rarityLabel(r: string) {
    return RARITIES.find((x) => x.key === r)?.label ?? r;
  }

  async create() {
    const m = this.measure();
    const target = this.target();
    if (!m || !target) return;
    const n = this.reached().length;
    const text =
      `Créer « ${this.name.trim()} » (${m.label} : ${this.fmt(m, target)}) ?\n\n` +
      (n ? `${n} membre(s) le débloquent tout de suite, ` : 'Personne ne l’a encore, ') +
      'annonce dans le salon de la banque.';
    if (!confirm(text)) return;
    await this.run(
      () => this.api.adminTierAction('create', { measure: m.key, target, name: this.name, icon: this.icon, desc: this.desc, rarity: this.rarity }),
      (holders) => `🆕 Palier créé, ${holders ?? 0} déblocage(s) annoncé(s).`,
      () => {
        this.amount.set(null);
        this.name = this.icon = this.desc = '';
      },
    );
  }

  startEdit(a: AdminTierAchievement) {
    this.edit = { name: a.name, icon: a.icon ?? '', desc: a.ownDesc ?? '', rarity: a.rarity };
    this.editing.set(a.id);
  }

  async saveEdit(a: AdminTierAchievement) {
    await this.run(
      () => this.api.adminTierAction('update', { id: a.id, ...this.edit }),
      () => '✅ Palier modifié.',
      () => this.editing.set(null),
    );
  }

  async remove(a: AdminTierAchievement) {
    if (!confirm(`Supprimer « ${a.name} » ?\n\nSes ${a.holders} déblocage(s) sont effacés, sans annonce.`)) return;
    await this.run(
      () => this.api.adminTierAction('delete', { id: a.id }),
      () => '🗑️ Palier supprimé.',
    );
  }

  private async run(
    call: () => Promise<{ result: { holders?: number }; tiers: AdminTiers }>,
    done: (holders?: number) => string,
    after?: () => void,
  ) {
    this.busy.set(true);
    try {
      const { result, tiers } = await call();
      this.tiers.set(tiers);
      after?.();
      this.toast.ok(done(result.holders));
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.busy.set(false);
    }
  }
}
