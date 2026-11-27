import { Component, DestroyRef, ViewContainerRef, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, errorText } from '../core/api.service';
import {
  ArmoryDetail,
  ArmoryGear,
  ArmoryItem,
  ArmoryList,
  ArmoryRow,
  ArmoryTalent,
  TextPiece,
} from '../core/models';
import { CLASS_NAMES, classColor } from '../shared/ui';
import { liveRefresh } from '../shared/guild-ui';

// Armurerie: every character of the guild, highest level first; a click opens a large window with the
// character sheet (gear around, stats of the game by class) and the talents. Data sent by the addon
// (Armory.lua) through the companion; members of the Discord server only (the bot checks the session).

type Line = { left: TextPiece[]; right: TextPiece[] };
type Block = { title: string; rows: [string, string, string?][] }; // label, value, green bonus

const SLOT_NAMES: Record<number, string> = {
  1: 'Tête',
  2: 'Cou',
  3: 'Épaules',
  4: 'Chemise',
  5: 'Torse',
  6: 'Taille',
  7: 'Jambes',
  8: 'Pieds',
  9: 'Poignets',
  10: 'Mains',
  11: 'Doigt',
  12: 'Doigt',
  13: 'Bijou',
  14: 'Bijou',
  15: 'Dos',
  16: 'Main droite',
  17: 'Main gauche',
  18: 'À distance',
  19: 'Tabard',
};
const LEFT = [1, 2, 3, 15, 5, 4, 19, 9];
const RIGHT = [10, 6, 7, 8, 11, 12, 13, 14];
const WEAPONS = [16, 17, 18];
const CLASS_ICONS: Record<string, string> = {
  WARRIOR: 'classicon_warrior',
  PALADIN: 'classicon_paladin',
  HUNTER: 'classicon_hunter',
  ROGUE: 'classicon_rogue',
  PRIEST: 'classicon_priest',
  SHAMAN: 'classicon_shaman',
  MAGE: 'classicon_mage',
  WARLOCK: 'classicon_warlock',
  DRUID: 'classicon_druid',
};
// Stat blocks shown first, by class (hybrids get two); the others behind « Tout afficher »
type BlockKey = 'melee' | 'ranged' | 'spell' | 'heal' | 'defense';
const FIRST: Record<string, BlockKey[]> = {
  WARRIOR: ['melee', 'defense'],
  ROGUE: ['melee', 'defense'],
  HUNTER: ['ranged', 'melee'],
  MAGE: ['spell', 'defense'],
  WARLOCK: ['spell', 'defense'],
  PRIEST: ['heal', 'defense'],
  PALADIN: ['melee', 'heal'],
  DRUID: ['melee', 'heal'],
  SHAMAN: ['spell', 'melee'],
};
const ALL: BlockKey[] = ['melee', 'ranged', 'spell', 'defense'];
const POWER: Record<number, string> = { 0: 'Mana', 1: 'Rage', 3: 'Énergie' };
const BANDS = [
  { key: '', label: 'Tous', lo: 0, hi: 999 },
  { key: '50', label: '50 et plus', lo: 50, hi: 999 },
  { key: '40', label: '40 à 49', lo: 40, hi: 49 },
  { key: '20', label: '20 à 39', lo: 20, hi: 39 },
  { key: '1', label: '1 à 19', lo: 1, hi: 19 },
];

const nf = (v: number | undefined, digits = 0) =>
  v === undefined
    ? ''
    : v
        .toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
        .replace(/\u202f/g, '\u00a0'); // narrow space: missing from the site's font
const pct = (v: number | undefined) => (v === undefined ? '' : `${nf(v, 2)} %`);
const icon = (name: string | null | undefined, size: 'large' | 'medium' = 'large') =>
  `https://wow.zamimg.com/images/wow/icons/${size}/${name || 'inv_misc_questionmark'}.jpg`;

function ago(at: number | null) {
  if (!at) return '';
  const s = Math.max(0, Date.now() / 1000 - at);
  if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'hier' : d < 14 ? `il y a ${d} j` : `il y a ${Math.round(d / 7)} sem.`;
}

