import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FeedbackDialogComponent } from './shared/feedback-dialog';
import { ApiService } from './core/api.service';
import { MyVersions } from './core/models';
import { CartService } from './core/cart.service';
import { DataService } from './core/data.service';
import { OrdersService, refreshOrders } from './core/orders.service';
import { SessionService } from './core/session.service';
import { ToastService } from './core/toast.service';

const LOGIN_ERRORS: Record<string, string> = {
  'not-member': 'Ce compte Discord n’est pas membre du serveur du club.',
  cancelled: 'Connexion annulée.',
  expired: 'La connexion a expiré, recommence.',
  discord: 'Discord n’a pas répondu, réessaie.',
};

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FeedbackDialogComponent],
  template: `
    <header class="topbar">
      <a routerLink="/" class="brand" title="Bagarre club">
        <img src="/bagarre-club.webp" alt="Bagarre club" />
      </a>
      @if (session.status() === 'in') {
        <nav class="nav nav-images">
          <a routerLink="/grimoire" routerLinkActive="active" title="Grimoire des recettes">
            <img src="/nav/grimoire.webp" alt="Grimoire" />
          </a>
          <a routerLink="/banque" routerLinkActive="active" title="Banque de guilde">
            <img src="/nav/banque.webp" alt="Banque" />
          </a>
          <a routerLink="/suivi" routerLinkActive="active" title="Suivi">
            <img src="/nav/suivi.webp" alt="Suivi" />
          </a>
          <a routerLink="/hauts-faits" routerLinkActive="active" title="Hauts faits">
            <img src="/nav/hauts-faits.webp" alt="Hauts faits" />
          </a>
          <a routerLink="/atelier" routerLinkActive="active" title="Mon atelier">
            <img src="/nav/atelier.webp" alt="Atelier" />
            @if (orders.receivedPending().length) {
              <span class="badge">{{ orders.receivedPending().length }}</span>
            }
          </a>
          <a routerLink="/defis" routerLinkActive="active" title="Défis de guilde">
            <img src="/nav/defis.webp" alt="Défis" />
          </a>
          <a routerLink="/panier" routerLinkActive="active" title="Panier">
            <img src="/nav/panier.webp" alt="Panier" />
            @if (cart.count()) {
              <span class="badge">{{ cart.count() }}</span>
            }
          </a>
          <a routerLink="/commandes" routerLinkActive="active" title="Mes commandes">
            <img src="/nav/commandes.webp" alt="Mes commandes" />
            @if (orders.placedPending().length) {
              <span class="badge dim">{{ orders.placedPending().length }}</span>
            }
          </a>
        </nav>
        <div class="user">
          <button
            type="button"
            class="icon-btn"
            title="Une idée ou un problème ? Envoie une suggestion ou signale un bug à l’équipe du site"
            aria-label="Suggestion ou bug"
            (click)="feedbackOpen.set(true)"
          >
            💡
          </button>
          @if (session.me()?.siteAdmin) {
            <a
              routerLink="/admin"
              routerLinkActive="active"
              class="icon-btn feedback-link"
              title="Tableau de bord du bot (visible seulement par vous deux)"
              aria-label="Tableau de bord du bot"
            >
              ⚙️
            </a>
          }
          @if (session.me()?.feedbackAdmin) {
            <a
              routerLink="/feedback"
              routerLinkActive="active"
              class="icon-btn feedback-link"
              title="Suggestions et bugs reçus (visible seulement par vous deux)"
              aria-label="Suggestions et bugs reçus"
            >
              📋
              @if (feedbackNew()) {
                <span class="badge">{{ feedbackNew() }}</span>
              }
            </a>
          }
          @if (session.me()?.user?.avatar; as avatar) {
            <img [src]="avatar" alt="" [title]="session.me()?.user?.name ?? ''" />
          }
          <button
            type="button"
            class="icon-btn logout"
            title="Se déconnecter du site"
            aria-label="Déconnexion"
            (click)="session.logout()"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 16l4-4-4-4M19 12H9"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      }
    </header>

    <main [class]="'theme-' + theme()">
      @switch (session.status()) {
        @case ('loading') {
          <p class="center muted">Chargement…</p>
        }
        @case ('out') {
          <div class="login tooltip">
            <img src="https://wow.zamimg.com/images/wow/icons/large/inv_misc_book_09.jpg" alt="" />
            <h1>Le comptoir des artisans</h1>
            <p>
              Commande tes objets aux artisans du club, suis tes commandes et prépare tes
              composants.
            </p>
            @if (loginError(); as error) {
              <p class="refused">{{ error }}</p>
            }
            <a class="btn discord" [href]="api.loginUrl()">Se connecter avec Discord</a>
            <p class="muted small">
              Réservé aux membres du serveur Discord du club. Le site ne lit que ton pseudo et ton
              avatar.
            </p>
          </div>
        }
        @case ('error') {
          <div class="login tooltip">
            <h1>Le bot ne répond pas</h1>
            <p>Réessaie dans un moment.</p>
            <button type="button" class="btn gold" (click)="session.load()">Réessayer</button>
          </div>
        }
        @default {
          @if (data.error(); as error) {
            <p class="refused center">
              {{ error }}
              <button type="button" class="btn ghost" (click)="data.load()">Réessayer</button>
            </p>
          } @else if (!data.catalog()) {
            <p class="center muted">Ouverture du grimoire…</p>
          } @else {
            <router-outlet />
          }
        }
      }
    </main>

    @if (feedbackOpen()) {
      <app-feedback-dialog (closed)="feedbackOpen.set(false)" />
    }

    <div class="toasts" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        @if (t.kind === 'warn') {
          <!-- Nono, the angry mascot, says it in a comic speech bubble -->
          <button type="button" class="toast-nono" (click)="toast.dismiss(t.id)" title="Fermer">
            <img src="/nono-colere.webp" alt="Nono en colère" width="88" height="84" />
            <span class="bubble">{{ t.text }}</span>
          </button>
        } @else {
          <button type="button" class="toast {{ t.kind }}" (click)="toast.dismiss(t.id)">
            {{ t.text }}
          </button>
        }
      }
    </div>
  `,
})
export class App {
  protected session = inject(SessionService);
  protected cart = inject(CartService);
  protected orders = inject(OrdersService);
  protected data = inject(DataService);
  protected toast = inject(ToastService);
  protected api = inject(ApiService);
  readonly feedbackOpen = signal(false);
  // FEEDBACK_ADMINS only: count of the suggestions and bugs still « À voir »
  readonly feedbackNew = signal(0);

