# MGA golf league app

A 9-hole golf league manager: roster, schedule, scorecards, handicaps, standings, playoffs and the year-end outing.
Static front end plus one Netlify Function, with league data in Netlify Blobs. Members sign in with their name and a PIN.

Setting it up for a league: see [SETUP-GUIDE.md](SETUP-GUIDE.md).

## Layout

| Path | What it is |
|---|---|
| `public/index.html`, `public/css/app.css` | Page shell and styles (light by default, dark on request) |
| `public/js/rules.js` | The league's rules: handicaps, match scoring, standings, schedule, bracket. Pure functions. |
| `public/js/ops.js` | Every change as an operation, the permission matrix, validation, migration. Shared by browser and server. |
| `public/js/api.js`, `core.js`, `app.js`, `ui.js` | Client: server calls, state, navigation, dialogs |
| `public/js/views/*.js` | One file per tab |
| `netlify/functions/api.mjs` | The server: sign-in, applying operations with conditional writes, revision history, backup |
| `test/` | Node test suite, including the server function against an in-memory blob store |
| `scripts/dev.mjs`, `scripts/seed.mjs` | Local preview with sample data |

## Developing

```bash
npm install
npm test
```

```bash
SEED=1 npm run dev
```

Then open http://localhost:8787. With `SEED=1` a 10-team sample league is created: sign in as "Jim Allen" with PIN 1234 (Commissioner), join code `DEMO`. Without it, the first-time setup code is `demo`. Data lives in memory and resets on restart.

## How saving works

The browser applies each change locally for instant feedback and sends it to the server as a small operation ("set hole 3 for player X in week Y to 5"). The server checks the caller's role, applies the operation to the stored copy, validates the result and writes it back with a conditional write. If someone else saved in between, it reloads and applies again, so two people entering scores at once never overwrite each other. The last 200 saves are kept as revisions; deleted weeks, teams and players sit in Recently deleted for 30 days.
