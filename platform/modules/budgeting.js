// ============================================================
// Budgeting & Forecasting Module — Pier Foundations Operations Platform
// Renders into #mod-budgeting > #budgeting-app
// ============================================================

(function () {
  'use strict';

  // ---- SAFE NUMBER FORMATTER ----
  function safe(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  // ---- CONSTANTS ----
  var FY26_TARGET = 6000000;
  var FY_START_YEAR = 2025;
  var FY_START_MONTH = 9; // October is month index 9
  var CONTRIBUTION_MARGIN = 0.17;
  var WORKING_DAYS_YR = 200;
  var AVG_PROJECT_VALUE = 166000;
  var AVG_PROJECT_DAYS = 18;

  var FIXED_COSTS = [
    { name: 'SBA Debt Service',       monthly: 12398, annual: 148776, pct: 35.2 },
    { name: 'Insurance',              monthly: 9300,  annual: 111600, pct: 26.4 },
    { name: 'Yard Lease',             monthly: 2500,  annual: 30000,  pct: 7.1  },
    { name: 'Trucks',                 monthly: 2000,  annual: 24000,  pct: 5.7  },
    { name: 'Admin / Office',         monthly: 2000,  annual: 24000,  pct: 5.7  },
    { name: 'Equipment Depreciation', monthly: 7000,  annual: 84000,  pct: 19.9 }
  ];

  var FIXED_MONTHLY = 35198;
  var FIXED_ANNUAL = 422376;
  var BREAK_EVEN = 2484565;
  var BREAK_EVEN_MONTHLY = 207047;

  var CAPACITY_TABLE = [
    { rigs: 1, maxDays: 200, maxProjects: 11, maxRev: 1830000, at85: 1556000, at70: 1281000 },
    { rigs: 2, maxDays: 400, maxProjects: 22, maxRev: 3660000, at85: 3111000, at70: 2562000 },
    { rigs: 3, maxDays: 600, maxProjects: 33, maxRev: 5490000, at85: 4667000, at70: 3843000 }
  ];

  // ---- DATA ACCESS ----
  function getBids() {
    return (typeof LIVE_BIDS !== 'undefined' && Array.isArray(LIVE_BIDS)) ? LIVE_BIDS : [];
  }

  // ---- FORMATTING ----
  function dollar(n) {
    n = safe(n);
    return '$' + Math.round(n).toLocaleString();
  }

  function pct(n) {
    return safe(n).toFixed(1) + '%';
  }

  function pctInt(n) {
    return Math.round(safe(n)) + '%';
  }

  // ---- CALCULATIONS ----
  function monthsElapsed() {
    var now = new Date();
    var months = (now.getFullYear() - FY_START_YEAR) * 12 + (now.getMonth() - FY_START_MONTH);
    months += now.getDate() / 30;
    return Math.max(safe(months), 0.5);
  }

  function calcAwardedYTD() {
    var bids = getBids();
    var total = 0;
    for (var i = 0; i < bids.length; i++) {
      var b = bids[i];
      if (b.bid_status === 'Awarded' || b.bid_status === 'Completed') {
        total += safe(b.bid_value);
      }
    }
    return total;
  }

  // ---- STAT CARD BUILDER ----
  function statCard(label, value, extra) {
    var h = '<div class="stat-card">';
    h += '<span style="font-size:0.72rem">' + label + '</span>';
    h += '<span style="font-size:1.1rem;font-weight:600">' + value + '</span>';
    if (extra) {
      h += '<span style="font-size:0.72rem">' + extra + '</span>';
    }
    h += '</div>';
    return h;
  }

  // ---- PROGRESS BAR BUILDER ----
  function progressBar(label, valuePct, rightLabel) {
    var w = Math.max(0, Math.min(safe(valuePct), 100));
    var h = '<div style="margin-top:12px">';
    h += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">';
    h += '<span style="font-size:0.72rem">' + label + '</span>';
    h += '<span style="font-size:0.72rem">' + rightLabel + '</span>';
    h += '</div>';
    h += '<div class="progress-bar"><div class="progress-fill" style="width:' + w + '%"></div></div>';
    h += '</div>';
    return h;
  }

  // ---- MAIN RENDER ----
  function render() {
    var app = document.getElementById('budgeting-app');
    if (!app) return;

    var awardedYTD = calcAwardedYTD();
    var elapsed = monthsElapsed();
    var runRate = safe((awardedYTD / elapsed) * 12);
    var gap = safe(FY26_TARGET - runRate);
    var revenuePacePct = safe((awardedYTD / FY26_TARGET) * 100);
    var fyElapsedPct = safe((elapsed / 12) * 100);

    var html = '';

    // ============ SECTION 1: REVENUE FORECAST ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Revenue Forecast</h3></div>';

    html += '<div class="grid grid-4">';
    html += statCard('FY26 Target', dollar(FY26_TARGET));
    html += statCard('Awarded YTD', dollar(awardedYTD));
    html += statCard('Run Rate', dollar(runRate));

    if (gap > 0) {
      html += statCard('Gap to Target', dollar(gap), '<span style="font-size:0.72rem;color:#e74c3c">Behind</span>');
    } else {
      html += statCard('Gap to Target', dollar(Math.abs(gap)), '<span style="font-size:0.72rem;color:#27ae60">Ahead</span>');
    }
    html += '</div>';

    html += progressBar('Revenue Pace', revenuePacePct, pctInt(revenuePacePct));
    html += progressBar('FY Elapsed', fyElapsedPct, safe(elapsed).toFixed(1) + ' / 12 months');

    html += '</div>';

    // ============ SECTION 2: BREAK-EVEN ANALYSIS ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Break-Even Analysis</h3></div>';

    html += '<div class="grid grid-3">';
    html += statCard('Fixed Costs (Monthly)', dollar(FIXED_MONTHLY), dollar(FIXED_ANNUAL) + '/year');
    html += statCard('Contribution Margin', pctInt(safe(CONTRIBUTION_MARGIN * 100)));
    html += statCard('Break-Even Revenue', dollar(BREAK_EVEN), dollar(BREAK_EVEN_MONTHLY) + '/month');
    html += '</div>';

    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Expense</th><th>Monthly</th><th>Annual</th><th>% of Fixed</th></tr></thead>';
    html += '<tbody>';
    for (var i = 0; i < FIXED_COSTS.length; i++) {
      var c = FIXED_COSTS[i];
      html += '<tr>';
      html += '<td>' + c.name + '</td>';
      html += '<td>' + dollar(safe(c.monthly)) + '</td>';
      html += '<td>' + dollar(safe(c.annual)) + '</td>';
      html += '<td>' + safe(c.pct).toFixed(1) + '%</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';

    html += '</div>';

    // ============ SECTION 3: CAPACITY MODEL ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Capacity Model</h3></div>';

    html += '<div class="table-wrap"><table>';
    html += '<thead><tr>';
    html += '<th>Rigs</th><th>Max Days/Year</th><th>Max Projects</th>';
    html += '<th>Max Revenue</th><th>At 85% Util</th><th>At 70% Util</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    for (var j = 0; j < CAPACITY_TABLE.length; j++) {
      var r = CAPACITY_TABLE[j];
      html += '<tr>';
      html += '<td>' + safe(r.rigs) + '</td>';
      html += '<td>' + safe(r.maxDays) + '</td>';
      html += '<td>' + safe(r.maxProjects) + '</td>';
      html += '<td>' + dollar(safe(r.maxRev)) + '</td>';
      html += '<td>' + dollar(safe(r.at85)) + '</td>';
      html += '<td>' + dollar(safe(r.at70)) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';

    html += '<p style="font-size:0.72rem;margin-top:8px;opacity:0.7">';
    html += 'Based on ' + safe(WORKING_DAYS_YR) + ' working days/year, ';
    html += dollar(safe(AVG_PROJECT_VALUE)) + ' avg project, ';
    html += safe(AVG_PROJECT_DAYS) + '-day avg duration. ';
    html += 'Note: No single configuration at current averages reaches the $6M target at realistic utilization.';
    html += '</p>';

    html += '</div>';

    // ============ SECTION 4: CASH FLOW TEMPLATE ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Cash Flow Template</h3></div>';

    var monthlyInflow = safe(awardedYTD / 12);
    var monthlyVariable = safe(monthlyInflow * 0.83);
    var netMonthly = safe(monthlyInflow - safe(FIXED_MONTHLY) - monthlyVariable);

    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Category</th><th>Monthly Est</th></tr></thead>';
    html += '<tbody>';
    html += '<tr><td>Inflows (Revenue / 12)</td><td>' + dollar(monthlyInflow) + '</td></tr>';
    html += '<tr><td>Outflows - Fixed</td><td>' + dollar(safe(FIXED_MONTHLY)) + '</td></tr>';
    html += '<tr><td>Outflows - Variable (83% of revenue)</td><td>' + dollar(monthlyVariable) + '</td></tr>';
    html += '<tr style="font-weight:600"><td>Net Monthly</td><td>' + dollar(netMonthly) + '</td></tr>';
    html += '</tbody></table></div>';

    html += '</div>';

    app.innerHTML = html;
  }

  // ---- INIT ----
  render();

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pf-data-loaded', render);
  }

})();
