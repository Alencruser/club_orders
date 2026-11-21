import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FeedbackDialogComponent } from './shared/feedback-dialog';
import { ApiService } from './core/api.service';
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
      <a routerLink="/" class="brand">
        <img src="https://wow.zamimg.com/images/wow/icons/medium/inv_hammer_20.jpg" alt="" />
        <span><strong>Bagarre club</strong> <span class="muted">· Commandes</span></span>
      </a>
      @if (session.status() === 'in') {
        <nav class="nav nav-images">
          <a
            routerLink="/"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: true }"
            class="nav-text"
            >Grimoire</a
          >
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
          <a routerLink="/atelier" routerLinkActive="active" title="Mon atelier">
            <img src="/nav/atelier.webp" alt="Atelier" />
            @if (orders.receivedPending().length) {
              <span class="badge">{{ orders.receivedPending().length }}</span>
            }
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
          <a routerLink="/defis" routerLinkActive="active" title="Défis de guilde">
            <img src="/nav/defis.webp" alt="Défis" />
          </a>
        </nav>
        <div class="user">
          <button type="button" class="btn ghost" (click)="feedbackOpen.set(true)">
            💡 Suggestion / bug
          </button>
          @if (session.me()?.user?.avatar; as avatar) {
            <img [src]="avatar" alt="" />
          }
          <span>{{ session.me()?.user?.name }}</span>
          <button type="button" class="btn ghost" (click)="session.logout()">Déconnexion</button>
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
        <button type="button" class="toast {{ t.kind }}" (click)="toast.dismiss(t.id)">
          {{ t.text }}
        </button>
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
      if (e instanceof NavigationEnd) this.theme.set(this.themeOf(e.urlAfterRedirects));
    });
    this.session.load();
    refreshOrders(this.session, this.orders, this.data);
  }
}
