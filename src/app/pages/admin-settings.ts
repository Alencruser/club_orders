import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { AdminSettings, AdminSettingsValues } from '../core/models';
import { ToastService } from '../core/toast.service';

type Section = keyof AdminSettingsValues;

// One field of a settings block: the bot's key, its label and a hint
interface Field {
  key: string;
  label: string;
  hint: string;
  off?: string; // shown when the value is 0 (or empty for a version)
  version?: boolean; // a version like 0.6.6 instead of minutes
}

const BLOCKS: Record<Section, { title: string; intro: string; fields: Field[] }> = {
  versions: {
    title: '🛡️ Versions minimales',
    intro:
      'Garde-fou : un envoi d’un addon ou d’un compagnon plus ancien (ou sans version connue, compagnon avant 0.7.5) ' +
      'n’est pas rangé. Le compagnon le garde et le renvoie : il passe dès que le joueur est à jour. Les bloqués ' +
      'apparaissent dans 📦 Versions.',
    fields: [
      { key: 'minAddon', label: 'Addon au moins', hint: 'ex. 0.6.6', off: 'aucun minimum', version: true },
      { key: 'minCompanion', label: 'Compagnon au moins', hint: 'ex. 0.7.5', off: 'aucun minimum', version: true },
    ],
  },
  spy: {
    title: '⏱️ Messages automatiques des espions',
    intro: 'Communs aux trois espions (bot principal, Espion bot, tourne-disque), pendant une session vocale.',
    fields: [
      { key: 'statusMin', label: 'Statut automatique toutes les', hint: 'dans le salon des rapports', off: 'pas de statut automatique' },
      { key: 'reminderMin', label: 'Rappel au hasard après', hint: 'sans message dans le chat du salon vocal', off: 'pas de rappel' },
    ],
  },
  activity: {
    title: '📅 Activités',
    intro: 'Les cartes d’activité et le rappel aux remplaçants.',
    fields: [
      { key: 'remindBeforeMin', label: 'Rappel aux remplaçants', hint: 'avant le rendez-vous, s’il reste des places', off: 'pas de rappel' },
      { key: 'expireAfterMin', label: 'La carte disparaît', hint: 'après l’heure du rendez-vous' },
    ],
  },
};

// A block of server settings (bot settings.js), used by the ⚙️ Réglages tab and on top of 🕵️ Espionnage.
// Values in minutes; 0 turns off what can be turned off.
@Component({
  selector: 'app-admin-settings-block',
  imports: [FormsModule],
  styles: `
    .set-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.2rem 0.8rem;
      align-items: center;
      padding: 0.35rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      input {
        width: 5.5rem;
      }
    }
    .set-value {
      display: flex;
      gap: 0.3rem;
      align-items: center;
      white-space: nowrap;
    }
  `,
  template: `
    <section class="tooltip admin-card">
      <h2>{{ block().title }}</h2>
      <p class="muted small">{{ block().intro }}</p>
      @if (data(); as d) {
        @for (f of block().fields; track f.key) {
          <div class="set-row">
            <span>
              {{ f.label }}
              <span class="muted small">{{ f.hint }}</span><br />
              <span class="muted small">
                @if (f.version) {
                  {{ values[f.key] ? 'refusé en dessous de ' + values[f.key] : f.off }}
                } @else {
                  @if (f.off && values[f.key] === 0) {
                    {{ f.off }} ·
                  } @else {
                    {{ human(+values[f.key]) }} ·
                  }
                  par défaut {{ human(+defaultOf(d, f.key)) }} · {{ range(d, f.key) }}
                }
              </span>
            </span>
            <span class="set-value">
              @if (f.version) {
                <input [(ngModel)]="values[f.key]" maxlength="12" placeholder="aucun" />
              } @else {
                <input type="number" [(ngModel)]="values[f.key]" [min]="0" [step]="5" /> min
              }
            </span>
          </div>
        }
        <div class="admin-actions">
          <button type="button" class="btn gold" [disabled]="busy() || !changed()" (click)="save()">Enregistrer</button>
          <button type="button" class="btn ghost" [disabled]="busy()" (click)="reset(d)">Valeurs par défaut</button>
        </div>
        @if (section() === 'spy') {
          <p class="muted small">L’Espion bot et le tourne-disque prennent le changement en moins d’une minute.</p>
        }
      } @else if (error(); as e) {
        <p class="refused">❌ {{ e }}</p>
      } @else {
        <p class="muted small">Chargement…</p>
      }
    </section>
  `,
})
export class AdminSettingsBlockComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly section = input.required<Section>();
  readonly block = computed(() => BLOCKS[this.section()]);
  readonly data = signal<AdminSettings | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  values: Record<string, number | string> = {};
  private tick = signal(0); // values is a plain object: re-check changed() after each edit

  constructor() {
    this.load();
  }

  async load() {
    try {
      this.apply(await this.api.adminSettings());
    } catch (err) {
      this.error.set(errorText(err));
    }
  }

  private apply(d: AdminSettings) {
    this.data.set(d);
    this.values = { ...(d.settings[this.section()] as Record<string, number | string>) };
    this.error.set(null);
  }

  changed() {
    this.tick();
    const saved = this.data()?.settings[this.section()] as Record<string, number | string> | undefined;
    return Boolean(saved && Object.keys(saved).some((k) => String(this.values[k] ?? '').trim() !== String(saved[k])));
  }

  defaultOf(d: AdminSettings, key: string) {
    return (d.defaults[this.section()] as Record<string, number | string>)[key];
  }

  range(d: AdminSettings, key: string) {
    const limit = d.limits[this.section()][key];
    if (limit === 'version') return '';
    const [min, max, off] = limit;
    return `${this.human(min)} à ${this.human(max)}${off ? ', 0 pour couper' : ''}`;
  }

  human(min: number) {
    if (!min) return '0';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? (m ? `${h} h ${m}` : `${h} h`) : `${m} min`;
  }

  reset(d: AdminSettings) {
    this.values = { ...(d.defaults[this.section()] as Record<string, number | string>) };
    this.tick.update((x) => x + 1);
  }

  async save() {
    this.busy.set(true);
    try {
      const versionKeys = new Set(this.block().fields.filter((f) => f.version).map((f) => f.key));
      const values = Object.fromEntries(
        Object.entries(this.values).map(([k, v]) => [k, versionKeys.has(k) ? String(v ?? '').trim() : Math.round(Number(v))]),
      );
      this.apply(await this.api.adminSaveSettings(this.section(), values));
      this.toast.ok('✅ Réglages enregistrés.');
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.busy.set(false);
    }
  }
}

// ⚙️ Réglages tab of /admin (pages/admin.ts): the settings with no other home. The spies' block is also on top
// of 🕵️ Espionnage.
@Component({
  selector: 'app-admin-settings',
  imports: [AdminSettingsBlockComponent],
  template: `
    <div class="admin-grid">
      <app-admin-settings-block section="versions" />
      <app-admin-settings-block section="activity" />
      <app-admin-settings-block section="spy" />
    </div>
  `,
})
export class AdminSettingsComponent {}
