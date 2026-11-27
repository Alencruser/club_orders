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
            Le fichier est dans le dossier <b>SavedVariables</b> de ton compte. Sur Windows, avec l’installation
            par défaut, son chemin complet est :
            <div class="ai-path small">
              C:\\Program Files (x86)\\World of Warcraft\\_forever_\\WTF\\Account\\<b>TON_COMPTE</b>\\SavedVariables\\WallOfShameForever.lua
            </div>
          </li>
          <li>Choisis ce fichier ici, vérifie ce que le site a trouvé, puis <b>Enregistrer</b>.</li>
        </ol>

        <details class="small ai-help">
          <summary>❓ Je ne trouve pas le fichier</summary>
          <ul>
            <li>
              <b>TON_COMPTE</b> est un dossier au nom en chiffres, par exemple <code>123456789#1</code> (ce n’est pas ton
              pseudo ni ton battletag). Si tu en vois plusieurs, prends celui qui contient un dossier SavedVariables
              avec WallOfShameForever.lua.
            </li>
            <li>
              Jeu installé ailleurs (autre disque, autre dossier) : dans l’application <b>Battle.net</b>, choisis WoW,
              clique sur la roue ⚙️ à côté de « Jouer », puis <b>Afficher dans l’explorateur</b>. Tu arrives dans le dossier
              World of Warcraft : ouvre ensuite <code>_forever_\\WTF\\Account\\TON_COMPTE\\SavedVariables</code>.
            </li>
            <li>
              Pour aller plus vite : colle
              <code>C:\Program Files (x86)\World of Warcraft\_forever_\WTF\Account</code> dans la barre d’adresse de
              l’explorateur Windows, Entrée, puis ouvre ton dossier de compte et SavedVariables.
            </li>
            <li>
              Sur <b>Mac</b> :
              <code>/Applications/World of Warcraft/_forever_/WTF/Account/TON_COMPTE/SavedVariables/WallOfShameForever.lua</code>
            </li>
            <li>
              Pas de fichier WallOfShameForever.lua ? L’addon n’a encore rien écrit : connecte-toi en jeu avec l’addon
              activé, ouvre tes fenêtres de métier, puis <b>/reload</b>.
            </li>
            <li>
              Attention à prendre celui de <b>SavedVariables</b>, pas celui du dossier de l’addon (Interface\\AddOns) : le
              site te le dira si ce n’est pas le bon.
            </li>
          </ul>
        </details>
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
    .ai-help {
      margin: 0.6rem 0;
      summary {
        cursor: pointer;
        font-weight: bold;
      }
      li {
        margin: 0.35rem 0;
      }
      code {
        overflow-wrap: anywhere;
      }
    }
  `,
})
export class ImportPage {}
