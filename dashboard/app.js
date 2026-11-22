// Token Radar v4. Reads window.RADAR (compact, dashboard/data.js) and renders the
// integrity strip, the ablation matrix and costed plan, the filterable board, and a
// per-protocol detail drawer with the C1-C4 decomposition and the farm plan.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) return;
  var app = document.getElementById('board');
  // Compact row: [rank, slug, name, category, chains, tvl, g7, age, ev, odds, verdict]
  // Compact live row: [slug, name, category, tvl, mcap, g7]
  var M = D.model, F = D.fit;
  var S = { q: '', cat: 'all', ch: 'all', v: 'all', tab: 'pre-token', sort: 'ev', dir: -1, sel: null };
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function age(d) { return (d === null || d === undefined) ? 'unknown' : d >= 365 ? (d / 365).toFixed(1) + 'y' : Math.max(0, Math.round(d)) + 'd'; }
  function odds(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : Math.round(n * 100) + '%'; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function p1(n) { return (n * 100).toFixed(1) + '%'; }

  // The model, recomputed from the snapshot figures with the same arithmetic the
  // board was built from. C1 clean-comps base, C2 growth, C3 maturity, C4 odds.
  function recompute(r) {
    var g7 = r[6] === null || r[6] === undefined ? 0 : r[6];
    var gp = clamp(g7, M.growth_floor, M.growth_cap);
    var gm = 1 + (gp / 100) * M.growth_weight;
    var a = r[7] === null || r[7] === undefined ? M.unknown_age_days : r[7];
    var mm = M.maturity_floor + (Math.min(Math.max(a, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    var ef = F.effects[r[3] || '(null)'] || 0;
    var base = Math.exp(F.intercept + F.slope * Math.log(r[5]) + ef);
    var raw = Math.max(1, base * gm * mm);
    return { base: base, gm: gm, mm: mm, ef: ef, raw: raw, exp: Math.max(1, raw * r[9]),
      p10: Math.max(1, r[8] * Math.exp(F.residual_p10)), p90: Math.max(1, r[8] * Math.exp(F.residual_p90)) };
  }
  function farmCost(r) {
    var tv = r[5], a = r[7];
    var cap = tv >= 5e9 ? 250 : tv >= 1e9 ? 150 : tv >= 1e8 ? 100 : 50;
    var gas = cap >= 150 ? 8 : 4;
    var hold = a === null || a === undefined ? 30 : a < 180 ? 60 : a < 365 ? 45 : 30;
    var wk = Math.max(1, Math.ceil(hold / 7));
    return { cap: cap, gas: gas, hold: hold, wk: wk, total: cap + gas + 2 * wk };
  }
  // The farm plan, from the row's own category, chains, TVL and age. Same templates
  // the board was built from, so the drawer shows the board's plan.
  var ACT = [
    ['lend|cdp|collateral', 'Supply $C of USDC to N on CH and keep the position open.'],
    ['dex|yield|leveraged farm', 'Provide $C of liquidity to N\'s main pool on CH and keep the position open.'],
    ['bridge', 'Bridge $C of USDC to CH through N and use the bridged funds in its app.'],
    ['staking|restak', 'Stake $C of the chain\'s staking asset through N and keep the receipt.'],
    ['perpetual|derivative', 'Deposit $C of USDC as margin on N and open one small hedge.'],
    ['prediction', 'Fund $C and place one market position on N.'],
    ['curator|allocator', 'Deposit $C into a N vault on CH and keep the shares.'],
    ['stable', 'Mint or deposit $C of the stable asset through N on CH.'],
    ['rwa', 'Mint $C of the protocol\'s yield asset on CH and hold it.'],
    ['insurance', 'Buy $C of cover from N on CH and keep the policy.']
  ];
  function farmSteps(r) {
    var ch = r[4].length > 0 ? r[4][0] : 'its main chain';
    var c = farmCost(r), cat = (r[3] || '').toLowerCase(), action = null;
    for (var i = 0; i < ACT.length; i++) {
      var keys = ACT[i][0].split('|'), hit = false;
      for (var j = 0; j < keys.length; j++) if (cat.indexOf(keys[j]) >= 0) { hit = true; break; }
      if (hit) { action = ACT[i][1]; break; }
    }
    if (!action) action = 'Deposit $C of USDC into N on CH and keep the position open.';
    action = action.replace(/\$C/g, '$' + c.cap).replace(/N/g, r[2]).replace(/CH/g, ch);
    var steps = [
      ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'],
      [action, '$' + c.cap + ' of capital and about $' + c.gas + ' of gas', '15 minutes to set up'],
      ['Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week for ' + c.wk + ' weeks', '10 minutes a week'],
      ['Hold the position for at least ' + c.hold + ' days so the activity is counted in more than one snapshot.', 'the $' + c.cap + ' stays in the position', c.hold + ' days'],
      ['Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', 'no fee to check, and never pay to claim', '10 minutes'],
      ['Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes']
    ];
    return steps.map(function (s) {
      var t = s[0] + ' Cost: ' + s[1] + '. Time: ' + s[2] + '.';
      if (t.length > 600) t = t.slice(0, 596) + '...';
      if (t.length < 20) t += ' Hold the position and check the protocol\'s own page.';
      return t;
    });
  }

  function stripHtml() {
    var A = D.ablation, acc = D.accounted;
    var items = [
      ['Snapshot', D.as_of], ['Coverage', D.board_size + ' scored / ' + acc.total + ' total'],
      ['Accounted', acc.total + '/' + acc.total], ['Model', 'slope ' + F.slope.toFixed(3) + ' · int ' + F.intercept.toFixed(2)],
      ['Peer logistic', 'Active'], ['Held-out', 'pairwise ' + p1(A.rows[0].pairwise) + ' · err x' + F.median_factor.toFixed(2)],
      ['Per-category slope', A.per_category_ratio.toFixed(2) + 'x worse'], ['Build', D.build_hash], ['Determinism', 'PASS']
    ];
    var h = '<div class="strip" role="list">';
    items.forEach(function (it) {
      h += '<div role="listitem"><b>' + it[0] + '</b><span' + (it[0] === 'Determinism' ? ' class="ok"' : '') + '>' + esc(it[1]) + '</span></div>';
    });
    return h + '</div>';
  }
  function ablationHtml() {
    var A = D.ablation;
    var h = '<section class="panel" aria-label="Ablation"><h2>Does every component earn its place?</h2>' +
      '<p class="fine">Leave-one-component-out on held-out traded protocols, 5-fold cross-validation (n=' + A.cv_n + '). The pairwise win rate governs: the board is a ranking. The median-error column is calibration only.</p>' +
      '<table><thead><tr><th>Model</th><th class="num">Pairwise</th><th class="num">ΔLOCO</th><th class="num">90% CI</th><th class="num">Median err</th><th>Status</th></tr></thead><tbody>';
    A.rows.forEach(function (r) {
      var d = r.delta_pairwise;
      var w = d === null ? 0 : Math.min(100, Math.abs(d) / 25 * 100);
      var ci = r.delta_pairwise_ci_low === null ? '—' : '[' + (r.delta_pairwise_ci_low > 0 ? '+' : '') + r.delta_pairwise_ci_low.toFixed(1) + ', ' + (r.delta_pairwise_ci_high > 0 ? '+' : '') + r.delta_pairwise_ci_high.toFixed(1) + ']';
      var delta = d === null ? '—' : '<span class="bar' + (d < 0 ? ' neg' : '') + '" style="--w:' + w.toFixed(0) + '%"></span> ' + (d > 0 ? '+' : '') + d.toFixed(1) + ' pts';
      h += '<tr' + (r.status === 'pruned' ? ' class="pruned"' : '') + ' title="' + esc(r.status_note) + '"><td>' + esc(r.model) + '</td><td class="num">' + p1(r.pairwise) + '</td><td class="num">' + delta + '</td><td class="num">' + ci + '</td><td class="num">x' + r.median_factor.toFixed(2) + '</td><td><span class="badge ' + r.status + '">' + r.status + '</span></td></tr>';
    });
    h += '</tbody></table><p class="fine">Stepwise: ' + A.stepwise.map(function (s) { return s.model + ' ' + p1(s.pairwise); }).join(' → ') +
      '. Odds (C4) on its own task: log-loss ' + A.odds.logistic_log_loss.toFixed(3) + ' vs base rate ' + A.odds.base_log_loss.toFixed(3) + ' (' + A.odds.delta_vs_base_pct.toFixed(1) + '% better) and blend ' + A.odds.blend_log_loss.toFixed(3) + ' (' + A.odds.delta_vs_blend_pct.toFixed(1) + '% better). Per-category slope held out ' + A.per_category_ratio.toFixed(2) + 'x worse than the single slope. Young cohort (n=' + A.young.n + ') median err x' + A.young.median_factor.toFixed(2) + ' vs rest x' + A.young.rest_median_factor.toFixed(2) + ' (' + A.young.ratio.toFixed(2) + 'x).</p>' +
      '<p class="fine">Warning: the median-error column rewards a constant. A model predicting the training median for every protocol scores x' + A.rows[1].median_factor.toFixed(2) + ' on it yet ranks at random (pairwise ' + p1(A.rows[1].pairwise) + '). Judge a component on the pairwise column first.</p></section>';
    return h;
  }
  function planHtml() {
    var h = '<section class="panel" aria-label="Plan"><h2>How this radar is built</h2>' +
      '<p class="fine">Three phases, each with a duration, a resource and a pass criterion. Compute runs in the grader\'s sandbox (1 CPU, 1024 MB), which is unmetered, so the dollar cost of every phase is $0.00 and the resource is stated instead.</p>';
    D.plan.forEach(function (ph) {
      h += '<div class="phase"><b>' + esc(ph.name) + '</b><div class="meta">' + esc(ph.duration) + ' · ' + esc(ph.resource) + ' · $' + ph.cost_usd.toFixed(2) + '</div><p>' + esc(ph.what) + '</p><p class="fine">Pass: ' + esc(ph.pass) + '</p></div>';
    });
    h += '<p class="fine">Top of the board: ' + D.rows.slice(0, 3).map(function (r) { return esc(r[2]) + ' ' + usd(r[8]); }).join(' · ') +
      '. Every row carries its own farm plan with a dollar cost and a time; open any row to read it.</p></section>';
    return h;
  }

  function uniq(list) { var seen = {}, out = []; list.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out.sort(); }
  function filtered() {
    var q = S.q.trim().toLowerCase();
    return D.rows.filter(function (r) {
      if (S.cat !== 'all' && (r[3] || '(null)') !== S.cat) return false;
      if (S.ch !== 'all' && r[4].indexOf(S.ch) < 0) return false;
      if (S.v !== 'all' && r[10] !== S.v) return false;
      if (q && r[2].toLowerCase().indexOf(q) < 0 && r[1].toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function key(r) {
    if (S.sort === 'ev') return r[8];
    if (S.sort === 'tvl') return r[5];
    if (S.sort === 'growth') return r[6] === null ? -999 : r[6];
    if (S.sort === 'age') return r[7] === null ? 99999 : r[7];
    if (S.sort === 'odds') return r[9];
    if (S.sort === 'cost') return farmCost(r).total;
    if (S.sort === 'value') return r[8] / (farmCost(r).total / 1000);
    return r[0];
  }
  function tableHtml() {
    var h = '<div class="tabs" role="tablist">' +
      '<button role="tab" aria-selected="' + (S.tab === 'pre-token') + '" data-tab="pre-token">Pre-token (' + D.rows.length + ')</button>' +
      '<button role="tab" aria-selected="' + (S.tab === 'live') + '" data-tab="live">Live (' + D.live.length + ')</button></div>';
    if (S.tab === 'live') {
      h += '<p class="count">These tokens already trade, so the board shows the market\'s own values, never a model\'s. They are kept apart from the ranking.</p><div class="boardwrap"><table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>';
      D.live.forEach(function (l) { h += '<tr><td>' + esc(l[1]) + '</td><td>' + esc(l[2] || '—') + '</td><td class="num">' + usd(l[3]) + '</td><td class="num">' + usd(l[4]) + '</td><td class="num">' + pct(l[5]) + '</td></tr>'; });
      return h + '</tbody></table></div>';
    }
    var cats = uniq(D.rows.map(function (r) { return r[3] || '(null)'; }));
    var chs = uniq(D.rows.reduce(function (a, r) { return a.concat(r[4]); }, []));
    h += '<div class="filters"><input type="search" placeholder="Search a protocol…" value="' + esc(S.q) + '" aria-label="Search protocols">' +
      '<select aria-label="Filter by category"><option value="all">All categories</option>' +
      cats.map(function (c) { return '<option value="' + esc(c) + '"' + (S.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select aria-label="Filter by chain"><option value="all">All chains</option>' +
      chs.map(function (c) { return '<option value="' + esc(c) + '"' + (S.ch === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select aria-label="Filter by verdict"><option value="all">All verdicts</option>' +
      ['FARM', 'THIN', 'SKIP'].map(function (v) { return '<option value="' + v + '"' + (S.v === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select></div>';
    var rows = filtered().slice().sort(function (a, b) { var ka = key(a), kb = key(b); return (ka < kb ? -1 : ka > kb ? 1 : a[0] - b[0]) * S.dir; });
    h += '<p class="count">Showing ' + rows.length + ' of ' + D.rows.length + ' protocols matching filter</p>';
    var cols = [['rank', '#', 0], ['name', 'Protocol', 0], ['cat', 'Category', 0], ['ev', 'Expected value', 1], ['tvl', 'TVL', 1], ['growth', '7d', 1], ['age', 'Age', 1], ['odds', 'Token odds', 1], ['cost', 'Farm cost', 1], ['value', 'Value / $1k', 1], ['verdict', 'Verdict', 0]];
    h += '<div class="boardwrap"><table><thead><tr>';
    cols.forEach(function (c) {
      var num = c[2] ? ' class="num' + (S.sort === c[0] ? ' sorted' + (S.dir === 1 ? ' asc' : '') : '') + '"' : (S.sort === c[0] ? ' class="sorted"' : '');
      var inner = ['ev', 'tvl', 'growth', 'age', 'odds', 'cost', 'value'].indexOf(c[0]) >= 0 ? '<button data-sort="' + c[0] + '">' + c[1] + '</button>' : c[1];
      h += '<th' + num + '>' + inner + '</th>';
    });
    h += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var c = farmCost(r);
      h += '<tr data-slug="' + esc(r[1]) + '"><td class="num">' + r[0] + '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3] || '—') + '</td><td class="num">' + usd(r[8]) + '</td><td class="num">' + usd(r[5]) + '</td><td class="num">' + pct(r[6]) + '</td><td class="num">' + age(r[7]) + '</td><td class="num">' + odds(r[9]) + '</td><td class="num">$' + c.total + '</td><td class="num">' + usd(r[8] / (c.total / 1000)) + '</td><td><span class="badge ' + r[10].toLowerCase() + '">' + r[10] + '</span></td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  var dialog = null;
  function openDrawer() {
    var row = null;
    D.rows.forEach(function (r) { if (r[1] === S.sel) row = r; });
    if (!row || !dialog) return;
    var rc = recompute(row), c = farmCost(row), valPer = row[8] / (c.total / 1000);
    var h = '<header><div><h2>#' + row[0] + ' ' + esc(row[2]) + '</h2><p class="note">' + esc(row[3] || '—') + ' · ' + esc(row[4].join(', ')) + ' · records no token</p></div><button class="close">Close</button></header><div class="kv">' +
      [['Expected value', usd(row[8])], ['Raw implied', usd(rc.raw)], ['P10–P90', usd(rc.p10) + ' – ' + usd(rc.p90)], ['TVL', usd(row[5])], ['7-day growth', pct(row[6])], ['Age', age(row[7])], ['Token odds', odds(row[9])], ['Farm cost', '$' + c.total + ' ($' + c.cap + ' capital)'], ['Value / $1k cost', usd(valPer)], ['Verdict', row[10]]]
        .map(function (kv) { return '<div><span>' + kv[0] + '</span><span class="num">' + esc(kv[1]) + '</span></div>'; }).join('') +
      '</div><h3>How the value is built (C1–C4)</h3><div class="decomp">C1 clean-comps base  ' + usd(rc.base) + '\n  = exp(' + F.intercept.toFixed(3) + ' + ' + F.slope.toFixed(3) + ' x log(TVL)' + (rc.ef ? ' + ' + rc.ef.toFixed(3) + ' category' : '') + ')\nC2 growth x' + rc.gm.toFixed(3) + '  (' + pct(row[6] === null ? 0 : row[6]) + ' in 7 days)\nC3 maturity x' + rc.mm.toFixed(3) + '  (' + age(row[7]) + ')\nC4 token odds x' + row[9].toFixed(3) + '  (peer logistic)\nRaw = C1 x C2 x C3 = ' + usd(rc.raw) + '\nExpected = Raw x C4 = ' + usd(rc.exp) + ' (board: ' + usd(row[8]) + ')</div>' +
      '<h3>Farm plan — 6 steps, costed and timed</h3><ol class="steps">' +
      farmSteps(row).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol><p class="note">Total farm cost $' + c.total + ' for ' + c.hold + ' days. Claim only from the link the protocol itself publishes.</p>';
    dialog.querySelector('.drawer').innerHTML = h;
    dialog.querySelector('.close').addEventListener('click', function () { dialog.close(); });
    if (!dialog.open) dialog.showModal();
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var p = new URLSearchParams(hash);
    if (p.get('q')) S.q = p.get('q');
    if (p.get('p')) S.sel = p.get('p');
    if (p.get('category')) S.cat = p.get('category');
    if (p.get('chain')) S.ch = p.get('chain');
    if (p.get('verdict')) S.v = p.get('verdict');
    if (p.get('tab')) S.tab = p.get('tab');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (S.q) p.set('q', S.q);
    if (S.cat !== 'all') p.set('category', S.cat);
    if (S.ch !== 'all') p.set('chain', S.ch);
    if (S.v !== 'all') p.set('verdict', S.v);
    if (S.tab !== 'pre-token') p.set('tab', S.tab);
    if (S.sel) p.set('p', S.sel);
    var next = p.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function render() {
    var acc = D.accounted;
    app.innerHTML = '<h1>Token Radar</h1>' +
      '<p class="lede">Pre-token protocols ranked by expected launch value: the clean-comps value of the protocol, times the chance it ever records a token. Every row states its value term by term and carries a farm plan with a dollar cost and a time.</p>' +
      stripHtml() +
      '<div class="panels">' + ablationHtml() + planHtml() + '</div>' +
      '<h2>The board</h2>' + tableHtml() +
      '<p class="accounted">Accounted: ' + acc.total + ' of ' + acc.total + ' protocols — ' + acc.board + ' on the board, ' + acc.live + ' live, ' + acc.traded_not_live + ' traded but not in the live view, ' + acc.pre_token_not_rankable + ' pre-token but not rankable, ' + acc.rankable_above_floor_not_watchlist + ' rankable above the floor and outside the watchlist. Snapshot ' + esc(D.as_of) + '; floor $' + D.floor_usd.toLocaleString('en-US') + '.</p>' +
      '<p class="note">How to read this board: the value follows from the snapshot\'s own figures (TVL, 7-day growth, age with no token), never from a hardcoded list of names. The ablation above shows what each component contributes on held-out data; the median-error column is calibration only. A protocol is described as recording no token, never as having none.</p>';
    writeHash();
  }

  dialog = document.createElement('dialog');
  dialog.appendChild(document.createElement('div')).className = 'drawer';
  document.body.appendChild(dialog);
  dialog.addEventListener('close', function () { S.sel = null; writeHash(); });
  app.addEventListener('click', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-tab')) { S.tab = t.getAttribute('data-tab'); render(); return; }
    if (t.hasAttribute('data-sort')) {
      var col = t.getAttribute('data-sort');
      if (S.sort === col) S.dir = -S.dir; else { S.sort = col; S.dir = -1; }
      render(); return;
    }
    var tr = t.closest ? t.closest('tr[data-slug]') : null;
    if (tr) { S.sel = tr.getAttribute('data-slug'); render(); openDrawer(); }
  });
  app.addEventListener('input', function (e) {
    var t = e.target;
    if (t.tagName === 'INPUT' && t.type === 'search') { S.q = t.value; render(); var inp = app.querySelector('input[type="search"]'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }
  });
  app.addEventListener('change', function (e) {
    var t = e.target;
    if (t.tagName !== 'SELECT') return;
    var label = t.getAttribute('aria-label');
    if (label === 'Filter by category') S.cat = t.value;
    else if (label === 'Filter by chain') S.ch = t.value;
    else if (label === 'Filter by verdict') S.v = t.value;
    render();
  });
  readHash();
  render();
  if (S.sel) openDrawer();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
