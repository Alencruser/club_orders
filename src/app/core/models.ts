// Shapes of the bot's /api (bot-bagarre, src/web.js).

export interface Me {
  user: { id: string; name: string; avatar: string | null };
  guild: { id: string; name: string; icon: string | null };
  characters: Character[];
  note: string | null;
  admin?: boolean; // bot admin: may share the guild cards on Discord
}

export interface Character {
  name: string;
  realm: string;
  class: string | null; // WARRIOR, MAGE…
  level: number | null;
}

// craftdata.json of the bot (SkillUp Forever + wago.tools), plus profession names and blocks.
export interface Recipe {
  s: number; // profession (skill line)
  t: [number, number, number, number]; // orange, yellow, green, grey
  r: [number, number][]; // reagents: [itemId, quantity]
  o: [number, number] | null; // output: [itemId, quantity]
  scroll: [number, number] | null; // [recipe item, profession level]
  fee: [number, number] | null; // [trainer price in copper, profession level]
}

export interface ItemInfo {
  n: string; // name
  q: number; // quality
  slot: number;
  lvl: number; // required level
  ilvl: number;
  c: number | null;
  sc: number | null;
}

export interface Catalog {
  build: string;
  importedAt: number;
  recipes: Record<string, Recipe>;
  items: Record<string, ItemInfo>;
  names: Record<string, string>; // recipe names (enchants have no item)
  areas: Record<string, string>;
  scrollDrops: Record<string, [number, number][]>;
  worldDrops: number[];
  limited: Record<string, [number, number][]>;
  professions: Record<string, string>;
  blocks: { key: string; title: string; skills: number[] }[];
}

export interface Artisan {
  key: string; // "name-realm", lower case
  name: string;
  realm: string;
  class: string | null;
  userId: string | null;
  note: string | null;
  updatedAt: number | null;
  professions: Record<
    string,
    {
      name: string;
      level: number | null;
      max: number | null;
      recipes: Record<string, number | null> | null;
    }
  >;
}

// Wowhead tooltip, cached by the bot.
export interface Tooltip {
  icon: string;
  stats: [string, number][];
  armor: number | null;
  source: number[];
  // one line: left part and right part (e.g. "Torse" … "Tissu"), each made of colored pieces
  lines: { left: TextPiece[]; right: TextPiece[] }[];
}

export interface TextPiece {
  text: string;
  cls: string; // q0…q5 quality colors, q yellow, b bold, '' white
}

export type OrderStatus = 'pending' | 'done' | 'refused' | 'cancelled';

export interface Order {
  id: string;
  createdAt: number; // ms
  updatedAt: number;
  buyer: {
    userId: string;
    name: string;
    realm: string;
    class: string | null;
    level: number | null;
  };
  artisan: { key: string; name: string; realm: string; userId: string | null };
  item: { itemId: number | null; spellId: number; name: string };
  qty: number;
  note: string;
  status: OrderStatus;
  reason: string;
  reply?: string;
  archived?: boolean; // kept only in this browser: the bot forgot it (30 days)
}

// Suggestion or bug sent from the site (read on the hidden /feedback page)
export interface FeedbackItem {
  id: string;
  createdAt: number; // ms
  type: 'suggestion' | 'bug';
  text: string;
  page: string;
  userId: string;
  name: string;
  status: 'new' | 'done';
}

// Guild bank (bot: bank.js, /api/bank). Amounts in copper, dates in seconds.
export interface BankTx {
  at: number;
  copper: number;
  name: string;
}
export interface BankMember {
  id: string;
  userId: string | null;
  linked: boolean;
  name: string;
  title?: string | null;
  avatar?: string | null;
  move: number | null; // places won (+) or lost (-) since last week
  seasonNet: number;
  net: number;
  dep: number;
  wd: number;
  deposits: number;
  withdrawals: number;
  maxDep: BankTx | null;
  maxWd: BankTx | null;
  minDep: BankTx | null;
  streak: number;
  bestStreak: number;
  characters: string[];
}
export interface BankSummary {
  guildName: string | null;
  goal: number;
  money: number | null;
  moneyAt: number | null;
  since: number | null;
  last: { at: number; name: string } | null;
  monthName: string;
  seasonStart: number;
  milestones: { percent: number; at: number | null }[];
  members: BankMember[];
  records: {
    deposit: (BankTx & { character: string }) | null;
    withdraw: (BankTx & { character: string }) | null;
  };
  patron: BankMember | null;
  rat: BankMember | null;
  war: { out: number; in: number; count: number };
  neverGave: { userId: string; name: string | null; avatar?: string | null }[];
  days: { day: string; dep: number; wd: number }[];
  recent: {
    id: number;
    at: number;
    type: 'deposit' | 'withdraw';
    copper: number;
    character: string;
    name: string;
    guild: boolean;
  }[];
}

// Follow time (bot: follow.js, /api/follow). Durations in seconds.
export interface FollowMember {
  id: string;
  userId: string | null;
  linked: boolean;
  name: string;
  title?: string | null;
  avatar?: string | null;
  move: number | null;
  season: number;
  seconds: number;
  week: number;
  sessions: number;
  targets: {
    name: string;
    userId: string | null;
    member: string | null;
    seconds: number;
    count: number;
  }[];
  characters: { name: string; seconds: number }[];
}
export interface FollowSummary {
  total: number;
  seasonStart: number;
  members: FollowMember[];
}

// Titles and achievements (bot: gamification.js, titles.js, /api/achievements)
export interface Title {
  id: string;
  name: string;
  min: number;
}
export interface TitleProgress {
  current: Title | null;
  next: Title | null;
  value: number;
}
export interface AchievementDef {
  id: string;
  cat: 'bank' | 'follow' | 'craft';
  name: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  desc: string;
}
export interface AchievementsSummary {
  definitions: AchievementDef[];
  titles: { bank: Title[]; follow: Title[]; craft: Title[] };
  players: {
    userId: string;
    name: string;
    avatar?: string | null;
    delivered: number;
    deliveredSeason: number;
    titles: { bank: TitleProgress; follow: TitleProgress; craft: TitleProgress };
    achievements: {
      id: string;
      value: number;
      target: number;
      done: boolean;
      unlockedAt: number | null;
    }[];
  }[];
  seasonStart: number;
  seasons: Season[];
  challenges: Challenge[];
}

export interface SeasonWinner {
  userId: string;
  name: string;
  value: number;
}
export interface Season {
  week: number;
  start: number;
  end: number;
  bank: SeasonWinner | null;
  follow: SeasonWinner | null;
  craft: SeasonWinner | null;
}

// Guild challenge, created by an admin (bot: gamification.js). Dates in seconds.
export type ChallengeType = 'deposits' | 'deposited' | 'follow' | 'delivered';
export interface Challenge {
  id: string;
  title: string;
  type: ChallengeType;
  target: number;
  start: number;
  end: number;
  reward: string;
  progress: number;
  status: 'upcoming' | 'active' | 'done' | 'failed';
  completedAt: number | null;
}