@Component({
  selector: 'app-armory',
  imports: [FormsModule, NgTemplateOutlet],
  styles: `
    .arm-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.8rem;
      align-items: end;
      margin-bottom: 1rem;
    }
    .arm-filters label {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.8rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--gold);
      min-width: 0;
    }
    .arm-filters input {
      width: 220px;
      max-width: 100%;
    }
    .arm-cards {
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      margin-top: 1rem;
    }
    .arm-card {
      gap: 0.6rem;
    }
    .arm-card.known {
      cursor: pointer;
    }
    .arm-card.known:focus-visible {
      outline: 3px solid #f7d38a;
      outline-offset: 2px;
    }
    .arm-card.unknown {
      opacity: 0.55;
    }
    .arm-crest {
      width: 44px;
      height: 44px;
      border: 2px solid #1a0b06;
      border-radius: 8px;
      box-shadow: 0 0 0 2px rgba(240, 196, 110, 0.5);
    }
    .arm-card h3 {
      font-family: 'Sansita', Georgia, serif !important;
      font-size: 1.25rem !important;
      text-shadow: 1px 1px 0 #1a0b06;
    }
    .arm-level {
      display: flex;
      flex-direction: column;
      align-items: center;
      line-height: 1;
      font-family: 'Sansita', Georgia, serif;
      font-weight: 800;
      font-size: 1.7rem;
      color: #f7d38a;
      -webkit-text-stroke: 4px #1a0b06;
      paint-order: stroke fill;
    }
    .arm-level small {
      font-size: 0.7rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--gold);
      -webkit-text-stroke: 0;
      font-family: 'Alegreya Sans', system-ui, sans-serif;
    }
    .arm-facts {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 2px 12px;
      margin: 0;
      font-size: 0.92rem;
    }
    .arm-facts dt {
      color: var(--gold);
      font-size: 0.78rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      align-self: center;
    }
    .arm-facts dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .arm-seen {
      margin: 0;
      color: #d8b98a;
    }
    .who {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .who img {
      width: 30px;
      height: 30px;
      border: 2px solid #1a0b06;
      border-radius: 6px;
    }
    .who b {
      font-family: 'Sansita', Georgia, serif;
      font-size: 1.08rem;
      text-shadow: 1px 1px 0 #1a0b06;
    }
    .lvl {
      font-family: 'Sansita', Georgia, serif;
      font-weight: 800;
      font-size: 1.15rem;
      color: #f7d38a;
    }
    .soft {
      color: #d8b98a;
    }
    .me {
      font-size: 0.7rem;
      background: var(--gold);
      color: #1a0b06;
      border-radius: 999px;
      padding: 1px 7px;
      margin-left: 6px;
      font-weight: 700;
    }

    .arm-modal {
      width: min(1120px, 100%);
      max-height: calc(100vh - 2rem);
      overflow: auto;
    }
    .arm-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.6rem 1.1rem;
    }
    .arm-head h2 {
      margin-bottom: 0 !important;
    }
    .arm-meta {
      color: var(--gold);
      font-family: 'Sansita', Georgia, serif;
      font-style: italic;
      font-weight: 700;
      text-shadow: 2px 2px 0 #1a0b06;
    }
    .arm-close {
      margin-left: auto;
    }
    .arm-tabs {
      margin: 1rem 0 1.2rem;
    }
    .sheet {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(250px, 300px) minmax(0, 1fr);
      gap: 22px;
      align-items: start;
    }
    .col {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    .col.right .slot {
      flex-direction: row-reverse;
      text-align: right;
    }
    .slot {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      background: rgba(26, 11, 6, 0.5);
      border: 2px solid rgba(240, 196, 110, 0.15);
      border-radius: 12px;
      padding: 5px 8px;
    }
    .slot.filled {
      cursor: pointer;
    }
    .slot.filled:hover,
    .slot.filled:focus-visible {
      border-color: rgba(240, 196, 110, 0.55);
      outline: none;
    }
    .slot .ic {
      flex: none;
      width: 46px;
      height: 46px;
      border-radius: 8px;
      border: 2px solid #555;
      box-shadow: 0 0 0 2px #1a0b06;
      background: #120806 center / cover;
    }
    .slot .txt {
      min-width: 0;
    }
    .slot .nm {
      font-weight: 700;
      line-height: 1.15;
      overflow-wrap: anywhere;
      text-shadow: 1px 1px 0 #1a0b06;
    }
    .slot .il {
      font-size: 0.8rem;
      color: #d8b98a;
    }
    .slot .en {
      font-size: 0.78rem;
      color: #1eff00;
    }
    .slot.empty .ic {
      border: 2px dashed rgba(240, 196, 110, 0.35);
      box-shadow: none;
      background: rgba(0, 0, 0, 0.25);
    }
    .slot.empty .nm {
      color: rgba(246, 222, 176, 0.5);
      font-weight: 500;
      font-style: italic;
    }
    .qb0 {
      border-color: #9d9d9d !important;
    }
    .qb1 {
      border-color: #fff !important;
    }
    .qb2 {
      border-color: #1eff00 !important;
    }
    .qb3 {
      border-color: #3d9bff !important;
    }
    .qb4 {
      border-color: #b964ff !important;
    }
    .qb5 {
      border-color: #ff8000 !important;
    }
    .center {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 0;
    }
    .crest {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 18px 12px;
      border-radius: 18px;
      background: radial-gradient(
        circle at 50% 38%,
        rgba(240, 196, 110, 0.22),
        rgba(26, 11, 6, 0.6) 65%
      );
      border: 2px solid rgba(240, 196, 110, 0.3);
    }
    .crest img {
      width: 92px;
      height: 92px;
      border-radius: 50%;
      border: 4px solid #1a0b06;
      box-shadow:
        0 0 0 3px var(--gold),
        0 0 26px rgba(240, 160, 64, 0.5);
    }
    .crest .big {
      font-family: 'Sansita', Georgia, serif;
      font-weight: 800;
      font-size: 2.1rem;
      line-height: 1;
      color: #f7d38a;
      -webkit-text-stroke: 5px #1a0b06;
      paint-order: stroke fill;
    }
    .crest .cap {
      font-size: 0.75rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--gold);
    }
    .stats {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .stats section {
      background: rgba(26, 11, 6, 0.55);
      border: 2px solid rgba(240, 196, 110, 0.2);
      border-radius: 12px;
      padding: 8px 12px;
    }
    .stats h3 {
      margin: 0 0 4px;
      font-family: Metamorphous, Georgia, serif;
      font-size: 0.95rem;
      font-weight: 400;
      color: var(--gold);
    }
    .stats section,
    .stats dt {
      text-align: left;
    }
    .stats dl {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 1px 10px;
      margin: 0;
      font-size: 0.92rem;
    }
    .stats dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      color: #f7d38a;
      text-align: right;
    }
    .stats dd i {
      color: #1eff00;
      font-style: normal;
      font-weight: 500;
      margin-left: 4px;
    }
    .more {
      align-self: center;
      font-weight: 700;
      font-size: 0.9rem;
      color: var(--gold);
      background: none;
      border: 2px dashed rgba(240, 196, 110, 0.45);
      border-radius: 999px;
      padding: 4px 14px;
      cursor: pointer;
    }
    .more:hover,
    .more:focus-visible {
      border-style: solid;
      color: #f7d38a;
      outline: none;
    }
    .weapons {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .updated {
      grid-column: 1 / -1;
      color: #d8b98a;
      font-size: 0.85rem;
      text-align: center;
    }
    .trees {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }
    .tree {
      background: rgba(26, 11, 6, 0.55);
      border: 2px solid rgba(240, 196, 110, 0.22);
      border-radius: 16px;
      padding: 12px 12px 16px;
      min-width: 0;
    }
    .tree header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .tree h3 {
      margin: 0;
      font-family: Metamorphous, Georgia, serif;
      font-size: 1.05rem;
      font-weight: 400;
      color: var(--gold);
    }
    .tree .pts {
      margin-left: auto;
      font-family: 'Sansita', Georgia, serif;
      font-weight: 800;
      font-size: 1.2rem;
      color: #f7d38a;
      -webkit-text-stroke: 4px #1a0b06;
      paint-order: stroke fill;
    }
    .grid {
      position: relative;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px 8px;
      justify-items: center;
    }
    .link {
      position: absolute;
      background: #6b6b6b;
      box-shadow: 0 0 0 1px #1a0b06;
      pointer-events: none;
    }
    .link.on {
      background: var(--gold);
    }
    .link.down::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: -6px;
      transform: translateX(-50%);
      border: 5px solid transparent;
      border-top-color: #6b6b6b;
      border-bottom: 0;
    }
    .link.down.on::after {
      border-top-color: var(--gold);
    }
    .talent {
      position: relative;
      z-index: 1;
      width: 44px;
      height: 44px;
      border-radius: 8px;
      border: 2px solid #6b6b6b;
      box-shadow: 0 0 0 2px #1a0b06;
      background: #111 center / cover;
    }
    .talent.none {
      filter: grayscale(1) brightness(0.55);
    }
    .talent.some {
      border-color: #1eff00;
    }
    .talent.max {
      border-color: var(--gold);
    }
    .talent:focus-visible {
      outline: 3px solid #f7d38a;
      outline-offset: 2px;
    }
    .talent .rk {
      position: absolute;
      right: -8px;
      bottom: -8px;
      font-size: 0.72rem;
      line-height: 1;
      font-weight: 700;
      background: #1a0b06;
      color: #1eff00;
      border: 1px solid #555;
      border-radius: 6px;
      padding: 2px 4px;
      font-variant-numeric: tabular-nums;
    }
    .talent.max .rk {
      color: #f7d38a;
    }
    .talent.none .rk {
      color: #bbb;
    }
    .spacer {
      width: 44px;
      height: 44px;
    }
    .total {
      margin-top: 16px;
      text-align: center;
      font-family: 'Sansita', Georgia, serif;
      font-weight: 800;
      font-size: 1.1rem;
      color: #f7d38a;
      text-shadow: 2px 2px 0 #1a0b06;
    }
    .wtip {
      position: fixed;
      z-index: 60;
      max-width: 330px;
      background: #0b0d1c;
      border: 1px solid #c9b37e;
      border-radius: 6px;
      box-shadow:
        0 0 0 1px #000,
        0 8px 22px rgba(0, 0, 0, 0.7);
      padding: 8px 10px;
      font-size: 13px;
      line-height: 1.35;
      color: #fff;
      pointer-events: none;
    }
    .wtip .tt-line {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
    }
    .wtip .crafted {
      margin-top: 6px;
      color: #ffd100;
      font-style: italic;
    }
    .wtip .hint {
      margin-top: 6px;
      color: #9d9d9d;
      font-size: 12px;
    }
    .wtip .rank {
      color: #ffd100;
    }
    @media (max-width: 900px) {
      .sheet {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
      .center {
        grid-column: 1 / -1;
        order: -1;
      }
      .trees {
        grid-template-columns: minmax(0, 1fr);
      }
      .grid {
        max-width: 260px;
        margin: 0 auto;
      }
    }
    @media (max-width: 560px) {
      .sheet {
        grid-template-columns: minmax(0, 1fr);
      }
      .col.right .slot {
        flex-direction: row;
        text-align: left;
      }
      .weapons {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  template: `
    <div class="page-head">
      <div>
        <h1 class="page-banner"><img src="/titles/armurerie.webp" alt="Armurerie" /></h1>
        <p class="muted small">
          Tous les persos de la guilde, du plus haut niveau au plus bas. Clique sur un perso pour
          ouvrir sa fiche.
        </p>
      </div>
    </div>

    @if (error(); as e) {
      <p class="refused">{{ e }}</p>
    }
    @if (list(); as l) {
      <section class="tooltip">
        <div class="arm-filters">
          <label
            >Nom<input
              id="arm-q"
              type="search"
              placeholder="Chercher un perso"
              [ngModel]="q()"
              (ngModelChange)="q.set($event)"
          /></label>
          <label
            >Classe
            <select id="arm-class" [ngModel]="cls()" (ngModelChange)="cls.set($event)">
              <option value="">Toutes</option>
              @for (c of classes; track c[0]) {
                <option [value]="c[0]">{{ c[1] }}</option>
              }
            </select>
          </label>
          <label
            >Niveau
            <select id="arm-band" [ngModel]="band()" (ngModelChange)="band.set($event)">
              @for (b of bands; track b.key) {
                <option [value]="b.key">{{ b.label }}</option>
              }
            </select>
          </label>
          <button
            type="button"
            class="btn"
            [class.active]="mine()"
            [attr.aria-pressed]="mine()"
            (click)="mine.set(!mine())"
          >
            Mes persos
          </button>
        </div>
        <p class="muted small">{{ shown().length }} perso{{ shown().length > 1 ? 's' : '' }}</p>
      </section>

      <div class="cards arm-cards">
        @for (c of shown(); track c.key) {
          <article
            class="tooltip card arm-card"
            [class.known]="c.updatedAt"
            [class.unknown]="!c.updatedAt"
            [attr.tabindex]="c.updatedAt ? 0 : null"
            [attr.role]="c.updatedAt ? 'button' : null"
            (click)="c.updatedAt && open(c.key)"
            (keydown.enter)="c.updatedAt && open(c.key)"
          >
            <div class="card-head">
              <img class="arm-crest" [src]="classIcon(c.class)" alt="" />
              <div class="card-title">
                <h3 [style.color]="color(c.class)">{{ c.name }}</h3>
                <p class="soft small">{{ c.race ? c.race + ' · ' : '' }}{{ className(c.class) }}</p>
              </div>
              <span class="arm-level" title="Niveau"><small>niv.</small>{{ c.level ?? '?' }}</span>
            </div>
            <dl class="arm-facts">
              <dt>Spé</dt>
              <dd>
                @if (c.spec; as s) {
                  {{ s.name }} <span class="soft">({{ s.split }})</span>
                } @else {
                  —
                }
              </dd>
              <dt>iLvl moyen</dt>
              <dd>{{ c.ilvl !== null ? fmt(c.ilvl, 1) : '—' }}</dd>
              <dt>Membre</dt>
              <dd>
                {{ c.member ?? '—' }}
                @if (c.userId && c.userId === l.me) {
                  <span class="me">moi</span>
                }
              </dd>
            </dl>
            <p class="arm-seen small">
              {{ c.updatedAt ? 'Équipement vu ' + ago(c.updatedAt) : 'Équipement inconnu (addon pas encore lancé)' }}
            </p>
          </article>
        } @empty {
          <p class="muted">Aucun perso ne correspond.</p>
        }
      </div>
    } @else if (!error()) {
      <p class="center muted">Chargement…</p>
    }

    @if (openKey()) {
      <div class="overlay" (click)="close()">
        <section
          class="tooltip dialog arm-modal"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="arm-name"
        >
          <div class="arm-head">
            <h2 id="arm-name">{{ detail()?.name ?? rowOf(openKey())?.name }}</h2>
            @if (detail(); as d) {
              <span class="arm-meta"
                >Niveau {{ d.level }} · {{ className(d.class) }}{{ d.race ? ' ' + d.race : ''
                }}{{ d.spec ? ' · ' + d.spec.name + ' (' + d.spec.split + ')' : ''
                }}{{ d.member ? ' · ' + d.member : '' }}</span
              >
            }
            <button type="button" class="btn ghost arm-close" (click)="close()" aria-label="Fermer">
              ✕
            </button>
          </div>
          <div class="tabs arm-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              [class.active]="tab() === 'sheet'"
              [attr.aria-selected]="tab() === 'sheet'"
              (click)="setTab('sheet')"
            >
              Personnage
            </button>
            <button
              type="button"
              role="tab"
              [class.active]="tab() === 'talents'"
              [attr.aria-selected]="tab() === 'talents'"
              (click)="setTab('talents')"
            >
              Talents
            </button>
          </div>

          @if (detailError(); as e) {
            <p class="refused">{{ e }}</p>
          } @else if (detail(); as d) {
            @if (tab() === 'sheet') {
              <div class="sheet">
                <div class="col left">
                  @for (s of left; track s) {
                    <ng-container *ngTemplateOutlet="slotTpl; context: { $implicit: s }" />
                  }
                </div>
                <div class="center">
                  <div class="crest">
                    <img [src]="classIcon(d.class)" alt="" />
                    <span class="big">{{ d.ilvl !== null ? fmt(d.ilvl, 1) : '—' }}</span>
                    <span class="cap">niveau d’objet moyen</span>
                  </div>
                  <div class="stats">
                    @for (b of firstBlocks(); track b.title) {
                      <section>
                        <h3>{{ b.title }}</h3>
                        <dl>
                          @for (r of b.rows; track r[0]) {
                            <dt>{{ r[0] }}</dt>
                            <dd>
                              {{ r[1] }}
                              @if (r[2]) {
                                <i>({{ r[2] }})</i>
                              }
                            </dd>
                          }
                        </dl>
                      </section>
                    }
                    @if (otherBlocks().length) {
                      <button
                        type="button"
                        class="more"
                        [attr.aria-expanded]="showAll()"
                        (click)="showAll.set(!showAll())"
                      >
                        {{ showAll() ? 'Masquer' : 'Tout afficher (' + otherTitles() + ')' }}
                      </button>
                      @if (showAll()) {
                        @for (b of otherBlocks(); track b.title) {
                          <section>
                            <h3>{{ b.title }}</h3>
                            <dl>
                              @for (r of b.rows; track r[0]) {
                                <dt>{{ r[0] }}</dt>
                                <dd>{{ r[1] }}</dd>
                              }
                            </dl>
                          </section>
                        }
                      }
                    }
                  </div>
                </div>
                <div class="col right">
                  @for (s of right; track s) {
                    <ng-container *ngTemplateOutlet="slotTpl; context: { $implicit: s }" />
                  }
                </div>
                <div class="weapons">
                  @for (s of weapons; track s) {
                    <ng-container *ngTemplateOutlet="slotTpl; context: { $implicit: s }" />
                  }
                </div>
                <p class="updated">
                  Équipement envoyé par l’addon {{ ago(d.updatedAt) }}. Caractéristiques telles que
                  le jeu les affiche (buffs compris), bonus des objets en vert.
                </p>
              </div>
            } @else {
              <div class="trees">
                @for (tree of d.talents; track $index) {
                  <div class="tree">
                    <header>
                      <h3>{{ tree.name }}</h3>
                      <span class="pts">{{ tree.points }}</span>
                    </header>
                    <div class="grid">
                      @for (l of links(tree); track $index) {
                        <span
                          class="link"
                          [class.on]="l.on"
                          [class.down]="l.down"
                          [style.left]="l.left"
                          [style.top]="l.top"
                          [style.width]="l.width"
                          [style.height]="l.height"
                        ></span>
                      }
                      @for (cell of grid(tree.talents); track $index) {
                        @if (cell; as t) {
                          <div
                            class="talent"
                            [class.none]="!t.rank"
                            [class.some]="t.rank && t.rank < t.max"
                            [class.max]="t.rank && t.rank === t.max"
                            tabindex="0"
                            [attr.aria-label]="t.name + ' ' + t.rank + '/' + t.max"
                            [style.background-image]="'url(' + talentIcon(t) + ')'"
                            (mouseenter)="tipTalent($event, t)"
                            (focus)="tipTalent($event, t)"
                            (mouseleave)="tip.set(null)"
                            (blur)="tip.set(null)"
                          >
                            <span class="rk">{{ t.rank }}/{{ t.max }}</span>
                          </div>
                        } @else {
                          <span class="spacer"></span>
                        }
                      }
                    </div>
                  </div>
                } @empty {
                  <p class="muted">Aucun talent reçu pour ce perso.</p>
                }
              </div>
              @if (d.talents.length) {
                <p class="total">{{ split() }} · {{ spent() }} point{{ spent() > 1 ? 's' : '' }}</p>
              }
            }
          } @else {
            <p class="center muted">Chargement…</p>
          }
        </section>
      </div>
    }

    <ng-template #slotTpl let-s>
      @if (gearAt(s); as g) {
        <div
          class="slot filled"
          tabindex="0"
          role="button"
          (click)="openObtain(g)"
          (keydown.enter)="openObtain(g)"
          (mouseenter)="tipItem($event, g)"
          (focus)="tipItem($event, g)"
          (mouseleave)="tip.set(null)"
          (blur)="tip.set(null)"
        >
          <span
            class="ic qb{{ quality(g) }}"
            [style.background-image]="'url(' + itemIcon(g) + ')'"
          ></span>
          <span class="txt">
            <span class="nm q{{ quality(g) }}" style="display: block">{{
              item(g)?.name ?? 'Objet ' + g.item
            }}</span>
            <span class="il" style="display: block"
              >{{ slotName(s) }} · niveau d’objet {{ g.ilvl || item(g)?.ilvl || '?' }}</span
            >
            @if (item(g)?.enchant; as en) {
              <span class="en" style="display: block">{{ en }}</span>
            }
          </span>
        </div>
      } @else {
        <div class="slot empty">
          <span class="ic"></span>
          <span class="txt"
            ><span class="nm">{{ slotName(s) }} : vide</span></span
          >
        </div>
      }
    </ng-template>

    @if (tip(); as t) {
      <div class="wtip" [style.left.px]="t.x" [style.top.px]="t.y">
        @for (l of t.lines; track $index) {
          <div class="tt-line">
            <span>
              @for (p of l.left; track $index) {
                <span class="{{ p.cls }}">{{ p.text }}</span>
              }
            </span>
            @if (l.right.length) {
              <span>
                @for (p of l.right; track $index) {
                  <span class="{{ p.cls }}">{{ p.text }}</span>
                }
              </span>
            }
          </div>
        }
        @for (x of t.extra; track $index) {
          <div [class]="x[1]">{{ x[0] }}</div>
        }
      </div>
    }
  `,
})
export class ArmoryPage {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private vcr = inject(ViewContainerRef);
  private obtainOpen = false;

  readonly list = signal<ArmoryList | null>(null);
  readonly error = signal<string | null>(null);
  readonly q = signal('');
  readonly cls = signal('');
  readonly band = signal('');
  readonly mine = signal(false);
  readonly openKey = signal<string | null>(null);
  readonly detail = signal<ArmoryDetail | null>(null);
  readonly detailError = signal<string | null>(null);
  readonly tab = signal<'sheet' | 'talents'>('sheet');
  readonly showAll = signal(false);
  readonly tip = signal<{ x: number; y: number; lines: Line[]; extra: [string, string][] } | null>(
    null,
  );

  readonly classes = Object.entries(CLASS_NAMES);
  readonly bands = BANDS;
  readonly left = LEFT;
  readonly right = RIGHT;
  readonly weapons = WEAPONS;
  readonly fmt = nf;
  readonly ago = ago;
  readonly color = classColor;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private tries = 0;

  readonly shown = computed(() => {
    const l = this.list();
    if (!l) return [];
    const q = this.q().trim().toLowerCase();
    const band = BANDS.find((b) => b.key === this.band()) ?? BANDS[0];
    return l.characters.filter(
      (c) =>
        (!q || c.name.toLowerCase().includes(q)) &&
        (!this.cls() || c.class === this.cls()) &&
        (c.level ?? 0) >= band.lo &&
        (c.level ?? 0) <= band.hi &&
        (!this.mine() || c.userId === l.me),
    );
  });

  readonly blocks = computed(() => this.buildBlocks(this.detail()));
  readonly firstBlocks = computed(() => {
    const d = this.detail();
    const b = this.blocks();
    if (!d) return [];
    const first = FIRST[d.class ?? ''] ?? ['melee', 'defense'];
    return [b['attrs'], ...first.map((k) => b[k])].filter((x): x is Block =>
      Boolean(x?.rows.length),
    );
  });
  readonly otherBlocks = computed(() => {
    const d = this.detail();
    if (!d) return [];
    const first = FIRST[d.class ?? ''] ?? ['melee', 'defense'];
    const spellShown = first.includes('spell') || first.includes('heal');
    return ALL.filter((k) => !first.includes(k) && !(k === 'spell' && spellShown))
      .map((k) => this.blocks()[k])
      .filter((x): x is Block => Boolean(x?.rows.length));
  });
  readonly otherTitles = computed(() =>
    this.otherBlocks()
      .map((b) => b.title)
      .join(', '),
  );
  readonly spent = computed(() => (this.detail()?.talents ?? []).reduce((s, t) => s + t.points, 0));
  readonly split = computed(() => (this.detail()?.talents ?? []).map((t) => t.points).join(' / '));

  constructor() {
    this.load();
    liveRefresh('armory', () => this.load());
    // ?perso=<key>: the window opens on that character (a link shared on Discord)
    const sub = this.route.queryParamMap.subscribe((p) => {
      const key = p.get('perso');
      if (key && key !== this.openKey()) this.show(key);
      if (!key && this.openKey()) this.reset();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.openKey() && !this.obtainOpen) this.close(); // Escape closes the Obtention first
    };
    document.addEventListener('keydown', onKey);
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      document.removeEventListener('keydown', onKey);
      if (this.retry) clearTimeout(this.retry);
    });
  }

  load() {
    this.api
      .armory()
      .then((l) => {
        this.list.set(l);
        this.error.set(null);
      })
      .catch((err) => this.error.set(`Armurerie indisponible : ${errorText(err)}`));
  }

  open(key: string) {
    this.router.navigate([], { queryParams: { perso: key }, queryParamsHandling: 'merge' });
  }
  close() {
    this.router.navigate([], { queryParams: { perso: null }, queryParamsHandling: 'merge' });
  }
  private reset() {
    this.openKey.set(null);
    this.detail.set(null);
    this.tip.set(null);
    if (this.retry) clearTimeout(this.retry);
  }
  private show(key: string) {
    this.reset();
    this.openKey.set(key);
    this.tab.set('sheet');
    this.showAll.set(false);
    this.detailError.set(null);
    this.tries = 0;
    this.fetchDetail(key);
  }
  // Tooltips Wowhead has not given yet: asked again a few seconds later
  private fetchDetail(key: string) {
    this.api
      .armoryCharacter(key)
      .then((d) => {
        if (this.openKey() !== key) return;
        this.detail.set(d);
        if (d.missing.length && this.tries++ < 6)
          this.retry = setTimeout(() => this.fetchDetail(key), 3000);
      })
      .catch((err) => {
        if (this.openKey() === key) this.detailError.set(`Fiche indisponible : ${errorText(err)}`);
      });
  }
  setTab(t: 'sheet' | 'talents') {
    this.tab.set(t);
    this.tip.set(null);
  }

  rowOf(key: string | null): ArmoryRow | undefined {
    return this.list()?.characters.find((c) => c.key === key);
  }
  className(cls: string | null) {
    return (cls && CLASS_NAMES[cls]) || 'Classe inconnue';
  }
  classIcon(cls: string | null) {
    return icon(CLASS_ICONS[cls ?? ''] ?? 'inv_misc_questionmark', 'medium');
  }
  slotName(s: number) {
    return SLOT_NAMES[s];
  }
  gearAt(s: number) {
    return this.detail()?.gear.find((g) => g.slot === s) ?? null;
  }
  item(g: ArmoryGear): ArmoryItem | undefined {
    return this.detail()?.items[`${g.item}:${g.enchant || 0}:${g.suffix || 0}`];
  }
  quality(g: ArmoryGear) {
    return g.quality ?? this.item(g)?.quality ?? 1;
  }
  itemIcon(g: ArmoryGear) {
    return icon(this.item(g)?.icon);
  }
  talentIcon(t: ArmoryTalent) {
    return icon(t.spell ? this.detail()?.spells[t.spell]?.icon : null, 'medium');
  }

  // « 📍 Obtention » of the item (same window as the Grimoire's, loaded on the first click): drops, vendors,
  // quests, and the guild's artisans who can make it
  async openObtain(g: ArmoryGear) {
    this.tip.set(null);
    const { ObtainDialogComponent } = await import('../shared/obtain-dialog');
    const craft = this.detail()?.craftable[g.item];
    const ref = this.vcr.createComponent(ObtainDialogComponent);
    ref.setInput('item', {
      id: g.item,
      name: this.item(g)?.name ?? `Objet ${g.item}`,
      craft: craft?.artisans.length ? craft : null,
    });
    this.obtainOpen = true;
    ref.instance.closed.subscribe(() => {
      ref.destroy();
      setTimeout(() => (this.obtainOpen = false)); // after this Escape has reached every listener
    });
  }

  // Talents on the game's grid: 4 columns, a row per tier (empty cells: null)
  grid(talents: ArmoryTalent[]) {
    const rows = Math.max(1, ...talents.map((t) => t.tier));
    const cells: (ArmoryTalent | null)[] = Array(rows * 4).fill(null);
    for (const t of talents) {
      const i = (t.tier - 1) * 4 + (t.column - 1);
      if (i >= 0 && i < cells.length) cells[i] = t;
    }
    return cells;
  }

  // The game's lines between talents, under the icons: straight down in a column, or across a row (cells 44 px,
  // rows 12 px apart, 4 equal columns). Gold when the talent it leads to has points.
  links(tree: ArmoryDetail['talents'][number]) {
    const ROW = 56;
    const x = (col: number) => `${((col - 0.5) / 4) * 100}%`;
    const out: { left: string; top: string; width: string; height: string; on: boolean; down: boolean }[] = [];
    for (const { from, to } of tree.links ?? []) {
      const target = tree.talents.find((t) => t.tier === to[0] && t.column === to[1]);
      const on = Boolean(target?.rank);
      const [a, b] = from[1] < to[1] ? [from[1], to[1]] : [to[1], from[1]];
      if (from[1] === to[1] && to[0] > from[0]) {
        out.push({
          left: `calc(${x(from[1])} - 2px)`,
          top: `${(from[0] - 1) * ROW + 44}px`,
          width: '4px',
          height: `${(to[0] - from[0]) * ROW - 50}px`,
          on,
          down: true,
        });
      } else if (from[0] === to[0]) {
        out.push({
          left: `calc(${x(a)} + 22px)`,
          top: `${(from[0] - 1) * ROW + 20}px`,
          width: `calc(${x(b)} - ${x(a)} - 44px)`,
          height: '4px',
          on,
          down: false,
        });
      } else {
        // across to the target's column on the source's row, then down to the target
        out.push({
          left: from[1] < to[1] ? `calc(${x(a)} + 22px)` : x(a),
          top: `${(from[0] - 1) * ROW + 20}px`,
          width: `calc(${x(b)} - ${x(a)} - 22px)`,
          height: '4px',
          on,
          down: false,
        });
        out.push({
          left: `calc(${x(to[1])} - 2px)`,
          top: `${(from[0] - 1) * ROW + 20}px`,
          width: '4px',
          height: `${(to[0] - from[0]) * ROW - 26}px`,
          on,
          down: true,
        });
      }
    }
    return out;
  }

  private place(e: Event, lines: Line[], extra: [string, string][]) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const w = 330;
    let x = r.right + 10;
    if (x + w > window.innerWidth - 8) x = Math.max(8, r.left - w - 10);
    const y = Math.max(8, Math.min(r.top, window.innerHeight - 320));
    this.tip.set({ x, y, lines, extra });
  }
  tipItem(e: Event, g: ArmoryGear) {
    const it = this.item(g);
    const lines: Line[] = it?.lines ?? [
      { left: [{ text: `Objet ${g.item}`, cls: 'b' }], right: [] },
      { left: [{ text: 'Infobulle en chargement…', cls: 'q0' }], right: [] },
    ];
    const extra: [string, string][] = [];
    const craft = this.detail()?.craftable[g.item];
    if (craft?.artisans.length) {
      const who = craft.artisans.slice(0, 3).join(', ') + (craft.artisans.length > 3 ? '…' : '');
      extra.push([
        `Fabricable dans la guilde : ${craft.profession ?? 'métier'} (${who})`,
        'crafted',
      ]);
    }
    extra.push(['Clic : 📍 Obtention', 'hint']);
    this.place(e, lines, extra);
  }
  tipTalent(e: Event, t: ArmoryTalent) {
    const spell = t.spell ? this.detail()?.spells[t.spell] : null;
    const lines: Line[] = spell?.lines.length
      ? [...spell.lines]
      : [{ left: [{ text: t.name, cls: 'b' }], right: [] }];
    this.place(e, lines, [[`Rang ${t.rank}/${t.max}`, 'rank']]);
  }

  // Stat blocks from what the game gave (a stat the client did not give is left out)
  private buildBlocks(d: ArmoryDetail | null): Record<string, Block> {
    if (!d) return {};
    const s = d.stats;
    const row = (label: string, value: string, bonus?: number): [string, string, string?] =>
      bonus ? [label, value, `${bonus > 0 ? '+' : ''}${nf(bonus)}`] : [label, value];
    const has = (...keys: string[]) => keys.every((k) => s[k] !== undefined);
    const attrs: [string, string, string?][] = [];
    for (const [k, label] of [
      ['str', 'Force'],
      ['agi', 'Agilité'],
      ['sta', 'Endurance'],
      ['int', 'Intelligence'],
      ['spi', 'Esprit'],
    ]) {
      if (has(k)) attrs.push(row(label, nf(s[k]), s[k + 'B']));
    }
    if (has('armor')) attrs.push(['Armure', nf(s['armor'])]);
    if (has('hp')) attrs.push(['Vie', nf(s['hp'])]);
    if (has('power') && POWER[s['powerType']]) attrs.push([POWER[s['powerType']], nf(s['power'])]);
    const melee: [string, string][] = [];
    if (has('ap')) melee.push(["Puissance d'attaque", nf(s['ap'])]);
    if (has('dmgMin', 'dmgMax')) melee.push(['Dégâts', `${nf(s['dmgMin'])} – ${nf(s['dmgMax'])}`]);
    if (has('speed')) melee.push(['Vitesse', nf(s['speed'], 2)]);
    if (has('hit')) melee.push(['Toucher', `+${pct(s['hit'])}`]);
    if (has('crit')) melee.push(['Critique', pct(s['crit'])]);
    const ranged: [string, string][] = [];
    if (has('rap')) ranged.push(["Puissance d'attaque", nf(s['rap'])]);
    if (has('rdmgMin', 'rdmgMax') && s['rdmgMax'] > 0)
      ranged.push(['Dégâts', `${nf(s['rdmgMin'])} – ${nf(s['rdmgMax'])}`]);
    if (has('rspeed') && s['rspeed'] > 0) ranged.push(['Vitesse', nf(s['rspeed'], 2)]);
    if (has('rcrit')) ranged.push(['Critique', pct(s['rcrit'])]);
    const schools: [string, string][] = [];
    for (const [k, label] of [
      ['sp2', 'Sacré'],
      ['sp3', 'Feu'],
      ['sp4', 'Nature'],
      ['sp5', 'Givre'],
      ['sp6', 'Ombre'],
      ['sp7', 'Arcanes'],
    ]) {
      if ((s[k] ?? 0) > 0 && s[k] !== s['sp']) schools.push([`· ${label}`, `+${nf(s[k])}`]);
    }
    const dmg: [string, string][] = has('sp')
      ? [['Bonus aux dégâts', `+${nf(s['sp'])}`], ...schools]
      : [];
    const heal: [string, string][] = has('heal') ? [['Bonus aux soins', `+${nf(s['heal'])}`]] : [];
    const spellRest: [string, string][] = [];
    if (has('scrit')) spellRest.push(['Critique des sorts', pct(s['scrit'])]);
    if (has('shit')) spellRest.push(['Toucher des sorts', `+${pct(s['shit'])}`]);
    if (has('mp5')) spellRest.push(['Régén. de mana (5 s)', nf(s['mp5'])]);
    if (has('mp5c')) spellRest.push(["Pendant l'incantation (5 s)", nf(s['mp5c'])]);
    const defense: [string, string][] = [];
    if (has('def')) defense.push(['Défense', nf(s['def'])]);
    if (has('dodge')) defense.push(['Esquive', pct(s['dodge'])]);
    if (has('parry')) defense.push(['Parade', pct(s['parry'])]);
    if (has('block')) defense.push(['Blocage', pct(s['block'])]);
    const res = [
      ['res2', 'Feu'],
      ['res3', 'Nature'],
      ['res4', 'Givre'],
      ['res5', 'Ombre'],
      ['res6', 'Arcanes'],
    ].filter(([k]) => (s[k] ?? 0) > 0);
    for (const [k, label] of res) defense.push([`Résistance (${label})`, nf(s[k])]);
    return {
      attrs: { title: 'Caractéristiques', rows: attrs },
      melee: { title: 'Mêlée', rows: melee },
      ranged: { title: 'À distance', rows: ranged },
      spell: { title: 'Sorts', rows: [...dmg, ...heal, ...spellRest] },
      heal: { title: 'Sorts', rows: [...heal, ...dmg, ...spellRest] },
      defense: { title: 'Défense', rows: defense },
    };
  }
}
