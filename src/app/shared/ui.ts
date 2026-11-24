import { Component, computed, effect, inject, input } from '@angular/core';
import { DataService, COLOR_NAMES } from '../core/data.service';

// Class colors of the game, and French class names
export const CLASS_COLORS: Record<string, string> = {
  WARRIOR: '#c69b6d',
  PALADIN: '#f48cba',
  HUNTER: '#aad372',
  ROGUE: '#fff468',
  PRIEST: '#ffffff',
  SHAMAN: '#0070dd',
  MAGE: '#3fc7eb',
  WARLOCK: '#8788ee',
  DRUID: '#ff7c0a',
};
export const CLASS_NAMES: Record<string, string> = {
  WARRIOR: 'Guerrier',
  PALADIN: 'Paladin',
  HUNTER: 'Chasseur',
  ROGUE: 'Voleur',
  PRIEST: 'Prêtre',
  SHAMAN: 'Chaman',
  MAGE: 'Mage',
  WARLOCK: 'Démoniste',
  DRUID: 'Druide',
};
export const classColor = (cls: string | null | undefined) =>
  (cls && CLASS_COLORS[cls.toUpperCase()]) || '#e6e1d3';

// Item icon (Wowhead), framed with the item's quality color
@Component({
  selector: 'app-icon',
  template: `
    <span
      class="icon q{{ quality() }}"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [attr.title]="title() || null"
    >
      <img [src]="src()" alt="" loading="lazy" />
      @if (count() > 1) {
        <span class="icon-count">{{ count() }}</span>
      }
    </span>
  `,
})
export class IconComponent {
  private data = inject(DataService);
  readonly itemId = input<number | string | null>(null); // an item, or « s<spell> » (enchant: the spell's icon)
  readonly size = input(40);
  readonly count = input(0);
  readonly title = input('');

  readonly quality = computed(() => {
    const id = this.itemId();
    return (id && this.data.catalog()?.items[id]?.q) ?? 1;
  });
  readonly src = computed(() => {
    const id = this.itemId();
    const icon = (id && this.data.tooltips()[id]?.icon) || 'inv_misc_questionmark';
    return `https://wow.zamimg.com/images/wow/icons/${this.size() > 36 ? 'large' : 'medium'}/${icon}.jpg`;
  });

  constructor() {
    effect(() => this.data.want([this.itemId()]));
  }
}

// Recipe color dot (orange, yellow, green, grey; lock: not learnable yet)
@Component({
  selector: 'app-dot',
  template: `<span class="dot c{{ color() ?? 'x' }}" [attr.title]="label()"></span>`,
})
export class DotComponent {
  readonly color = input<number | null>(null);
  readonly label = computed(() => COLOR_NAMES[this.color() ?? 99] ?? 'couleur inconnue');
}

// Materials list: icon, name, quantity
@Component({
  selector: 'app-materials',
  imports: [IconComponent],
  template: `
    @if (list().length) {
      <ul class="materials" [class.compact]="compact()">
        @for (m of list(); track m.id) {
          <li>
            <app-icon [itemId]="m.id" [size]="compact() ? 22 : 28" />
            <span class="q{{ data.catalog()?.items?.[m.id]?.q ?? 1 }}">{{
              data.itemName(m.id)
            }}</span>
            <span class="qty">× {{ m.qty }}</span>
          </li>
        }
      </ul>
    } @else {
      <p class="muted">Aucun composant.</p>
    }
  `,
})
export class MaterialsComponent {
  protected data = inject(DataService);
  readonly list = input<{ id: number; qty: number }[]>([]);
  readonly compact = input(false);
}
