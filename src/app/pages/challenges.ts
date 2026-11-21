import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { Challenge, ChallengeType } from '../core/models';
import { SessionService } from '../core/session.service';
import { ToastService } from '../core/toast.service';
import { MoneyComponent, duration, frDate, liveRefresh } from '../shared/guild-ui';

// Guild challenges: everyone sees them with the progress of the whole guild; the bot's admins create
// and delete them here. Progress comes from the bank, the follow time and the orders delivered.
const TYPES: { key: ChallengeType; label: string; unit: string; factor: number }[] = [
  { key: 'deposits', label: 'Nombre de dépôts', unit: 'dépôts', factor: 1 },
  { key: 'deposited', label: 'Montant déposé', unit: 'po', factor: 10000 },
  { key: 'follow', label: 'Temps de suivi', unit: 'heures', factor: 3600 },
  { key: 'delivered', label: 'Commandes livrées', unit: 'commandes', factor: 1 },
];
const STATUS: Record<Challenge['status'], string> = {
  upcoming: 'À venir',
  active: 'En cours',
  done: 'Réussi',
  failed: 'Raté',
};

const dayInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toSeconds = (day: string, nextDay = false) => {
  const d = new Date(`${day}T00:00:00`);
  if (nextDay) d.setDate(d.getDate() + 1);
  return Math.floor(d.getTime() / 1000);
};

@Component({
  selector: 'app-challenges',
  imports: [FormsModule, MoneyComponent],
  template: `
    <div class="page-head">
      <div>
        <h1>Défis de guilde</h1>
        <p class="muted small">Des objectifs à remplir tous ensemble, lancés par les admins</p>
      </div>
    </div>
    @if (error(); as e) {
      <p class="refused">{{ e }}</p>
    }

    @if (admin()) {
      <form class="tooltip challenge-form" (ngSubmit)="create()">
        <h2>Lancer un défi</h2>
        <div class="challenge-fields">
          <label class="field grow">
            Titre
            <input
              name="title"
              maxlength="80"
              required
              [(ngModel)]="form.title"
              placeholder="Ex. : Remplir le coffre"
            />
          </label>
          <label class="field">
            Type
            <select name="type" [(ngModel)]="form.type">
              @for (t of types; track t.key) {
                <option [value]="t.key">{{ t.label }}</option>
              }
            </select>
          </label>
          <label class="field">
            Objectif ({{ unit(form.type) }})
            <input
              name="target"
              type="number"
              min="1"
              step="any"
              required
              [(ngModel)]="form.target"
            />
          </label>
          <label class="field">
            Du
            <input name="start" type="date" required [(ngModel)]="form.start" />
          </label>
          <label class="field">
            Au (inclus)
            <input name="end" type="date" required [(ngModel)]="form.end" />
          </label>
          <label class="field grow">
            Récompense (facultatif)
            <input
              name="reward"
              maxlength="200"
              [(ngModel)]="form.reward"
              placeholder="Ex. : un tabard pour chacun"
            />
          </label>
        </div>
        <button class="btn gold" [disabled]="saving() || !form.title.trim() || !(form.target > 0)">
          {{ saving() ? 'Lancement…' : 'Lancer le défi' }}
        </button>
        <p class="muted small">
          Le bot annonce le défi dans le salon de la banque, puis sa réussite.
        </p>
      </form>
    }

    <div class="challenge-list">
      @for (c of list(); track c.id) {
        <article class="tooltip challenge s-{{ c.status }}">
          <div class="challenge-head">
            <h3>{{ c.title }}</h3>
            <span class="challenge-status">{{ statusText(c.status) }}</span>
          </div>
          <p class="muted small">
            {{ label(c.type) }} · du {{ date(c.start) }} au {{ date(c.end - 1) }}
          </p>
          <span class="challenge-bar"><span [style.width.%]="share(c)"></span></span>
          <p class="challenge-progress">
            @switch (c.type) {
              @case ('deposited') {
                <app-money [copper]="c.progress" /> / <app-money [copper]="c.target" />
              }
              @case ('follow') {
                {{ fmt(c.progress) }} / {{ fmt(c.target) }}
              }
              @default {
                {{ c.progress }} / {{ c.target }} {{ unit(c.type) }}
              }
            }
            <span class="muted">· {{ pct(c) }} %</span>
          </p>
          @if (c.reward) {
            <p class="challenge-reward">🎁 {{ c.reward }}</p>
          }
          @if (admin()) {
            <button type="button" class="btn ghost" (click)="remove(c)">Supprimer</button>
          }
        </article>
      } @empty {
        <div class="tooltip empty"><p>Aucun défi pour l’instant.</p></div>
      }
    </div>
  `,
})
export class ChallengesPage {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private session = inject(SessionService);

  readonly list = signal<Challenge[]>([]);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly admin = computed(() => Boolean(this.session.me()?.admin));
  readonly types = TYPES;
  readonly date = frDate;
  readonly fmt = duration;
  form = {
    title: '',
    type: 'deposits' as ChallengeType,
    target: 10,
    start: dayInput(new Date()),
    end: dayInput(new Date(Date.now() + 6 * 86400000)),
    reward: '',
  };

  constructor() {
    this.load();
    liveRefresh('achievements', () => this.load());
  }

  load() {
    this.api
      .challenges()
      .then((l) => {
        this.list.set(l);
        this.error.set(null);
      })
      .catch((err) => this.error.set(`Défis indisponibles : ${errorText(err)}`));
  }

  async create() {
    const type = TYPES.find((t) => t.key === this.form.type)!;
    this.saving.set(true);
    try {
      await this.api.createChallenge({
        title: this.form.title.trim(),
        type: this.form.type,
        target: Math.round(Number(this.form.target) * type.factor),
        start: toSeconds(this.form.start),
        end: toSeconds(this.form.end, true),
        reward: this.form.reward.trim(),
      });
      this.toast.ok('⚔️ Défi lancé');
      this.form.title = '';
      this.form.reward = '';
      this.load();
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(c: Challenge) {
    try {
      await this.api.deleteChallenge(c.id);
      this.toast.ok('Défi supprimé');
      this.load();
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  share(c: Challenge) {
    return Math.min(100, (100 * c.progress) / (c.target || 1));
  }
  pct(c: Challenge) {
    return Math.floor(this.share(c));
  }
  label(type: ChallengeType) {
    return TYPES.find((t) => t.key === type)?.label ?? type;
  }
  unit(type: ChallengeType) {
    return TYPES.find((t) => t.key === type)?.unit ?? '';
  }
  statusText(s: Challenge['status']) {
    return STATUS[s];
  }
}
