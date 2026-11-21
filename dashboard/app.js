// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the model's
// own inputs and the protocol's farm plan, plus a model sandbox, a two-protocol compare and a CSV
// export. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', verdict: 'all', tab: 'pre-token',
    sort: 'implied', dir: -1, selected: null,
    sandbox: false, growthWeight: DATA.model.growth_weight, maturityFloor: DATA.model.maturity_floor,
    compareA: null, compareB: null
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtOdds(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return Math.round(n * 100) + '%';
  }
  function ageBand(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days < 180) return '<180d';
    if (days < 365) return '180-365d';
    if (days < 730) return '1-2y';
    if (days < 1095) return '2-3y';
    return '>3y';
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. radar-2: log(mcap) = intercept + slope x log(TVL) + category effect, times growth
  // and maturity, times token odds.
  function rawImpliedOf(row, growthWeight, maturityFloor) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * growthWeight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = maturityFloor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var base = Math.exp(DATA.fit.intercept + DATA.fit.slope * Math.log(row.tvl_usd) + (row.category_effect || 0));
    return { raw: Math.max(1, base * growthMult * maturity), growthMult: growthMult, maturity: maturity };
  }
  function expectedOf(row, growthWeight, maturityFloor) {
    var r = rawImpliedOf(row, growthWeight, maturityFloor);
    return Math.max(1, Math.round(r.raw * row.token_odds));
  }
  function displayedValue(row) {
    if (!state.sandbox) return row.implied_value_usd;
    return expectedOf(row, state.growthWeight, state.maturityFloor);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else if (key === 'raw') { av = a.raw_implied_value_usd; bv = b.raw_implied_value_usd; }
      else { av = displayedValue(a); bv = displayedValue(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var v = DATA.fit.validation;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by expected launch value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Expected value is raw implied value times token odds; both are shown for every row. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Held-out median error' }), el('b', { text: 'x' + v.median_factor.toFixed(2) }))
      )
    );
  }

  function kpis() {
    var v = DATA.fit.validation;
    var a = DATA.accounted;
    return el('div', null,
      el('div', { class: 'kpis' },
        el('div', { class: 'kpi' }, el('span', { text: 'Watchlist covered' }), el('b', { text: a.board === DATA.board_size ? DATA.watchlist_size + ' / ' + DATA.watchlist_size : 'incomplete' }), el('small', { text: 'every watchlist slug is on the board' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Board rows' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.watchlist_size + ' watchlist + ' + DATA.early_size + ' early' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Fitted slope' }), el('b', { text: DATA.fit.slope.toFixed(2) }), el('small', { text: 'log(mcap) on log(TVL), ' + DATA.fit.fitted_on + ' traded protocols' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Held-out error' }), el('b', { text: 'x' + v.median_factor.toFixed(2) }), el('small', { text: 'median, ' + v.test_n + ' unseen tokens; starter x' + v.starter_median_factor.toFixed(2) })),
        el('div', { class: 'kpi' }, el('span', { text: 'P10-P90 coverage' }), el('b', { text: Math.round(v.coverage * 100) + '%' }), el('small', { text: v.coverage_n + ' of ' + v.test_n + ' held-out caps inside the band' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Snapshot' }), el('b', { text: DATA.as_of }), el('small', { text: 'sealed DefiLlama index' }))
      ),
      el('p', { class: 'accounted' },
        el('b', { text: String(a.total) }), ' protocols accounted for: ',
        el('b', { text: String(a.board) }), ' on the board, ',
        el('b', { text: String(a.live) }), ' in the live view, ',
        el('b', { text: String(a.traded_not_live) }), ' traded but below the live top ' + DATA.live_size + ', ',
        el('b', { text: String(a.pre_token_not_rankable) }), ' pre-token but not rankable (exchange or versioned pool), ',
        el('b', { text: String(a.rankable_above_floor_not_watchlist) }), ' rankable above the floor but not on the watchlist.'
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var verdictSelect = el('select', { id: 'verdict', 'aria-label': 'Filter by farm verdict' },
      el('option', { value: 'all', text: 'All verdicts' }),
      ['FARM', 'THIN', 'SKIP'].map(function (v) { return el('option', { value: v, text: v, selected: v === state.verdict ? 'selected' : null }); })
    );
    verdictSelect.addEventListener('change', function () { state.verdict = verdictSelect.value; render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var exportBtn = el('button', { class: 'button', type: 'button', text: 'Export CSV', onclick: exportCsv });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), verdictSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      exportBtn,
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function exportCsv() {
    var list = sortedRows(rows());
    var head = ['rank', 'slug', 'name', 'category', 'chains', 'tvl_usd', 'change_7d', 'age_days', 'raw_implied_usd', 'token_odds', 'expected_usd', 'p10_usd', 'p90_usd', 'verdict', 'farm_cost_usd'];
    function esc(v) {
      var s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var lines = [head.join(',')];
    list.forEach(function (r) {
      lines.push([r.rank, r.slug, r.name, r.category || '', (r.chains || []).join(';'), r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days, r.raw_implied_value_usd, r.token_odds, r.implied_value_usd, r.p10_usd, r.p90_usd, r.verdict, r.farm_cost_usd].map(esc).join(','));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'token-radar-board.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; writeHash(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { var v = displayedValue(r); if (v > max) max = v; });
    if (max <= 0) max = 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var value = displayedValue(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtOdds(r.token_odds) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((value / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(value) })
        )),
        el('td', null, el('span', { class: 'verdict ' + r.verdict.toLowerCase(), text: r.verdict }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest expected value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('odds', 'Token odds'),
            sortHeader('implied', 'Expected value'),
            el('th', { scope: 'col', text: 'Farm' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var f = DATA.fit;
    var v = f.validation;
    var topEffects = Object.keys(f.category_effects).map(function (c) { return [c, f.category_effects[c]]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How expected value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one fitted function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'log(mcap) = ' + f.intercept.toFixed(3) + ' + ' + f.slope.toFixed(3) + ' x log(tvl_usd) + category effect\n' +
        'raw = exp(log(mcap)) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ')\n' +
        'expected = raw x token odds'
      ),
      el('p', { class: 'sub', text: 'The line is fit by least squares on ' + f.fitted_on + ' traded protocols with a positive market cap (a market cap of 0 or -1 is a bad figure, not a price). The slope is below one: market cap grows more slowly than TVL, so a fixed multiple overstates the giants. Category effects are a category\'s mean residual, used only where at least three traded protocols carry the category. Largest effects: ' + topEffects.map(function (e) { return e[0] + ' ' + (e[1] >= 0 ? '+' : '') + e[1].toFixed(2); }).join(', ') + '.' }),
      el('p', { class: 'sub', text: 'Token odds blend two peer records, half and half: the share of protocols in the category that record a token, and the share in the protocol\'s age band, clamped to 2%..60%. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.' }),
      el('p', { class: 'sub', text: 'Held out, not asserted: every third traded protocol by slug (' + v.test_n + ') never trains the line. On those unseen tokens the median error is a factor of x' + v.median_factor.toFixed(2) + ' (the house starter rule, a fixed 0.25 multiple, scores x' + v.starter_median_factor.toFixed(2) + ' on the same set), and ' + v.coverage_n + ' of ' + v.test_n + ' market caps land inside the P10-P90 band from the training residuals. The band is wide because launch values vary enormously even among traded peers; it is shown on every row.' }),
      el('p', { class: 'sub', text: 'Farm verdicts compare value to cost inside this board: expected value per $1,000 of farm cost, top third FARM, middle third THIN, bottom third SKIP. The farm cost is the deposit plus gas to open plus $2 of gas a week over the hold.' })
    );
  }

  function sandboxPanel() {
    var m = DATA.model;
    var gw = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(state.growthWeight), 'aria-label': 'Growth weight' });
    var gwOut = el('output', { text: String(state.growthWeight) });
    gw.addEventListener('input', function () { state.growthWeight = parseFloat(gw.value); state.sandbox = true; gwOut.textContent = gw.value; render(); });
    var mf = el('input', { type: 'range', min: '0.6', max: '1', step: '0.05', value: String(state.maturityFloor), 'aria-label': 'Maturity floor' });
    var mfOut = el('output', { text: String(state.maturityFloor) });
    mf.addEventListener('input', function () { state.maturityFloor = parseFloat(mf.value); state.sandbox = true; mfOut.textContent = mf.value; render(); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset to fitted weights', onclick: function () { state.growthWeight = m.growth_weight; state.maturityFloor = m.maturity_floor; state.sandbox = false; render(); } });
    return el('section', { class: 'panel tool' },
      el('h2', { text: 'Model sandbox' }),
      el('p', { class: 'sub', text: 'Move the weights and the board re-ranks in place from the same snapshot figures. The sandbox only changes this page: the submitted board uses the fitted weights (growth ' + m.growth_weight + ', maturity floor ' + m.maturity_floor + ').' }),
      el('div', { class: 'row' },
        el('label', null, 'Growth weight', gw, gwOut),
        el('label', null, 'Maturity floor', mf, mfOut),
        reset
      ),
      state.sandbox ? el('p', { class: 'note', text: 'Sandbox active: the board above is re-ranked with growth ' + state.growthWeight + ' and maturity floor ' + state.maturityFloor + '.' }) : null
    );
  }

  function comparePanel() {
    var options = DATA.rows.map(function (r) { return { value: r.slug, text: '#' + r.rank + ' ' + r.name }; });
    function select(which, current) {
      var s = el('select', { 'aria-label': which === 'a' ? 'First protocol to compare' : 'Second protocol to compare' },
        el('option', { value: '', text: 'Pick a protocol' }),
        options.map(function (o) { return el('option', { value: o.value, text: o.text, selected: o.value === current ? 'selected' : null }); })
      );
      s.addEventListener('change', function () { if (which === 'a') state.compareA = s.value || null; else state.compareB = s.value || null; render(); });
      return s;
    }
    function card(slug) {
      if (!slug) return el('div', { class: 'compare-card' }, el('h3', { text: 'No protocol picked' }), el('p', { class: 'sub', text: 'Pick a protocol to see its numbers.' }));
      var r = DATA.rows.filter(function (x) { return x.slug === slug; })[0];
      if (!r) return el('div', { class: 'compare-card' }, el('h3', { text: 'Not found' }));
      var rows = [
        ['Rank', '#' + r.rank], ['TVL', fmtUsd(r.tvl_usd)], ['7-day growth', fmtPct(r.change_7d)],
        ['Age', fmtAge(r.age_days)], ['Raw implied', fmtUsd(r.raw_implied_value_usd)],
        ['Token odds', fmtOdds(r.token_odds)], ['Expected value', fmtUsd(r.implied_value_usd)],
        ['P10-P90', fmtUsd(r.p10_usd) + ' - ' + fmtUsd(r.p90_usd)],
        ['Farm cost', '$' + r.farm_cost_usd], ['Verdict', r.verdict]
      ];
      return el('div', { class: 'compare-card' },
        el('h3', { text: r.name }),
        el('p', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains || []).join(', ') }),
        el('dl', null, rows.map(function (kv) { return el('div', null, el('dt', { text: kv[0] }), el('dd', { text: kv[1] })); }))
      );
    }
    return el('section', { class: 'panel tool' },
      el('h2', { text: 'Compare two protocols' }),
      el('div', { class: 'row' },
        el('label', null, 'First', select('a', state.compareA)),
        el('label', null, 'Second', select('b', state.compareB))
      ),
      el('div', { class: 'compare-grid' }, card(state.compareA), card(state.compareB))
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = rawImpliedOf(row, DATA.model.growth_weight, DATA.model.maturity_floor);
    var recomputedRaw = Math.max(1, Math.round(recomputed.raw));
    var catCount = DATA.fit.category_counts[row.category || '(null)'];
    var band = ageBand(row.age_days);
    var ageCount = DATA.fit.age_counts[band];
    var catOdds = DATA.fit.category_odds[row.category || '(null)'];
    var ageOdds = DATA.fit.age_odds[band];
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Expected value, term by term' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Category effect' }), el('b', { class: 'num', text: (row.category_effect >= 0 ? '+' : '') + row.category_effect.toFixed(2) + ' log points' })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Raw implied value' }), el('b', { class: 'num', text: fmtUsd(row.raw_implied_value_usd) })),
        el('div', null, el('span', { text: 'Token odds' }), el('b', { class: 'num', text: fmtOdds(row.token_odds) })),
        el('div', null, el('span', { text: 'Expected value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'P10-P90 band' }), el('b', { class: 'num', text: fmtUsd(row.p10_usd) + ' - ' + fmtUsd(row.p90_usd) }))
      ),
      el('p', { class: 'sub', text: 'Token odds: ' + (catOdds !== undefined ? 'category ' + fmtOdds(catOdds) + (catCount ? ' (' + catCount.t + ' of ' + catCount.n + ' peers record a token)' : '') : 'category fallback ' + fmtOdds(DATA.fit.overall_odds)) + ', age band ' + band + ' ' + fmtOdds(ageOdds) + (ageCount ? ' (' + ageCount.t + ' of ' + ageCount.n + ' peers record a token)' : '') + ', blended half and half.' }),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputedRaw) + (recomputedRaw === row.raw_implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' The band is wide because launch values vary enormously even among traded peers. This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'sub', text: 'Verdict ' + row.verdict + ': $' + row.farm_cost_usd + ' to farm (deposit plus gas), $' + Math.round(row.value_per_1000_cost).toLocaleString('en-US') + ' of expected value per $1,000 of cost.' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(kpis());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(modelPanel());
      shell.appendChild(sandboxPanel());
      shell.appendChild(comparePanel());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
