import { Injectable, computed, inject, signal, untracked } from '@angular/core';
import { ApiService } from './api.service';
import { Artisan, Catalog, Recipe, Tooltip } from './models';
import { readStore, writeStore } from './storage';

// Recipe color for a profession level: -1 not learnable yet, 0 orange, 1 yellow, 2 green, 3 grey.
export function colorAt(recipe: Recipe, level: number) {
  const [orange, yellow, green, grey] = recipe.t;
  if (level < orange) return -1;
  if (level < yellow) return 0;
  if (level < green) return 1;
  if (level < grey) return 2;
  return 3;
}

export const COLOR_NAMES: Record<number, string> = {
  [-1]: 'pas encore apprenable',
  0: 'orange : un point de métier à coup sûr',
  1: 'jaune : un point de métier probable',
  2: 'vert : un point de métier rare',
  3: 'gris : plus aucun point de métier',
};

// Copper → "1 po 20 pa 5 pc"
export function money(copper: number) {
  const g = Math.floor(copper / 10000);
  const s = Math.floor((copper % 10000) / 100);
  const c = copper % 100;
  return [g && `${g} po`, s && `${s} pa`, (c || (!g && !s)) && `${c} pc`].filter(Boolean).join(' ');
}

export interface Crafter {
  artisan: Artisan;
  level: number;
  color: number | null;
}

const TOOLTIP_CACHE = 'co.tooltips';
const TOOLTIP_CACHE_MAX = 4000;

// The catalog (recipes, items), the artisans, and Wowhead tooltips (icons, stats) asked as cards show.
@Injectable({ providedIn: 'root' })
export class DataService {
  private api = inject(ApiService);

