import { Component, computed, effect, HostListener, inject, input, OnDestroy, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { DataService, money } from '../core/data.service';
import { NpcInfo, PatternSources } from '../core/models';
import { readStore, writeStore } from '../core/storage';

const WOWHEAD = 'https://www.wowhead.com/forever/fr';
const SHOWN = 5; // trainers or vendors listed before « voir les autres »

// NPCs and pattern sources already received, kept in this browser: reopening a window is instant, even
// after a reload. Only complete answers (Wowhead's part there); the oldest go past the cap.
const NPC_STORE = 'co.npcs';
const PATTERN_STORE = 'co.patterns';
const NPC_MAX = 3000;
const PATTERN_MAX = 800;
const known = new Map<string, NpcInfo>(Object.entries(readStore<Record<string, NpcInfo>>(NPC_STORE, {})));
const knownPatterns = new Map<string, PatternSources>(Object.entries(readStore<Record<string, PatternSources>>(PATTERN_STORE, {})));

function persist<T>(key: string, map: Map<string, T>, max: number) {
  while (map.size > max) map.delete(map.keys().next().value as string);
  writeStore(key, Object.fromEntries(map));
}
// kinds of source Wowhead gives without naming anyone
const KINDS: Record<number, string> = { 1: 'fabriqué par un artisan', 2: 'butin', 4: 'récompense de quête', 5: 'vendu par un marchand', 7: 'découverte', 16: 'pêche', 21: 'butin' };
const RANKS: Record<number, string> = { 4: 'Neutre', 5: 'Amical', 6: 'Honoré', 7: 'Révéré', 8: 'Exalté' };

type WhQuest = { quest: number; name: string; zone: string | null };
type WhNpc = { npc: number; name: string; zone: string | null; kind: 'vendor' | 'drop' };

interface Vendor {
  id: string;
  name: string | null; // when Wowhead's NPC page isn't there (yet)
  zone: string | null;
  coords: [number, number] | null;
  side: string | null; // A / H
  price: number | null;
  stock: number | null; // limited stock (SkillUp)
  limited: boolean; // limited stock (ForeverDB)
  unseen: boolean; // ForeverDB: Classic data, not seen in Forever yet
  npc: NpcInfo | null;
}

interface Mob {
  id: string | null; // null: named by ForeverDB only (English name, no id)
  name: string | null;
  rate: number | null;
  zone: string | null;
  npc: NpcInfo | null;
  forever?: boolean; // ForeverDB: seen dropping it in Forever
}

// « 📍 Obtention » of a recipe (recipe card): the pattern, the trainers, vendors and quests (zone, position,
// faction), and the monsters that drop the pattern, best drop rate first (name, type and level, zone, rate).
// Three sources put together: SkillUp Forever (trainers, drop rates, limited stock), Wowhead (French names,
// zones, positions) and ForeverDB.net (every vendor, faction, quests, reputation; credited at the bottom, as
// its licence asks). Loaded on the first click (recipe card).
@Component({
  selector: 'app-obtain-dialog',
  styles: `
    .ob {
      width: min(660px, 100%);
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
    .ob-seen {
      margin-left: 0.4rem;
      font-size: 0.75rem;
      color: #1eff00;
      white-space: nowrap;
    }
    .ob-side {
      font-size: 0.75rem;
      padding: 0 0.3rem;
      border-radius: 4px;
      margin-right: 0.2rem;
      &.A {
        background: rgba(60, 110, 220, 0.45);
      }
      &.H {
        background: rgba(200, 50, 40, 0.45);
      }
    }
    .ob-loading {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin: 0.5rem 0;
      padding: 0.5rem 0.7rem;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.06);
    }
    .ob-spin {
      flex: none;
      display: inline-block;
      width: 1.3rem;
      height: 1.3rem;
      border: 3px solid rgba(248, 215, 124, 0.25);
      border-top-color: #f8d77c;
      border-radius: 50%;
      animation: ob-spin 0.8s linear infinite;
      &.small {
        width: 0.8rem;
        height: 0.8rem;
        border-width: 2px;
        vertical-align: -0.1rem;
      }
    }
    @keyframes ob-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .ob-spin {
        animation-duration: 2.4s;
      }
    }
    .ob-credit {
      margin-top: 0.6rem;
      opacity: 0.65;
      font-size: 0.8rem;
    }
  `,
  template: `
    <div class="overlay" (click)="closed.emit()">
      <section class="tooltip dialog ob" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
        <div class="ob-head">
          <h2>📍 Obtention · {{ item()?.name ?? data.recipeName(spell() ?? '') }}</h2>
          <button type="button" class="btn ghost" (click)="closed.emit()" aria-label="Fermer">✕</button>
        </div>

        @if (loading() || patternLoading()) {
          <div class="ob-loading" role="status" aria-live="polite">
            <span class="ob-spin" aria-hidden="true"></span>
            <span class="small">
              Chargement des infos depuis Wowhead…
              <span class="muted">La première fois, ça prend quelques secondes ; ensuite c’est instantané.</span>
            </span>
          </div>
        }

        @if (recipe() || item()) {
          @if (item()?.craft; as cr) {
            <p>
              🔨 Fabriqué en <b>{{ cr.profession ?? 'métier' }}</b>
              @if (cr.level) {
                (niveau {{ cr.level }})
              }
              @if (cr.artisans.length) {
                · dans la guilde : {{ cr.artisans.join(', ') }}
              } @else {
                · aucun artisan de la guilde relevé
              }
              · <a href="/grimoire" (click)="goGrimoire($event)">voir la recette au Grimoire</a>
            </p>
          }
          @if (recipe()?.scroll; as sc) {
            <p>
              📜 Patron
              <a [href]="wowhead + '/item=' + sc[0]" target="_blank" rel="noopener">« {{ data.itemName(sc[0]) }} » ↗</a>
              · métier {{ sc[1] }}
            </p>
          } @else if (recipe()?.fee; as fee) {
            <p>🎓 Appris chez un formateur · métier {{ fee[1] }} · {{ money(fee[0]) }}</p>
          }
          @if (fdb()?.r; as rep) {
            <p class="small">🏅 Réputation requise : {{ rep[0] }} · {{ rank(rep[1]) }}</p>
          }

          @if (trainers().length || vendors().length || quests().length) {
            <h3>🧑 PNJ et quêtes</h3>
            <ul>
              @for (q of quests(); track q.name) {
                <li>
                  ❗ Quête <a [href]="q.href" target="_blank" rel="noopener">« {{ q.name }} » ↗</a>
                  @if (q.zone) {
                    · {{ q.zone }}
                  }
                </li>
              }
              @for (v of shownVendors(); track v.id) {
                <li>
                  🛒
                  @if (v.side === 'A' || v.side === 'H') {
                    <span class="ob-side {{ v.side }}">{{ v.side === 'A' ? 'Alliance' : 'Horde' }}</span>
                  }
                  <a [href]="wowhead + '/npc=' + v.id" target="_blank" rel="noopener">
                    @if (v.npc?.name ?? v.name; as n) {
                      {{ n }}
                    } @else if (v.npc) {
                      PNJ n°{{ v.id }}
                    } @else {
                      <span class="ob-spin small" aria-label="chargement"></span>
                    }
                    ↗</a
                  >
                  · {{ vendorPlace(v) }}
                  @if (v.price) {
                    · {{ money(v.price) }}
                  }
                  @if (v.stock) {
                    · stock limité ({{ v.stock }})
                  } @else if (v.limited) {
                    · stock limité
                  }
                  @if (v.unseen) {
                    <span class="muted small" title="Donnée de WoW Classic, pas encore vue dans Forever"> · à confirmer</span>
                  }
                </li>
              }
              @if (vendors().length > shownVendors().length) {
                <li>
                  <button type="button" class="btn ghost" (click)="allVendors.set(true)">
                    Voir les {{ vendors().length - shownVendors().length }} autres vendeurs
                  </button>
                </li>
              }
              @if (moreVendors() > 0) {
                <li class="muted small">… et {{ moreVendors() }} autre(s) vendeur(s) non détaillé(s)</li>
              }
              @for (t of shownTrainers(); track t.id) {
                <li>
                  🎓
                  <a [href]="wowhead + '/npc=' + t.id" target="_blank" rel="noopener">
                    @if (t.npc) {
                      {{ t.npc.name ?? 'PNJ n°' + t.id }}
                    } @else {
                      <span class="ob-spin small" aria-label="chargement"></span>
                    }
                    ↗</a
                  >
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
                @for (m of mobs(); track $index) {
                  <tr>
                    <td>
                      <a [href]="m.id ? wowhead + '/npc=' + m.id : search(m.name ?? '')" target="_blank" rel="noopener">
                        @if (m.npc?.name ?? m.name; as n) {
                          {{ n }}
                        } @else if (m.npc) {
                          Monstre n°{{ m.id }}
                        } @else {
                          <span class="ob-spin small" aria-label="chargement"></span>
                        }
                        ↗
                      </a>
                      @if (m.npc && kindText(m.npc); as k) {
                        <span class="ob-kind" [class.ob-elite]="m.npc.kind"> ({{ k }})</span>
                      }
                      @if (m.forever) {
                        <span class="ob-seen" title="ForeverDB.net : des joueurs l’ont vu tomber sur ce monstre dans Forever">✔ vu dans Forever</span>
                      }
                    </td>
                    <td>{{ m.npc ? (m.npc.zone ?? m.zone ?? '—') : (m.zone ?? (m.id ? '…' : '—')) }}</td>
                    <td class="rate">{{ m.rate === null ? '—' : rate(m.rate) }}</td>
                  </tr>
                }
              </tbody>
            </table>
            @if (dropNote(); as note) {
              <p class="muted small">{{ note }}</p>
            }
          }

          @if (worldDrop()) {
            <p class="small">🎲 Tombe aussi en butin aléatoire sur les monstres de niveau proche.</p>
          }

          @if (otherKinds().length && scrollId()) {
            <p class="small">
              🔎 {{ item()?.craft || mobs().length || vendors().length || quests().length || trainers().length || worldDrop() ? 'Aussi' : 'Source' }} :
              {{ otherKinds().join(', ') }}, sans plus de détail ;
              <a [href]="wowhead + '/item=' + scrollId()" target="_blank" rel="noopener"
                >{{ item() ? 'voir la fiche de l’objet' : 'voir la fiche du patron' }} ↗</a
              >
            </p>
          }

          @if (nothing()) {
            <p class="muted">
              @if (item()) {
                Personne ne sait encore où trouver cet objet :
                <a [href]="wowhead + '/item=' + scrollId()" target="_blank" rel="noopener">voir sa fiche Wowhead ↗</a>
              } @else if (recipe()?.scroll) {
                Personne ne sait encore où trouver ce patron :
                <a [href]="wowhead + '/item=' + scrollId()" target="_blank" rel="noopener">voir sa fiche Wowhead ↗</a>
              } @else {
                Source inconnue :
                <a [href]="wowhead + '/spell=' + spell()" target="_blank" rel="noopener">voir la recette sur Wowhead ↗</a>
              }
            </p>
          }


          <p class="ob-credit">
            Sources : SkillUp Forever, Wowhead et
            <a href="https://foreverdb.net" target="_blank" rel="noopener">Data from ForeverDB.net</a>
          </p>
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

  // a recipe (Grimoire: where to get its pattern), or an item worn (Armurerie: where to get the item)
  readonly spell = input<string | null>(null);
  readonly item = input<{
    id: number;
    name: string;
    craft: { profession: string | null; level?: number | null; artisans: string[] } | null;
  } | null>(null);
  readonly closed = output<void>();
  private router = inject(Router);

  readonly allTrainers = signal(false);
  readonly allVendors = signal(false);
  private readonly npcs = signal<Record<string, NpcInfo>>(Object.fromEntries(known));
  private readonly pending = signal(0);
  private readonly patterns = signal<Record<string, PatternSources>>(Object.fromEntries(knownPatterns));
  readonly patternLoading = signal(false);
  private alive = true;

  readonly recipe = computed(() => {
    const spell = this.spell();
    return spell ? this.data.recipe(spell) : null;
  });
  // the item whose sources are shown: the item worn, else the recipe's pattern
  readonly scrollId = computed(() => this.item()?.id ?? this.recipe()?.scroll?.[0] ?? null);

  // everything known about the pattern (null: not received yet, or no pattern)
  private readonly sources = computed(() => {
    const id = this.scrollId();
    return id ? ((this.patterns()[id] as PatternSources | undefined) ?? null) : null;
  });
  readonly fdb = computed(() => this.sources()?.fdb ?? null);
  private readonly whNpcs = computed(() => (this.sources()?.more ?? []).filter((m): m is WhNpc => 'npc' in m));
  private readonly whQuests = computed(() => (this.sources()?.more ?? []).filter((m): m is WhQuest => 'quest' in m));

  // Wowhead's quests (French), else ForeverDB's (English, found with Wowhead's search)
  readonly quests = computed(() => {
    const wh = this.whQuests();
    if (wh.length) return wh.map((q) => ({ name: q.name, zone: q.zone, href: `${WOWHEAD}/quest=${q.quest}` }));
    return (this.fdb()?.q ?? []).map(([name]) => ({ name, zone: null as string | null, href: this.search(name) }));
  });

  // SkillUp's drop rates first (best first), then the monsters only Wowhead names (rate unknown); if neither
  // names one, ForeverDB's main monster (English name)
  readonly mobs = computed(() => {
    const c = this.data.catalog();
    const id = this.scrollId();
    const all = this.npcs();
    const drops = (id && c?.scrollDrops[id] ? [...c.scrollDrops[id]] : []).sort((a, b) => b[1] - a[1]);
    const list: Mob[] = drops.map(([npc, rate]) => ({ id: String(npc), name: null, rate, zone: null, npc: this.npcOf(all, npc) }));
    for (const m of this.whNpcs())
      if (m.kind === 'drop' && !list.some((x) => x.id === String(m.npc)))
        list.push({ id: String(m.npc), name: m.name, rate: null, zone: m.zone, npc: this.npcOf(all, m.npc) });
    // ForeverDB: monsters seen dropping it in Forever (marked; those already listed only get the mark and the rate)
    for (const [npc, name, rate] of this.sources()?.fdbMobs ?? []) {
      const same = list.find((x) => (npc ? x.id === String(npc) : (x.npc?.name ?? x.name ?? '').toLowerCase() === name.toLowerCase()));
      if (same) {
        same.forever = true;
        same.rate ??= rate;
      } else list.push({ id: npc ? String(npc) : null, name, rate, zone: null, npc: npc ? this.npcOf(all, npc) : null, forever: true });
    }
    const d = this.fdb()?.d;
    if (!list.length && d) list.push({ id: null, name: d[0], rate: d[1], zone: null, npc: null });
    return list;
  });
  readonly dropNote = computed(() => {
    const f = this.fdb();
    const parts: string[] = [];
    if (f?.d && f.d[2] > this.mobs().length) parts.push(`Lâché par ${f.d[2]} monstres au total.`);
    if (f?.s?.[0]) parts.push(`Vu tomber ${f.s[0]} fois chez ${f.s[1]} joueur(s) dans Forever.`);
    return parts.join(' ');
  });

  // Vendors from the three sources, merged by NPC
  readonly vendors = computed(() => {
    const c = this.data.catalog();
    const id = this.scrollId();
    const all = this.npcs();
    const src = this.sources();
    const byId = new Map<string, Vendor>();
    const get = (npc: number | string) => {
      const key = String(npc);
      let v = byId.get(key);
      if (!v) {
        v = { id: key, name: null, zone: null, coords: null, side: null, price: null, stock: null, limited: false, unseen: false, npc: this.npcOf(all, key) };
        byId.set(key, v);
      }
      return v;
    };
    for (const [npc, stock] of id ? (c?.limited[id] ?? []) : []) get(npc).stock = stock;
    for (const m of this.whNpcs())
      if (m.kind === 'vendor') Object.assign(get(m.npc), { name: m.name, zone: m.zone });
    for (const [npc, price, limited] of src?.fdb?.v ?? []) {
      const v = get(npc);
      const info = src?.fdbNpcs[npc];
      v.price = price || null;
      v.limited ||= Boolean(limited);
      if (info) {
        v.name ??= info[0];
        v.coords ??= info[1] !== null && info[2] !== null ? [info[1], info[2]] : null;
        v.side = info[3];
        v.unseen = !info[4];
      }
    }
    // seen in Forever first, then by faction and name
    return [...byId.values()].sort(
      (a, b) => Number(a.unseen) - Number(b.unseen) || (a.side ?? '').localeCompare(b.side ?? '') || (a.npc?.name ?? a.name ?? '').localeCompare(b.npc?.name ?? b.name ?? ''),
    );
  });
  readonly shownVendors = computed(() => (this.allVendors() ? this.vendors() : this.vendors().slice(0, SHOWN)));
  // vendors ForeverDB counts but doesn't list
  readonly moreVendors = computed(() => Math.max(0, (this.fdb()?.vc ?? 0) - Math.max(this.vendors().length, this.fdb()?.v?.length ?? 0)));

  readonly trainers = computed(() => {
    const c = this.data.catalog();
    const set = this.recipe()?.tr;
    const all = this.npcs();
    return (set && c?.trainerSets?.[set] ? c.trainerSets[set] : [])
      .map((npc) => ({ id: String(npc), npc: this.npcOf(all, npc) }))
      .sort((a, b) => (a.npc?.zone ?? '~').localeCompare(b.npc?.zone ?? '~') || (a.npc?.name ?? '').localeCompare(b.npc?.name ?? ''));
  });
  readonly shownTrainers = computed(() => (this.allTrainers() ? this.trainers() : this.trainers().slice(0, SHOWN)));

  readonly worldDrop = computed(() => {
    const id = this.scrollId();
    return Boolean(id && this.data.catalog()?.worldDrops.includes(id));
  });
  // kinds of source Wowhead knows but nothing above details
  readonly otherKinds = computed(() => {
    const s = this.sources()?.source;
    if (!s) return [];
    const shown = new Set<string>();
    if (this.vendors().length) shown.add(KINDS[5]);
    if (this.quests().length) shown.add(KINDS[4]);
    if (this.mobs().length || this.worldDrop()) shown.add(KINDS[2]);
    if (this.item()?.craft) shown.add(KINDS[1]);
    return [...new Set(s.map((k) => KINDS[k]).filter((k) => k && !shown.has(k)))];
  });
  readonly nothing = computed(
    () =>
      !this.mobs().length &&
      !this.vendors().length &&
      !this.trainers().length &&
      !this.worldDrop() &&
      !this.quests().length &&
      !this.otherKinds().length &&
      !this.item()?.craft &&
      !this.patternLoading() &&
      !(this.recipe()?.fee && !this.recipe()?.scroll),
  );
  readonly loading = computed(() => this.pending() > 0);

  // NPC ids to ask Wowhead for (French name, zone, position, level), from the catalog and the pattern's
  // sources only (not from the NPCs received: no new round for each answer). Monsters and vendors first.
  private readonly ids = computed(() => {
    const c = this.data.catalog();
    const id = this.scrollId();
    const set = this.recipe()?.tr;
    return [
      ...new Set(
        [
          ...(id ? (c?.scrollDrops[id] ?? []) : []).map(([npc]) => npc),
          ...(id ? (c?.limited[id] ?? []) : []).map(([npc]) => npc),
          ...this.whNpcs().map((m) => m.npc),
          ...(this.fdb()?.v ?? []).map(([npc]) => npc),
          ...(this.sources()?.fdbMobs ?? []).map(([npc]) => npc).filter((npc): npc is number => npc !== null),
          ...((set && c?.trainerSets?.[set]) || []),
        ].map(String),
      ),
    ];
  });

  constructor() {
    // recipes imported again (new ForeverDB data): the sources kept in this browser are dropped
    const at = this.data.catalog()?.importedAt;
    if (at && readStore<number>(PATTERN_STORE + '.at', 0) !== at) {
      knownPatterns.clear();
      this.patterns.set({});
      writeStore(PATTERN_STORE, {});
      writeStore(PATTERN_STORE + '.at', at);
    }
    effect(() => {
      const id = this.scrollId();
      const have = id ? knownPatterns.get(String(id)) : null;
      if (id && !have?.more) queueMicrotask(() => this.fetchPattern(String(id), 0));
    });
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
  }

  private npcOf(all: Record<string, NpcInfo>, id: number | string) {
    return (all[id] as NpcInfo | undefined) ?? null;
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
      if (Object.keys(res.npcs).length) persist(NPC_STORE, known, NPC_MAX);
      missing = res.missing;
    } catch {
      missing = ids;
    }
    if (!this.alive) return;
    if (!missing.length || round >= 15) return this.pending.set(0);
    this.pending.set(missing.length);
    setTimeout(() => this.fetch(missing, round + 1), 3000);
  }

  // The pattern's sources: ForeverDB's at once, Wowhead's once the bot has them (asked again meanwhile)
  private async fetchPattern(id: string, round: number) {
    if (!this.alive) return;
    this.patternLoading.set(true);
    let missing = true;
    try {
      const res = await this.api.patterns([id]);
      if (res.patterns[id]) {
        knownPatterns.set(id, res.patterns[id]);
        this.patterns.set(Object.fromEntries(knownPatterns));
        if (res.patterns[id].more) persist(PATTERN_STORE, knownPatterns, PATTERN_MAX);
      }
      missing = res.missing.includes(id);
    } catch {
      missing = true;
    }
    if (!this.alive) return;
    if (!missing || round >= 10) return this.patternLoading.set(false);
    setTimeout(() => this.fetchPattern(id, round + 1), 2500);
  }

  // the item's recipe in the Grimoire (searched by the item's name)
  goGrimoire(e: Event) {
    e.preventDefault();
    const name = this.item()?.name;
    this.closed.emit();
    this.router.navigate(['/grimoire'], { queryParams: { recherche: name } });
  }

  place(n: NpcInfo | null, zone: string | null = null) {
    if (!n) return zone ?? '…';
    if (n.unknown) return zone ?? 'zone inconnue';
    if (!n.zone) return zone ?? 'zone inconnue';
    return n.coords ? `${n.zone} · ${n.coords[0]}, ${n.coords[1]}` : n.zone;
  }

  // Wowhead's zone (French) and position, else ForeverDB's position
  vendorPlace(v: Vendor) {
    const zone = v.npc?.zone ?? v.zone;
    const coords = v.npc?.coords ?? v.coords;
    if (!zone && !coords) return v.npc ? 'zone inconnue' : '…';
    return [zone, coords ? `${coords[0]}, ${coords[1]}` : null].filter(Boolean).join(' · ');
  }

  kindText(n: NpcInfo) {
    const level = n.level ? `niv. ${n.level.replace(' - ', '-')}` : null;
    return [n.kind, level].filter(Boolean).join(', ');
  }

  rank(r: number) {
    return RANKS[r] ?? `rang ${r}`;
  }

  search(name: string) {
    return `${WOWHEAD}/search?q=${encodeURIComponent(name)}`;
  }

  rate(r: number) {
    return `${r.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
  }
}
