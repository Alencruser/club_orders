import { Routes } from '@angular/router';
import { ArtisanPage } from './pages/artisan';
import { CartPage } from './pages/cart';
import { CatalogPage } from './pages/catalog';
import { FeedbackPage } from './pages/feedback';
import { MyOrdersPage } from './pages/my-orders';

export const routes: Routes = [
  { path: '', component: CatalogPage, title: 'Grimoire · Bagarre club' },
  { path: 'panier', component: CartPage, title: 'Panier · Bagarre club' },
  { path: 'commandes', component: MyOrdersPage, title: 'Mes commandes · Bagarre club' },
  { path: 'atelier', component: ArtisanPage, title: 'Atelier · Bagarre club' },
  // hidden: no link anywhere, and the bot only answers BOT_ADMINS accounts
  { path: 'feedback', component: FeedbackPage, title: 'Retours · Bagarre club' },
  { path: '**', redirectTo: '' },
];
