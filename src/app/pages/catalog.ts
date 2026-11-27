import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../core/data.service';
import { charKey, SessionService } from '../core/session.service';
import { RecipeCardComponent } from '../shared/recipe-card';
import { CLASS_NAMES, classColor } from '../shared/ui';

// Icon of each profession (Wowhead icons)
const PROF_ICONS: Record<number, string> = {
  171: 'trade_alchemy',
  164: 'trade_blacksmithing',
  333: 'trade_engraving',
  202: 'trade_engineering',
  165: 'inv_misc_armorkit_17',
  197: 'trade_tailoring',
  185: 'inv_misc_food_15',
  129: 'spell_holy_sealofsacrifice',
  356: 'trade_fishing',
  186: 'trade_mining',
  182: 'spell_nature_naturetouchgrow',
  393: 'inv_misc_pelt_wolf_01',
  633: 'spell_nature_moonkey', // lockpicking (rogues)
};
const LOCKPICKING = 633;
const PAGE = 24;

// « Emplacement » filter: the item's slot (game InventoryType) for armor and weapons, like the Discord
// filter (bot crafts.js SLOTS), else its category; in this order in the list
const SLOT_GROUPS: [number[], string][] = [
  [[1], 'Tête'],
  [[2], 'Cou'],
  [[3], 'Épaules'],
  [[16], 'Dos'],
  [[5, 20], 'Torse'],
  [[4], 'Chemise'],
  [[19], 'Tabard'],
  [[9], 'Poignets'],
  [[10], 'Mains'],
  [[6], 'Taille'],
  [[7], 'Jambes'],
  [[8], 'Pieds'],
  [[11], 'Doigt'],
  [[12], 'Bijou'],
  [[13, 21], 'Une main'],
  [[17], 'Deux mains'],
  [[22, 23], 'Main gauche'],
  [[14], 'Bouclier'],
  [[15, 25, 26], 'Distance'],
  [[24], 'Munitions'],
];
const CATEGORY_GROUPS = ['Consommables', 'Enchantements', 'Sacs', 'Composants et autres'];
const GROUP_ORDER = [...SLOT_GROUPS.map(([, name]) => name), ...CATEGORY_GROUPS];
function slotGroup(item: { slot: number; c: number | null } | null): string {
  if (!item) return 'Enchantements'; // recipes without an item
  if (item.c === 4 || item.c === 2) return SLOT_GROUPS.find(([types]) => types.includes(item.slot))?.[1] ?? 'Composants et autres';
  if (item.c === 0) return 'Consommables';
  if (item.c === 1) return 'Sacs';
  return 'Composants et autres';
}

