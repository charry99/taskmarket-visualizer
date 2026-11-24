// Taskmarket live market visualizer — server-side data fetch.
// Fetches every number the dashboard shows from the public Taskmarket API
// (https://api.taskmarket.dev, no key) and writes data/data.json + data/meta.json.
// Run: node scripts/fetch.mjs
// No dependencies. Node 18+ (global fetch).
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const BASE = 'https://api.taskmarket.dev';
const CHAINS = [4217, 8453];
const DECIMALS = 1e6; // OUSD and USDC both use 6 decimals

const ENDPOINTS = [];
function track(url) { ENDPOINTS.push(url); return url; }

async function getJson(url, tries = 2) {
  track(url);
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1000)); }
  }
  throw lastErr;
}

async function fetchChain(chainId) {
  const q = `chainId=${chainId}`;
  const out = {};
  out.stats = await getJson(`${BASE}/api/market/stats?${q}`);
  out.breakdowns = await getJson(`${BASE}/api/stats/breakdowns?${q}`);
  out.series = {};
  for (const [range, bucket] of [['7d', 'day'], ['30d', 'day'], ['90d', 'day'], ['all', 'day'], ['allWeek', 'week']]) {
    const r = range === 'allWeek' ? 'all' : range;
    out.series[range] = await getJson(`${BASE}/api/stats/platform-time-series?${q}&range=${r}&bucket=${bucket}`);
  }
  out.heatmapHow = await getJson(`${BASE}/api/stats/activity-heatmap?${q}&range=30d&dimension=hourOfWeek`);
  out.heatmapMode = await getJson(`${BASE}/api/stats/activity-heatmap?${q}&range=30d&dimension=mode`);
  out.heatmap7d = await getJson(`${BASE}/api/stats/activity-heatmap?${q}&range=7d&dimension=hourOfWeek`);
  out.feed = await getJson(`${BASE}/api/stats/activity-feed?${q}&limit=30`);
  return out;
}

