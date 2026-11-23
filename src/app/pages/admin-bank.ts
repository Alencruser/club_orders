import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { AdminBank } from '../core/models';
import { ToastService } from '../core/toast.service';
import { MoneyComponent } from '../shared/guild-ui';

// 🏦 Banque tab of /admin (pages/admin.ts): the goal of the bank bar (a new goal gets new chests, the old
// one goes to the history) and the « Jamais donné » list (time window, members left out by hand).
@Component({
  selector: 'app-admin-bank',
  imports: [DatePipe, FormsModule, MoneyComponent],
  // only loaded with /admin (lazy chunk), not in the global stylesheet
  styles: `
// 🏦 Banque tab (pages/admin-bank.ts): members left out of « Jamais donné »
.admin-search {
  width: 100%;
  margin: 0.3rem 0;
}
.admin-checks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 160px), 1fr));
  gap: 0.15rem 0.8rem;
  max-height: 14rem;
  overflow-y: auto;
  padding: 0.3rem 0;
  label {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    cursor: pointer;
    overflow-wrap: anywhere;
  }
}
.admin-days {
  width: 4.5rem;
  margin: 0 0.3rem;
}
.admin-radios {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0.3rem 0 0.6rem;
  label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    cursor: pointer;
  }
}
`,
  template: `
    @if (bank(); as b) {
      <div class="admin-grid">
        <section class="tooltip admin-card">
          <h2>🎯 Objectif de la banque</h2>
          <p>
            Actuel : <b>{{ b.goal.name }}</b> · <app-money [copper]="b.goal.copper" />
            @if (b.money !== null) {
              <span class="muted small">
                (en banque : <app-money [copper]="b.money" />, {{ percent() }} %)</span
              >
            }
          </p>
          <label class="field">
            Nom
            <input [(ngModel)]="goalName" maxlength="60" placeholder="ex. Onglet 2" />
          </label>
          <label class="field">
            Montant en po
            <input type="number" min="1" max="100000" step="1" [(ngModel)]="goalGold" />
          </label>
          <div class="admin-actions">
            <button type="button" class="btn gold" [disabled]="busy() || !goalChanged()" (click)="saveGoal()">
              Enregistrer
            </button>
          </div>
          <p class="muted small">
            Un nouvel objectif repart avec de nouveaux coffres (25, 50, 75, 100 %), annoncés quand ils
            s'ouvrent. Ceux que la banque atteint déjà s'ouvrent sans annonce. L'ancien objectif part
            dans l'historique.
          </p>
          @if (b.history.length) {
            <h4>Objectifs précédents</h4>
            <ul class="admin-list">
              @for (h of b.history; track h.until) {
                <li>
                  <b>{{ h.name }}</b> · <app-money [copper]="h.copper" />
                  <span class="muted small">
                    @if (h.reachedAt) {
                      ✅ atteint le {{ h.reachedAt * 1000 | date: 'd MMM y' }}
                    } @else {
                      non atteint
                    }
                    · remplacé le {{ h.until * 1000 | date: 'd MMM y' }}
                  </span>
                </li>
              }
            </ul>
          }
        </section>

        <section class="tooltip admin-card">
          <h2>🙈 Jamais donné</h2>
          <div class="admin-radios">
            <label
              ><input type="radio" name="never-mode" [checked]="!useDays" (change)="useDays = false" /> Jamais donné
              (aucun dépôt depuis le début)</label
            >
            <label
              ><input type="radio" name="never-mode" [checked]="useDays" (change)="useDays = true" /> Rien donné depuis
              <input class="admin-days" type="number" min="1" max="365" [(ngModel)]="days" (focus)="useDays = true" />
              jours</label
            >
          </div>
          <h4>Membres exclus de la liste ({{ excluded().size }})</h4>
          <input class="admin-search" [(ngModel)]="search" placeholder="🔍 Chercher un membre…" />
          <div class="admin-checks">
            @for (p of shownPlayers(); track p.userId) {
              <label
                ><input type="checkbox" [checked]="excluded().has(p.userId)" (change)="toggle(p.userId)" />
                {{ p.name }}</label
              >
            } @empty {
              <span class="muted small">Personne.</span>
            }
          </div>
          <div class="admin-actions">
            <button type="button" class="btn gold" [disabled]="busy()" (click)="saveNever()">Enregistrer</button>
          </div>
          <h4>Dans la liste aujourd'hui ({{ b.list.length }})</h4>
          <p class="small">
            @for (p of b.list; track p.userId; let last = $last) {
              {{ p.name }}{{ last ? '' : ' · ' }}
            } @empty {
              <span class="muted">Personne 🎉</span>
            }
          </p>
          <p class="muted small">
            La liste est postée chaque soir dans le salon de la banque et affichée sur la page Banque.
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
export class AdminBankComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly bank = signal<AdminBank | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly excluded = signal(new Set<string>());
  goalName = '';
  goalGold = 0;
  useDays = false;
  days = 14;
  search = '';

  readonly percent = computed(() => {
    const b = this.bank();
    return b?.money ? Math.min(100, Math.floor((b.money / b.goal.copper) * 100)) : 0;
  });

  constructor() {
    this.load();
  }

  async load() {
    try {
      this.apply(await this.api.adminBank());
    } catch (err) {
      this.error.set(errorText(err));
    }
  }

  private apply(b: AdminBank) {
    this.bank.set(b);
    this.error.set(null);
    this.goalName = b.goal.name;
    this.goalGold = Math.round(b.goal.copper / 100) / 100;
    this.useDays = b.neverGave.days !== null;
    if (b.neverGave.days) this.days = b.neverGave.days;
    this.excluded.set(new Set(b.neverGave.excluded));
  }

  goalChanged() {
    const b = this.bank();
    return Boolean(b) && (this.goalName.trim() !== b!.goal.name || Math.round(this.goalGold * 10000) !== b!.goal.copper);
  }

  shownPlayers() {
    const q = this.search.trim().toLowerCase();
    const players = this.bank()?.players ?? [];
    return q ? players.filter((p) => p.name.toLowerCase().includes(q)) : players;
  }

  toggle(userId: string) {
    const next = new Set(this.excluded());
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    this.excluded.set(next);
  }

  async saveGoal() {
    const copper = Math.round(Number(this.goalGold) * 10000);
    if (!copper || copper <= 0) return this.toast.error('❌ Montant invalide.');
    if (!confirm(`Nouvel objectif « ${this.goalName.trim()} » à ${this.goalGold} po ?\n\nLes coffres repartent à zéro.`)) return;
    await this.run(() => this.api.adminBankGoal(copper, this.goalName.trim()), '🎯 Objectif enregistré.');
  }

  async saveNever() {
    const days = this.useDays ? Math.round(Number(this.days)) : null;
    await this.run(() => this.api.adminBankNeverGave(days, [...this.excluded()]), '🙈 Liste réglée.');
  }

  private async run(call: () => Promise<AdminBank>, done: string) {
    this.busy.set(true);
    try {
      this.apply(await call());
      this.toast.ok(done);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.busy.set(false);
    }
  }
}
