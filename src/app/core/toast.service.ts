import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error' | 'warn';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private next = 1;

  ok(text: string) {
    this.push(text, 'ok');
  }

  error(text: string) {
    this.push(text, 'error');
  }

  // A reminder (out-of-date addon…): the same text is never shown twice at once
  warn(text: string) {
    if (this.toasts().some((t) => t.text === text)) return;
    this.push(text, 'warn');
  }

  dismiss(id: number) {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(text: string, kind: Toast['kind']) {
    const id = this.next++;
    this.toasts.update((list) => [...list.slice(-3), { id, text, kind }]);
    setTimeout(() => this.dismiss(id), kind === 'ok' ? 4000 : kind === 'warn' ? 9000 : 7000);
  }
}
