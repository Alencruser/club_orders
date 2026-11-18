# Bagarre club · Commandes

Craft orders website of the Bagarre club: a recipe book (profession → artisan → recipe cards in the
WoW tooltip style), a cart, my orders (current and history) and the artisan's workshop (orders by
buyer, done / refuse / reply, materials per buyer and in total).

Angular 21, static files. Everything else comes from the Discord bot (repo `bot-bagarre`,
`src/web.js`): Discord login, catalog, artisans, orders. The site and the bot share one address:
Caddy serves the files and forwards `/api/*` to the bot.

## Deploy (VPS)

```bash
git pull && ./deploy.sh
```

`deploy.sh` installs, builds and copies the site to `/var/www/commandes` (rsync). Needs Node
22.12+ and rsync. Nothing to restart: Caddy serves the new files at once.

## Develop

```bash
npm install
npx ng serve
```

The site needs the bot's `/api`: without a local bot, only the login screen shows.

## Browser storage (localStorage)

Only conveniences: the cart (`co.cart`), the character you order for (`co.buyer`), the Wowhead
tooltips already seen (`co.tooltips`) and your past orders (`co.history.<user>`), kept after the
bot forgets finished orders (30 days).
