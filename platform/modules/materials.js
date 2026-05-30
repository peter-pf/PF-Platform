// ============================================================
// Material Costs Module — Pier Foundations Operations Platform
// Renders into #mod-materials > #materials-app
// ============================================================

(function () {
  'use strict';

  // ---- SUPPLIER DATA (from Jonathan's Bid Log) ----
  const SUPPLIERS = [
    { supplier: 'Heidelberg',          city: 'Fort Wayne',      state: 'IN', stoneRate: 17.00, haulRate:  5.00, tax: 1.54, total: 23.54 },
    { supplier: 'Heidelberg',          city: 'Castleton',       state: 'IN', stoneRate: 21.00, haulRate: 12.10, tax: 2.32, total: 35.42 },
    { supplier: 'Heidelberg',          city: 'Downtown Indy',   state: 'IN', stoneRate: 21.00, haulRate:  7.95, tax: 2.03, total: 30.98 },
    { supplier: 'US Agg',              city: 'Lebanon',         state: 'IN', stoneRate: 23.50, haulRate: 14.60, tax: 2.67, total: 40.77 },
    { supplier: 'US Agg',              city: 'Kokomo',          state: 'IN', stoneRate: 14.30, haulRate:  8.50, tax: 1.60, total: 24.40 },
    { supplier: 'IMI',                 city: 'Peru',            state: 'IN', stoneRate: 15.00, haulRate:  5.00, tax: 1.40, total: 21.40 },
    { supplier: 'IMI',                 city: 'Mishawaka',       state: 'IN', stoneRate: 16.00, haulRate: 19.00, tax: 2.45, total: 37.45 },
    { supplier: 'Yellow Creek Gravel', city: 'South Bend',      state: 'IN', stoneRate: 30.00, haulRate:  6.50, tax: 2.56, total: 39.06 },
    { supplier: 'Yellow Creek Gravel', city: 'Elkhart',         state: 'IN', stoneRate: 30.00, haulRate:  6.50, tax: 2.56, total: 39.06 },
    { supplier: 'StoneCo',             city: 'Celina',          state: 'OH', stoneRate: 19.00, haulRate:  7.00, tax: 1.82, total: 27.82 },
    { supplier: 'Piqua Materials',     city: 'Piqua',           state: 'OH', stoneRate: 23.00, haulRate:  3.65, tax: 1.87, total: 28.52 },
    { supplier: '(unknown)',           city: 'Columbus',        state: 'OH', stoneRate: 24.00, haulRate: 10.00, tax: 2.38, total: 36.38 },
    { supplier: '(unknown)',           city: 'Cincinnati',      state: 'OH', stoneRate: 25.00, haulRate:  3.50, tax: 2.00, total: 30.50 },
    { supplier: '(unknown)',           city: 'Mount Pleasant',  state: 'IA', stoneRate: 25.00, haulRate: 14.00, tax: 2.73, total: 41.73 },
    { supplier: 'StoneCo',             city: 'Lansing',         state: 'MI', stoneRate: 28.25, haulRate:  3.75, tax: 2.24, total: 34.24 },
    { supplier: '(unknown)',           city: 'Robinson',        state: 'IL', stoneRate: 17.00, haulRate: 11.00, tax: 1.96, total: 29.96 },
    { supplier: 'Martin Marietta',     city: 'Liberty',         state: 'NC', stoneRate: 35.00, haulRate:  0.00, tax: 2.45, total: 37.45 },
  ];

  // Stone consumption from POET prelim design
  const TONS_PER_LF = 0.209;

  // ---- HELPERS ----
  function fmt(n, decimals) {
    if (decimals === undefined) decimals = 2;
    return '$' + n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function getStates() {
    return [...new Set(SUPPLIERS.map(s => s.state))].sort();
  }

  function cheapestPerState() {
    var map = {};
    SUPPLIERS.forEach(function (s) {
      if (!map[s.state] || s.total < map[s.state].total) map[s.state] = s;
    });
    return map;
  }

  function computeStats(list) {
    if (!list.length) return { min: 0, max: 0, avg: 0, cheapest: null, expensive: null };
    var sorted = list.slice().sort(function (a, b) { return a.total - b.total; });
    var sum = list.reduce(function (s, r) { return s + r.total; }, 0);
    return {
      min: sorted[0].total,
      max: sorted[sorted.length - 1].total,
      avg: sum / list.length,
      cheapest: sorted[0],
      expensive: sorted[sorted.length - 1]
    };
  }

  // ---- STATE ----
  var currentFilter = 'ALL';
  var sortCol = 'total';
  var sortAsc = true;

  // ---- RENDER ----
  function render() {
    var app = document.getElementById('materials-app');
    if (!app) return;

    var filtered = currentFilter === 'ALL'
      ? SUPPLIERS
      : SUPPLIERS.filter(function (s) { return s.state === currentFilter; });

    var stats = computeStats(filtered);
    var cheapByState = cheapestPerState();

    // Sort
    var sorted = filtered.slice().sort(function (a, b) {
      var va = a[sortCol], vb = b[sortCol];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    app.innerHTML = buildSummary(stats) +
      buildFilterBar() +
      buildTable(sorted, cheapByState) +
      buildEstimator();

    attachEvents();
  }

  // ---- SUMMARY STATS ----
  function buildSummary(stats) {
    if (!stats.cheapest) return '';
    return '<div class="grid grid-4" style="margin-bottom:20px">' +
      statCard('Cheapest Supplier', fmt(stats.cheapest.total) + '/TN', stats.cheapest.supplier + ' — ' + stats.cheapest.city + ', ' + stats.cheapest.state) +
      statCard('Most Expensive', fmt(stats.expensive.total) + '/TN', stats.expensive.supplier + ' — ' + stats.expensive.city + ', ' + stats.expensive.state) +
      statCard('Average Cost', fmt(stats.avg) + '/TN', 'Across ' + (currentFilter === 'ALL' ? 'all states' : currentFilter) + ' suppliers') +
      statCard('Cost Range', fmt(stats.min) + ' — ' + fmt(stats.max), 'Spread: ' + fmt(stats.max - stats.min) + '/TN') +
    '</div>';
  }

  function statCard(label, value, note) {
    return '<div class="stat-card">' +
      '<div class="stat-label">' + label + '</div>' +
      '<div class="stat-value" style="font-size:1.25rem">' + value + '</div>' +
      '<div class="stat-change" style="color:var(--text-3)">' + note + '</div>' +
    '</div>';
  }

  // ---- FILTER BAR ----
  function buildFilterBar() {
    var states = getStates();
    var btns = '<button class="btn ' + (currentFilter === 'ALL' ? 'btn-primary' : 'btn-secondary') + '" data-filter="ALL">All States</button>';
    states.forEach(function (st) {
      btns += '<button class="btn ' + (currentFilter === st ? 'btn-primary' : 'btn-secondary') + '" data-filter="' + st + '">' + st + '</button>';
    });
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' + btns + '</div>';
  }

  // ---- TABLE ----
  function buildTable(rows, cheapByState) {
    var cols = [
      { key: 'supplier',  label: 'Supplier' },
      { key: 'city',      label: 'City' },
      { key: 'state',     label: 'State' },
      { key: 'stoneRate', label: 'Stone/TN' },
      { key: 'haulRate',  label: 'Haul/TN' },
      { key: 'tax',       label: 'Tax/TN' },
      { key: 'total',     label: 'Total/TN' }
    ];

    var thead = '<tr>';
    cols.forEach(function (c) {
      var arrow = '';
      if (sortCol === c.key) arrow = sortAsc ? ' &#9650;' : ' &#9660;';
      thead += '<th style="cursor:pointer" data-sort="' + c.key + '">' + c.label + arrow + '</th>';
    });
    thead += '</tr>';

    var tbody = '';
    rows.forEach(function (r) {
      var isCheapest = cheapByState[r.state] && cheapByState[r.state].total === r.total &&
                       cheapByState[r.state].city === r.city;
      var rowStyle = isCheapest ? ' style="background:var(--green-light)"' : '';
      tbody += '<tr' + rowStyle + '>';
      tbody += '<td style="font-weight:500">' + r.supplier + '</td>';
      tbody += '<td>' + r.city + '</td>';
      tbody += '<td>' + r.state + '</td>';
      tbody += '<td>' + fmt(r.stoneRate) + '</td>';
      tbody += '<td>' + fmt(r.haulRate) + '</td>';
      tbody += '<td>' + fmt(r.tax) + '</td>';
      tbody += '<td style="font-weight:600">' + fmt(r.total) + '</td>';
      tbody += '</tr>';
    });

    return '<div class="card">' +
      '<div class="card-header">' +
        '<span class="card-title">Stone Supplier Reference</span>' +
        '<span class="card-subtitle">Click column headers to sort &middot; Green = cheapest in state</span>' +
      '</div>' +
      '<div class="table-wrap">' +
        '<table><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>' +
      '</div>' +
    '</div>';
  }

  // ---- COST ESTIMATOR ----
  function buildEstimator() {
    var options = '';
    SUPPLIERS.forEach(function (s, i) {
      options += '<option value="' + i + '">' + s.supplier + ' — ' + s.city + ', ' + s.state + ' (' + fmt(s.total) + '/TN)</option>';
    });

    return '<div class="card" style="margin-top:8px">' +
      '<div class="card-header">' +
        '<span class="card-title">Stone Cost Estimator</span>' +
        '<span class="card-subtitle">Consumption rate: ' + TONS_PER_LF + ' tons/LF (from POET prelim design)</span>' +
      '</div>' +

      '<div class="tabs" style="margin-bottom:16px">' +
        '<div class="tab active" data-calc-tab="lf">By Linear Feet</div>' +
        '<div class="tab" data-calc-tab="col">By Columns + Depth</div>' +
      '</div>' +

      // LF input tab
      '<div id="calcTabLF">' +
        '<div class="grid grid-3">' +
          formGroup('Total Linear Feet', '<input type="number" class="form-input" id="calcLF" placeholder="e.g. 5000" min="0">') +
          formGroup('Supplier', '<select class="form-select" id="calcSupplier">' + options + '</select>') +
          formGroup('&nbsp;', '<button class="btn btn-primary" id="calcBtn" style="margin-top:2px;width:100%">Calculate Cost</button>') +
        '</div>' +
      '</div>' +

      // Columns input tab (hidden initially)
      '<div id="calcTabCOL" style="display:none">' +
        '<div class="grid grid-4">' +
          formGroup('Total Columns', '<input type="number" class="form-input" id="calcCols" placeholder="e.g. 200" min="0">') +
          formGroup('Avg Depth (ft)', '<input type="number" class="form-input" id="calcDepth" placeholder="e.g. 25" min="0" step="0.5">') +
          formGroup('Supplier', '<select class="form-select" id="calcSupplier2">' + options + '</select>') +
          formGroup('&nbsp;', '<button class="btn btn-primary" id="calcBtn2" style="margin-top:2px;width:100%">Calculate Cost</button>') +
        '</div>' +
      '</div>' +

      '<div id="calcResult" style="margin-top:16px"></div>' +
    '</div>';
  }

  function formGroup(label, input) {
    return '<div class="form-group">' +
      '<label class="form-label">' + label + '</label>' +
      input +
    '</div>';
  }

  // ---- CALCULATE ----
  function calculate(lf, supplierIdx) {
    if (!lf || lf <= 0) return;
    var s = SUPPLIERS[supplierIdx];
    var tons = lf * TONS_PER_LF;
    var stoneCost = tons * s.stoneRate;
    var haulCost  = tons * s.haulRate;
    var taxCost   = tons * s.tax;
    var totalCost = tons * s.total;

    var result = document.getElementById('calcResult');
    result.innerHTML =
      '<div class="grid grid-4" style="margin-bottom:12px">' +
        statCard('Total LF', lf.toLocaleString() + ' LF', '') +
        statCard('Tons Required', tons.toFixed(1) + ' TN', lf.toLocaleString() + ' LF x ' + TONS_PER_LF + ' TN/LF') +
        statCard('Supplier', s.supplier, s.city + ', ' + s.state) +
        statCard('Total Material Cost', fmt(totalCost), fmt(s.total) + '/TN x ' + tons.toFixed(1) + ' TN') +
      '</div>' +
      '<div class="card" style="padding:16px;margin-bottom:0">' +
        '<table>' +
          '<thead><tr><th>Component</th><th>Rate/TN</th><th>Tons</th><th style="text-align:right">Cost</th></tr></thead>' +
          '<tbody>' +
            '<tr><td>Stone</td><td>' + fmt(s.stoneRate) + '</td><td>' + tons.toFixed(1) + '</td><td style="text-align:right">' + fmt(stoneCost) + '</td></tr>' +
            '<tr><td>Hauling</td><td>' + fmt(s.haulRate) + '</td><td>' + tons.toFixed(1) + '</td><td style="text-align:right">' + fmt(haulCost) + '</td></tr>' +
            '<tr><td>Tax</td><td>' + fmt(s.tax) + '</td><td>' + tons.toFixed(1) + '</td><td style="text-align:right">' + fmt(taxCost) + '</td></tr>' +
            '<tr style="font-weight:700;border-top:2px solid var(--border)"><td>Total</td><td>' + fmt(s.total) + '</td><td>' + tons.toFixed(1) + '</td><td style="text-align:right;color:var(--accent)">' + fmt(totalCost) + '</td></tr>' +
          '</tbody>' +
        '</table>' +
      '</div>';
  }

  // ---- EVENTS ----
  function attachEvents() {
    // State filter buttons
    var app = document.getElementById('materials-app');
    app.querySelectorAll('[data-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentFilter = this.getAttribute('data-filter');
        render();
      });
    });

    // Sort headers
    app.querySelectorAll('[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var col = this.getAttribute('data-sort');
        if (sortCol === col) { sortAsc = !sortAsc; }
        else { sortCol = col; sortAsc = true; }
        render();
      });
    });

    // Calc tabs
    app.querySelectorAll('[data-calc-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        app.querySelectorAll('[data-calc-tab]').forEach(function (t) { t.classList.remove('active'); });
        this.classList.add('active');
        var mode = this.getAttribute('data-calc-tab');
        document.getElementById('calcTabLF').style.display  = mode === 'lf'  ? '' : 'none';
        document.getElementById('calcTabCOL').style.display = mode === 'col' ? '' : 'none';
        document.getElementById('calcResult').innerHTML = '';
      });
    });

    // Calc button (LF mode)
    var calcBtn = document.getElementById('calcBtn');
    if (calcBtn) {
      calcBtn.addEventListener('click', function () {
        var lf = parseFloat(document.getElementById('calcLF').value);
        var idx = parseInt(document.getElementById('calcSupplier').value, 10);
        calculate(lf, idx);
      });
    }

    // Calc button (Columns mode)
    var calcBtn2 = document.getElementById('calcBtn2');
    if (calcBtn2) {
      calcBtn2.addEventListener('click', function () {
        var cols  = parseFloat(document.getElementById('calcCols').value);
        var depth = parseFloat(document.getElementById('calcDepth').value);
        if (cols > 0 && depth > 0) {
          var lf = cols * depth;
          var idx = parseInt(document.getElementById('calcSupplier2').value, 10);
          calculate(lf, idx);
        }
      });
    }

    // Enter key triggers calc
    ['calcLF', 'calcCols', 'calcDepth'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            var parent = this.closest('#calcTabLF, #calcTabCOL');
            if (parent) parent.querySelector('.btn-primary').click();
          }
        });
      }
    });
  }

  // ---- INIT ----
  // Use a MutationObserver so the module renders when its view becomes visible,
  // or render immediately if already visible.
  function init() {
    var container = document.getElementById('materials-app');
    if (!container) return;
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
