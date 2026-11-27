import { Routes } from '@angular/router';
import { ArtisanPage } from './pages/artisan';
import { BankPage } from './pages/bank';
import { CartPage } from './pages/cart';
import { CatalogPage } from './pages/catalog';
import { HomePage } from './pages/home';
import { FollowPage } from './pages/follow';
import { TrophiesPage } from './pages/trophies';
import { ChallengesPage } from './pages/challenges';
import { MyOrdersPage } from './pages/my-orders';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'Bagarre club' },
  { path: 'grimoire', component: CatalogPage, title: 'Grimoire · Bagarre club' },
  { path: 'panier', component: CartPage, title: 'Panier · Bagarre club' },
  { path: 'commandes', component: MyOrdersPage, title: 'Mes commandes · Bagarre club' },
  { path: 'atelier', component: ArtisanPage, title: 'Atelier · Bagarre club' },
  { path: 'banque', component: BankPage, title: 'Banque de guilde · Bagarre club' },
  { path: 'suivi', component: FollowPage, title: 'Suivi · Bagarre club' },
  { path: 'hauts-faits', component: TrophiesPage, title: 'Hauts faits · Bagarre club' },
  { path: 'defis', component: ChallengesPage, title: 'Défis · Bagarre club' },
  // hidden: linked only for SITE_ADMINS accounts (top bar), and the bot only answers them
  // loaded on demand: only two accounts ever open them
  { path: 'admin', loadComponent: () => import('./pages/admin').then((m) => m.AdminPage), title: 'Tableau de bord · Bagarre club' },
  { path: 'importer', loadComponent: () => import('./pages/import').then((m) => m.ImportPage), title: 'Importer mon addon · Bagarre club' },
  { path: 'feedback', loadComponent: () => import('./pages/feedback').then((m) => m.FeedbackPage), title: 'Retours · Bagarre club' },
  { path: '**', redirectTo: '' },
];
