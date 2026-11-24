import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { AdminChannel, AdminSpy, AdminSpyBot } from '../core/models';
import { ToastService } from '../core/toast.service';
import { AdminSettingsBlockComponent } from './admin-settings';

const REFRESH_MS = 15 * 1000; // live talk times while the tab is open
const PERIODS = ['1h', '2h', '3h', '6h'];

// 🕵️ Espionnage tab of /admin (pages/admin.ts): the three spies (main bot, Espion bot, record player),
// their live session (who talks, how long), report channel, start / stop / status / report — the same
// actions as /espionnage, /espionnage2 and /espionnage3.
@Component({
  selector: 'app-admin-spy',
  imports: [DatePipe, FormsModule, AdminSettingsBlockComponent],
  // only loaded with /admin (lazy chunk), not in the global stylesheet
  styles: `
    .spy-head {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      img {
        width: 36px;
        height: 36px;
        border-radius: 50%;
      }
    }
    .spy-state {
      margin-left: auto;
      white-space: nowrap;
    }
    .spy-people {
      list-style: none;
      margin: 0.4rem 0;
      padding: 0;
      li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 6rem auto;
        gap: 0.5rem;
        align-items: center;
        padding: 0.2rem 0;
      }
      .gone {
        opacity: 0.55;
      }
    }
    .spy-bar {
      height: 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      overflow: hidden;
      span {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, #8a6a12, #ffd100);
      }
    }
    .spy-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      align-items: center;
      margin: 0.5rem 0;
      select {
        flex: 1;
        min-width: 10rem;
      }
    }
  `,
  template: `
    @if (spy(); as s) {
      <p class="muted small">
        Le temps de parole est compté sans rien écouter. Actualisé toutes les 15 s. Les rapports partent dans le
        salon des rapports de chaque espion.
      </p>
      <div class="admin-grid">
        <app-admin-settings-block section="spy" />
        @for (b of s.bots; track b.key) {
          <section class="tooltip admin-card">
            <div class="spy-head">
              @if (b.bot?.avatar) {
                <img [src]="b.bot!.avatar" alt="" />
              }
              <div>
                <h2>{{ b.label }}</h2>
                <span class="muted small">/{{ b.command }}{{ b.bot ? ' · ' + b.bot.name : '' }}</span>
              </div>
              <span class="spy-state small">
                @if (!b.online) {
                  🔴 injoignable
                } @else if (b.session) {
                  🟢 en écoute
                } @else {
                  ⚪ en attente
                }
              </span>
            </div>

            @if (!b.online) {
              <p class="bad small">{{ b.error }}</p>
            } @else {
              @if (b.session; as ses) {
                <p>
                  🎙️ <b>{{ ses.channelName }}</b> depuis {{ ses.startedAt | date: 'HH:mm' }}
                  <span class="muted small"
                    >({{ duration(s.now - ses.startedAt) }}, {{ ses.startedBy ? 'lancé par ' + ses.startedBy : 'arrivée automatique' }})</span
                  >
                </p>
                <ul class="spy-people">
                  @for (p of ses.participants; track p.userId) {
                    <li [class.gone]="!p.present">
                      <span>{{ p.name }}{{ p.present ? '' : ' (parti)' }}</span>
                      <span class="spy-bar"><span [style.width.%]="share(ses.participants, p.ms)"></span></span>
                      <span class="small">{{ duration(p.ms) }}</span>
                    </li>
                  } @empty {
                    <li class="muted small">Personne pour l'instant.</li>
                  }
                </ul>
                <div class="spy-row">
                  <button type="button" class="btn danger" [disabled]="busy()" (click)="act(b, 'stop')">⏹️ Arrêter</button>
                  <button type="button" class="btn ghost" [disabled]="busy()" (click)="act(b, 'post', 'status')">📊 Statut</button>
                  @for (k of periods; track k) {
                    <button type="button" class="btn ghost" [disabled]="busy()" (click)="act(b, 'post', k)">{{ k }}</button>
                  }
                </div>
              } @else {
                @if (b.resident) {
                  <p class="muted small">Reste dans <b>{{ b.resident.channelName ?? 'son salon' }}</b> avec la musique ; démarre tout seul quand quelqu'un arrive.</p>
                  <div class="spy-row">
                    <button type="button" class="btn gold" [disabled]="busy()" (click)="act(b, 'start')">▶️ Lancer</button>
                  </div>
                } @else {
                  <p class="muted small">Rejoint tout seul un salon où il y a du monde, ou lance-le dans un salon :</p>
                  <div class="spy-row">
                    <select [(ngModel)]="voiceOf[b.key]">
                      <option [ngValue]="undefined">Salon vocal…</option>
                      @for (v of b.voiceChannels ?? []; track v.id) {
                        <option [ngValue]="v.id" [disabled]="v.bot || !v.joinable">
                          {{ v.name }}{{ v.humans ? ' · ' + v.humans + ' présent(s)' : '' }}{{ v.bot ? ' · un bot y est' : '' }}
                        </option>
                      }
                    </select>
                    <button type="button" class="btn gold" [disabled]="busy() || !voiceOf[b.key]" (click)="act(b, 'start')">▶️ Lancer</button>
                  </div>
                }
              }

              <h4>Salon des rapports</h4>
              <div class="spy-row">
                <select [(ngModel)]="reportOf[b.key]">
                  <option [ngValue]="null">
                    Par défaut{{ b.defaultReportChannelId ? ' (#' + channelName(b.defaultReportChannelId) + ')' : '' }}
                  </option>
                  @if (b.reportChannelId && !known(b.reportChannelId)) {
                    <option [ngValue]="b.reportChannelId">⚠️ salon introuvable (supprimé ?)</option>
                  }
                  @for (c of channels(); track c.id) {
                    <option [ngValue]="c.id" [disabled]="!c.botCanWrite">#{{ c.name }}</option>
                  }
                </select>
                <button
                  type="button"
                  class="btn ghost"
                  [disabled]="busy() || (reportOf[b.key] ?? null) === (b.reportChannelId ?? null)"
                  (click)="act(b, 'report')"
                >
                  Enregistrer
                </button>
              </div>
            }
          </section>
        }
      </div>
    } @else if (error(); as e) {
      <p class="refused">❌ {{ e }}</p>
    } @else {
      <p class="center muted">Chargement…</p>
    }
  `,
})
export class AdminSpyComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly spy = signal<AdminSpy | null>(null);
  readonly channels = signal<AdminChannel[]>([]);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly periods = PERIODS;
  voiceOf: Record<string, string | undefined> = {};
  reportOf: Record<string, string | null> = {};

  constructor() {
    this.load(true);
    this.api.adminChannels().then((c) => this.channels.set(c), () => {});
    const timer = setInterval(() => {
      if (!document.hidden && !this.busy()) this.load(false);
    }, REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  async load(first: boolean) {
    try {
      this.apply(await this.api.adminSpy(), first);
    } catch (err) {
      if (first) this.error.set(errorText(err));
    }
  }

  // the report channel menus follow the bot, except one the admin is changing
  private apply(s: AdminSpy, resetMenus: boolean) {
    const before = this.spy();
    for (const b of s.bots) {
      const old = before?.bots.find((x) => x.key === b.key);
      if (resetMenus || !old || (this.reportOf[b.key] ?? null) === (old.reportChannelId ?? null)) {
        this.reportOf[b.key] = b.reportChannelId ?? null;
      }
    }
    this.spy.set(s);
    this.error.set(null);
  }

  async act(b: AdminSpyBot, action: 'start' | 'stop' | 'report' | 'post', kind?: string) {
    if (action === 'stop' && !confirm(`Arrêter ${b.label} ? Le rapport de la session est posté.`)) return;
    const channelId = action === 'start' ? (this.voiceOf[b.key] ?? null) : action === 'report' ? (this.reportOf[b.key] ?? null) : null;
    this.busy.set(true);
    try {
      const { result, spy } = await this.api.adminSpyAction(b.key, action, channelId, kind);
      this.apply(spy, action === 'report');
      const url = (result as { url?: string | null })?.url;
      const done = {
        start: `▶️ ${b.label} lancé.`,
        stop: '⏹️ Arrêté, rapport posté.',
        report: '✅ Salon des rapports enregistré.',
        post: '📊 Posté dans le salon des rapports.',
      }[action];
      this.toast.ok(url ? `${done} ${url}` : done);
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.busy.set(false);
    }
  }

  known(id: string) {
    return this.channels().some((c) => c.id === id);
  }

  channelName(id: string) {
    return this.channels().find((c) => c.id === id)?.name ?? 'salon';
  }

  share(list: { ms: number }[], ms: number) {
    const max = Math.max(1, ...list.map((p) => p.ms));
    return (100 * ms) / max;
  }

  duration(ms: number) {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h) return `${h} h ${String(m).padStart(2, '0')}`;
    if (m) return `${m} min ${String(s % 60).padStart(2, '0')}`;
    return `${s} s`;
  }
}
