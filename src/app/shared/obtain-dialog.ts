import { Component, computed, effect, HostListener, inject, input, OnDestroy, output, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { DataService, money } from '../core/data.service';
import { NpcInfo } from '../core/models';

const WOWHEAD = 'https://www.wowhead.com/forever/fr';
const TRAINERS_SHOWN = 5;

// NPCs already received, kept while the page is open: reopening a window is instant
const known = new Map<string, NpcInfo>();

// « 📍 Obtention » of a recipe (recipe card): the pattern, the trainers and vendors (zone, position),
// and the monsters that drop the pattern, best drop rate first (name, type and level, zone, rate). Every
// name links to Wowhead Forever. Loaded only when opened (@defer in the recipe card).
@Component({
  selector: 'app-obtain-dialog',
  styles: `
    .ob {
      width: min(640px, 100%);
      max-height: calc(100vh - 2rem);
      overflow-y: auto;
    }
    .ob-head {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 0.5rem;
      h2 {
        margin: 0;
      }
    }
    .ob h3 {
      margin: 0.4rem 0 0.2rem;
      font-size: 1rem;
    }
    .ob ul {
      list-style: none;
      margin: 0;
      padding: 0;
      li {
        padding: 0.15rem 0;
      }
    }
    .ob a {
      color: inherit;
      text-decoration: underline dotted;
      &:hover {
        color: var(--gold, #f8d77c);
      }
    }
    .ob table {
      width: 100%;
      border-collapse: collapse;
      th,
      td {
        text-align: left;
        padding: 0.3rem 0.4rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        vertical-align: top;
      }
      th {
        font-weight: normal;
        opacity: 0.7;
        font-size: 0.85rem;
      }
      .rate {
        text-align: right;
        white-space: nowrap;
      }
    }
    .ob-kind {
      opacity: 0.8;
      font-size: 0.85rem;
      white-space: nowrap;
    }
    .ob-elite {
      color: #f8b84e;
    }
  `,
  template: `
    <div class="overlay" (click)="closed.emit()">
      <section class="tooltip dialog ob" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
        <div class="ob-head">
          <h2>📍 Obtention · {{ data.recipeName(spell()) }}</h2>
          <button type="button" class="btn ghost" (click)="closed.emit()" aria-label="Fermer">✕</button>
        </div>

        @if (recipe(); as r) {
          @if (r.scroll; as sc) {
            <p>
              📜 Patron
              <a [href]="wowhead + '/item=' + sc[0]" target="_blank" rel="noopener">« {{ data.itemName(sc[0]) }} » ↗</a>
              · métier {{ sc[1] }}
            </p>
          } @else if (r.fee; as fee) {
            <p>🎓 Appris chez un formateur · métier {{ fee[1] }} · {{ money(fee[0]) }}</p>
          }

          @if (trainers().length || vendors().length) {
            <h3>🧑 PNJ</h3>
            <ul>
              @for (v of vendors(); track v.id) {
                <li>
                  🛒 <a [href]="wowhead + '/npc=' + v.id" target="_blank" rel="noopener">{{ v.npc?.name ?? '…' }} ↗</a>
                  · {{ place(v.npc) }} · stock limité ({{ v.stock }})
                </li>
              }
              @for (t of shownTrainers(); track t.id) {
                <li>
                  🎓 <a [href]="wowhead + '/npc=' + t.id" target="_blank" rel="noopener">{{ t.npc?.name ?? '…' }} ↗</a>
                  · {{ place(t.npc) }}
                </li>
              }
            </ul>
            @if (trainers().length > shownTrainers().length) {
              <button type="button" class="btn ghost" (click)="allTrainers.set(true)">
                Voir les {{ trainers().length - shownTrainers().length }} autres formateurs
              </button>
            }
          }

          @if (mobs().length) {
            <h3>🗡️ Monstres</h3>
            <table>
              <thead>
                <tr>
                  <th>Monstre</th>
                  <th>Zone</th>
                  <th class="rate">Taux ▼</th>
                </tr>
              </thead>
              <tbody>
                @for (m of mobs(); track m.id) {
                  <tr>
                    <td>
                      <a [href]="wowhead + '/npc=' + m.id" target="_blank" rel="noopener">{{ m.npc?.name ?? '…' }} ↗</a>
                      @if (m.npc && kindText(m.npc); as k) {
                        <span class="ob-kind" [class.ob-elite]="m.npc.kind"> ({{ k }})</span>
                      }
                    </td>
                    <td>{{ m.npc ? (m.npc.zone ?? '—') : '…' }}</td>
                    <td class="rate">{{ rate(m.rate) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }

          @if (worldDrop()) {
            <p class="small">🎲 Tombe aussi en butin aléatoire sur les monstres de niveau proche.</p>
          }

          @if (nothing()) {
            <p class="muted">
              @if (r.scroll) {
                Pas de détail connu pour ce patron (vendeur, quête…) :
                <a [href]="wowhead + '/item=' + r.scroll[0]" target="_blank" rel="noopener">voir sa fiche Wowhead ↗</a>
              } @else {
                Source inconnue :
                <a [href]="wowhead + '/spell=' + spell()" target="_blank" rel="noopener">voir la recette sur Wowhead ↗</a>
              }
            </p>
          }

          @if (loading()) {
            <p class="muted small">Chargement des PNJ depuis Wowhead…</p>
          }
        }
      </section>
    </div>
  `,
})
export class ObtainDialogComponent implements OnDestroy {
  protected data = inject(DataService);
  private api = inject(ApiService);
  protected readonly wowhead = WOWHEAD;
  protected readonly money = money;

  readonly spell = input.required<string>();
  readonly closed = output<void>();

  readonly allTrainers = signal(false);
  private readonly npcs = signal<Record<string, NpcInfo>>(Object.fromEntries(known));
  private readonly pending = signal(0);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private alive = true;

  readonly recipe = computed(() => this.data.recipe(this.spell()));
  private readonly scrollId = computed(() => this.recipe()?.scroll?.[0] ?? null);

  readonly mobs = computed(() => {
    const c = this.data.catalog();
    const id = this.scrollId();
    const all = this.npcs();
    return (id && c?.scrollDrops[id] ? [...c.scrollDrops[id]] : [])
      .sort((a, b) => b[1] - a[1])
      .map(([npc, rate]) => ({ id: String(npc), rate, npc: (all[npc] as NpcInfo | undefined) ?? null }));
  });
  readonly vendors = computed(() => {
    const c = this.data.catalog();
    const id = this.scrollId();
    const all = this.npcs();
    return (id && c?.limited[id] ? c.limited[id] : []).map(([npc, stock]) => ({ id: String(npc), stock, npc: (all[npc] as NpcInfo | undefined) ?? null }));
  });
  readonly trainers = computed(() => {
    const c = this.data.catalog();
    const set = this.recipe()?.tr;
    const all = this.npcs();
    return (set && c?.trainerSets?.[set] ? c.trainerSets[set] : [])
      .map((npc) => ({ id: String(npc), npc: (all[npc] as NpcInfo | undefined) ?? null }))
      .sort(
        (a, b) =>
          (a.npc?.zone ?? '~').localeCompare(b.npc?.zone ?? '~') || (a.npc?.name ?? '').localeCompare(b.npc?.name ?? ''),
      );
  });
  readonly shownTrainers = computed(() => (this.allTrainers() ? this.trainers() : this.trainers().slice(0, TRAINERS_SHOWN)));
  readonly worldDrop = computed(() => {
    const id = this.scrollId();
    return Boolean(id && this.data.catalog()?.worldDrops.includes(id));
  });
  readonly nothing = computed(
    () =>
      !this.mobs().length &&
      !this.vendors().length &&
      !this.trainers().length &&
      !this.worldDrop() &&
      !(this.recipe()?.fee && !this.recipe()?.scroll),
  );
  readonly loading = computed(() => this.pending() > 0);

  // NPC ids to ask, from the catalog only (not from the NPCs received: no new round for each answer).
  // Monsters and vendors first: they are the fewest.
  private readonly ids = computed(() => {
    const c = this.data.catalog();
    const id = this.scrollId();
    const set = this.recipe()?.tr;
    return [
      ...(id ? (c?.scrollDrops[id] ?? []) : []).map(([npc]) => npc),
      ...(id ? (c?.limited[id] ?? []) : []).map(([npc]) => npc),
      ...((set && c?.trainerSets?.[set]) || []),
    ].map(String);
  });

  constructor() {
    effect(() => {
      const ids = this.ids().filter((id) => !known.has(id));
      queueMicrotask(() => this.fetch(ids, 0));
    });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closed.emit();
  }

  ngOnDestroy() {
    this.alive = false;
    if (this.timer) clearTimeout(this.timer);
  }

  // The bot answers those it has, and asks Wowhead for the others (about one a second): ask again
  private async fetch(ids: string[], round: number) {
    if (!this.alive || !ids.length) return this.pending.set(0);
    this.pending.set(ids.length);
    let missing: string[] = [];
    try {
      const res = await this.api.npcs(ids);
      for (const [id, n] of Object.entries(res.npcs)) known.set(id, n);
      this.npcs.set(Object.fromEntries(known));
      missing = res.missing;
    } catch {
      missing = ids;
    }
    if (!this.alive) return;
    if (!missing.length || round >= 15) return this.pending.set(0);
    this.pending.set(missing.length);
    this.timer = setTimeout(() => this.fetch(missing, round + 1), 3000);
  }

  place(n: NpcInfo | null) {
    if (!n) return '…';
    if (!n.zone) return 'zone inconnue';
    return n.coords ? `${n.zone} · ${n.coords[0]}, ${n.coords[1]}` : n.zone;
  }

  kindText(n: NpcInfo) {
    const level = n.level ? `niv. ${n.level.replace(' - ', '-')}` : null;
    return [n.kind, level].filter(Boolean).join(', ');
  }

  rate(r: number) {
    return `${r.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
  }
}
