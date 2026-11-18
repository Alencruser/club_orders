import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorText } from '../core/api.service';
import { ToastService } from '../core/toast.service';

// Small window to send a suggestion or a bug report; the current page goes with it.
@Component({
  selector: 'app-feedback-dialog',
  imports: [FormsModule],
  template: `
    <div class="overlay" (click)="closed.emit()">
      <form class="tooltip dialog" (click)="$event.stopPropagation()" (ngSubmit)="send()">
        <h2>Une idée ? Un souci ?</h2>
        <p class="muted small">Ton message arrive directement à l’équipe du site.</p>
        <div class="tabs">
          <button
            type="button"
            [class.active]="type() === 'suggestion'"
            (click)="type.set('suggestion')"
          >
            💡 Suggestion
          </button>
          <button type="button" [class.active]="type() === 'bug'" (click)="type.set('bug')">
            🐞 Bug
          </button>
        </div>
        <textarea
          name="text"
          rows="6"
          maxlength="1500"
          [placeholder]="
            type() === 'bug'
              ? 'Ce qui ne marche pas, et ce que tu faisais à ce moment-là'
              : 'Ce que tu aimerais voir sur le site'
          "
          [(ngModel)]="text"
          autofocus
        ></textarea>
        <div class="dialog-actions">
          <button type="button" class="btn ghost" (click)="closed.emit()">Annuler</button>
          <button class="btn gold" [disabled]="sending() || text.trim().length < 5">
            {{ sending() ? 'Envoi…' : 'Envoyer' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class FeedbackDialogComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly closed = output<void>();

  readonly type = signal<'suggestion' | 'bug'>('suggestion');
  readonly sending = signal(false);
  text = '';

  async send() {
    this.sending.set(true);
    try {
      await this.api.sendFeedback(this.type(), this.text, location.pathname + location.search);
      this.toast.ok(
        this.type() === 'bug' ? '🐞 Bug signalé, merci !' : '💡 Suggestion envoyée, merci !',
      );
      this.closed.emit();
    } catch (err) {
      this.toast.error(`❌ ${errorText(err)}`);
    } finally {
      this.sending.set(false);
    }
  }
}