// The book: profession → artisan → recipe cards. The choice is in the address (?metier=165&artisan=…),
// so a page can be shared and the back button works.
@Component({
  selector: 'app-catalog',
  imports: [FormsModule, RecipeCardComponent],
  template: `
    <div class="page-head">
      <h1 class="page-banner"><img src="/titles/grimoire.webp" alt="Grimoire" /></h1>
    </div>
    <div class="book">
      <nav class="book-index tooltip" aria-label="Métiers">
        <h2>Grimoire</h2>
        @for (block of data.catalog()?.blocks ?? []; track block.key) {
          <h3>{{ block.title }}</h3>
          @for (skill of block.skills; track skill) {
            <button
              type="button"
              class="prof"
              [class.active]="skill === profession()"
              (click)="go(skill, null)"
            >
              <img [src]="profIcon(skill)" alt="" />
              <span>{{ data.professionName(skill) }}</span>
              <span class="muted">{{ artisansOf(skill).length }}</span>
            </button>
          }
        }
      </nav>

      <section class="book-page">
        <div class="toolbar tooltip">
          <label class="field">
            <span>Commander pour</span>
            @if (session.characters().length) {
              <select [ngModel]="buyerKey()" (ngModelChange)="session.chooseBuyer($event)">
                @for (c of session.characters(); track charKey(c)) {
                  <option [value]="charKey(c)">
                    {{ c.name }}{{ c.level ? ' · ' + c.level : ''
                    }}{{ c.class ? ' · ' + className(c.class) : '' }}
                  </option>
                }
              </select>
            } @else {
              <input
                placeholder="Nom de ton perso"
                [ngModel]="session.typedName()"
                (ngModelChange)="session.setTypedName($event)"
              />
            }
          </label>
          <label class="field grow">
            <span>Recherche</span>
            <input
              type="search"
              placeholder="Nom d’objet (toutes les recettes si aucun métier choisi)"
              [ngModel]="search()"
              (ngModelChange)="search.set($event); shown.set(PAGE)"
            />
          </label>
          <label class="field">
            <span>Qualité</span>
            <select [ngModel]="quality()" (ngModelChange)="quality.set(+$event); shown.set(PAGE)">
              <option [value]="-1">Toutes</option>
              <option [value]="1">Commune+</option>
              <option [value]="2">Inhabituelle+</option>
              <option [value]="3">Rare+</option>
              <option [value]="4">Épique</option>
            </select>
          </label>
          <label class="field">
            <span>Emplacement</span>
            <select [ngModel]="slotShown()" (ngModelChange)="slot.set($event); shown.set(PAGE)">
              <option value="">Tous</option>
              @for (g of slotChoices(); track g) {
                <option [value]="g">{{ g }}</option>
              }
            </select>
          </label>
          <label class="field small-field">
            <span>Niveau objet</span>
            <span class="range">
              <input
                type="number"
                min="0"
                max="60"
                placeholder="min"
                [ngModel]="minLevel()"
                (ngModelChange)="minLevel.set($event); shown.set(PAGE)"
              />
              <input
                type="number"
                min="0"
                max="60"
                placeholder="max"
                [ngModel]="maxLevel()"
                (ngModelChange)="maxLevel.set($event); shown.set(PAGE)"
              />
            </span>
          </label>
          <label class="check">
            <input
              type="checkbox"
              [ngModel]="knownOnly()"
              (ngModelChange)="knownOnly.set($event); shown.set(PAGE)"
            />
            Seulement ce qu’un artisan sait faire
          </label>
        </div>

        @if (profession(); as skill) {
          <header class="prof-head">
            <img [src]="profIcon(skill)" alt="" />
            <h2>{{ data.professionName(skill) }}</h2>
          </header>
          <div class="artisans">
            <button
              type="button"
              class="chip"
              [class.active]="!artisan()"
              (click)="go(skill, null)"
            >
              Tous les artisans
            </button>
            @for (a of artisansOf(skill); track a.key) {
              <button
                type="button"
                class="chip"
                [class.active]="a.key === artisan()"
                (click)="go(skill, a.key)"
                [attr.title]="a.note ? 'Note : ' + a.note : null"
              >
                <span [style.color]="classColor(a.class)">{{ a.name }}</span>
                <span class="muted"
                  >{{ a.professions[skill].level }}/{{ a.professions[skill].max }}</span
                >
                @if (a.note) {
                  <span>📝</span>
                }
              </button>
            }
          </div>
          @if (selectedNote(); as note) {
            <p class="note">📝 Note de l’artisan : {{ note }}</p>
          }
        } @else if (!search().trim()) {
          <div class="welcome tooltip">
            <h2>Bienvenue au comptoir des artisans</h2>
            <p>
              Choisis un métier dans le grimoire, puis un artisan, ou cherche un objet. Chaque fiche
              montre ses composants et qui peut la fabriquer ; commande d’un clic ou remplis ton
              panier.
            </p>
            <p class="muted">
              L’artisan voit ta commande en jeu (addon Wall of Shame Forever) et sur Discord ; tu
              reçois un message privé quand elle est faite.
            </p>
          </div>
        }

        @if (lockpicking()) {
          <section class="tooltip lockpicking">
            <h2>Crochetage des voleurs</h2>
            <p class="muted small">
              Un coffret verrouillé à ouvrir ? Demande à un voleur dont le crochetage est assez haut : tu mets le
              coffret dans la fenêtre d’échange, case « Ne sera pas échangé », et il le crochète sans le prendre.
            </p>
            <ol class="lp-list">
              @for (r of rogues(); track r.key) {
                <li>
                  <span class="lp-name" [style.color]="classColor(r.class)">{{ r.name }}</span>
                  <span class="lp-bar"><span [style.width.%]="r.share"></span></span>
                  <b>{{ r.level }}</b><span class="muted">/{{ r.max }}</span>
                  <span class="muted small lp-when">{{ r.updated }}</span>
                </li>
              } @empty {
                <li class="muted">
                  Aucun voleur relevé pour l’instant : l’addon (v0.7.2 ou plus) envoie le crochetage à la connexion.
                </li>
              }
            </ol>
          </section>
        } @else if (gathering()) {
          <p class="muted">
            Métier de récolte : pas de recettes. Les artisans ci-dessus peuvent récolter pour toi,
            demande-leur directement.
          </p>
        } @else if (profession() || search().trim()) {
          <p class="muted small">{{ list().length }} recette(s)</p>
          <div class="cards">
            @for (spell of list().slice(0, shown()); track spell) {
              <app-recipe-card [spell]="spell" [preferred]="artisan()" />
            }
          </div>
          @if (list().length > shown()) {
            <button type="button" class="btn more" (click)="shown.set(shown() + PAGE)">
              Voir plus ({{ list().length - shown() }})
            </button>
          }
        }
      </section>
    </div>
  `,
})
export class CatalogPage {
  protected data = inject(DataService);
  protected session = inject(SessionService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected readonly PAGE = PAGE;
  protected readonly charKey = charKey;
  protected readonly classColor = classColor;

  readonly profession = signal<number | null>(null);
  readonly artisan = signal<string | null>(null);
  readonly search = signal('');
  readonly quality = signal(-1);
  readonly minLevel = signal<number | null>(null);
  readonly maxLevel = signal<number | null>(null);
  readonly knownOnly = signal(true);
  readonly shown = signal(PAGE);

  readonly buyerKey = computed(() => {
    const b = this.session.buyer();
    return b ? charKey(b) : '';
  });

  readonly gathering = computed(() => {
    const skill = this.profession();
    return (
      skill !== null &&
      (this.data
        .catalog()
        ?.blocks.find((b) => b.key === 'rec')
        ?.skills.includes(skill) ??
        false) &&
      !this.search().trim()
    );
  });

  // Crochetage (voleurs) : pas de recettes, le classement des voleurs à la place
  readonly lockpicking = computed(() => this.profession() === LOCKPICKING && !this.search().trim());
  readonly rogues = computed(() =>
    this.artisansOf(LOCKPICKING).map((a) => {
      const p = a.professions[LOCKPICKING];
      const level = p.level ?? 0;
      const max = p.max || 300;
      const days = a.updatedAt ? Math.floor((Date.now() / 1000 - a.updatedAt) / 86400) : null;
      return {
        key: a.key,
        name: a.name,
        class: a.class,
        level,
        max,
        share: Math.min(100, (100 * level) / 300),
        updated: days === null ? '' : days < 1 ? 'aujourd’hui' : `il y a ${days} j`,
      };
    }),
  );

  readonly selectedNote = computed(
    () => this.data.artisans().find((a) => a.key === this.artisan())?.note ?? null,
  );

  // Recipes matching every filter but the slot, with their slot group (the slot list is built from them)
  readonly candidates = computed(() => {
    const catalog = this.data.catalog();
    if (!catalog) return [];
    const skill = this.profession();
    const text = this.search().trim().toLowerCase();
    const artisan = this.data.artisans().find((a) => a.key === this.artisan());
    const known = artisan && skill !== null ? (artisan.professions[skill]?.recipes ?? {}) : null;
    const crafters = this.data.crafters();
    const min = Number(this.minLevel()) || 0;
    const max = Number(this.maxLevel()) || 99;
    const out: { spell: string; lvl: number; name: string; group: string }[] = [];
    for (const [spell, r] of Object.entries(catalog.recipes)) {
      if (skill !== null && r.s !== skill) continue; // without a profession: search in every one
      if (known && !(spell in known)) continue;
      if (this.knownOnly() && !crafters.has(spell)) continue;
      const item = r.o ? catalog.items[r.o[0]] : null;
      if (this.quality() >= 0 && (item?.q ?? 1) < this.quality()) continue;
      const lvl = item?.lvl ?? 0;
      if (lvl < min || lvl > max) continue;
      const name = this.data.recipeName(spell);
      if (text && !name.toLowerCase().includes(text)) continue;
      out.push({ spell, lvl, name, group: slotGroup(item) });
    }
    return out;
  });

  // « Emplacement »: only the groups present in the profession (or the search results); a choice that is
  // not there any more (another profession) counts as « Tous »
  readonly slot = signal('');
  readonly slotChoices = computed(() => {
    const present = new Set(this.candidates().map((x) => x.group));
    return GROUP_ORDER.filter((g) => present.has(g));
  });
  readonly slotShown = computed(() => (this.slotChoices().includes(this.slot()) ? this.slot() : ''));

  // Recipes shown: profession (or all when searching), artisan, filters; highest item level first
  readonly list = computed(() => {
    const slot = this.slotShown();
    return this.candidates()
      .filter((x) => !slot || x.group === slot)
      .sort((a, b) => b.lvl - a.lvl || a.name.localeCompare(b.name))
      .map((x) => x.spell);
  });

  constructor() {
    this.route.queryParamMap.subscribe((q) => {
      const skill = Number(q.get('metier'));
      this.profession.set(Number.isInteger(skill) && skill > 0 ? skill : null);
      this.artisan.set(q.get('artisan'));
      this.shown.set(PAGE);
    });
    effect(() => {
      if (this.session.status() === 'in' && !this.data.catalog() && !this.data.loading())
        this.data.load();
    });
  }

  artisansOf(skill: number) {
    return this.data
      .artisans()
      .filter((a) => a.professions[skill])
      .sort(
        (a, b) =>
          (b.professions[skill].level ?? 0) - (a.professions[skill].level ?? 0) ||
          a.name.localeCompare(b.name),
      );
  }

  go(skill: number, artisan: string | null) {
    this.router.navigate([], { queryParams: { metier: skill, artisan } });
  }

  profIcon(skill: number) {
    return `https://wow.zamimg.com/images/wow/icons/medium/${PROF_ICONS[skill] ?? 'inv_misc_questionmark'}.jpg`;
  }

  className(cls: string) {
    return CLASS_NAMES[cls.toUpperCase()] ?? cls;
  }
}