const TASK_FIELDS = ['id', 'referenceCode', 'requester', 'chainId', 'createdAt', 'expiryTime', 'status', 'mode', 'reward', 'netReward', 'submissionCount', 'awardCount'];
async function fetchTasks(chainId, cap = 3000) {
  const tasks = [];
  let cursor = null;
  let pages = 0;
  while (tasks.length < cap) {
    const url = `${BASE}/api/tasks?chainId=${chainId}&sort=newest&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const page = await getJson(url);
    const items = page.tasks || [];
    for (const t of items) {
      const slim = {};
      for (const f of TASK_FIELDS) slim[f] = t[f] ?? null;
      tasks.push(slim);
    }
    pages++;
    if (!page.hasMore || !page.nextCursor || items.length === 0) break;
    cursor = page.nextCursor;
  }
  return { tasks, pages };
}

// ISO week starting Monday, as YYYY-MM-DD of the Monday.
function weekStart(d) {
  const date = new Date(d);
  const day = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - day);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}
function lastWeeks(n) {
  const weeks = [];
  const now = new Date();
  let start = weekStart(now);
  for (let i = 0; i < n; i++) {
    weeks.unshift(start);
    const d = new Date(start + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 7);
    start = d.toISOString().slice(0, 10);
  }
  return weeks;
}
function distinctPosters(tasks, weeks) {
  const byWeek = new Map(weeks.map(w => [w, new Set()]));
  for (const t of tasks) {
    if (!t.createdAt || !t.requester) continue;
    const w = weekStart(t.createdAt);
    if (byWeek.has(w)) byWeek.get(w).add(String(t.requester).toLowerCase());
  }
  return weeks.map(w => ({ week: w, distinctPosters: byWeek.get(w).size }));
}

function sumField(rows, field) {
  return rows.reduce((s, r) => s + BigInt(r[field] || '0'), 0n);
}
function money(raw) { return Number(raw) / DECIMALS; }

async function main() {
  const startedAt = new Date();
  const errors = [];
  const chains = {};
  for (const chainId of CHAINS) {
    try {
      chains[String(chainId)] = await fetchChain(chainId);
    } catch (e) {
      errors.push(`chain ${chainId}: ${e.message}`);
      chains[String(chainId)] = null;
    }
  }
  const okChains = CHAINS.filter(c => chains[String(c)]);
  if (okChains.length === 0) throw new Error('all chain fetches failed: ' + errors.join('; '));

  const taskLists = {};
  for (const chainId of CHAINS) {
    try {
      taskLists[String(chainId)] = await fetchTasks(chainId);
    } catch (e) {
      errors.push(`tasks ${chainId}: ${e.message}`);
      taskLists[String(chainId)] = { tasks: [], pages: 0 };
    }
  }

  // The API returns the same series/breakdowns for both chains: detect and flag,
  // so the page shows them once instead of doubling the market.
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const both = okChains.length === 2;
  const flags = {
    seriesPlatformWide: both && same(chains['4217'].series, chains['8453'].series),
    breakdownsPlatformWide: both && same(chains['4217'].breakdowns, chains['8453'].breakdowns),
    heatmapHowPlatformWide: both && same(chains['4217'].heatmapHow, chains['8453'].heatmapHow),
    heatmapModePlatformWide: both && same(chains['4217'].heatmapMode, chains['8453'].heatmapMode),
    statsIdenticalFields: both ? Object.keys(chains['4217'].stats).filter(k => chains['4217'].stats[k] === chains['8453'].stats[k]) : [],
  };

  // Combined feed: the feed endpoint ignores the chain filter and returns the
  // same items for both chains, so dedupe by event identity. Attach the task
  // reference code (TSK-…) from the fetched task lists for display.
  const allTasks = [...taskLists['4217'].tasks, ...taskLists['8453'].tasks];
  const codeById = new Map();
  for (const t of allTasks) if (t.id && t.referenceCode) codeById.set(t.id, t.referenceCode);
  const seenFeed = new Set();
  const feedCombined = [...okChains.flatMap(c => (chains[String(c)].feed.items || []))]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .filter(it => {
      const key = [it.timestamp, it.taskId, it.actor, it.type].join('|');
      if (seenFeed.has(key)) return false;
      seenFeed.add(key);
      return true;
    })
    .slice(0, 30)
    .map(it => ({ ...it, referenceCode: codeById.get(it.taskId) || null }));

  // Posters per week (last 12 ISO weeks).
  const weeks = lastWeeks(12);
  const postersPerWeek = {
    combined: distinctPosters(allTasks, weeks),
    '4217': distinctPosters(taskLists['4217'].tasks, weeks),
    '8453': distinctPosters(taskLists['8453'].tasks, weeks),
  };

  // Insights, all computed from the fetched data only.
  const bd = chains[String(okChains[0])].breakdowns;
  const statusCount = Object.fromEntries((bd.status || []).map(s => [s.status, s.count]));
  const modeCount = Object.fromEntries((bd.mode || []).map(m => [m.mode, m.count]));
  const totalTasks = Object.values(statusCount).reduce((a, b) => a + b, 0);
  const completed = statusCount.completed || 0;
  const cancelled = statusCount.cancelled || 0;
  const open = statusCount.open || 0;
  const s30 = chains[String(okChains[0])].series['30d'];
  const rewardsPutUp30d = money(sumField(s30, 'rewardVolume'));
  const paidOut30d = money(sumField(s30, 'paidVolume'));
  const tasksCreated30d = s30.reduce((s, r) => s + (r.tasksCreated || 0), 0);
  const completed30d = s30.reduce((s, r) => s + (r.completedTasks || 0), 0);
  const settlements30d = s30.reduce((s, r) => s + (r.settlements || 0), 0);
  const openTasks = allTasks.filter(t => t.status === 'open');
  const openRewards = openTasks.map(t => Number(t.reward || 0) / DECIMALS).sort((a, b) => a - b);
  const medianOpenReward = openRewards.length ? openRewards[Math.floor(openRewards.length / 2)] : 0;
  const posterCounts = new Map();
  for (const t of allTasks) {
    if (!t.requester) continue;
    const k = String(t.requester).toLowerCase();
    posterCounts.set(k, (posterCounts.get(k) || 0) + 1);
  }
  const topPosters = [...posterCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([address, count]) => ({ address, count, share: totalTasks ? count / totalTasks : 0 }));
  const topPosterShare = topPosters.length ? topPosters[0].count / Math.max(allTasks.length, 1) : 0;
  // Busiest hour of the week from the 30d hour-of-week heatmap.
  let busiest = null;
  const heat = chains[String(okChains[0])].heatmapHow;
  if (heat && heat.cells) {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const best = heat.cells.reduce((m, c) => (c.count > (m?.count || 0) ? c : m), null);
    if (best) busiest = { day: days[Number(best.row)] || best.row, hour: Number(best.col), count: best.count };
  }
  // Median time from posting to completion, where the API gives both timestamps.
  const decisionHours = [];
  for (const t of allTasks) {
    if (t.status === 'completed' && t.createdAt && t.completedAt) {
      decisionHours.push((new Date(t.completedAt) - new Date(t.createdAt)) / 3600000);
    }
  }
  decisionHours.sort((a, b) => a - b);
  const medianDecisionHours = decisionHours.length ? decisionHours[Math.floor(decisionHours.length / 2)] : null;

  const insights = {
    totalTasks, completed, cancelled, open,
    completionRate: totalTasks ? completed / totalTasks : 0,
    cancelledRate: totalTasks ? cancelled / totalTasks : 0,
    bountyShare: totalTasks ? (modeCount.bounty || 0) / totalTasks : 0,
    rewardsPutUp30d, paidOut30d,
    paidShare30d: rewardsPutUp30d ? paidOut30d / rewardsPutUp30d : 0,
    tasksCreated30d, completed30d, settlements30d,
    medianOpenReward,
    topPosters, topPosterShare,
    busiest, medianDecisionHours,
    decisionSample: decisionHours.length,
    tasksFetched: allTasks.length,
  };

  const generatedAt = new Date().toISOString();
  // The page only needs a short list of the newest open tasks; the full
  // fetched lists stay out of the page payload so it stays fast on a phone.
  // Every computed number below is reproducible by re-running this script.
  const newestOpen = allTasks
    .filter(t => t.status === 'open')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 12)
    .map(t => ({ referenceCode: t.referenceCode, reward: t.reward, mode: t.mode, createdAt: t.createdAt, chainId: t.chainId }));
  const data = {
    generatedAt,
    chains,
    tasks: {
      counts: { '4217': taskLists['4217'].tasks.length, '8453': taskLists['8453'].tasks.length, total: allTasks.length },
      newestOpen,
    },
    feedCombined,
    postersPerWeek,
    insights,
    flags,
    endpoints: [...new Set(ENDPOINTS)],
    errors,
  };
  const meta = {
    generatedAt,
    generatedAtUnix: Date.parse(generatedAt),
    fetchSeconds: ((Date.now() - startedAt.getTime()) / 1000).toFixed(1),
    chainsFetched: okChains,
    tasksFetched: allTasks.length,
    endpoints: [...new Set(ENDPOINTS)],
    errors,
    units: 'Reward and paid volumes are raw smallest-unit strings from the API (OUSD on Tempo, USDC on Base, both 6 decimals). The page divides by 1,000,000.',
    notes: 'Some endpoints return the same numbers for both chains (see flags). The page shows those once, labelled platform-wide, and never adds the two chains together for them.',
  };
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, 'data.json.tmp'), JSON.stringify(data));
  renameSync(join(DATA_DIR, 'data.json.tmp'), join(DATA_DIR, 'data.json'));
  writeFileSync(join(DATA_DIR, 'meta.json.tmp'), JSON.stringify(meta, null, 2));
  renameSync(join(DATA_DIR, 'meta.json.tmp'), join(DATA_DIR, 'meta.json'));
  console.log(JSON.stringify({
    generatedAt, chains: okChains, tasksFetched: allTasks.length,
    rewardsPutUp30d, paidOut30d, totalTasks, completed,
    medianDecisionHours, decisionSample: decisionHours.length,
    flags, errors,
  }, null, 2));
}

main().catch(e => { console.error('FETCH FAILED:', e.message); process.exit(1); });