  readonly catalog = signal<Catalog | null>(null);
  readonly artisans = signal<Artisan[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly tooltips = signal<Record<string, Tooltip>>(readStore(TOOLTIP_CACHE, {}));

  // spell → crafters who know it, best color first then highest level
  readonly crafters = computed(() => {
    const map = new Map<string, Crafter[]>();
    for (const artisan of this.artisans()) {
      for (const p of Object.values(artisan.professions)) {
        for (const [spell, color] of Object.entries(p.recipes ?? {})) {
          const list = map.get(spell) ?? [];
          list.push({ artisan, level: p.level ?? 0, color });
          map.set(spell, list);
        }
      }
    }
    for (const list of map.values())
      list.sort((a, b) => (a.color ?? 9) - (b.color ?? 9) || b.level - a.level);
    return map;
  });

  private wanted = new Set<string>();
  private tries = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [catalog, artisans] = await Promise.all([this.api.catalog(), this.api.artisans()]);
      this.catalog.set(catalog);
      this.artisans.set(artisans);
    } catch {
      this.error.set(
        'Impossible de charger le catalogue : le bot ne répond pas, réessaie dans un moment.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async refreshArtisans() {
    this.artisans.set(await this.api.artisans());
  }

  recipe(spell: string | number) {
    return this.catalog()?.recipes[spell] ?? null;
  }

  outputItemId(spell: string | number) {
    return this.recipe(spell)?.o?.[0] ?? null;
  }

  // Tooltip (and icon) of a recipe: its crafted item, or « s<spell> » for a recipe that crafts nothing
  // (enchants: the bot gives the spell's effect, « +2 Endurance »…)
  tooltipKey(spell: string | number): string | null {
    if (!this.recipe(spell)) return null;
    const id = this.outputItemId(spell);
    return id ? String(id) : `s${spell}`;
  }

  itemName(itemId: number) {
    return this.catalog()?.items[itemId]?.n ?? `Objet ${itemId}`;
  }

  recipeName(spell: string | number) {
    const id = this.outputItemId(spell);
    return (
      (id && this.catalog()?.items[id]?.n) || this.catalog()?.names[spell] || `Recette ${spell}`
    );
  }

  quality(spell: string | number) {
    const id = this.outputItemId(spell);
    return (id && this.catalog()?.items[id]?.q) ?? 1;
  }

  // No pattern, no trainer price and an orange threshold of 1: the source is unknown and the level a
  // guess (same rule as the bot, crafts.js)
  guessed(recipe: Recipe) {
    return !recipe.scroll && !recipe.fee && recipe.t[0] <= 1;
  }

  learnLevel(recipe: Recipe) {
    return (
      recipe.scroll?.[1] ??
      recipe.fee?.[1] ??
      (this.guessed(recipe) ? Math.max(1, recipe.t[1] - 30) : recipe.t[0])
    );
  }

  // How the recipe is learned, in a few words
  learnText(recipe: Recipe) {
    const c = this.catalog();
    const level = this.learnLevel(recipe);
    if (recipe.scroll) {
      const [scrollId] = recipe.scroll;
      const how = [
        c?.scrollDrops[scrollId] ? 'butin' : null,
        c?.worldDrops.includes(scrollId) ? 'butin aléatoire' : null,
        c?.limited[scrollId] ? 'vendeur, stock limité' : null,
      ].filter(Boolean);
      return `Patron « ${this.itemName(scrollId)} » · métier ${level}${how.length ? ` · ${how.join(', ')}` : ''}`;
    }
    if (recipe.fee) return `Formateur · métier ${level} · ${money(recipe.fee[0])}`;
    if (this.guessed(recipe)) return `Source inconnue · métier ≈ ${level}`;
    return `Formateur · métier ${level}`;
  }

  professionName(skill: number | string) {
    return this.catalog()?.professions[skill] ?? `Métier ${skill}`;
  }

  // Ask the tooltips of these items; cached ones come at once, missing ones are asked again later.
  want(ids: (number | string | null | undefined)[]) {
    // untracked: a component asking from an effect must not re-run each time a tooltip arrives
    const have = untracked(this.tooltips);
    for (const raw of ids) {
      const id = raw ? String(raw) : '';
      if (id && !have[id] && (this.tries.get(id) ?? 0) < 4) this.wanted.add(id);
    }
    if (this.wanted.size && !this.timer) this.timer = setTimeout(() => this.fetchTooltips(), 60);
  }

  private async fetchTooltips() {
    this.timer = null;
    const ids = [...this.wanted].slice(0, 60);
    ids.forEach((id) => this.wanted.delete(id));
    try {
      const { items, missing } = await this.api.items(ids);
      if (Object.keys(items).length) {
        this.tooltips.update((t) => ({ ...t, ...items }));
        const all = this.tooltips();
        const keys = Object.keys(all);
        writeStore(
          TOOLTIP_CACHE,
          keys.length > TOOLTIP_CACHE_MAX
            ? Object.fromEntries(keys.slice(-TOOLTIP_CACHE_MAX).map((k) => [k, all[k]]))
            : all,
        );
      }
      for (const id of ids) if (!items[id]) this.tries.set(id, (this.tries.get(id) ?? 0) + 1);
      // the bot fetches the missing ones from Wowhead in the background: ask again a bit later
      if (missing.length) setTimeout(() => this.want(missing), 4000);
    } catch {
      for (const id of ids) this.tries.set(id, (this.tries.get(id) ?? 0) + 1);
    }
    if (this.wanted.size && !this.timer) this.timer = setTimeout(() => this.fetchTooltips(), 60);
  }

  // Materials of crafts: [{ spell, qty }] → [{ id, qty }], sorted by name. qty is a number of items;
  // a craft that makes several gives them all at once.
  materials(entries: { spell: string | number; qty: number }[]) {
    const sum = new Map<number, number>();
    for (const { spell, qty } of entries) {
      const recipe = this.recipe(spell);
      if (!recipe) continue;
      const crafts = Math.ceil(qty / Math.max(1, recipe.o?.[1] ?? 1));
      for (const [id, n] of recipe.r) sum.set(id, (sum.get(id) ?? 0) + n * crafts);
    }
    return [...sum.entries()]
      .map(([id, qty]) => ({ id, qty }))
      .sort((a, b) => this.itemName(a.id).localeCompare(this.itemName(b.id)));
  }
}
