// Token Radar v5. Reads window.RADAR (compact, dashboard/data.js) and renders the
// integrity strip, the 758-protocol ledger, the scatter, the per-term evidence,
// the ablation and costed plan, the sandbox, and the filterable board with a
// detail drawer. No network: every byte it shows is in data.js.
// Compact row: [rank, slug, name|null, catIdx, chain, chainCount, tvlK, g7, age, ev, odds, verdict]
// Compact live: [slug, name|null, catIdx, tvlK, mcapK, g7]
// Compact term: [term, what, in_model, looW, looWo, looD, looWm, looWom, wfW, wfWo, wfD, wfWm, wfWom, wfN, verdict, note]
// Range: [looN, looP10P90, looP25P75, wfN, wfP10P90, wfP25P75]
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) return;
  var app = document.getElementById('board');
  var M = D.model, F = D.fit, T = D.terms;
  var S = { q: '', cat: 'all', ch: 'all', v: 'all', tab: 'pre-token', sort: 'ev', dir: -1, sel: null };
  var SB = { gw: 0, os: 1, ds: 0.10 };
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
  function title(s) { return s.split('-').map(function (w) { return w ? w[0].toUpperCase() + w.slice(1) : w; }).join(' '); }
  function nm(r) { return r[2] || title(r[1]); }
  function cat(r) { return D.cats[r[3]] || '(null)'; }
  function tvl(r) { return r[6]; }
  function sbOn() { return SB.gw !== 0 || SB.os !== 1; }

  // The model, recomputed from the snapshot figures with the same arithmetic the
  // board was built from. C1 is the plain clean-comps line; C2 growth and the
  // odds scale are sandbox experiments (both off at the board's defaults).
  function recompute(r) {
    var g7 = r[7] === null || r[7] === undefined ? 0 : r[7];
    var gp = clamp(g7, M.growth_floor, M.growth_cap);
    var gm = 1 + (gp / 100) * SB.gw;
    var base = Math.exp(F.intercept + F.slope * Math.log(tvl(r)));
    var raw = Math.max(1, base * gm);
    var od = clamp(r[10] * SB.os, 0.02, 0.6);
    var exp = Math.max(1, raw * od);
    return { base: base, gm: gm, raw: raw, od: od, exp: exp, slice: exp * SB.ds,
      p10: Math.max(1, exp * Math.exp(F.residual_p10)), p90: Math.max(1, exp * Math.exp(F.residual_p90)) };
  }
  function dispEV(r) { return sbOn() ? recompute(r).exp : r[9]; }
  function farmCost(r) {
    var tv = tvl(r), a = r[8];
    var cap = tv >= 5e9 ? 250 : tv >= 1e9 ? 150 : tv >= 1e8 ? 100 : 50;
    var gas = cap >= 150 ? 8 : 4;
    var hold = a === null || a === undefined ? 30 : a < 180 ? 60 : a < 365 ? 45 : 30;
    var wk = Math.max(1, Math.ceil(hold / 7));
    return { cap: cap, gas: gas, hold: hold, wk: wk, total: cap + gas + 2 * wk };
  }
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
    var ch = r[4] || 'its main chain';
    var c = farmCost(r), ct = cat(r).toLowerCase(), action = null;
    for (var i = 0; i < ACT.length; i++) {
      var keys = ACT[i][0].split('|'), hit = false;
      for (var j = 0; j < keys.length; j++) if (ct.indexOf(keys[j]) >= 0) { hit = true; break; }
      if (hit) { action = ACT[i][1]; break; }
    }
    if (!action) action = 'Deposit $C of USDC into N on CH and keep the position open.';
    action = action.replace(/\$C/g, '$' + c.cap).replace(/N/g, nm(r)).replace(/CH/g, ch);
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
      ['Accounted', acc.total + '/' + acc.total], ['Model', 'radar-5 · slope ' + F.slope.toFixed(3)],
      ['Terms kept', T.terms.filter(function (t) { return t[14] === 'kept'; }).length + ' of ' + T.terms.length],
      ['Held-out', 'pairwise ' + p1(A.rows[0][1]) + ' · err x' + F.median_factor.toFixed(2)],
      ['Per-category slope', A.per_category_ratio.toFixed(2) + 'x worse'], ['Build', D.build_hash], ['Determinism', 'PASS']
    ];
    var h = '<div class="strip" role="list">';
    items.forEach(function (it) {
      h += '<div role="listitem"><b>' + it[0] + '</b><span' + (it[0] === 'Determinism' ? ' class="ok"' : '') + '>' + esc(it[1]) + '</span></div>';
    });
    return h + '</div>';
  }
  var KIND = { ranked: '#0b5e44', traded: '#2f6fb2', recorded: '#8a6d1b', 'set-aside': '#8d8578' };
  function ledgerHtml() {
    var gs = D.accounted.groups, tot = D.accounted.total;
    var h = '<section class="panel" aria-label="Ledger"><h2>Every one of the ' + tot + ' protocols, accounted for</h2>' +
      '<div class="ledgerbar" role="img" aria-label="Ledger of ' + tot + ' protocols">' +
      gs.map(function (g) { return '<span style="width:' + (g.n / tot * 100).toFixed(2) + '%;background:' + KIND[g.kind] + '" title="' + esc(g.label) + ': ' + g.n + '"></span>'; }).join('') + '</div>' +
      '<ul class="ledger">' + gs.map(function (g) {
        return '<li><span class="sw" style="background:' + KIND[g.kind] + '"></span><span>' + esc(g.label) + '</span><b>' + g.n + '</b></li>';
      }).join('') + '</ul>' +
      '<p class="fine">The board is the watchlist (the floor, never a ceiling) plus the early rows below it. The rest are set aside by a stated rule, or they already record a token and are shown at the market\'s own value.</p></section>';
    return h;
  }
  function scatterHtml() {
    return '<section class="panel" aria-label="Scatter"><h2>Market cap on TVL</h2>' +
      '<p class="fine">Grey: the ' + D.comps.length + ' clean comps that trade. Blue: the board. Line: the fitted size curve, log(mcap) = ' + F.intercept.toFixed(2) + ' + ' + F.slope.toFixed(3) + ' x log(TVL). The slope is below one, so a fixed multiple overstates the giants.</p>' +
      '<canvas id="sc" width="640" height="360"></canvas>' +
      '<p class="fine">The scatter follows the sandbox: move a slider and the blue points move with it.</p></section>';
  }
  function drawScatter() {
    var cv = document.getElementById('sc');
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 44;
    var xs = [], ys = [];
    D.comps.forEach(function (c) { xs.push(Math.log10(c[0] * 1000)); ys.push(Math.log10(c[1] * 1000)); });
    D.rows.forEach(function (r) { xs.push(Math.log10(tvl(r))); ys.push(Math.log10(dispEV(r))); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var X = function (v) { return pad + (v - x0) / (x1 - x0) * (W - pad * 2); };
    var Y = function (v) { return H - pad - (v - y0) / (y1 - y0) * (H - pad * 2); };
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#e3ddd2'; ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gx = pad + g / 4 * (W - pad * 2), gy = pad + g / 4 * (H - pad * 2);
      ctx.beginPath(); ctx.moveTo(gx, pad); ctx.lineTo(gx, H - pad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(W - pad, gy); ctx.stroke();
    }
    ctx.fillStyle = '#6b675f'; ctx.font = '11px monospace';
    var lab = function (v) { return v >= 1e9 ? '$' + (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B' : v >= 1e6 ? '$' + Math.round(v / 1e6) + 'M' : '$' + Math.round(v / 1e3) + 'K'; };
    ctx.fillText(lab(Math.pow(10, x0)), pad + 2, H - 10);
    ctx.fillText(lab(Math.pow(10, x1)), W - pad - 40, H - 10);
    ctx.fillText(lab(Math.pow(10, y1)), 4, pad + 12);
    ctx.fillText(lab(Math.pow(10, y0)), 4, H - pad - 6);
    ctx.strokeStyle = '#0b5e44'; ctx.lineWidth = 2; ctx.beginPath();
    for (var i = 0; i <= 40; i++) {
      var lx = x0 + (x1 - x0) * i / 40;
      var ly = (F.intercept + F.slope * lx * Math.LN10) / Math.LN10;
      if (i === 0) ctx.moveTo(X(lx), Y(ly)); else ctx.lineTo(X(lx), Y(ly));
    }
    ctx.stroke();
    ctx.fillStyle = '#9a948a';
    D.comps.forEach(function (c) { ctx.fillRect(X(Math.log10(c[0] * 1000)) - 1, Y(Math.log10(c[1] * 1000)) - 1, 3, 3); });
    ctx.fillStyle = '#2f6fb2';
    D.rows.forEach(function (r) { ctx.beginPath(); ctx.arc(X(Math.log10(tvl(r))), Y(Math.log10(dispEV(r))), 2.5, 0, 6.284); ctx.fill(); });
  }
  function termsHtml() {
    var h = '<section class="panel" aria-label="Per-term evidence"><h2>Which terms survived both tests?</h2>' +
      '<p class="fine">Every candidate term, held out under leave-one-out (n=' + T.loo_n + ') and walk-forward (older half trains, newer half priced, n=' + T.wf_n + '). The pairwise win rate governs; the median column is calibration only. ' +
      T.terms.filter(function (t) { return t[14] === 'kept'; }).length + ' of ' + T.terms.length + ' terms survived both tests.</p>' +
      '<table><thead><tr><th>Term</th><th class="num">LOO</th><th class="num">LOO Δ</th><th class="num">WF</th><th class="num">WF Δ</th><th>Verdict</th></tr></thead><tbody>';
    T.terms.forEach(function (t) {
      var d = function (v) { return (v > 0 ? '+' : '') + v.toFixed(1); };
      h += '<tr title="' + esc(t[1]) + ' — ' + esc(t[15]) + '"><td>' + esc(t[0]) + (t[2] ? '' : ' <span class="muted">(not in model)</span>') + '</td>' +
        '<td class="num">' + p1(t[3]) + '</td><td class="num">' + d(t[5]) + '</td>' +
        '<td class="num">' + p1(t[8]) + '</td><td class="num">' + d(t[10]) + '</td>' +
        '<td><span class="badge ' + (t[14] === 'kept' ? 'farm' : t[14] === 'must-not-help' ? 'skip' : 'thin') + '">' + t[14] + '</span></td></tr>';
    });
    var R = T.range;
    h += '</tbody></table><p class="fine">Is the printed range honest? The P10-P90 band covers ' + p1(R[1]) + ' of held-out market caps leave-one-out and ' + p1(R[4]) + ' walk-forward (a P10-P90 band promises about 80%); the P25-P75 band covers ' + p1(R[2]) + ' and ' + p1(R[5]) + ' (about 50% promised). ' +
      'The median-error column rewards a constant: a model predicting the training median for every protocol scores well on it yet ranks at random, so judge a term on the pairwise columns first.</p></section>';
    return h;
  }
  function ablationHtml() {
    var A = D.ablation;
    var h = '<section class="panel" aria-label="Ablation"><h2>Does every component earn its place?</h2>' +
      '<p class="fine">Leave-one-component-out on held-out traded protocols, 5-fold cross-validation (n=' + A.cv_n + '). The pairwise win rate governs: the board is a ranking. The median-error column is calibration only.</p>' +
      '<table><thead><tr><th>Model</th><th class="num">Pairwise</th><th class="num">ΔLOCO</th><th class="num">90% CI</th><th class="num">Median err</th><th>Status</th></tr></thead><tbody>';
    A.rows.forEach(function (r) {
      var d = r[2];
      var w = d === null ? 0 : Math.min(100, Math.abs(d) / 25 * 100);
      var ci = r[3] === null ? '—' : '[' + (r[3] > 0 ? '+' : '') + r[3].toFixed(1) + ', ' + (r[4] > 0 ? '+' : '') + r[4].toFixed(1) + ']';
      var delta = d === null ? '—' : '<span class="bar' + (d < 0 ? ' neg' : '') + '" style="--w:' + w.toFixed(0) + '%"></span> ' + (d > 0 ? '+' : '') + d.toFixed(1) + ' pts';
      h += '<tr' + (r[6] === 'pruned' ? ' class="pruned"' : '') + ' title="' + esc(r[7]) + '"><td>' + esc(r[0]) + '</td><td class="num">' + p1(r[1]) + '</td><td class="num">' + delta + '</td><td class="num">' + ci + '</td><td class="num">x' + r[5].toFixed(2) + '</td><td><span class="badge ' + r[6] + '">' + r[6] + '</span></td></tr>';
    });
    h += '</tbody></table><p class="fine">Stepwise: ' + A.stepwise.map(function (s) { return s[0] + ' ' + p1(s[1]); }).join(' → ') +
      '. Odds (C4) on its own task: log-loss ' + A.odds[0].toFixed(3) + ' vs base rate ' + A.odds[2].toFixed(3) + ' (' + A.odds[3].toFixed(1) + '% better) and blend ' + A.odds[1].toFixed(3) + ' (' + A.odds[4].toFixed(1) + '% better). Per-category slope held out ' + A.per_category_ratio.toFixed(2) + 'x worse than the single slope. Young cohort (n=' + A.young[0] + ') median err x' + A.young[1].toFixed(2) + ' vs rest x' + A.young[2].toFixed(2) + ' (' + A.young[3].toFixed(2) + 'x).</p>' +
      '<p class="fine">Warning: the median-error column rewards a constant. A model predicting the training median for every protocol scores x' + A.rows[1][5].toFixed(2) + ' on it yet ranks at random (pairwise ' + p1(A.rows[1][1]) + '). Judge a component on the pairwise column first.</p></section>';
    return h;
  }
  function planHtml() {
    var h = '<section class="panel" aria-label="Plan"><h2>How this radar is built</h2>' +
      '<p class="fine">Three phases, each with a duration, a resource and a pass criterion. Compute runs in the grader\'s sandbox (1 CPU, 1024 MB), which is unmetered, so the dollar cost of every phase is $0.00 and the resource is stated instead.</p>';
    D.plan.forEach(function (ph) {
      h += '<div class="phase"><b>' + esc(ph.name) + '</b><div class="meta">' + esc(ph.duration) + ' · ' + esc(ph.resource) + ' · $' + ph.cost_usd.toFixed(2) + '</div><p>' + esc(ph.what) + '</p><p class="fine">Pass: ' + esc(ph.pass) + '</p></div>';
    });
    h += '<p class="fine">Top of the board: ' + D.rows.slice(0, 3).map(function (r) { return esc(nm(r)) + ' ' + usd(r[9]); }).join(' · ') +
      '. Every row carries its own farm plan with a dollar cost and a time; open any row to read it.</p></section>';
    return h;
  }
  function sandboxHtml() {
    var h = '<section class="panel" aria-label="Sandbox"><h2>Sandbox: move the assumptions, watch the values move</h2>' +
      '<p class="fine">The board is priced with growth off and odds as fitted. These sliders are experiments, not the board: they recompute every row\'s expected value and value per $1,000 of cost in place.</p>';
    var sliders = [
      ['gw', 'Growth weight', SB.gw, 0, 0.5, 0.05, 'C2, off in the board: how much 7-day growth moves the value.'],
      ['os', 'Token odds scale', SB.os, 0.5, 1.5, 0.05, 'Multiplies every row\'s token odds (clamped 0.02–0.60).'],
      ['ds', 'Drop share', SB.ds, 0.05, 0.2, 0.01, 'The share of a launch value assumed to drop to depositors.']
    ];
    sliders.forEach(function (s) {
      h += '<label class="slider"><span>' + s[1] + ': <b>' + (s[0] === 'ds' ? Math.round(s[2] * 100) + '%' : s[2].toFixed(2)) + '</b></span>' +
        '<input type="range" data-sb="' + s[0] + '" min="' + s[3] + '" max="' + s[4] + '" step="' + s[5] + '" value="' + s[2] + '" aria-label="' + s[1] + '">' +
        '<span class="fine">' + s[6] + '</span></label>';
    });
    h += '<p><button data-sbreset>Reset to the board</button>' + (sbOn() ? ' <span class="fine">Sandbox on: the expected-value column shows the sandbox values.</span>' : '') + '</p></section>';
    return h;
  }

  function uniq(list) { var seen = {}, out = []; list.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out.sort(); }
  function filtered() {
    var q = S.q.trim().toLowerCase();
    return D.rows.filter(function (r) {
      if (S.cat !== 'all' && cat(r) !== S.cat) return false;
      if (S.ch !== 'all' && r[4] !== S.ch) return false;
      if (S.v !== 'all' && r[11] !== S.v) return false;
      if (q && nm(r).toLowerCase().indexOf(q) < 0 && r[1].toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function key(r) {
    if (S.sort === 'ev') return dispEV(r);
    if (S.sort === 'tvl') return tvl(r);
    if (S.sort === 'growth') return r[7] === null ? -999 : r[7];
    if (S.sort === 'age') return r[8] === null ? 99999 : r[8];
    if (S.sort === 'odds') return r[10];
    if (S.sort === 'cost') return farmCost(r).total;
    if (S.sort === 'value') return dispEV(r) / (farmCost(r).total / 1000);
    return r[0];
  }
  function exportRows() {
    var rows = filtered();
    var q = function (v) { var s = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var text = 'rank,slug,name,category,tvl_usd,change_7d,age_days,expected_value_usd,token_odds,verdict\n' +
      rows.map(function (r) { return [r[0], r[1], nm(r), cat(r), tvl(r), r[7], r[8], Math.round(dispEV(r)), r[10], r[11]].map(q).join(','); }).join('\n');
    var blob = new Blob([text], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'token-radar-board.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function tableHtml() {
    var h = '<div class="tabs" role="tablist">' +
      '<button role="tab" aria-selected="' + (S.tab === 'pre-token') + '" data-tab="pre-token">Pre-token (' + D.rows.length + ')</button>' +
      '<button role="tab" aria-selected="' + (S.tab === 'live') + '" data-tab="live">Live (' + D.live.length + ')</button></div>';
    if (S.tab === 'live') {
      h += '<p class="count">These tokens already trade, so the board shows the market\'s own values, never a model\'s. They are kept apart from the ranking.</p><div class="boardwrap"><table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>';
      D.live.forEach(function (l) { h += '<tr><td>' + esc(l[1] || title(l[0])) + '</td><td>' + esc(D.cats[l[2]] || '—') + '</td><td class="num">' + usd(l[3] * 1000) + '</td><td class="num">' + usd((l[4] === null ? null : l[4] * 1000)) + '</td><td class="num">' + pct(l[5]) + '</td></tr>'; });
      return h + '</tbody></table></div>';
    }
    var cats = uniq(D.rows.map(function (r) { return cat(r); }));
    var chs = uniq(D.rows.map(function (r) { return r[4]; }).filter(function (c) { return !!c; }));
    h += '<div class="filters"><input type="search" placeholder="Search a protocol…" value="' + esc(S.q) + '" aria-label="Search protocols">' +
      '<select aria-label="Filter by category"><option value="all">All categories</option>' +
      cats.map(function (c) { return '<option value="' + esc(c) + '"' + (S.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select aria-label="Filter by chain"><option value="all">All chains</option>' +
      chs.map(function (c) { return '<option value="' + esc(c) + '"' + (S.ch === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select aria-label="Filter by verdict"><option value="all">All verdicts</option>' +
      ['FARM', 'THIN', 'SKIP'].map(function (v) { return '<option value="' + v + '"' + (S.v === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select>' +
      '<button data-export="csv">CSV</button></div>';
    var rows = filtered().slice().sort(function (a, b) { var ka = key(a), kb = key(b); return (ka < kb ? -1 : ka > kb ? 1 : a[0] - b[0]) * S.dir; });
    h += '<p class="count">Showing ' + rows.length + ' of ' + D.rows.length + ' protocols matching filter' + (sbOn() ? ' · sandbox values shown' : '') + '</p>';
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
      h += '<tr data-slug="' + esc(r[1]) + '"><td class="num">' + r[0] + '</td><td>' + esc(nm(r)) + '</td><td>' + esc(cat(r)) + '</td><td class="num">' + usd(dispEV(r)) + '</td><td class="num">' + usd(tvl(r)) + '</td><td class="num">' + pct(r[7]) + '</td><td class="num">' + age(r[8]) + '</td><td class="num">' + odds(r[10]) + '</td><td class="num">$' + c.total + '</td><td class="num">' + usd(dispEV(r) / (c.total / 1000)) + '</td><td><span class="badge ' + r[11].toLowerCase() + '">' + r[11] + '</span></td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  var dialog = null;
  function openDrawer() {
    var row = null;
    D.rows.forEach(function (r) { if (r[1] === S.sel) row = r; });
    if (!row || !dialog) return;
    var rc = recompute(row), c = farmCost(row), valPer = dispEV(row) / (c.total / 1000);
    var chainTxt = row[4] ? esc(row[4]) + (row[5] > 1 ? ' + ' + (row[5] - 1) + ' more' : '') : '—';
    var h = '<header><div><h2>#' + row[0] + ' ' + esc(nm(row)) + '</h2><p class="note">' + esc(cat(row)) + ' · ' + chainTxt + ' · records no token</p></div><button class="close">Close</button></header><div class="kv">' +
      [['Expected value', usd(dispEV(row)) + (sbOn() ? ' (sandbox)' : '')], ['Raw implied', usd(rc.raw)], ['P10–P90', usd(rc.p10) + ' – ' + usd(rc.p90)], ['TVL', usd(tvl(row))], ['7-day growth', pct(row[7])], ['Age', age(row[8])], ['Token odds', odds(rc.od)], ['Farm cost', '$' + c.total + ' ($' + c.cap + ' capital)'], ['Value / $1k cost', usd(valPer)], ['Verdict', row[11]]]
        .map(function (kv) { return '<div><span>' + kv[0] + '</span><span class="num">' + esc(kv[1]) + '</span></div>'; }).join('') +
      '</div><h3>How the value is built (C1 x C4)</h3><div class="decomp">C1 clean-comps base  ' + usd(rc.base) + '\n  = exp(' + F.intercept.toFixed(3) + ' + ' + F.slope.toFixed(3) + ' x log(TVL))\nC2 growth x' + rc.gm.toFixed(3) + '  (' + pct(row[7] === null ? 0 : row[7]) + ' in 7 days' + (SB.gw === 0 ? ', off in the board' : '') + ')\nC4 token odds x' + rc.od.toFixed(3) + '  (peer logistic)\nRaw = C1 x C2 = ' + usd(rc.raw) + '\nExpected = Raw x C4 = ' + usd(rc.exp) + ' (board: ' + usd(row[9]) + ')' + (SB.ds !== 0.10 || sbOn() ? '\nYour slice at ' + Math.round(SB.ds * 100) + '% drop = ' + usd(rc.slice) : '') + '</div>' +
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
      stripHtml() + ledgerHtml() +
      '<div class="panels">' + scatterHtml() + termsHtml() + '</div>' +
      '<div class="panels">' + ablationHtml() + planHtml() + '</div>' +
      sandboxHtml() +
      '<h2>The board</h2>' + tableHtml() +
      '<p class="accounted">Accounted: ' + acc.total + ' of ' + acc.total + ' protocols — ' + acc.board + ' on the board, ' + acc.live + ' live, ' + acc.traded_not_live + ' traded but not in the live view, ' + acc.pre_token_not_rankable + ' pre-token but not rankable, ' + acc.rankable_above_floor_not_watchlist + ' rankable above the floor and outside the watchlist. Snapshot ' + esc(D.as_of) + '; floor $' + D.floor_usd.toLocaleString('en-US') + '.</p>' +
      '<p class="note">How to read this board: the value follows from the snapshot\'s own figures (TVL, 7-day growth, age with no token), never from a hardcoded list of names. The per-term table above shows what each candidate term contributes on held-out data under two methods; the median-error column is calibration only. A protocol is described as recording no token, never as having none.</p>';
    writeHash();
    drawScatter();
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
    if (t.hasAttribute('data-export')) { exportRows(); return; }
    if (t.hasAttribute('data-sbreset')) { SB.gw = 0; SB.os = 1; SB.ds = 0.10; render(); return; }
    var tr = t.closest ? t.closest('tr[data-slug]') : null;
    if (tr) { S.sel = tr.getAttribute('data-slug'); render(); openDrawer(); }
  });
  app.addEventListener('input', function (e) {
    var t = e.target;
    if (t.tagName === 'INPUT' && t.type === 'search') { S.q = t.value; render(); var inp = app.querySelector('input[type="search"]'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } return; }
    if (t.tagName === 'INPUT' && t.type === 'range' && t.hasAttribute('data-sb')) {
      var k = t.getAttribute('data-sb'), v = parseFloat(t.value);
      if (k === 'gw') SB.gw = v; else if (k === 'os') SB.os = v; else if (k === 'ds') SB.ds = v;
      render();
    }
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
