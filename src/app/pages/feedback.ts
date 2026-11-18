import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, errorText } from '../core/api.service';
import { FeedbackItem } from '../core/models';
import { ToastService } from '../core/toast.service';

// Hidden page (no link anywhere): suggestions and bugs sent by players. The bot only answers BOT_ADMINS
// accounts; anyone else is sent back to the book, as for an unknown address.
@Component({
  selector: 'app-feedback',
  imports: [DatePipe],
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
  `,
})
export class FeedbackPage {
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly items = signal<FeedbackItem[] | null>(null);
  readonly filter = signal<'new' | 'done' | 'all'>('new');
  readonly shown = computed(() =>
    (this.items() ?? []).filter((f) => this.filter() === 'all' || f.status === this.filter()),
  );

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
}
