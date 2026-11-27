import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ApiService, errorText } from '../core/api.service';
import { AddonImportRow } from '../core/models';
import { classColor } from './ui';

// Only what the bot needs from the addon's SavedVariables file: the professions table and the
// professions readings of the outbox ("2|P|…", for each character's class and level). The rest of the
// file (the companion's connection code, deaths, bank…) never leaves the player's computer.
export function slimAddonFile(text: string): string | null {
  const start = text.indexOf('["professions"] = {');
  if (start < 0 || !/WallOfShameForeverDB\s*=/.test(text)) return null;
  const open = text.indexOf('{', start);
  let depth = 0;
  let inString = false;
  let i = open;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '-' && text[i + 1] === '-') {
      // comment (« -- [1] ») up to the end of the line
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
    }
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  if (depth !== 0) return null;
  // readings kept down to id, name, realm, guild, level, class and time: no battletag, no recipes (in the table)
  const payloads = (text.match(/"2\|P\|(?:[^"\\\n]|\\.)*"/g) ?? []).map((p) => `"${p.slice(1, -1).split('|').slice(0, 9).join('|')}||"`);
  return `WallOfShameForeverDB = {\n["professions"] = ${text.slice(open, i + 1)},\n["outbox"] = {\n${payloads.join(',\n')}\n},\n}\n`;
}

const STATUS: Record<AddonImportRow['status'], { icon: string; text: string }> = {
  mine: { icon: '✅', text: 'à toi : ajouté au Grimoire à l’enregistrement' },
  link: { icon: '🔗', text: 'sera relié à ce joueur et ajouté au Grimoire' },
  pending: { icon: '⏳', text: 'pas encore relié à toi : un admin devra le valider dans l’Annuaire' },
  other: { icon: '⛔', text: 'relié à un autre joueur : ignoré' },
  trashed: { icon: '🪦', text: 'à la corbeille : ignoré' },
};

// 📤 Import of the addon's file, for a player without the companion: choose the file, see what the bot
// reads in it (characters, professions, number of recipes, what will happen), then save. forUser: an admin
// imports for this player (📇 Annuaire); empty: the player imports his own file.
@Component({
  selector: 'app-addon-import',
  styles: `
    .ai-drop {
      display: block;
      border: 2px dashed rgba(248, 215, 124, 0.45);
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
      cursor: pointer;
      &.over {
        background: rgba(248, 215, 124, 0.08);
      }
      input {
        display: none;
      }
    }
    .ai-path {
      font-family: monospace;
      font-size: 0.85rem;
      overflow-wrap: anywhere;
      background: rgba(0, 0, 0, 0.35);
      padding: 0.3rem 0.5rem;
      border-radius: 4px;
    }
    .ai-rows {
      list-style: none;
      padding: 0;
      margin: 0.6rem 0;
      > li {
        padding: 0.45rem 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      }
    }
    .ai-off {
      opacity: 0.55;
    }
  `,
  template: `
    <label
      class="ai-drop"
      [class.over]="over()"
      (dragover)="$event.preventDefault(); over.set(true)"
      (dragleave)="over.set(false)"
      (drop)="drop($event)"
    >
      <input type="file" accept=".lua" (change)="pick($event)" />
      📂 <b>{{ fileName() ?? 'Choisis le fichier WallOfShameForever.lua' }}</b>
      <br />
      <span class="muted small">ou glisse-le ici</span>
    </label>

    @if (busy()) {
      <p class="muted small">Lecture du fichier…</p>
    }
    @if (error(); as e) {
      <p class="refused">❌ {{ e }}</p>
    }

    @if (rows(); as list) {
      <ul class="ai-rows">
        @for (r of list; track r.key) {
          <li [class.ai-off]="r.status === 'other' || r.status === 'trashed'">
            <b [style.color]="classColor(r.class)">{{ r.name }}</b>
            @if (r.level) {
              <span class="muted small"> niv. {{ r.level }}</span>
            }
            <div class="small">
              @for (p of r.professions; track p.name; let last = $last) {
                {{ p.name }} {{ p.level ?? '?' }}/{{ p.max ?? '?' }}
                @if (p.recipes !== null) {
                  ({{ p.recipes }} recette(s))
                }
                @if (!last) {
                  ·
                }
              }
            </div>
            <div class="small">{{ status(r).icon }} {{ status(r).text }}</div>
          </li>
        }
      </ul>
      @if (done(); as d) {
        <p class="ok">
          ✅ {{ d.saved }} perso(s) ajouté(s) au Grimoire
          @if (d.waiting) {
            · ⏳ {{ d.waiting }} en attente d’un admin
          }
        </p>
      } @else if (useful()) {
        <button type="button" class="btn gold" [disabled]="busy()" (click)="save()">📤 Enregistrer</button>
      } @else {
        <p class="muted small">Rien à enregistrer dans ce fichier.</p>
      }
    }
  `,
})
export class AddonImportComponent {
  private api = inject(ApiService);
  protected readonly classColor = classColor;

  readonly forUser = input<string | null>(null);
  readonly saved = output<void>();

  readonly over = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly fileName = signal<string | null>(null);
  readonly rows = signal<AddonImportRow[] | null>(null);
  readonly done = signal<{ saved: number; waiting: number } | null>(null);
  private text = '';

  readonly useful = computed(() => (this.rows() ?? []).some((r) => r.status === 'mine' || r.status === 'link' || r.status === 'pending'));

  status(r: AddonImportRow) {
    return STATUS[r.status];
  }

  pick(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void this.read(file);
  }

  drop(event: DragEvent) {
    event.preventDefault();
    this.over.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.read(file);
  }

  private async read(file: File) {
    this.fileName.set(file.name);
    this.rows.set(null);
    this.done.set(null);
    this.error.set(null);
    if (file.size > 20 * 1024 * 1024) return this.error.set('Fichier trop gros : ce n’est pas celui de l’addon.');
    const slim = slimAddonFile(await file.text());
    if (!slim) {
      return this.error.set(
        'Pas de métiers dans ce fichier. Vérifie que c’est bien WallOfShameForever.lua du dossier SavedVariables, ' +
          'et qu’en jeu tu as ouvert chaque fenêtre de métier une fois puis fait /reload.',
      );
    }
    this.text = slim;
    await this.call(false);
  }

  save() {
    return this.call(true);
  }

  private async call(apply: boolean) {
    this.busy.set(true);
    this.error.set(null);
    try {
      const forUser = this.forUser();
      if (forUser) {
        const r = await this.api.adminAddonImport(forUser, this.text, apply);
        if (apply) this.finish(r.result!);
        else this.rows.set(r.rows!);
      } else {
        const r = await this.api.addonImport(this.text, apply);
        this.rows.set(r.rows);
        if (apply) this.finish(r as { saved: number; waiting: number; rows: AddonImportRow[] });
      }
    } catch (err) {
      this.error.set(errorText(err));
    } finally {
      this.busy.set(false);
    }
  }

  private finish(r: { saved: number; waiting: number; rows: AddonImportRow[] }) {
    this.rows.set(r.rows);
    this.done.set({ saved: r.saved, waiting: r.waiting });
    this.saved.emit();
  }
}
