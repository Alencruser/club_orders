import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ApiService, errorText } from '../core/api.service';
import { AdminLogEntry } from '../core/models';

const FIRST = 15;

// 📜 Journal des actions (État tab of /admin): who did what on the admin pages, most recent first
// (bot: admin-log.js, written by every admin action).
@Component({
  selector: 'app-admin-log',
  imports: [DatePipe],
  styles: `
    .log-list {
      list-style: none;
      margin: 0.3rem 0;
      padding: 0;
      li {
        padding: 0.25rem 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        overflow-wrap: anywhere;
      }
    }
  `,
  template: `
    <section class="tooltip admin-card wide">
      <h2>📜 Journal des actions</h2>
      <p class="muted small">Ce que les admins ont fait sur cette page, le plus récent d'abord.</p>
      @if (entries(); as list) {
        <ul class="log-list">
          @for (e of shown(); track $index) {
            <li class="small">
              <span class="muted">{{ e.at * 1000 | date: 'dd/MM HH:mm' }}</span> · <b>{{ e.name }}</b> · {{ e.what }}
            </li>
          } @empty {
            <li class="muted small">Rien pour l'instant.</li>
          }
        </ul>
        @if (list.length > shown().length) {
          <div class="admin-actions">
            <button type="button" class="btn ghost" (click)="limit.set(limit() + 50)">Voir plus ({{ list.length - shown().length }})</button>
          </div>
        }
      } @else if (error(); as e) {
        <p class="refused">❌ {{ e }}</p>
      } @else {
        <p class="muted small">Chargement…</p>
      }
    </section>
  `,
})
export class AdminLogComponent {
  private api = inject(ApiService);
  readonly entries = signal<AdminLogEntry[] | null>(null);
  readonly error = signal<string | null>(null);
  readonly limit = signal(FIRST);
  readonly shown = computed(() => (this.entries() ?? []).slice(0, this.limit()));

  constructor() {
    this.api.adminLog().then(
      (list) => this.entries.set(list),
      (err) => this.error.set(errorText(err)),
    );
  }
}
