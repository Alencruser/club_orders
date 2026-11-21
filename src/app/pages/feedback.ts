import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, errorText } from '../core/api.service';
import { FeedbackItem } from '../core/models';
import { ToastService } from '../core/toast.service';

type Channel = { id: string; name: string; parent: string | null };

// Hidden page (no link anywhere): suggestions and bugs sent by players. The bot only answers
// FEEDBACK_ADMINS accounts; anyone else is sent back home, as for an unknown address.
// « Partager » posts one on Discord: the members vote 👍 / 👎 there and debate in its thread; the
// scores come back here.
@Component({
  selector: 'app-feedback',
  imports: [DatePipe, FormsModule],
  template: `
    @if (items(); as list) {
      <div class="page-head">
        <h1>Suggestions et bugs</h1>
        <div class="tabs">
          <button type="button" [class.active]="filter() === 'new'" (click)="filter.set('new')">
            À voir ({{ count('new') }})
          </button>
          <button type="button" [class.active]="filter() === 'done'" (click)="filter.set('done')">
            Traités ({{ count('done') }})
          </button>
          <button type="button" [class.active]="filter() === 'all'" (click)="filter.set('all')">
            Tout ({{ list.length }})
          </button>
        </div>
        <div class="tabs">
          <button type="button" [class.active]="sort() === 'date'" (click)="sort.set('date')">
            Plus récents
          </button>
          <button type="button" [class.active]="sort() === 'score'" (click)="sort.set('score')">
            Mieux notés
          </button>
        </div>
      </div>
      @for (f of shown(); track f.id) {
        <article class="tooltip feedback" [class.closed]="f.status === 'done'">
          <div class="feedback-head">
            <span class="kind {{ f.type }}">{{
              f.type === 'bug' ? '🐞 Bug' : '💡 Suggestion'
            }}</span>
            <strong>{{ f.name }}</strong>
            <span class="muted small">{{ f.createdAt | date: 'd MMM y, HH:mm' }}</span>
            @if (f.page) {
              <code class="small muted">{{ f.page }}</code>
            }
            <span class="grow"></span>
            @if (f.links.length) {
              <span
                class="feedback-score"
                [class.pos]="f.score > 0"
                [class.neg]="f.score < 0"
                title="Votes sur Discord"
              >
                👍 {{ f.up }} · 👎 {{ f.down }}
              </span>
              <a class="btn ghost" [href]="f.links[f.links.length - 1]" target="_blank" rel="noopener">
                💬 Débat
              </a>
            }
            <button type="button" class="btn ghost" (click)="openShare(f)">📤 Partager</button>
            <button type="button" class="btn ghost" (click)="toggle(f)">
              {{ f.status === 'done' ? '↩ À revoir' : '✓ Traité' }}
            </button>
            <button type="button" class="btn danger" (click)="remove(f)">Supprimer</button>
          </div>
          <p class="feedback-text">{{ f.text }}</p>
        </article>
      } @empty {
        <p class="muted">Rien ici.</p>
      }
    } @else {
      <p class="center muted">Chargement…</p>
    }

    @if (sharing(); as f) {
      <div class="overlay" (click)="sharing.set(null)">
        <form class="tooltip dialog" (click)="$event.stopPropagation()" (ngSubmit)="share(f)">
          <h2>Partager sur Discord</h2>
          <p class="muted small">
            Le bot poste {{ f.type === 'bug' ? 'ce bug' : 'cette suggestion' }} dans le salon choisi,
            avec {{ f.name }} mentionné (sans notification), les boutons 👍 / 👎 pour voter et un fil
            pour en débattre.
          </p>
          @if (channels(); as list) {
            <label class="field">
              Salon
              <select name="channel" [(ngModel)]="channelId" required>
                @for (c of list; track c.id) {
                  <option [value]="c.id">
                    #{{ c.name }}{{ c.parent ? ' · ' + c.parent : '' }}
                  </option>
                }
              </select>
            </label>
          } @else {
            <p class="muted">Chargement des salons…</p>
          }
          @if (f.links.length) {
            <p class="muted small">
              Déjà partagé {{ f.links.length }} fois : les votes s'additionnent.
            </p>
          }
          <div class="dialog-actions">
            <button type="button" class="btn ghost" (click)="sharing.set(null)">Annuler</button>
            <button class="btn gold" [disabled]="sending() || !channelId">
              {{ sending() ? 'Envoi…' : 'Partager' }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
})
export class FeedbackPage {
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly items = signal<FeedbackItem[] | null>(null);
  readonly filter = signal<'new' | 'done' | 'all'>('new');
  readonly sort = signal<'date' | 'score'>('date');
  readonly shown = computed(() => {
    const list = (this.items() ?? []).filter(
      (f) => this.filter() === 'all' || f.status === this.filter(),
    );
    return this.sort() === 'score'
      ? [...list].sort((a, b) => b.score - a.score || b.up - a.up || b.createdAt - a.createdAt)
      : list;
  });

  readonly sharing = signal<FeedbackItem | null>(null);
  readonly sending = signal(false);
  readonly channels = signal<Channel[] | null>(null);
  channelId = '';

  constructor() {
    this.load();
  }

  count(status: 'new' | 'done') {
    return (this.items() ?? []).filter((f) => f.status === status).length;
  }

  async load() {
    try {
      this.items.set(await this.api.feedbackList());
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.router.navigate([''], { replaceUrl: true });
      } else this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  async toggle(f: FeedbackItem) {
    try {
      const item = await this.api.feedbackStatus(f.id, f.status === 'done' ? 'new' : 'done');
      this.items.update((list) => (list ?? []).map((x) => (x.id === item.id ? item : x)));
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  async remove(f: FeedbackItem) {
    if (!confirm(`Supprimer ce message de ${f.name} ?`)) return;
    try {
      await this.api.feedbackDelete(f.id);
      this.items.update((list) => (list ?? []).filter((x) => x.id !== f.id));
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    }
  }

  async openShare(f: FeedbackItem) {
    this.sharing.set(f);
    if (this.channels()) return;
    try {
      const list = await this.api.feedbackChannels();
      this.channels.set(list);
      this.channelId ||=
        list.find((c) => /sugg|feedback|id[ée]e|retour/i.test(c.name))?.id ?? list[0]?.id ?? '';
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
      this.sharing.set(null);
    }
  }

  async share(f: FeedbackItem) {
    this.sending.set(true);
    try {
      const { url } = await this.api.feedbackShare(f.id, this.channelId);
      this.items.update((list) =>
        (list ?? []).map((x) => (x.id === f.id ? { ...x, links: [...x.links, url] } : x)),
      );
      this.toast.ok('📤 Partagé sur Discord');
      this.sharing.set(null);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.sending.set(false);
    }
  }
}
