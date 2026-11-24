import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, errorText } from '../core/api.service';
import { CartLine, CartService } from '../core/cart.service';
import { DataService } from '../core/data.service';
import { OrdersService } from '../core/orders.service';
import { charKey, SessionService } from '../core/session.service';
import { ToastService } from '../core/toast.service';
import { IconComponent, MaterialsComponent, classColor } from '../shared/ui';

// Cart: lines (quantity, note, artisan), the materials they need, and one click to send them all.
@Component({
  selector: 'app-cart',
  imports: [FormsModule, RouterLink, IconComponent, MaterialsComponent],
  template: `
    <div class="page-head">
      <h1 class="page-banner"><img src="/titles/panier.webp" alt="Panier" /></h1>
    </div>
    @if (!cart.lines().length) {
      <div class="tooltip empty">
        <p>Ton panier est vide.</p>
        <a routerLink="/grimoire" class="btn gold">Ouvrir le grimoire</a>
      </div>
    } @else {
      <div class="two-cols">
        <section>
          @for (line of cart.lines(); track line.spell + line.artisan; let i = $index) {
            <article class="tooltip cart-line">
              <app-icon [itemId]="data.tooltipKey(line.spell)" [size]="36" />
              <div class="grow">
                <strong class="q{{ data.quality(line.spell) }}">{{
                  data.recipeName(line.spell)
                }}</strong>
                <div class="small muted">
                  chez
                  <span [style.color]="classColor(artisan(line)?.class)">{{
                    artisan(line)?.name ?? line.artisan
                  }}</span>
                  @if (artisan(line)?.note; as note) {
                    · 📝 {{ note }}
                  }
                </div>
                <input
                  class="note-input"
                  maxlength="200"
                  placeholder="Note pour l’artisan (facultatif)"
                  [ngModel]="line.note"
                  (ngModelChange)="cart.update(i, { note: $event })"
                />
              </div>
              <input
                class="qty-input"
                type="number"
                min="1"
                max="99"
                [ngModel]="line.qty"
                (ngModelChange)="cart.update(i, { qty: clamp($event) })"
                aria-label="Quantité"
              />
              <button type="button" class="btn ghost" (click)="cart.remove(i)" aria-label="Retirer">
                ✕
              </button>
            </article>
          }
        </section>
        <aside class="tooltip">
          <h2>Composants nécessaires</h2>
          <p class="muted small">
            Pour tout le panier ; à fournir à l’artisan si vous en convenez.
          </p>
          <app-materials [list]="materials()" />
          <label class="field">
            <span>Pour</span>
            @if (session.characters().length) {
              <select [ngModel]="buyerKey()" (ngModelChange)="session.chooseBuyer($event)">
                @for (c of session.characters(); track charKey(c)) {
                  <option [value]="charKey(c)">
                    {{ c.name }}{{ c.level ? ' · ' + c.level : '' }}
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
          <button type="button" class="btn gold wide" [disabled]="sending()" (click)="send()">
            {{ sending() ? 'Envoi…' : 'Passer ' + cart.lines().length + ' commande(s)' }}
          </button>
        </aside>
      </div>
    }
  `,
})
export class CartPage {
  protected cart = inject(CartService);
  protected data = inject(DataService);
  protected session = inject(SessionService);
  private api = inject(ApiService);
  private orders = inject(OrdersService);
  private toast = inject(ToastService);
  protected readonly charKey = charKey;
  protected readonly classColor = classColor;

  readonly sending = signal(false);
  readonly materials = computed(() => this.data.materials(this.cart.lines()));
  readonly buyerKey = computed(() => {
    const b = this.session.buyer();
    return b ? charKey(b) : '';
  });

  constructor() {
    effect(() => {
      if (this.session.status() === 'in' && !this.data.catalog() && !this.data.loading())
        this.data.load();
    });
  }

  artisan(line: CartLine) {
    return this.data.artisans().find((a) => a.key === line.artisan) ?? null;
  }

  clamp(value: number) {
    return Math.min(99, Math.max(1, Math.floor(Number(value) || 1)));
  }

  // One order per line; the lines sent leave the cart, the refused ones stay with their error
  async send() {
    const buyer = this.session.buyerForOrder();
    if (!buyer) {
      this.toast.error('Indique pour quel perso tu commandes.');
      return;
    }
    this.sending.set(true);
    const sent: CartLine[] = [];
    for (const line of this.cart.lines()) {
      try {
        const order = await this.api.placeOrder({
          spell: line.spell,
          artisan: line.artisan,
          buyer,
          qty: line.qty,
          note: line.note,
        });
        this.orders.upsert(order);
        sent.push(line);
      } catch (err) {
        this.toast.error(`❌ ${this.data.recipeName(line.spell)} : ${errorText(err)}`);
      }
    }
    this.cart.removeLines(sent);
    if (sent.length)
      this.toast.ok(`✅ ${sent.length} commande(s) passée(s). Suivi : Mes commandes.`);
    this.sending.set(false);
  }
}
