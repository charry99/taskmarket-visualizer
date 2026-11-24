// Taskmarket live market visualizer — renders data/data.json (fetched server-side
// by scripts/fetch.mjs). No live API calls from the browser: the API blocks
// cross-origin browser requests, so the page reads the static JSON build.
(function () {
  'use strict';
  var state = { chain: 'both', range: '30d', metric: 'tasksCreated' };
  var DATA = null;

  function $(id) { return document.getElementById(id); }
  function fmtNum(n) { return Number(n).toLocaleString('en-US'); }
  function fmtMoney(n, dec) {
    dec = dec === undefined ? 2 : dec;
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function fmtPct(x) { return (x * 100).toFixed(1) + '%'; }
  function money(raw) { return Number(raw || '0') / 1e6; }
  function shortAddr(a) {
    if (!a) return '';
    return a.slice(0, 6) + '…' + a.slice(-4);
  }
  function shortDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear() + ', ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ' UTC';
  }
  function timeAgo(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function chainLabel() {
    return state.chain === 'both' ? 'Tempo + Base' : state.chain === '4217' ? 'Tempo (OUSD)' : 'Base (USDC)';
  }
  function chainStats() {
    if (state.chain === '4217') return DATA.chains['4217'].stats;
    if (state.chain === '8453') return DATA.chains['8453'].stats;
    return DATA.chains['4217'].stats; // platform-wide fields are identical
  }
  function feedItems() {
    return DATA.feedCombined.filter(function (it) {
      return state.chain === 'both' || String(it.chainId) === state.chain;
    });
  }

  // ---------- tiles ----------
  function renderTiles() {
    var st = chainStats();
    var ins = DATA.insights;
    var paidWorkers = state.chain === 'both'
      ? DATA.chains['4217'].stats.paidWorkers + DATA.chains['8453'].stats.paidWorkers
      : st.paidWorkers;
    var wallets = state.chain === 'both'
      ? DATA.chains['4217'].stats.activeWallets + DATA.chains['8453'].stats.activeWallets
      : st.activeWallets;
    var tiles = [
      { k: 'Open tasks now', v: fmtNum(st.openTasks), s: 'Across both chains, from market stats.' },
      { k: 'Rewards put up · 30 days', v: fmtMoney(ins.rewardsPutUp30d, 0), s: 'All chains. Raw API volumes, 6 decimals.' },
      { k: 'Paid out · 30 days', v: fmtMoney(ins.paidOut30d, 0), s: fmtPct(ins.paidShare30d) + ' of rewards put up reached workers.' },
      { k: 'Active agents · 7 days', v: fmtNum(st.activeAgents7d), s: 'Platform-wide, as the API returns it.' },
      { k: 'Workers paid', v: fmtNum(paidWorkers), s: state.chain === 'both' ? 'Tempo 158 + Base 470.' : chainLabel() + '.' },
      { k: 'Active wallets', v: fmtNum(wallets), s: state.chain === 'both' ? 'Tempo 930 + Base 3,524.' : chainLabel() + '.' },
    ];
    $('tiles').innerHTML = tiles.map(function (t) {
      return '<div class="tile"><div class="k">' + t.k + '</div><div class="v">' + t.v + '</div><div class="s">' + t.s + '</div></div>';
    }).join('');
  }

  // ---------- flow ----------
  function renderFlow() {
    var ins = DATA.insights;
    $('flowNums').innerHTML =
      '<div class="flowbox"><div class="k">Rewards put up · last 30 days</div><div class="v">' + fmtMoney(ins.rewardsPutUp30d) + '</div><div class="s" style="color:var(--muted);font-size:13px;margin-top:4px;">' + fmtNum(ins.tasksCreated30d) + ' tasks posted in the same window.</div></div>' +
      '<div class="flowbox"><div class="k">Paid out to workers · last 30 days</div><div class="v">' + fmtMoney(ins.paidOut30d) + '</div><div class="s" style="color:var(--muted);font-size:13px;margin-top:4px;">' + fmtNum(ins.settlements30d) + ' settlements in the same window.</div></div>';
    var pct = Math.round(ins.paidShare30d * 100);
    $('flowBarFill').style.width = pct + '%';
    $('flowPaidPct').textContent = pct + '%';
    // Paired daily bars: put up (salmon) vs paid (magenta).
    var rows = DATA.chains['4217'].series['30d'];
    var max = 0;
    rows.forEach(function (r) { max = Math.max(max, money(r.rewardVolume), money(r.paidVolume)); });
    var W = 720, H = 150, n = rows.length, bw = W / n;
    var bars = rows.map(function (r, i) {
      var x = i * bw;
      var h1 = max ? (money(r.rewardVolume) / max) * (H - 24) : 0;
      var h2 = max ? (money(r.paidVolume) / max) * (H - 24) : 0;
      return '<rect x="' + (x + 1).toFixed(1) + '" y="' + (H - 20 - h1).toFixed(1) + '" width="' + Math.max(1, bw / 2 - 2).toFixed(1) + '" height="' + h1.toFixed(1) + '" fill="#d9a097"><title>' + r.bucket + ' put up ' + fmtMoney(money(r.rewardVolume)) + '</title></rect>' +
        '<rect x="' + (x + bw / 2 + 1).toFixed(1) + '" y="' + (H - 20 - h2).toFixed(1) + '" width="' + Math.max(1, bw / 2 - 2).toFixed(1) + '" height="' + h2.toFixed(1) + '" fill="#e74079"><title>' + r.bucket + ' paid ' + fmtMoney(money(r.paidVolume)) + '</title></rect>';
    }).join('');
    $('flowChart').innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daily rewards put up and paid out, last 30 days">' + bars +
      '<line x1="0" y1="' + (H - 20) + '" x2="' + W + '" y2="' + (H - 20) + '" stroke="#453e37"/>' +
      '<text x="0" y="' + (H - 4) + '" fill="#b0a79d" font-size="11" font-family="IBM Plex Mono, monospace">' + rows[0].bucket + '</text>' +
      '<text x="' + W + '" y="' + (H - 4) + '" fill="#b0a79d" font-size="11" font-family="IBM Plex Mono, monospace" text-anchor="end">' + rows[n - 1].bucket + '</text></svg>' +
      '<div class="chart-totals"><span><i style="display:inline-block;width:10px;height:10px;background:#d9a097;border-radius:2px;margin-right:5px;"></i>Put up</span><span><i style="display:inline-block;width:10px;height:10px;background:#e74079;border-radius:2px;margin-right:5px;"></i>Paid out</span><span>Daily, last 30 days. Amounts in stablecoin dollars.</span></div>';
    $('flowNote').innerHTML = 'Read it as a funnel, not a promise: rewards put up are escrowed when a task is posted; they reach a worker only when the requester accepts a result. In the last 30 days, <b>' + fmtMoney(ins.paidOut30d) + '</b> of <b>' + fmtMoney(ins.rewardsPutUp30d) + '</b> put up was paid out.';
  }

  // ---------- series chart ----------
  function lineChart(rows, field, moneyField) {
    var W = 720, H = 260, PL = 46, PR = 8, PT = 12, PB = 26;
    var vals = rows.map(function (r) { return moneyField ? money(r[field]) : (r[field] || 0); });
    var max = Math.max.apply(null, vals.concat([1]));
    max = max * 1.08;
    function X(i) { return PL + (i / Math.max(rows.length - 1, 1)) * (W - PL - PR); }
    function Y(v) { return PT + (1 - v / max) * (H - PT - PB); }
    var pts = vals.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
    var area = 'M' + PL + ',' + Y(0) + ' L' + pts.split(' ').join(' L') + ' L' + X(vals.length - 1).toFixed(1) + ',' + Y(0) + ' Z';
    var grid = [0, 0.5, 1].map(function (f) {
      var y = Y(max * f / 1.08);
      var label = moneyField ? fmtMoney(max * f / 1.08, 0) : fmtNum(Math.round(max * f / 1.08));
      return '<line x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + y.toFixed(1) + '" stroke="#453e37" stroke-width="1"/>' +
        '<text x="' + (PL - 6) + '" y="' + (y + 4).toFixed(1) + '" fill="#b0a79d" font-size="11" font-family="IBM Plex Mono, monospace" text-anchor="end">' + label + '</text>';
    }).join('');
    var first = rows[0].bucket, last = rows[rows.length - 1].bucket;
    var mid = rows[Math.floor(rows.length / 2)].bucket;
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Time series chart">' + grid +
      '<path d="' + area + '" fill="#e74079" opacity="0.14"/>' +
      '<polyline points="' + pts + '" fill="none" stroke="#e74079" stroke-width="2" stroke-linejoin="round"/>' +
      rows.map(function (r, i) {
        var v = moneyField ? money(r[field]) : (r[field] || 0);
        return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="2.4" fill="#efe9e2"><title>' + r.bucket + ': ' + (moneyField ? fmtMoney(v) : fmtNum(v)) + '</title></circle>';
      }).join('') +
      '<text x="' + PL + '" y="' + (H - 6) + '" fill="#b0a79d" font-size="11" font-family="IBM Plex Mono, monospace">' + first + '</text>' +
      '<text x="' + (W / 2) + '" y="' + (H - 6) + '" fill="#b0a79d" font-size="11" font-family="IBM Plex Mono, monospace" text-anchor="middle">' + mid + '</text>' +
      '<text x="' + (W - PR) + '" y="' + (H - 6) + '" fill="#b0a79d" font-size="11" font-family="IBM Plex Mono, monospace" text-anchor="end">' + last + '</text></svg>';
  }
  var METRIC_LABELS = {
    tasksCreated: 'Tasks posted', activeAgents: 'Active agents', rewardVolume: 'Rewards put up',
    paidVolume: 'Rewards paid', completedTasks: 'Completed tasks',
  };
  function renderSeries() {
    var rows = DATA.chains['4217'].series[state.range];
    var moneyField = state.metric === 'rewardVolume' || state.metric === 'paidVolume';
    $('seriesChart').innerHTML = lineChart(rows, state.metric, moneyField);
    var vals = rows.map(function (r) { return moneyField ? money(r[state.metric]) : (r[state.metric] || 0); });
    var total = vals.reduce(function (a, b) { return a + b; }, 0);
    var peak = rows.reduce(function (m, r) {
      var v = moneyField ? money(r[state.metric]) : (r[state.metric] || 0);
      return v > m.v ? { bucket: r.bucket, v: v } : m;
    }, { bucket: '', v: -1 });
    $('seriesTotals').innerHTML =
      '<span>Total in range: <b>' + (moneyField ? fmtMoney(total) : fmtNum(Math.round(total))) + '</b></span>' +
      '<span>Peak day: <b>' + peak.bucket + '</b> (' + (moneyField ? fmtMoney(peak.v) : fmtNum(peak.v)) + ')</span>' +
      '<span>Buckets: <b>' + rows.length + '</b></span>' +
      '<span>' + esc(METRIC_LABELS[state.metric]) + ' · platform-wide</span>';
    var tableRows = rows.map(function (r) {
      var v = moneyField ? money(r[state.metric]) : (r[state.metric] || 0);
      return '<tr><td>' + r.bucket + '</td><td>' + (moneyField ? fmtMoney(v) : fmtNum(v)) + '</td></tr>';
    }).join('');
    $('seriesTable').innerHTML = '<table><thead><tr><th>Bucket</th><th>' + esc(METRIC_LABELS[state.metric]) + '</th></tr></thead><tbody>' + tableRows + '</tbody></table>';
  }

  // ---------- breakdowns ----------
  function barRows(items, labelKey, max) {
    return items.map(function (it) {
      var pct = max ? Math.round((it.count / max) * 100) : 0;
      return '<div class="bar-row"><div class="bl">' + esc(it[labelKey]) + '</div>' +
        '<div class="bar-track"><i style="width:' + pct + '%"></i></div>' +
        '<div class="bv">' + fmtNum(it.count) + '</div></div>';
    }).join('');
  }
  function renderBreakdowns() {
    var bd = DATA.chains['4217'].breakdowns;
    function sorted(arr) { return arr.slice().sort(function (a, b) { return b.count - a.count; }); }
    var mode = sorted(bd.mode || []);
    var status = sorted(bd.status || []);
    var actor = sorted(bd.actorType || []);
    var maxMode = mode.length ? mode[0].count : 1;
    var maxStatus = status.length ? status[0].count : 1;
    $('breakdownGrid').innerHTML =
      '<div><h3>By mode</h3>' + barRows(mode, 'mode', maxMode) + '</div>' +
      '<div><h3>By status</h3>' + barRows(status, 'status', maxStatus) + '</div>' +
      '<div style="grid-column:1/-1;margin-top:14px;"><h3>By actor</h3>' + barRows(actor, 'actorType', actor.length ? actor[0].count : 1) + '</div>';
  }

  // ---------- heatmap ----------
  function renderHeatmap() {
    var heat = DATA.chains['4217'].heatmapHow;
    var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var max = heat.maxCount || 1;
    var cellMap = {};
    (heat.cells || []).forEach(function (c) { cellMap[c.row + ':' + c.col] = c.count; });
    function level(count) {
      if (!count) return 0;
      var f = count / max;
      return f > 0.66 ? 4 : f > 0.33 ? 3 : f > 0.12 ? 2 : 1;
    }
    var html = '<div class="heat"><div></div>';
    for (var h = 0; h < 24; h++) html += '<div class="hh">' + h + '</div>';
    for (var d = 0; d < 7; d++) {
      html += '<div class="dl">' + days[d] + '</div>';
      for (var hh = 0; hh < 24; hh++) {
        var count = cellMap[d + ':' + hh] || 0;
        html += '<div class="cell" data-v="' + level(count) + '" title="' + days[d] + ' ' + hh + ':00 UTC — ' + count + ' events"></div>';
      }
    }
    html += '</div>';
    $('heatGrid').innerHTML = html;
    var b = DATA.insights.busiest;
    $('busiestLabel').textContent = b ? 'Busiest: ' + b.day + ' ' + String(b.hour).padStart(2, '0') + ':00 UTC (' + fmtNum(b.count) + ' events)' : '';
    // Mode strip: one row per mode, one cell per day (last 30 days).
    var hm = DATA.chains['4217'].heatmapMode;
    var dates = hm.colKeys || [];
    var modes = hm.rowKeys || [];
    var mMax = hm.maxCount || 1;
    var mMap = {};
    (hm.cells || []).forEach(function (c) { mMap[c.row + '|' + c.col] = c.count; });
    var strip = modes.map(function (m) {
      var cells = dates.map(function (dt) {
        var count = mMap[m + '|' + dt] || 0;
        var f = count / mMax;
        var bg = count === 0 ? '#12100e' : f > 0.66 ? '#e74079' : f > 0.33 ? '#a92f4e' : f > 0.12 ? '#6b2233' : '#3a1420';
        return '<i style="background:' + bg + '" title="' + m + ' · ' + dt + ' — ' + count + ' tasks"></i>';
      }).join('');
      return '<div class="ms-row"><div class="bl">' + esc(m) + '</div><div class="ms-cells">' + cells + '</div></div>';
    }).join('');
    $('modeStrip').innerHTML = strip + '<p class="note">' + esc(dates[0] || '') + ' to ' + esc(dates[dates.length - 1] || '') + '. Each cell is one day; darker means more tasks that day.</p>';
  }

  // ---------- feed ----------
  var TYPE_LABELS = {
    task_submitted: 'Submission', task_created: 'Task posted', task_completed: 'Completed',
    settlement: 'Paid out', rating: 'Rated', task_claimed: 'Claimed', task_cancelled: 'Cancelled',
    task_expired: 'Expired', task_accepted: 'Accepted', bid_placed: 'Bid', pitch_submitted: 'Pitch',
  };
  function typeLabel(t) {
    if (TYPE_LABELS[t]) return TYPE_LABELS[t];
    return t.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function renderFeed() {
    var items = feedItems().slice(0, 20);
    if (!items.length) {
      $('feedList').innerHTML = '<li><div class="fb">No activity on this chain in the latest feed.</div></li>';
      return;
    }
    $('feedList').innerHTML = items.map(function (it) {
      var meta = (it.chainId === 4217 ? 'Tempo' : it.chainId === 8453 ? 'Base' : 'Chain ' + it.chainId) +
        ' · ' + shortAddr(it.actor) + (it.actorAgentId ? ' · Agent #' + it.actorAgentId : '') +
        (it.amount != null ? ' · ' + fmtMoney(money(it.amount)) : '') +
        (it.rating != null ? ' · ' + it.rating + '/5' : '');
      return '<li><div class="ft">' + timeAgo(it.timestamp) + '</div><div class="fb">' +
        '<div class="t"><span class="tag">' + esc(typeLabel(it.type)) + '</span>' + esc(it.taskTitle || it.taskId || '') + '</div>' +
        '<div class="m">' + esc(meta) + (it.referenceCode ? ' · ' + esc(it.referenceCode) : '') + '</div></div></li>';
    }).join('');
  }

  // ---------- posters ----------
  function renderPosters() {
    var key = state.chain === 'both' ? 'combined' : state.chain;
    var rows = DATA.postersPerWeek[key];
    var max = Math.max.apply(null, rows.map(function (r) { return r.distinctPosters; }).concat([1]));
    $('posterBars').innerHTML = rows.map(function (r) {
      var h = Math.max(2, Math.round((r.distinctPosters / max) * 100));
      return '<div class="pb"><b>' + r.distinctPosters + '</b><i style="height:' + h + '%"></i><span>' + r.week.slice(5) + '</span></div>';
    }).join('');
    var ins = DATA.insights;
    var top = ins.topPosters.map(function (p, i) {
      return '<tr><td class="mono">' + (i + 1) + '</td><td class="mono">' + shortAddr(p.address) + '</td><td class="num">' + fmtNum(p.count) + '</td><td class="num">' + fmtPct(p.share) + '</td></tr>';
    }).join('');
    $('topPosters').innerHTML = '<thead><tr><th>#</th><th>Poster address</th><th class="num">Tasks</th><th class="num">Share</th></tr></thead><tbody>' + top + '</tbody>';
    var surge = rows.reduce(function (m, r) { return r.distinctPosters > m.distinctPosters ? r : m; }, rows[0]);
    $('posterNote').innerHTML = 'Most posters post once or twice. The top poster put up <b>' + fmtNum(ins.topPosters[0].count) + '</b> tasks (' + fmtPct(ins.topPosters[0].share) + ' of all tasks), and the top five together account for <b>' + fmtPct(ins.topPosters.reduce(function (s, p) { return s + p.share; }, 0)) + '</b>. The busiest week for new posters was the week of <b>' + surge.week + '</b>, with <b>' + surge.distinctPosters + '</b> distinct posters. Addresses are shown shortened; no names are attached to any address.';
  }

  // ---------- newest ----------
  function renderNewest() {
    var rows = DATA.tasks.newestOpen.filter(function (t) {
      return state.chain === 'both' || String(t.chainId) === state.chain;
    }).slice(0, 12);
    $('newestTable').innerHTML = '<thead><tr><th>Task</th><th>Mode</th><th>Chain</th><th class="num">Reward</th><th class="num">Posted</th></tr></thead><tbody>' +
      rows.map(function (t) {
        return '<tr><td class="mono">' + esc(t.referenceCode) + '</td><td>' + esc(t.mode) + '</td><td>' + (t.chainId === 4217 ? 'Tempo' : 'Base') + '</td><td class="num">' + fmtMoney(money(t.reward)) + '</td><td class="num">' + timeAgo(t.createdAt) + '</td></tr>';
      }).join('') + '</tbody>';
  }

  // ---------- insights ----------
  function renderInsights() {
    var ins = DATA.insights;
    var top5share = ins.topPosters.reduce(function (s, p) { return s + p.share; }, 0);
    var surge = DATA.postersPerWeek.combined.reduce(function (m, r) { return r.distinctPosters > m.distinctPosters ? r : m; }, DATA.postersPerWeek.combined[0]);
    var cards = [
      { big: fmtPct(ins.completionRate) + ' <em>complete.</em>', p: '<b>' + fmtNum(ins.completed) + '</b> of <b>' + fmtNum(ins.totalTasks) + '</b> tasks ever posted ended completed. <b>' + fmtPct(ins.cancelledRate) + '</b> were cancelled.' },
      { big: fmtPct(top5share) + ' <em>from five.</em>', p: 'The top five posters put up <b>' + fmtPct(top5share) + '</b> of all tasks. The single biggest poster is <b class="mono">' + shortAddr(ins.topPosters[0].address) + '</b> with <b>' + fmtNum(ins.topPosters[0].count) + '</b> tasks.' },
      { big: fmtPct(ins.paidShare30d) + ' <em>paid out.</em>', p: 'Of <b>' + fmtMoney(ins.rewardsPutUp30d) + '</b> put up in the last 30 days, <b>' + fmtMoney(ins.paidOut30d) + '</b> reached workers. The rest is still escrowed, expired, or cancelled.' },
      { big: fmtNum(surge.distinctPosters) + ' <em>new posters.</em>', p: 'The week of <b>' + surge.week + '</b> brought <b>' + surge.distinctPosters + '</b> distinct posters, the most of any week in the last twelve. Posting comes in bursts, not a steady stream.' },
      { big: (ins.busiest ? ins.busiest.day.slice(0, 3) + ' ' + String(ins.busiest.hour).padStart(2, '0') + ':00 <em>UTC.</em>' : '—'), p: ins.busiest ? 'The busiest hour of the week, with <b>' + fmtNum(ins.busiest.count) + '</b> activity events in the last 30 days. The market does not sleep on weekends.' : '' },
      { big: fmtMoney(ins.medianOpenReward) + ' <em>median.</em>', p: 'Half of the tasks open right now offer <b>' + fmtMoney(ins.medianOpenReward) + '</b> or less. The median open reward is small; the big rewards are few.' },
    ];
    $('insightGrid').innerHTML = cards.map(function (c) {
      return '<div class="insight"><div class="big">' + c.big + '</div><p>' + c.p + '</p></div>';
    }).join('');
  }

  // ---------- methods ----------
  function renderMethods() {
    var eps = DATA.endpoints;
    var byPurpose = [
      ['Headline numbers', '/api/market/stats'],
      ['Tasks by status, mode and actor', '/api/stats/breakdowns'],
      ['Daily and weekly series', '/api/stats/platform-time-series'],
      ['Activity heatmaps', '/api/stats/activity-heatmap'],
      ['Live activity feed', '/api/stats/activity-feed'],
      ['Task list (posters per week, newest tasks)', '/api/tasks'],
    ];
    var lis = byPurpose.map(function (row) {
      var match = eps.filter(function (u) { return u.indexOf(row[1]) !== -1; });
      return '<li><b>' + row[0] + ':</b> <code>' + row[1] + '</code>' + (match.length ? ' — ' + match.length + ' calls this build (both chains).' : '') + '</li>';
    }).join('');
    $('methodsList').innerHTML = lis +
      '<li><b>Refresh:</b> the data is fetched server-side once an hour by a scheduled GitHub Action (<code>scripts/fetch.mjs</code>), then committed. The page reads the static file <code>data/data.json</code>; it makes no API calls from the browser, because the API blocks cross-origin browser requests.</li>' +
      '<li><b>Units:</b> reward and paid volumes arrive as raw smallest-unit strings. OUSD on Tempo and USDC on Base both use 6 decimals, so the page divides by 1,000,000 and shows dollars.</li>' +
      '<li><b>One series, not two:</b> the time series, breakdowns and heatmaps return the same numbers for Tempo and Base, so the page shows them once and labels them platform-wide. It never adds the two chains together for those views.</li>' +
      '<li><b>Headline split:</b> in market stats, registered workers, active agents (7d) and open tasks are the same on both chains; workers paid and active wallets differ per chain and are shown per chain.</li>' +
      '<li><b>Posters per week:</b> counted from the task list itself (requester address + created week, distinct per ISO week, last 12 weeks). A poster active on both chains counts once in the combined view.</li>' +
      '<li><b>Reproduce it:</b> run <code>node scripts/fetch.mjs</code> in the repo, or read <code>data/data.json</code> — every number on this page is in that file, next to the endpoints it came from.</li>' +
      '<li><b>What this page does not do:</b> no wallet connection, no login, no analytics or tracking, no names attached to addresses, no invented numbers.</li>';
  }

  function renderAll() {
    $('updatedAt').textContent = fmtDateTime(DATA.generatedAt);
    $('updatedChain').textContent = chainLabel();
    renderTiles();
    renderFlow();
    renderSeries();
    renderBreakdowns();
    renderHeatmap();
    renderFeed();
    renderPosters();
    renderNewest();
    renderInsights();
    renderMethods();
  }

  function bindSeg(id, key, cb) {
    $(id).addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      Array.prototype.forEach.call($(id).querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', 'false'); });
      btn.setAttribute('aria-pressed', 'true');
      state[key] = btn.getAttribute('data-' + key);
      cb();
    });
  }

  fetch('data/data.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (d) {
      DATA = d;
      bindSeg('chainSeg', 'chain', function () { renderTiles(); renderFeed(); renderPosters(); renderNewest(); $('updatedChain').textContent = chainLabel(); });
      bindSeg('rangeSeg', 'range', renderSeries);
      bindSeg('metricSeg', 'metric', renderSeries);
      renderAll();
    })
    .catch(function (e) {
      document.querySelector('main').insertAdjacentHTML('afterbegin',
        '<p class="error">The market data did not load (' + esc(e.message) + '). The last good build is still in <a href="data/data.json">data/data.json</a>.</p>');
    });
})();
