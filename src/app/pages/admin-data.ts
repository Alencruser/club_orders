import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { AdminDataset } from '../core/models';
import { ToastService } from '../core/toast.service';

// 🗂️ Données tab of /admin (pages/admin.ts): resets, orphans, and every list of the bot's data with a
// member filter, a search, multi-select and delete (bot: admin-data.js, the Discord dashboard's lists).
@Component({
  selector: 'app-admin-data',
  imports: [FormsModule],
  template: `
    <div class="admin-grid">
      <section class="tooltip admin-card">
        <h2>🔄 Remises à zéro</h2>
        <label class="field">
          Pour qui
          <select [(ngModel)]="resetWho">
            <option value="">Tout le monde</option>
            @for (p of members(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        </label>
        <div class="admin-actions">
          <button type="button" class="btn danger" (click)="reset('levels')">📈 Oublier les niveaux</button>
          <button type="button" class="btn danger" (click)="reset('ranking')">🏆 Reset du classement</button>
        </div>
        <p class="muted small">
          Niveaux : ils reviennent au prochain /reload ou à la prochaine connexion. Classement : duels
          et coups fatals effacés, les événements déjà reçus ne sont pas recomptés.
        </p>
      </section>
      <section class="tooltip admin-card">
        <h2>🧹 Orphelins</h2>
        <p>
          @if (orphans()) {
            {{ orphans() }} battletag(s) absent(s) de l'annuaire, avec des données rangées dessous
            (détail dans 🚨 Anomalies).
          } @else {
            ✅ Aucun orphelin.
          }
        </p>
        <div class="admin-actions">
          <button type="button" class="btn ghost" [disabled]="!orphans()" (click)="cleanOrphans()">
            🧹 Nettoyer les orphelins
          </button>
        </div>
      </section>
    </div>

    <section class="tooltip admin-lists">
      <div class="admin-list-filters">
        <select [ngModel]="filter()" (ngModelChange)="setFilter($event)" aria-label="Membre">
          <option value="">👤 Tous les membres</option>
          @for (p of members(); track p.id) {
            <option [value]="p.id">{{ p.name }}</option>
          }
        </select>
        <input type="search" placeholder="🔍 Chercher…" [ngModel]="search()" (ngModelChange)="search.set($event)" />
      </div>
      <div class="tabs admin-tabs">
        @for (d of datasets() ?? []; track d.key) {
          <button type="button" [class.active]="current()?.key === d.key" [disabled]="!d.listable" (click)="pick(d.key)">
            {{ d.emoji }} {{ d.label }} <span class="muted small">{{ d.count }}</span>
          </button>
        }
      </div>
      @if (current(); as d) {
        @if (d.consequences) {
          <p class="muted small">🗑️ {{ cascade() && d.cascadeConsequences ? d.cascadeConsequences : d.consequences }}</p>
        }
        <div class="admin-list-actions">
          <label><input type="checkbox" [checked]="allShownPicked()" (change)="pickAllShown()" /> Tout cocher ({{ shown().length }})</label>
          @if (d.cascadeLabel) {
            <label><input type="checkbox" [checked]="cascade()" (change)="cascade.set(!cascade())" /> {{ d.cascadeLabel }}</label>
          }
          <span class="grow"></span>
          <button type="button" class="btn danger" [disabled]="!selected().size || busy()" (click)="remove(d)">
            🗑️ Supprimer la sélection ({{ selected().size }})
          </button>
        </div>
        <ul class="admin-list">
          @for (e of shown(); track e.id) {
            <li>
              <label>
                <input type="checkbox" [checked]="selected().has(e.id)" (change)="toggle(e.id)" />
                <span>{{ e.line }}</span>
              </label>
            </li>
          } @empty {
            <li class="muted">Rien ici{{ filter() || search() ? ' avec ce filtre' : '' }}.</li>
          }
        </ul>
      } @else if (!datasets()) {
        <p class="muted">Chargement…</p>
      }
    </section>
  `,
})
export class AdminDataComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly orphans = input(0);
  readonly changed = output<void>(); // the parent reloads the state (counts, anomalies)

  readonly datasets = signal<AdminDataset[] | null>(null);
  readonly members = signal<{ id: string; name: string }[]>([]); // from the directory list
  readonly key = signal('players');
  readonly filter = signal('');
  readonly search = signal('');
  readonly selected = signal(new Set<string>());
  readonly cascade = signal(false);
  readonly busy = signal(false);
  resetWho = '';

  readonly current = computed(() => this.datasets()?.find((d) => d.key === this.key() && d.listable) ?? null);
  readonly shown = computed(() => {
    const q = this.search().trim().toLowerCase();
    return (this.current()?.items ?? []).filter((e) => !q || e.line.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
  });
  readonly allShownPicked = computed(() => this.shown().length > 0 && this.shown().every((e) => this.selected().has(e.id)));

  constructor() {
    this.load();
  }

  async load() {
    try {
      const sets = await this.api.adminData(this.filter() || null);
      this.datasets.set(sets);
      if (!this.filter()) {
        // directory: "@Name · `Tag#1` · name" → the member's display name
        const players = sets.find((d) => d.key === 'players')?.items ?? [];
        this.members.set(
          players
            .map((p) => ({ id: p.id, name: p.line.split(' · ')[0].replace(/^@/, '') }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  setFilter(id: string) {
    this.filter.set(id);
    this.selected.set(new Set());
    this.load();
  }

  pick(key: string) {
    this.key.set(key);
    this.selected.set(new Set());
    this.cascade.set(false);
  }

  toggle(id: string) {
    this.selected.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  pickAllShown() {
    const all = this.allShownPicked();
    this.selected.update((s) => {
      const next = new Set(s);
      for (const e of this.shown()) {
        if (all) next.delete(e.id);
        else next.add(e.id);
      }
      return next;
    });
  }

  async remove(d: AdminDataset) {
    const n = this.selected().size;
    const what = this.cascade() && d.cascadeConsequences ? d.cascadeConsequences : d.consequences;
    if (!confirm(`Supprimer ${n} élément(s) de « ${d.label} » ?\n\n${what ?? ''}`)) return;
    this.busy.set(true);
    try {
      const r = await this.api.adminRemove(d.key, [...this.selected()], this.cascade());
      this.toast.ok(`🗑️ ${r.removed} supprimé(s).`);
      this.selected.set(new Set());
      await this.load();
      this.changed.emit();
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.busy.set(false);
    }
  }

  async reset(what: 'levels' | 'ranking') {
    const who = this.members().find((m) => m.id === this.resetWho)?.name ?? 'tout le monde';
    const label = what === 'levels' ? 'Oublier les niveaux de' : 'Remettre à zéro le classement de';
    if (!confirm(`${label} ${who} ?`)) return;
    try {
      const r = await this.api.adminReset(what, this.resetWho || null);
      this.toast.ok(`🧹 ${r.text}.`);
      await this.load();
      this.changed.emit();
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  async cleanOrphans() {
    if (!confirm('Supprimer pour de bon toutes les données rangées sous des battletags absents de l’annuaire ?')) return;
    try {
      const r = await this.api.adminCleanOrphans();
      this.toast.ok(`🧹 ${r.removed} orphelin(s) supprimé(s).`);
      await this.load();
      this.changed.emit();
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }
}