  // ?login=… after a refused Discord login (set by the bot)
  readonly loginError = computed(
    () => LOGIN_ERRORS[new URLSearchParams(location.search).get('login') ?? ''] ?? null,
  );

  // Look of the page
  private router = inject(Router);
  readonly theme = signal<'forge' | 'museum'>('forge');
  // the forge everywhere (the museum frames are kept in styles.scss, unused)
  private themeOf = (_url: string): 'forge' | 'museum' => 'forge';

  constructor() {
    this.theme.set(this.themeOf(location.pathname));
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        this.theme.set(this.themeOf(e.urlAfterRedirects));
        this.countFeedback();
        this.refreshVersions();
      }
    });
    // first page: the reminder waits for /api/me
    effect(() => {
      if (this.session.me()?.versions) untracked(() => this.versionReminder());
    });
    effect(() => {
      if (this.session.me()?.feedbackAdmin) this.countFeedback();
    });
    this.session.load();
    refreshOrders(this.session, this.orders, this.data);
  }

  // The player's versions, re-read on every page change (at most every 10 s): Nono calms down as soon as
  // the companion has sent its new version, without a reload
  private versionsAt = 0;
  private readonly versions = signal<MyVersions | null | undefined>(undefined);
  private async refreshVersions() {
    if (this.session.me() && Date.now() - this.versionsAt > 10_000) {
      this.versionsAt = Date.now();
      try {
        this.versions.set(await this.api.myVersions());
      } catch {
        // keep what we had
      }
    }
    this.versionReminder();
  }

  // Out-of-date addon or companion: a reminder on every page until the player updates (the bot sees
  // their versions through the companion 0.7.5+; unknown usually means an older companion)
  private versionReminder() {
    const fresh = this.versions();
    const v = fresh === undefined ? this.session.me()?.versions : fresh;
    if (!v || v.status === 'ok') return;
    if (v.status === 'unknown') {
      this.toast.warn(
        'Grrr ! Je ne vois pas tes versions : ton compagnon est trop vieux (ou éteint). Mets-le à jour : menu du compagnon (icône près de l’horloge) > Check for updates !',
      );
      return;
    }
    const parts = [
      v.addonBehind
        ? `l’addon (v${v.addon ?? '?'} → v${v.latest.addon}) : mets-le à jour dans l’app CurseForge`
        : null,
      v.companionBehind
        ? `le compagnon (${v.companion ?? '?'} → ${v.latest.companion}) : menu du compagnon > Check for updates`
        : null,
    ].filter(Boolean);
    if (parts.length) this.toast.warn(`Grrr ! T’es pas à jour : ${parts.join(' ; ')} !`);
  }

  private async countFeedback() {
    if (!this.session.me()?.feedbackAdmin) return;
    try {
      const list = await this.api.feedbackList();
      this.feedbackNew.set(list.filter((f) => f.status === 'new').length);
    } catch {
      this.feedbackNew.set(0);
    }
  }
}
