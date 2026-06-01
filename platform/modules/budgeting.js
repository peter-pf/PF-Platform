// ============================================================
// Budgeting & Forecasting Module — Pier Foundations Operations Platform
// Renders into #mod-budgeting > #budgeting-app
// ============================================================

(function () {
  'use strict';

  // ---- CONSTANTS ----
  var FY26_TARGET = 6000000;
  var FY_START = new Date('2025-10-01'); // FY26 starts Oct 2025
  var FY_END = new Date('2026-09-30');

  // SBA Loan
  var SBA_MONTHLY = 12398;

  // Fixed costs (monthly)
  var FIXED_COSTS = {
    'SBA Debt Service': SBA_MONTHLY,
    'Insurance': 9300,
    'Yard Lease': 2500,
    'Trucks': 2000,
    'Admin / Office': 2000,
    'Equipment Depreciation': 7000
  };
  var FIXED_MONTHLY = Object.keys(FIXED_COSTS).reduce(function (s, k) { return s + FIXED_COSTS[k]; }, 0);
  var FIXED_ANNUAL = FIXED_MONTHLY * 12;

  // Contribution margin
  var CONTRIBUTION_MARGIN = 0.17;

  // Capacity model
  var WORKING_DAYS_YR = 200;
  var AVG_PROJECT_VALUE = 166000;
  var AVG_PROJECT_DAYS = 18;

  // ---- DATA ACCESS ----
  function getBids() {
    return (typeof LIVE_BIDS !== 'undefined') ? LIVE_BIDS : [];
  }
  function getProjects() {
    return (typeof LIVE_PROJECTS !== 'undefined') ? LIVE_PROJECTS : [];
  }

  // ---- HELPERS ----
  function fmt(n) {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
    return '$' + n.toLocaleString();
  }
  function fmtFull(n) {
    return '$' + Math.round(n).toLocaleString();
  }
  function pct(n) { return Math.round(n) + '%'; }

  function monthsElapsed() {
    var now = new Date();
    var start = FY_START;
    var months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    // Partial month
    months += now.getDate() / 30;
    return Math.max(months, 0.5);
  }

  // ---- REVENUE CALCULATIONS ----
  function calcRevenue() {
    var bids = getBids();
    var projects = getProjects();

    // Awarded/completed revenue from bids
    var awardedFromBids = bids.filter(function (b) {
      return b.bid_status === 'Awarded' || b.bid_status === 'Completed';
    });
    var awardedRevenue = awardedFromBids.reduce(function (s, b) {
      return s + (b.bid_value || 0);
    }, 0);

    // Also count project contract values
    var projectRevenue = projects.reduce(function (s, p) {
      return s + (p.subcontract_value || 0);
    }, 0);

    // Use whichever is larger (avoid double-counting)
    var actualYTD = Math.max(awardedRevenue, projectRevenue);
    var elapsed = monthsElapsed();
    var runRate = (actualYTD / elapsed) * 12;
    var gap = FY26_TARGET - runRate;
    var pacePct = (runRate / FY26_TARGET) * 100;

    return {
      target: FY26_TARGET,
      actualYTD: actualYTD,
      elapsed: elapsed,
      runRate: runRate,
      gap: gap,
      pacePct: pacePct,
      awardedCount: awardedFromBids.length,
      projectCount: projects.length
    };
  }

  // ---- RENDER ----
  function render() {
    var app = document.getElementById('budgeting-app');
    if (!app) return;

    var rev = calcRevenue();
    var breakEven = FIXED_ANNUAL / CONTRIBUTION_MARGIN;
    var debtServiceFloor = 3720000;

    // Capacity per rig
    var rigCapacity = (WORKING_DAYS_YR / AVG_PROJECT_DAYS) * AVG_PROJECT_VALUE;
    var rigsNeeded = Math.ceil(FY26_TARGET / rigCapacity);

    // Cash flow
    var monthlyInflow = rev.runRate / 12;
    var monthlyVariable = monthlyInflow * 0.83;
    var monthlyNet = monthlyInflow - FIXED_MONTHLY - monthlyVariable;

    // Pace color
    var paceColor = rev.pacePct >= 90 ? 'green' : rev.pacePct >= 70 ? 'amber' : 'red';

    var html = '';

    // ============ REVENUE FORECAST ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Revenue Forecast</h3>';
    html += '<span class="card-subtitle">FY26 (Oct 2025 - Sep 2026)</span></div>';

    html += '<div class="grid grid-4">';
    html += statCard('FY26 Target', fmtFull(rev.target), '');
    html += statCard('Awarded YTD', fmtFull(rev.actualYTD), rev.awardedCount + ' projects');
    html += statCard('Run Rate', fmtFull(rev.runRate), pct(rev.pacePct) + ' of target');
    html += statCard('Gap to Target', fmtFull(Math.abs(rev.gap)), rev.gap > 0 ? 'Behind pace' : 'Ahead of pace', rev.gap > 0 ? 'down' : 'up');
    html += '</div>';

    // Progress bar
    html += '<div style="margin-top:12px">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">';
    html += '<span class="stat-label">Revenue Pace</span>';
    html += '<span class="stat-label">' + pct(Math.min(rev.pacePct, 100)) + '</span></div>';
    html += '<div class="progress-bar"><div class="progress-fill ' + paceColor + '" style="width:' + Math.min(rev.pacePct, 100) + '%"></div></div>';
    html += '</div>';

    // Months elapsed indicator
    var fyPctElapsed = (monthsElapsed() / 12) * 100;
    html += '<div style="margin-top:8px">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">';
    html += '<span class="stat-label">FY Elapsed</span>';
    html += '<span class="stat-label">' + monthsElapsed().toFixed(1) + ' / 12 months</span></div>';
    html += '<div class="progress-bar"><div class="progress-fill accent" style="width:' + Math.min(fyPctElapsed, 100) + '%"></div></div>';
    html += '</div>';

    html += '</div>'; // card

    // ============ BREAK-EVEN ANALYSIS ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Break-Even Analysis</h3>';
    html += '<span class="card-subtitle">Fixed costs vs. contribution margin</span></div>';

    html += '<div class="grid grid-3">';
    html += statCard('Fixed Costs (Monthly)', fmtFull(FIXED_MONTHLY), fmtFull(FIXED_ANNUAL) + '/year');
    html += statCard('Contribution Margin', pct(CONTRIBUTION_MARGIN * 100), 'Revenue minus variable costs');
    html += statCard('Break-Even Revenue', fmtFull(breakEven), fmtFull(breakEven / 12) + '/month');
    html += '</div>';

    // Fixed cost breakdown table
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Expense</th><th>Monthly</th><th>Annual</th><th>% of Fixed</th></tr></thead><tbody>';
    Object.keys(FIXED_COSTS).forEach(function (k) {
      var v = FIXED_COSTS[k];
      var annPct = (v / FIXED_MONTHLY * 100).toFixed(1);
      html += '<tr><td>' + k + '</td><td>' + fmtFull(v) + '</td><td>' + fmtFull(v * 12) + '</td><td>' + annPct + '%</td></tr>';
    });
    html += '<tr style="font-weight:600"><td>Total</td><td>' + fmtFull(FIXED_MONTHLY) + '</td><td>' + fmtFull(FIXED_ANNUAL) + '</td><td>100%</td></tr>';
    html += '</tbody></table></div>';

    // Break-even visual
    var revPctOfBE = (rev.runRate / breakEven) * 100;
    var beColor = revPctOfBE >= 100 ? 'green' : revPctOfBE >= 80 ? 'amber' : 'red';
    html += '<div style="margin-top:12px">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">';
    html += '<span class="stat-label">Run Rate vs Break-Even (' + fmtFull(breakEven) + ')</span>';
    html += '<span class="stat-label">' + pct(revPctOfBE) + '</span></div>';
    html += '<div class="progress-bar"><div class="progress-fill ' + beColor + '" style="width:' + Math.min(revPctOfBE, 100) + '%"></div></div>';
    html += '</div>';

    // Key thresholds
    html += '<div class="grid grid-3" style="margin-top:12px">';
    html += statCard('Break-Even', fmtFull(breakEven), 'Minimum to cover fixed', rev.runRate >= breakEven ? 'up' : 'down');
    html += statCard('Debt Service Floor', fmtFull(debtServiceFloor), 'Comfortable SBA coverage', rev.runRate >= debtServiceFloor ? 'up' : 'down');
    html += statCard('FY26 Target', fmtFull(FY26_TARGET), 'Growth objective', rev.runRate >= FY26_TARGET ? 'up' : 'down');
    html += '</div>';

    html += '</div>'; // card

    // ============ CAPACITY MODEL ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Capacity Model</h3>';
    html += '<span class="card-subtitle">Rig utilization and theoretical output</span></div>';

    html += '<div class="grid grid-4">';
    html += statCard('Working Days/Year', WORKING_DAYS_YR.toString(), 'Weather-adjusted');
    html += statCard('Avg Project Value', fmtFull(AVG_PROJECT_VALUE), '');
    html += statCard('Avg Duration', AVG_PROJECT_DAYS + ' days', '');
    html += statCard('Per-Rig Capacity', fmtFull(rigCapacity), WORKING_DAYS_YR + ' days / ' + AVG_PROJECT_DAYS + ' = ' + Math.round(WORKING_DAYS_YR / AVG_PROJECT_DAYS) + ' projects');
    html += '</div>';

    // Rig table
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Rigs</th><th>Theoretical Max</th><th>At 85% Utilization</th><th>At 70% Utilization</th><th>Hits $6M Target?</th></tr></thead><tbody>';
    [1, 2, 3, 4].forEach(function (rigs) {
      var max = rigCapacity * rigs;
      var at85 = max * 0.85;
      var at70 = max * 0.70;
      var hits = at85 >= FY26_TARGET;
      html += '<tr' + (rigs === 3 ? ' style="font-weight:600"' : '') + '>';
      html += '<td>' + rigs + ' rig' + (rigs > 1 ? 's' : '') + (rigs === 3 ? ' (current fleet)' : '') + '</td>';
      html += '<td>' + fmtFull(max) + '</td>';
      html += '<td>' + fmtFull(at85) + '</td>';
      html += '<td>' + fmtFull(at70) + '</td>';
      html += '<td><span class="badge-status ' + (hits ? 'bid' : 'no-bid') + '">' + (hits ? 'Yes' : 'No') + '</span></td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    // Utilization needed
    var utilNeeded = (FY26_TARGET / (rigCapacity * 3)) * 100;
    var utilColor = utilNeeded <= 85 ? 'green' : utilNeeded <= 95 ? 'amber' : 'red';
    html += '<div style="margin-top:12px">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">';
    html += '<span class="stat-label">3-Rig Utilization Needed for $6M</span>';
    html += '<span class="stat-label">' + pct(utilNeeded) + '</span></div>';
    html += '<div class="progress-bar"><div class="progress-fill ' + utilColor + '" style="width:' + Math.min(utilNeeded, 100) + '%"></div></div>';
    html += '</div>';

    html += '</div>'; // card

    // ============ CASH FLOW SUMMARY ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Cash Flow Summary</h3>';
    html += '<span class="card-subtitle">Monthly estimate based on run rate</span></div>';

    html += '<div class="grid grid-4">';
    html += statCard('Monthly Inflow', fmtFull(monthlyInflow), 'Based on run rate');
    html += statCard('Fixed Outflow', fmtFull(FIXED_MONTHLY), 'See breakdown above');
    html += statCard('Variable Outflow', fmtFull(monthlyVariable), '83% of revenue');
    html += statCard('Net Monthly', fmtFull(monthlyNet), monthlyNet >= 0 ? 'Positive' : 'Negative', monthlyNet >= 0 ? 'up' : 'down');
    html += '</div>';

    // 13-Week Forecast Template
    html += '<div style="margin-top:16px"><h4 class="card-title" style="font-size:14px;margin-bottom:8px">13-Week Cash Flow Forecast</h4></div>';

    var weeks = [];
    var today = new Date();
    for (var i = 0; i < 13; i++) {
      var d = new Date(today);
      d.setDate(d.getDate() + i * 7);
      weeks.push('Wk ' + (i + 1) + ' (' + (d.getMonth() + 1) + '/' + d.getDate() + ')');
    }

    html += '<div class="table-wrap" style="overflow-x:auto"><table style="min-width:900px">';
    html += '<thead><tr><th>Category</th>';
    weeks.forEach(function (w) { html += '<th style="font-size:11px;min-width:65px">' + w + '</th>'; });
    html += '</tr></thead><tbody>';

    // Inflows row
    var weeklyInflow = monthlyInflow / 4.33;
    html += '<tr><td>Inflows</td>';
    weeks.forEach(function () { html += '<td>' + fmt(weeklyInflow) + '</td>'; });
    html += '</tr>';

    // Outflows row
    var weeklyOutflow = (FIXED_MONTHLY + monthlyVariable) / 4.33;
    html += '<tr><td>Outflows</td>';
    weeks.forEach(function () { html += '<td>(' + fmt(weeklyOutflow) + ')</td>'; });
    html += '</tr>';

    // Net row
    var weeklyNet = weeklyInflow - weeklyOutflow;
    html += '<tr style="font-weight:600"><td>Net</td>';
    var cumulative = 0;
    weeks.forEach(function () {
      cumulative += weeklyNet;
      html += '<td style="color:' + (weeklyNet >= 0 ? 'var(--green)' : 'var(--red)') + '">' + fmt(weeklyNet) + '</td>';
    });
    html += '</tr>';

    // Cumulative row
    html += '<tr style="font-weight:600"><td>Cumulative</td>';
    cumulative = 0;
    weeks.forEach(function () {
      cumulative += weeklyNet;
      html += '<td style="color:' + (cumulative >= 0 ? 'var(--green)' : 'var(--red)') + '">' + fmt(cumulative) + '</td>';
    });
    html += '</tr>';

    html += '</tbody></table></div>';

    html += '</div>'; // card

    app.innerHTML = html;
  }

  // ---- STAT CARD HELPER ----
  function statCard(label, value, change, direction) {
    var h = '<div class="stat-card">';
    h += '<span class="stat-label">' + label + '</span>';
    h += '<span class="stat-value">' + value + '</span>';
    if (change) {
      h += '<span class="stat-change' + (direction ? ' ' + direction : '') + '">' + change + '</span>';
    }
    h += '</div>';
    return h;
  }

  // ---- INIT ----
  render();

  // Re-render if data loads later
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pf-data-loaded', render);
  }

})();
