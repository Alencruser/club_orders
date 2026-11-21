import { Routes } from '@angular/router';
import { ArtisanPage } from './pages/artisan';
import { BankPage } from './pages/bank';
import { CartPage } from './pages/cart';
import { CatalogPage } from './pages/catalog';
import { HomePage } from './pages/home';
import { FeedbackPage } from './pages/feedback';
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
  // hidden: no link anywhere, and the bot only answers BOT_ADMINS accounts
  { path: 'feedback', component: FeedbackPage, title: 'Retours · Bagarre club' },
  { path: '**', redirectTo: '' },
];
