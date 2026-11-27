import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AddonImportComponent } from '../shared/addon-import';

// 📤 Importer mon addon: a player who doesn't want the companion sends his addon's file by hand, and his
// characters' professions and recipes enter the Grimoire (orders can be placed with him). Loaded on demand.
@Component({
  selector: 'app-import',
  imports: [AddonImportComponent, RouterLink],
  template: `
    <div class="page-head">
      <h1>📤 Importer mon addon</h1>
    </div>
    <div class="two-cols">
      <section class="tooltip">
        <h2>Ton fichier</h2>
        <app-addon-import />
      </section>
      <aside class="tooltip">
        <h2>Comment faire</h2>
        <ol class="small">
          <li>En jeu, ouvre <b>une fois chaque fenêtre de métier</b> (l’addon lit tes recettes à ce moment-là).</li>
          <li>Tape <b>/reload</b> (ou déconnecte-toi) : le jeu écrit le fichier.</li>
          <li>
            Ouvre ce dossier sur ton PC :
            <div class="ai-path small">World of Warcraft\\_forever_\\WTF\\Account\\TON_COMPTE\\SavedVariables\\</div>
          </li>
          <li>Choisis le fichier <b>WallOfShameForever.lua</b> ici, vérifie, puis <b>Enregistrer</b>.</li>
        </ol>
        <p class="small">
          🔒 Seuls tes métiers et tes recettes sont envoyés. Le reste du fichier ne quitte pas ton PC.
        </p>
        <p class="small">
          🔁 Tu apprends de nouvelles recettes ? Refais l’import : le Grimoire n’est à jour qu’à ce moment-là. Avec
          le compagnon, c’est automatique.
        </p>
        <p class="small">
          Un perso pas encore relié à ton compte attend qu’un admin le valide dans l’Annuaire. Tes commandes, tu les
          vois dans <a routerLink="/atelier">Mon atelier</a>, même sans compagnon.
        </p>
      </aside>
    </div>
  `,
  styles: `
    .ai-path {
      font-family: monospace;
      overflow-wrap: anywhere;
      background: rgba(0, 0, 0, 0.35);
      padding: 0.3rem 0.5rem;
      border-radius: 4px;
      margin-top: 0.2rem;
    }
    ol li {
      margin-bottom: 0.4rem;
    }
  `,
})
export class ImportPage {}
