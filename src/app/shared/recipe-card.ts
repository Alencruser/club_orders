import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { CartService } from '../core/cart.service';
import { colorAt, DataService } from '../core/data.service';
import { OrdersService } from '../core/orders.service';
import { SessionService } from '../core/session.service';
import { ToastService } from '../core/toast.service';
import { DotComponent, IconComponent, MaterialsComponent, classColor } from './ui';

// A recipe as a WoW tooltip: item, stats, materials, how to learn it, who crafts it, and quick actions
// (quantity, artisan, add to cart, order now).
@Component({
  selector: 'app-recipe-card',
  imports: [FormsModule, IconComponent, DotComponent, MaterialsComponent],
  template: `
    @if (recipe(); as r) {
      <article class="tooltip card">
        <header class="card-head">
          <app-icon [itemId]="itemId()" [size]="44" />
          <div class="card-title">
            <h3 class="q{{ data.quality(spell()) }}">{{ data.recipeName(spell()) }}</h3>
            <p class="muted small">
              {{ data.professionName(r.s) }}
              @if (r.o && r.o[1] > 1) {
                · {{ r.o[1] }} par fabrication
              }
            </p>
          </div>
          <span class="thresholds" title="Seuils de couleur : orange, jaune, vert, gris">
            <span class="c0">{{ r.t[0] }}</span> <span class="c1">{{ r.t[1] }}</span>
            <span class="c2">{{ r.t[2] }}</span> <span class="c3">{{ r.t[3] }}</span>
          </span>
        </header>

        @if (lines().length) {
          <div class="tt-lines">
            @for (l of lines(); track $index) {
              <div class="tt-line">
                <span>
                  @for (p of l.left; track $index) {
                    <span class="{{ p.cls }}">{{ p.text }}</span>
                  }
                </span>
                @if (l.right.length) {
                  <span>
                    @for (p of l.right; track $index) {
                      <span class="{{ p.cls }}">{{ p.text }}</span>
                    }
                  </span>
                }
              </div>
            }
          </div>
        } @else if (itemId()) {
          <p class="muted small">Infobulle en chargement…</p>
        }

        <h4>Composants</h4>
        <app-materials [list]="materials()" [compact]="true" />

        <p class="learn small">📘 {{ data.learnText(r) }}</p>

        <h4>Artisans</h4>
        @if (crafters().length) {
          <div class="crafters">
            @for (c of crafters(); track c.artisan.key) {
              <button
                type="button"
                class="chip"
                [class.active]="c.artisan.key === artisanKey()"
                (click)="chosen.set(c.artisan.key)"
                [attr.title]="c.artisan.note ? 'Note : ' + c.artisan.note : null"
              >
                <app-dot [color]="c.color" />
                <span [style.color]="classColor(c.artisan.class)">{{ c.artisan.name }}</span>
                <span class="muted">{{ c.level }}</span>
                @if (c.artisan.note) {
                  <span>📝</span>
                }
              </button>
            }
          </div>
          @if (crafterNote(); as note) {
            <p class="note small">📝 {{ note }}</p>
          }
          <div class="card-actions">
            <div class="stepper">
              <button type="button" (click)="qty.set(Math.max(1, qty() - 1))" aria-label="Moins">
                −
              </button>
              <input
                type="number"
                min="1"
                max="99"
                [ngModel]="qty()"
                (ngModelChange)="setQty($event)"
                aria-label="Quantité"
              />
              <button type="button" (click)="qty.set(Math.min(99, qty() + 1))" aria-label="Plus">
                +
              </button>
            </div>
            <button
              type="button"
              class="btn"
              title="Garde l’objet dans ton panier : tu passes toutes les commandes du panier d’un coup"
              (click)="addToCart()"
            >
              🛒 Ajouter au panier
            </button>
            <button type="button" class="btn gold" [disabled]="busy()" (click)="orderNow()">
              Commander
            </button>
          </div>
        } @else {
          <p class="muted small">Personne dans la guilde ne connaît encore cette recette.</p>
          @if (couldLearn().length) {
            <p class="small">Pourraient l’apprendre : {{ couldLearn().join(', ') }}</p>
          }
        }
      </article>
    }
  `,
})
export class RecipeCardComponent {
  protected data = inject(DataService);
  private api = inject(ApiService);
  private cart = inject(CartService);
  private orders = inject(OrdersService);
  private session = inject(SessionService);
  private toast = inject(ToastService);
  protected readonly Math = Math;
  protected readonly classColor = classColor;

  readonly spell = input.required<string>();
  readonly preferred = input<string | null>(null); // artisan selected in the book

  readonly qty = signal(1);
  readonly chosen = signal<string | null>(null);
  readonly busy = signal(false);

  readonly recipe = computed(() => this.data.recipe(this.spell()));
  readonly itemId = computed(() => this.data.outputItemId(this.spell()));
  readonly lines = computed(() => {
    const id = this.itemId();
    // the first line repeats the name: it is already the title
    return (id && this.data.tooltips()[id]?.lines.slice(1, 14)) || [];
  });
  readonly materials = computed(() =>
    this.data.materials([{ spell: this.spell(), qty: Math.max(1, this.recipe()?.o?.[1] ?? 1) }]),
  );
  readonly crafters = computed(() => this.data.crafters().get(this.spell()) ?? []);
  readonly artisanKey = computed(() => {
    const keys = this.crafters().map((c) => c.artisan.key);
    for (const k of [this.chosen(), this.preferred()]) if (k && keys.includes(k)) return k;
    return keys[0] ?? null;
  });
  readonly crafterNote = computed(
    () => this.crafters().find((c) => c.artisan.key === this.artisanKey())?.artisan.note ?? null,
  );
  readonly couldLearn = computed(() => {
    const r = this.recipe();
    if (!r) return [];
    return this.data
      .artisans()
      .filter((a) => {
        const p = a.professions[r.s];
        return p && colorAt(r, p.level ?? 0) >= 0 && (p.level ?? 0) >= this.data.learnLevel(r);
      })
      .map((a) => a.name)
      .slice(0, 6);
  });

  constructor() {
    effect(() => this.data.want([this.itemId(), ...(this.recipe()?.r.map(([id]) => id) ?? [])]));
  }

  setQty(value: number) {
    this.qty.set(Math.min(99, Math.max(1, Math.floor(Number(value) || 1))));
  }

  addToCart() {
    const key = this.artisanKey();
    if (!key) return;
    this.cart.add(this.spell(), key, this.qty());
    this.toast.ok(`🛒 ${this.qty()} × ${this.data.recipeName(this.spell())} ajouté au panier`);
  }

  async orderNow() {
    const key = this.artisanKey();
    const buyer = this.session.buyerForOrder();
    if (!key) return;
    if (!buyer) {
      this.toast.error('Choisis d’abord pour quel perso tu commandes (en haut du catalogue).');
      return;
    }
    this.busy.set(true);
    try {
      const order = await this.api.placeOrder({
        spell: this.spell(),
        artisan: key,
        buyer,
        qty: this.qty(),
        note: '',
      });
      this.orders.upsert(order);
      this.toast.ok(
        `✅ Commande passée : ${order.qty} × ${order.item.name} chez ${order.artisan.name}`,
      );
      this.qty.set(1);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.busy.set(false);
    }
  }
}
