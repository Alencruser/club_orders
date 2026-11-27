import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AchievementsSummary,
  AdminBank,
  AdminChannel,
  AdminDirectory,
  AdminMemberHit,
  AdminSpy,
  AdminTiers,
  AdminFollow,
  AdminLogEntry,
  AdminSettings,
  AdminSettingsValues,
  AdminDataset,
  AdminReleaseEntry,
  AdminState,
  AdminTools,
  AdminVersions,
  AddonImportRow,
  Artisan,
  Challenge,
  BankLine,
  BankSummary,
  Catalog,
  FeedbackItem,
  FollowSummary,
  HomeData,
  Me,
  MyVersions,
  NpcInfo,
  PatternSources,
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

  // One of the player's own characters, deleted in game: forgotten for good (the addon would send it back)
  forgetMyCharacter(name: string, realm: string) {
    return this.post<{ name: string }>('/api/me/characters/forget', { name, realm });
  }

  // the player's addon and companion versions (Nono's reminder), re-read on every page change
  async myVersions() {
    return (await this.get<{ versions: MyVersions | null }>('/api/me/versions')).versions;
  }

  catalog() {
    return this.get<Catalog>('/api/catalog');
  }

  async artisans() {
    return (await this.get<{ artisans: Artisan[] }>('/api/artisans')).artisans;
  }

  // ids: item ids, or « s<spell> » for the effect of a recipe that crafts no item (enchants)
  patterns(ids: (number | string)[]) {
    return this.get<{ patterns: Record<string, PatternSources>; missing: string[] }>(`/api/patterns?ids=${ids.join(',')}`);
  }

  npcs(ids: (number | string)[]) {
    return this.get<{ npcs: Record<string, NpcInfo>; missing: string[] }>(`/api/npcs?ids=${ids.join(',')}`);
  }

  items(ids: (number | string)[]) {
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

  // the order was handed over (received false: undo)
  received(id: string, received: boolean) {
    return this.post<{ order: Order }>(`/api/orders/${id}/received`, { received }).then((r) => r.order);
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

  // Only for FEEDBACK_ADMINS accounts: anyone else gets a 404
  async feedbackList() {
    return (await this.get<{ items: FeedbackItem[] }>('/api/feedback')).items;
  }

  async feedbackStatus(id: string, status: 'new' | 'done') {
    return (await this.post<{ item: FeedbackItem }>(`/api/feedback/${id}/status`, { status })).item;
  }

  feedbackDelete(id: string) {
    return this.post(`/api/feedback/${id}/delete`, {});
  }

  async feedbackChannels() {
    return (
      await this.get<{ channels: { id: string; name: string; parent: string | null }[] }>(
        '/api/feedback/channels',
      )
    ).channels;
  }

  // Admin page: SITE_ADMINS only (404 for anyone else)
  adminState() {
    return this.get<AdminState>('/api/admin/state');
  }

  async adminChannels() {
    return (await this.get<{ channels: AdminChannel[] }>('/api/admin/channels')).channels;
  }

  // channelId null: unlink
  adminLink(key: string, channelId: string | null) {
    return this.post<{ text: string; warning?: string | null }>('/api/admin/slot', { key, channelId });
  }

  async adminCode(renew = false) {
    return (await this.post<{ code: string }>('/api/admin/code', { renew })).code;
  }

  adminClosePrivates() {
    return this.post<{ privates: number; prompts: number }>('/api/admin/closepm', {});
  }

  adminResolve(id: string) {
    return this.post<{ done: boolean }>(`/api/admin/anomalies/${id}/resolve`, {});
  }

  adminClearAnomalies() {
    return this.post<{ cleared: number }>('/api/admin/anomalies/clear', {});
  }

  // Guild bank lines one by one: SITE_ADMINS only (404 for anyone else)
  async bankLines() {
    return (await this.get<{ lines: BankLine[] }>('/api/bank/lines')).lines;
  }

  async bankLineFlags(id: number, flags: { guild?: boolean; ignored?: boolean }) {
    return (await this.post<{ line: BankLine }>(`/api/bank/lines/${id}`, flags)).line;
  }

  async adminData(user: string | null = null) {
    const q = user ? `?user=${encodeURIComponent(user)}` : '';
    return (await this.get<{ datasets: AdminDataset[] }>(`/api/admin/data${q}`)).datasets;
  }

  adminRemove(key: string, ids: string[], cascade: boolean) {
    return this.post<{ removed: number }>('/api/admin/data/remove', { key, ids, cascade });
  }

  adminCleanOrphans() {
    return this.post<{ removed: number }>('/api/admin/orphans/clean', {});
  }

  // userId null: everyone
  adminReset(what: 'levels' | 'ranking', userId: string | null) {
    return this.post<{ text: string }>('/api/admin/reset', { what, userId });
  }

  // 🏦 Banque tab: goal and « Jamais donné » settings
  adminBank() {
    return this.get<AdminBank>('/api/admin/bank');
  }
  adminBankGoal(copper: number, name: string) {
    return this.post<AdminBank>('/api/admin/bank/goal', { copper, name });
  }
  adminBankNeverGave(days: number | null, excluded: string[]) {
    return this.post<AdminBank>('/api/admin/bank/nevergave', { days, excluded });
  }

  // 🕵️ Espionnage tab
  adminSpy() {
    return this.get<AdminSpy>('/api/admin/spy');
  }
  adminSpyAction(bot: string, action: 'start' | 'stop' | 'report' | 'post', channelId: string | null, kind?: string) {
    return this.post<{ result: unknown; spy: AdminSpy }>('/api/admin/spy/action', { bot, action, channelId, kind });
  }

  // 📜 Journal des actions (État tab), most recent first
  async adminLog() {
    return (await this.get<{ entries: AdminLogEntry[] }>('/api/admin/log')).entries;
  }

  // ⚙️ Réglages (and the shared block of 🕵️ Espionnage)
  adminSettings() {
    return this.get<AdminSettings>('/api/admin/settings');
  }
  adminSaveSettings(section: keyof AdminSettingsValues, values: Record<string, number | string>) {
    return this.post<AdminSettings>('/api/admin/settings', { section, values });
  }

  // 🚶 Suivi tab: a session is ignored (counted nowhere) or deleted, its time never changes
  adminFollow() {
    return this.get<AdminFollow>('/api/admin/follow');
  }
  adminFollowIgnore(id: string, ignored: boolean) {
    return this.post<AdminFollow>('/api/admin/follow/ignore', { id, ignored });
  }
  adminFollowRemove(id: string) {
    return this.post<AdminFollow>('/api/admin/follow/remove', { id });
  }

  // 🏆 Paliers tab
  adminTiers() {
    return this.get<AdminTiers>('/api/admin/tiers');
  }
  adminTierAction(action: 'create' | 'update' | 'delete', body: unknown) {
    return this.post<{ result: { holders?: number }; tiers: AdminTiers }>(`/api/admin/tiers/${action}`, body);
  }

  // 📇 Annuaire tab
  adminDirectory() {
    return this.get<AdminDirectory>('/api/admin/directory');
  }
  async adminDirectoryMembers(q: string) {
    return (await this.get<{ members: AdminMemberHit[] }>(`/api/admin/directory/members?q=${encodeURIComponent(q)}`)).members;
  }
  adminDirectoryAction(action: 'player' | 'remove' | 'link' | 'forget' | 'forget-many' | 'restore', body: unknown) {
    return this.post<{ result: unknown; directory: AdminDirectory }>(`/api/admin/directory/${action}`, body);
  }

  // 📤 the addon's file (slimmed in the browser): preview, or save with apply
  addonImport(text: string, apply: boolean) {
    return this.post<{ rows: AddonImportRow[]; saved?: number; waiting?: number }>('/api/me/addon-import', { text, apply });
  }
  adminAddonImport(userId: string, text: string, apply: boolean) {
    return this.post<{ rows?: AddonImportRow[]; result?: { rows: AddonImportRow[]; saved: number; waiting: number }; directory?: AdminDirectory }>(
      '/api/admin/directory/addon-import',
      { userId, text, apply },
    );
  }

  adminTools() {
    return this.get<AdminTools>('/api/admin/tools');
  }

  adminTool<T = { ok: boolean }>(name: 'filters' | 'board' | 'recipes' | 'wowhead' | 'test' | 'redraw' | 'purge', body: unknown = {}) {
    return this.post<T>(`/api/admin/tools/${name}`, body);
  }

  async adminReleases() {
    return (await this.get<{ entries: AdminReleaseEntry[] }>('/api/admin/releases')).entries;
  }

  adminPublishRelease(key: string) {
    return this.post<{ title: string; channel: string | null }>('/api/admin/releases/publish', { key });
  }

  adminSetMention(mention: string) {
    return this.post<{ mention: string }>('/api/admin/releases/mention', { mention });
  }

  adminVersions() {
    return this.get<AdminVersions>('/api/admin/versions');
  }

  // mode share: friendly reminder; roast: with a teasing line. Tags the chosen members.
  adminVersionsPing(channelId: string, userIds: string[], mode: 'share' | 'roast') {
    return this.post<{ url: string; tagged: number }>('/api/admin/versions/ping', { channelId, userIds, mode });
  }

  adminDeleteOrphan(id: string) {
    return this.post<{ removed: number }>(`/api/admin/orphans/${id}/delete`, {});
  }

  // Posts it on Discord with 👍 / 👎 buttons and a thread; returns the message link
  feedbackShare(id: string, channelId: string) {
    return this.post<{ url: string }>(`/api/feedback/${id}/share`, { channelId });
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

  home() {
    return this.get<HomeData>('/api/home');
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

  // image: the card captured on screen (PNG data URL), or null for the bot's own drawing
  share(card: string, channelId: string, text: string, image: string | null = null) {
    return this.post<{ url: string }>('/api/share', { card, channelId, text, image });
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
