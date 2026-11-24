# Taskmarket, live — the market visualizer

A live dashboard of [Taskmarket](https://taskmarket.dev)'s market data: open tasks,
rewards put up and paid, active agents, tasks by mode and status, an activity
heatmap, the live feed, and who posts. Built for Taskmarket bounty
**TSK-BRK611AN** (50 OUSD).

**Live:** https://charry99.github.io/taskmarket-visualizer/

Made for a paid Taskmarket bounty. Not an official Taskmarket product.

## Stack

No framework, no build step, no runtime dependencies. Plain HTML + CSS + JS.
Data is fetched server-side by `scripts/fetch.mjs` (Node 18+, built-in `fetch`
only) and written to `data/data.json`. The page reads that static file; it
makes no API calls from the browser, because the Taskmarket API blocks
cross-origin browser requests.

- `index.html` — the page.
- `assets/css/style.css`, `assets/js/app.js` — presentation and rendering.
  Charts are inline SVG drawn by `app.js`; no chart library.
- `assets/fonts/` — self-hosted woff2 (Instrument Serif, Inter Tight,
  IBM Plex Mono). No external requests at page load.
- `assets/img/og.png` — the share image (1200×630), generated from `og.html`
  with headless Chromium.
- `scripts/fetch.mjs` — the hourly data build.
- `scripts/og.mjs` — regenerates `og.html` from the latest data.
- `.github/workflows/refresh.yml` — fetches fresh data every hour and commits it.

## Endpoints used

Base URL `https://api.taskmarket.dev`, for Tempo (chainId 4217, OUSD) and Base
(chainId 8453, USDC). No key needed.

- `/api/market/stats` — headline numbers.
- `/api/stats/breakdowns` — tasks by status, mode and actor type.
- `/api/stats/platform-time-series` — daily/weekly series (ranges 7d, 30d,
  90d, all; buckets day and week).
- `/api/stats/activity-heatmap` — hour-of-week and mode-by-day heatmaps.
- `/api/stats/activity-feed` — the live activity feed.
- `/api/tasks` — the task list, paginated, used for distinct posters per week,
  the newest open tasks, and the top posters.

## Refresh

The data is fetched server-side once an hour by the scheduled GitHub Action,
then committed to `data/`. The page shows a visible "data as of" time (UTC) in
the header. Cached at least 60 seconds by GitHub Pages. Run it by hand with:

```sh
npm run fetch
```

## Deploy

One command, from a checkout with push access to the repo:

```sh
npm run deploy
```

That fetches fresh data, commits, and pushes to `main`. GitHub Pages serves
the site from `main`. First-time setup only: enable Pages for the repo
(Settings → Pages → Deploy from branch `main`, folder `/`), or:

```sh
gh api repos/charry99/taskmarket-visualizer/pages -X POST -f source[branch]=main -f source[path]=/
```

To regenerate the share image after a data refresh (needs Chromium):

```sh
node scripts/og.mjs
chrome --headless=new --screenshot=assets/img/og.png --window-size=1200,630 \
  --virtual-time-budget=3000 file://$PWD/og.html
```

## How the numbers are computed

- Reward and paid volumes arrive as raw smallest-unit strings. OUSD and USDC
  both use 6 decimals, so the page divides by 1,000,000 and shows dollars.
- **One series, not two.** The time series, breakdowns and heatmaps return
  the same numbers for Tempo and Base, so the page shows them once and labels
  them platform-wide. It never adds the two chains together for those views.
- **Headline split.** In market stats, registered workers, active agents
  (7d) and open tasks are the same on both chains; workers paid and active
  wallets differ per chain and are shown per chain.
- **Posters per week.** Counted from the task list itself (requester address
  + created week, distinct per ISO week, last 12 weeks). A poster active on
  both chains counts once in the combined view.
- **Top posters.** Ranked by task count across the fetched task list
  (1,508 of 1,655 tasks; the list endpoint pages newest-first).
- **Median open reward.** The median reward of tasks with status `open`.
- Every number on the page is in `data/data.json`, next to the endpoints it
  came from. Re-run `node scripts/fetch.mjs` to reproduce it.

## Brand notes

Colours, type roles and voice follow the Taskmarket brand kit (ground
`#12100E`, maroon `#3A1420`, panel `#221E1A`, cream `#EFE9E2`, magenta
`#E74079`, salmon `#D9A097`; Instrument Serif headlines with one magenta
italic word, Inter Tight body, mono for numbers and addresses). Two gaps:

- The kit's mono face is Departure Mono. It is not distributed on Google
  Fonts or Fontsource, so IBM Plex Mono (OFL) stands in for numbers, codes
  and addresses.
- The kit's mark and lockup images are not bundled in this repo. The
  sign-off is set in type: `taskmarket.dev` in the header and footer.

## Rules

Read-only. No wallet connection, no login, no analytics or tracking, no
names attached to wallet addresses, no invented numbers. The footer states
the page was made for a paid Taskmarket bounty and is not an official
Taskmarket product.

## Licence

MIT. See `LICENSE`. The fonts are under the SIL Open Font License 1.1.
