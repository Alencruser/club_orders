import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AchievementsSummary,
  Artisan,
  Challenge,
  BankSummary,
  Catalog,
  FeedbackItem,
  FollowSummary,
  Me,
  Order,
  Tooltip,
} from './models';

// Calls to the bot (same address as the site, /api forwarded by Caddy). The session is a cookie.
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  me() {
    return this.get<Me>('/api/me');
  }

  catalog() {
    return this.get<Catalog>('/api/catalog');
  }

  async artisans() {
    return (await this.get<{ artisans: Artisan[] }>('/api/artisans')).artisans;
  }

  items(ids: number[]) {
    return this.get<{ items: Record<string, Tooltip>; missing: string[] }>(
      `/api/items?ids=${ids.join(',')}`,
    );
  }

  orders() {
    return this.get<{ placed: Order[]; received: Order[] }>('/api/orders');
  }

  async placeOrder(body: {
    spell: string;
    artisan: string;
    buyer: { name: string; realm: string };
    qty: number;
    note: string;
  }) {
    return (await this.post<{ order: Order }>('/api/orders', body)).order;
  }

  async cancel(id: string) {
    return (await this.post<{ order: Order }>(`/api/orders/${id}/cancel`, {})).order;
  }

  async setStatus(id: string, status: 'done' | 'refused', reason = '') {
    return (await this.post<{ order: Order }>(`/api/orders/${id}/status`, { status, reason }))
      .order;
  }

  async reply(id: string, text: string) {
    return (await this.post<{ order: Order }>(`/api/orders/${id}/reply`, { text })).order;
  }

  async setNote(text: string) {
    return (await this.post<{ note: string | null }>('/api/note', { text })).note;
  }

  sendFeedback(type: 'suggestion' | 'bug', text: string, page: string) {
    return this.post('/api/feedback', { type, text, page });
  }

  // Only for BOT_ADMINS accounts: anyone else gets a 404
  async feedbackList() {
    return (await this.get<{ items: FeedbackItem[] }>('/api/feedback')).items;
  }

  async feedbackStatus(id: string, status: 'new' | 'done') {
    return (await this.post<{ item: FeedbackItem }>(`/api/feedback/${id}/status`, { status })).item;
  }

  feedbackDelete(id: string) {
    return this.post(`/api/feedback/${id}/delete`, {});
  }

  logout() {
    return this.post('/api/auth/logout', {});
  }

  bank() {
    return this.get<BankSummary>('/api/bank');
  }

  follow() {
    return this.get<FollowSummary>('/api/follow');
  }

  achievements() {
    return this.get<AchievementsSummary>('/api/achievements');
  }

  async challenges() {
    return (await this.get<{ challenges: Challenge[] }>('/api/challenges')).challenges;
  }

  // Bot admins only
  createChallenge(body: Omit<Challenge, 'id' | 'progress' | 'status' | 'completedAt'>) {
    return this.post<{ challenge: Challenge }>('/api/challenges', body);
  }

  deleteChallenge(id: string) {
    return this.post(`/api/challenges/${id}/delete`, {});
  }

  // Bot admins only (404 for anyone else)
  async shareChannels() {
    return (
      await this.get<{ channels: { id: string; name: string; parent: string | null }[] }>(
        '/api/share/channels',
      )
    ).channels;
  }

  share(card: string, channelId: string, text: string) {
    return this.post<{ url: string }>('/api/share', { card, channelId, text });
  }

  loginUrl(back = location.pathname) {
    return `/api/auth/login?back=${encodeURIComponent(back)}`;
  }

  private get<T>(url: string) {
    return firstValueFrom(this.http.get<T>(url));
  }

  private post<T>(url: string, body: unknown) {
    return firstValueFrom(this.http.post<T>(url, body));
  }
}

// Message of an API error, in French (the bot's own text when it gave one).
export function errorText(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.error?.error) return err.error.error;
    if (err.status === 0) return 'le bot ne répond pas';
    return `erreur ${err.status}`;
  }
  return 'erreur inattendue';
}
