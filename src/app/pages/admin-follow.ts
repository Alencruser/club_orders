import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { AdminFollow, AdminFollowSession } from '../core/models';
import { ToastService } from '../core/toast.service';
import { duration } from '../shared/guild-ui';

const PAGE = 100;

type Show = 'all' | 'long' | 'ignored' | 'running';

// 🚶 Suivi tab of /admin (pages/admin.ts): every follow session the addon sent, one by one. An admin can
// ignore one (kept, counted nowhere) or delete it; its time is never changed. The board, the site, titles,
// achievements and challenges follow; achievements already unlocked stay.
@Component({
  selector: 'app-admin-follow',
  imports: [DatePipe, FormsModule],
  // only loaded with /admin (lazy chunk), not in the global stylesheet
  styles: `
    .fl-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      align-items: center;
      margin-bottom: 0.6rem;
      input {
        flex: 1;
        min-width: 10rem;
      }
    }
    .fl-list {
      list-style: none;
      margin: 0;
      padding: 0;
      > li {
        display: grid;
        grid-template-columns: 6.5rem minmax(0, 1fr) 7rem auto;
        gap: 0.3rem 0.6rem;
        align-items: center;
        padding: 0.35rem 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
      .fl-off {
        opacity: 0.5;
      }
      @media (max-width: 700px) {
        > li {
          grid-template-columns: 1fr auto;
        }
      }
    }
    .fl-who {
      overflow-wrap: anywhere;
    }
    .fl-acts {
      display: flex;
      gap: 0.3rem;
      flex-wrap: wrap;
      justify-content: end;
      .btn {
        padding: 0.15rem 0.5rem;
      }
    }
    .fl-badge {
      font-size: 0.75rem;
      padding: 0 0.35rem;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      margin-left: 0.3rem;
    }
  `,
  template: `
    @if (data(); as d) {
      <section class="tooltip admin-card">
        <h2>🚶 Sessions de suivi</h2>
        <p class="muted small">
          {{ d.sessions.length }} session(s), {{ fmt(counted()) }} comptées. Une session ignorée reste listée mais ne
          compte nulle part (bilan, site, titres, hauts faits, défis). Les hauts faits déjà débloqués restent.
        </p>
        <div class="fl-filters">
          <input [ngModel]="search()" (ngModelChange)="search.set($event); limit.set(PAGE)" placeholder="🔍 Suiveur ou suivi…" />
          <select [ngModel]="show()" (ngModelChange)="show.set($event); limit.set(PAGE)">
            <option value="all">Toutes</option>
            <option value="long">Plus d’1 h</option>
            <option value="ignored">Ignorées</option>
            <option value="running">En cours</option>
          </select>
          <select [ngModel]="order()" (ngModelChange)="order.set($event)">
            <option value="recent">Plus récentes</option>
            <option value="long">Plus longues</option>
          </select>
        </div>
        <ul class="fl-list">
          @for (s of shown(); track s.id) {
            <li [class.fl-off]="s.ignored">
              <span class="small">{{ s.start * 1000 | date: 'dd/MM HH:mm' }}</span>
              <span class="fl-who">
                <b>{{ s.member ?? s.name }}</b>
                @if (s.member && s.member !== s.name) {
                  <span class="muted small"> ({{ s.name }})</span>
                }
                → {{ s.targetMember ?? s.target }}
                @if (!s.done) {
                  <span class="fl-badge">en cours</span>
                }
                @if (s.ignored) {
                  <span class="fl-badge" [title]="'par ' + (s.ignored.by ?? '?')">ignorée</span>
                }
              </span>
              <span class="fl-time small">
                <b>{{ fmt(s.seconds) }}</b>
              </span>
              <span class="fl-acts">
                <button type="button" class="btn ghost" [disabled]="busy()" (click)="toggle(s)">
                  {{ s.ignored ? '↩️ Compter' : '🚫 Ignorer' }}
                </button>
                <button
                  type="button"
                  class="btn danger"
                  [disabled]="busy() || !s.done"
                  [title]="s.done ? 'Supprimer' : 'En cours : l’addon la renverrait, ignore-la plutôt'"
                  (click)="remove(s)"
                >
                  🗑️
                </button>
              </span>
            </li>
          } @empty {
            <li class="muted small">Aucune session.</li>
          }
        </ul>
        @if (filtered().length > limit()) {
          <div class="admin-actions">
            <button type="button" class="btn ghost" (click)="limit.set(limit() + PAGE)">
              Voir plus ({{ filtered().length - limit() }})
            </button>
          </div>
        }
      </section>
    } @else if (error(); as e) {
      <p class="refused">❌ {{ e }}</p>
    } @else {
      <p class="center muted">Chargement…</p>
    }
  `,
})
export class AdminFollowComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly PAGE = PAGE;
  readonly data = signal<AdminFollow | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly search = signal('');
  readonly show = signal<Show>('all');
  readonly order = signal<'recent' | 'long'>('recent');
  readonly limit = signal(PAGE);

  readonly counted = computed(() => (this.data()?.sessions ?? []).filter((s) => !s.ignored).reduce((sum, s) => sum + s.seconds, 0));
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const show = this.show();
    const list = (this.data()?.sessions ?? []).filter((s) => {
      if (show === 'long' && s.seconds < 3600) return false;
      if (show === 'ignored' && !s.ignored) return false;
      if (show === 'running' && s.done) return false;
      return !q || [s.name, s.member, s.target, s.targetMember].some((x) => x?.toLowerCase().includes(q));
    });
    return this.order() === 'long' ? [...list].sort((a, b) => b.seconds - a.seconds) : list;
  });
  readonly shown = computed(() => this.filtered().slice(0, this.limit()));

  readonly fmt = duration;

  constructor() {
    this.load();
  }

  async load() {
    try {
      this.data.set(await this.api.adminFollow());
      this.error.set(null);
    } catch (err) {
      this.error.set(errorText(err));
    }
  }


  toggle(s: AdminFollowSession) {
    return this.run(() => this.api.adminFollowIgnore(s.id, !s.ignored), s.ignored ? '↩️ Session recomptée.' : '🚫 Session ignorée.');
  }


  remove(s: AdminFollowSession) {
    if (!confirm(`Supprimer pour de bon la session de ${s.member ?? s.name} → ${s.targetMember ?? s.target} (${duration(s.seconds)}) ?`)) return;
    return this.run(() => this.api.adminFollowRemove(s.id), '🗑️ Session supprimée.');
  }

  private async run(call: () => Promise<AdminFollow>, done: string) {
    this.busy.set(true);
    try {
      this.data.set(await call());
      this.toast.ok(done);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.busy.set(false);
    }
  }
}
