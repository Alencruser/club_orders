import { Component, computed, inject, signal } from '@angular/core';
import { ApiService, errorText } from '../core/api.service';
import { FollowMember, FollowSummary } from '../core/models';
import { AvatarComponent, duration, liveRefresh } from '../shared/guild-ui';
import { ShareButtonComponent } from '../shared/share-button';

// Follow time: who follows the most (all time or the last 7 days), and for each player everyone they
// followed, for how long and how many times. Read only, live from the bot.
@Component({
  selector: 'app-follow',
  imports: [AvatarComponent, ShareButtonComponent],
  template: `
    <div class="page-head">
      <div>
        <h1>Suivi</h1>
        <p class="muted small">
          Temps passé en /follow derrière un guildeux, tous les persos d’un membre réunis
        </p>
      </div>
      <div class="tabs">
        <button type="button" [class.active]="period() === 'all'" (click)="period.set('all')">
          Depuis le début
        </button>
        <button type="button" [class.active]="period() === 'week'" (click)="period.set('week')">
          7 derniers jours
        </button>
      </div>
    </div>

    @if (error(); as e) {
      <p class="refused">{{ e }}</p>
    }
    @if (data(); as d) {
      <section class="tooltip follow-total">
        <div>
          <h4>Temps de suivi de la guilde</h4>
          <span class="follow-big">{{ fmt(d.total) }}</span>
        </div>
        @if (ranked()[0]; as first) {
          <div class="follow-crown">
            <h4>👑 Champion du suivi</h4>
            <div class="highlight-who">
              <app-avatar [src]="first.avatar" [name]="first.name" [size]="36" /> {{ first.name }}
            </div>
            <span class="muted">{{ fmt(time(first)) }}</span>
          </div>
        }
      </section>

      <section class="tooltip">
        <h2>Qui suit le plus <app-share [card]="'follow:' + period()" /></h2>
        <ol class="ranking">
          @for (m of ranked(); track m.id; let i = $index) {
            <li [class.open]="open() === m.id" [class.unlinked]="!m.linked">
              <button type="button" class="rank-row" (click)="toggle(m.id)">
                <span class="medal m{{ i }}">{{ i + 1 }}</span>
                <app-avatar [src]="m.avatar" [name]="m.name" />
                <span class="rank-name">
                  {{ m.name }}
                  @if (m.title) {
                    <span class="rank-title">{{ m.title }}</span>
                  }
                  @if (!m.linked) {
                    <span class="muted small">sans battletag</span>
                  }
                </span>
                <span class="rank-gauge"
                  ><span [style.width.%]="(100 * time(m)) / max()"></span
                ></span>
                <span class="rank-value"
                  >{{ fmt(time(m)) }}
                  <span class="muted small"
                    >· {{ m.sessions }} suivi{{ m.sessions > 1 ? 's' : '' }}</span
                  ></span
                >
              </button>
              @if (open() === m.id) {
                <div class="rank-detail follow-detail">
                  <div class="detail-share"><app-share [card]="'followPlayer:' + m.id" /></div>
                  <h4>Derrière qui (depuis le début)</h4>
                  @for (t of m.targets; track t.name) {
                    <div class="target">
                      <span class="grow">
                        {{ t.name }}
                        @if (t.member) {
                          <span class="muted small">{{ t.member }}</span>
                        }
                      </span>
                      <span class="rank-gauge"
                        ><span [style.width.%]="(100 * t.seconds) / m.targets[0].seconds"></span
                      ></span>
                      <span class="rank-value"
                        >{{ fmt(t.seconds) }}
                        <span class="muted small">· {{ t.count }} fois</span></span
                      >
                    </div>
                  }
                  @if (m.characters.length > 1) {
                    <h4>Par perso</h4>
                    <p>
                      @for (c of m.characters; track c.name; let last = $last) {
                        {{ c.name }} <span class="muted">{{ fmt(c.seconds) }}</span>{{
                          last ? '' : ' · '
                        }}
                      }
                    </p>
                  }
                </div>
              }
            </li>
          } @empty {
            <li class="muted">
              Personne n’a encore suivi un guildeux{{
                period() === 'week' ? ' cette semaine' : ''
              }}.
            </li>
          }
        </ol>
      </section>
    } @else if (!error()) {
      <p class="center muted">Chargement…</p>
    }
  `,
})
export class FollowPage {
  private api = inject(ApiService);

  readonly data = signal<FollowSummary | null>(null);
  readonly error = signal<string | null>(null);
  readonly period = signal<'all' | 'week'>('all');
  readonly open = signal<string | null>(null);
  readonly fmt = duration;

  readonly ranked = computed(() =>
    (this.data()?.members ?? [])
      .filter((m) => this.time(m) > 0)
      .sort((a, b) => this.time(b) - this.time(a)),
  );
  readonly max = computed(() => Math.max(1, ...this.ranked().map((m) => this.time(m))));

  constructor() {
    this.load();
    liveRefresh('follow', () => this.load());
  }

  load() {
    this.api
      .follow()
      .then((d) => {
        this.data.set(d);
        this.error.set(null);
      })
      .catch((err) => this.error.set(`Suivi indisponible : ${errorText(err)}`));
  }

  time(m: FollowMember) {
    return this.period() === 'week' ? m.week : m.seconds;
  }
  toggle(id: string) {
    this.open.set(this.open() === id ? null : id);
  }
}
