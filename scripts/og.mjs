// Generates og.html (1200x630) from the latest fetched data, for the share image.
// Screenshot it with headless Chromium:
//   chrome --headless=new --screenshot=assets/img/og.png --window-size=1200,630 \
//     --virtual-time-budget=3000 file://$PWD/og.html
// Run: node scripts/og.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'data', 'data.json'), 'utf8'));
const ins = data.insights;
const st = data.chains['4217'].stats;
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const d = new Date(data.generatedAt);
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const asOf = `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Instrument Serif'; font-style: normal; font-weight: 400; src: url('assets/fonts/instrument-serif-400-normal-latin.woff2') format('woff2'); }
@font-face { font-family: 'Instrument Serif'; font-style: italic; font-weight: 400; src: url('assets/fonts/instrument-serif-400-italic-latin.woff2') format('woff2'); }
@font-face { font-family: 'Inter Tight'; font-weight: 500; src: url('assets/fonts/inter-tight-500-normal-latin.woff2') format('woff2'); }
@font-face { font-family: 'IBM Plex Mono'; font-weight: 500; src: url('assets/fonts/ibm-plex-mono-500-normal-latin.woff2') format('woff2'); }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: #12100e; color: #efe9e2; font-family: 'Inter Tight', sans-serif; overflow: hidden; position: relative; }
body::before { content: ""; position: absolute; inset: 0; background: radial-gradient(700px 420px at 88% -10%, rgba(58,20,32,.9), rgba(18,16,14,0) 70%); }
.inner { position: relative; padding: 64px 72px; }
.kicker { font-family: 'IBM Plex Mono', monospace; font-size: 20px; letter-spacing: .14em; text-transform: uppercase; color: #b0a79d; }
.kicker b { color: #e74079; font-weight: 500; }
h1 { font-family: 'Instrument Serif', serif; font-weight: 400; font-size: 108px; line-height: 1.02; margin-top: 18px; color: #fff6e8; }
h1 em { font-style: italic; color: #e74079; }
.stats { display: flex; gap: 56px; margin-top: 44px; }
.stat .k { font-size: 15px; letter-spacing: .1em; text-transform: uppercase; color: #b0a79d; }
.stat .v { font-family: 'IBM Plex Mono', monospace; font-size: 46px; margin-top: 8px; color: #fff6e8; }
.foot { position: absolute; left: 72px; right: 72px; bottom: 44px; display: flex; justify-content: space-between; font-family: 'IBM Plex Mono', monospace; font-size: 19px; color: #b0a79d; }
.foot b { color: #efe9e2; font-weight: 500; }
</style></head><body><div class="inner">
<div class="kicker">taskmarket <b>·</b> live market visualizer</div>
<h1>The market, <em>live.</em></h1>
<div class="stats">
<div class="stat"><div class="k">Open tasks</div><div class="v">${st.openTasks}</div></div>
<div class="stat"><div class="k">Rewards put up · 30d</div><div class="v">${money(ins.rewardsPutUp30d)}</div></div>
<div class="stat"><div class="k">Paid out · 30d</div><div class="v">${money(ins.paidOut30d)}</div></div>
<div class="stat"><div class="k">Tasks completed</div><div class="v">${ins.completed.toLocaleString('en-US')}</div></div>
</div>
</div>
<div class="foot"><span><b>taskmarket.dev</b></span><span>Data as of ${asOf} · refreshed hourly</span></div>
</body></html>
`;
writeFileSync(join(ROOT, 'og.html'), html);
console.log('og.html written, as of', asOf);
