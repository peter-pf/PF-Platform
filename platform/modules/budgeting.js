// Budgeting & Forecasting Module — rewritten clean June 1
// Renders into #mod-budgeting > #budgeting-app
// Uses inline CSS grid (not class-based) to avoid stat-card/stat-value conflicts
(function () {
  'use strict';

  var FY26_TARGET = 6000000;
  var FY_START_MONTH = 9;
  var FY_START_YEAR = 2025;
  var FIXED = [
    { name: 'SBA Debt Service', monthly: 12398 },
    { name: 'Insurance', monthly: 9300 },
    { name: 'Yard Lease', monthly: 2500 },
    { name: 'Trucks', monthly: 2000 },
    { name: 'Admin / Office', monthly: 2000 },
    { name: 'Equipment Depreciation', monthly: 7000 }
  ];
  var MARGIN = 0.17;

  function safe(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function dollar(v) { return '$' + Math.round(safe(v)).toLocaleString('en-US'); }
  function pct(v) { return Math.round(safe(v)) + '%'; }
  function getBids() { return (typeof LIVE_BIDS !== 'undefined') ? LIVE_BIDS : []; }

  function monthsElapsed() {
    var now = new Date();
    var m = (now.getFullYear() - FY_START_YEAR) * 12 + (now.getMonth() - FY_START_MONTH) + now.getDate() / 30;
    return Math.max(m, 0.5);
  }

  function fixedMonthly() {
    return FIXED.reduce(function (s, f) { return s + f.monthly; }, 0);
  }

  // Each metric gets its own card div with all styles inline — no shared CSS classes
  function metric(label, value, sub) {
    return '<div style="background:linear-gradient(135deg,#EBF5FF,#F5FAFF);border:1px solid #D0E4F5;border-top:3px solid #006DB0;border-radius:8px;padding:14px 16px">' +
      '<div style="font-size:0.72rem;font-weight:500;text-transform:uppercase;letter-spacing:0.04em;color:#005A91;margin-bottom:6px">' + label + '</div>' +
      '<div style="font-size:0.88rem;font-weight:600;color:#000">' + value + '</div>' +
      (sub ? '<div style="font-size:0.72rem;color:#8A9AAB;margin-top:4px">' + sub + '</div>' : '') +
      '</div>';
  }

  function bar(label, val, sub) {
    var c = val > 60 ? '#16a34a' : val > 30 ? '#d97706' : '#dc2626';
    return '<div>' +
      '<div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:4px"><span>' + label + '</span><span>' + (sub || (val + '%')) + '</span></div>' +
      '<div style="height:6px;background:#e8e8e8;border-radius:3px;overflow:hidden"><div style="height:100%;width:' + Math.min(val, 100) + '%;background:' + c + ';border-radius:3px"></div></div></div>';
  }

  function render() {
    var app = document.getElementById('budgeting-app');
    if (!app) return;

    var bids = getBids();
    var awarded = bids.filter(function (b) { return b.bid_status === 'Awarded' || b.bid_status === 'Completed'; });
    var awardedTotal = awarded.reduce(function (s, b) { return s + safe(b.bid_value); }, 0);
    var months = monthsElapsed();
    var runRate = (awardedTotal / months) * 12;
    var gap = FY26_TARGET - runRate;
    var pacePct = Math.round((awardedTotal / FY26_TARGET) * 100);
    var fm = fixedMonthly();
    var fa = fm * 12;
    var breakEven = Math.round(fa / MARGIN);
    var h = '';

    // Revenue Forecast
    h += '<div class="card" style="margin-bottom:16px"><div class="card-header"><span class="card-title">Revenue Forecast</span><span class="card-subtitle">FY26 (Oct 2025 - Sep 2026)</span></div>';
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">';
    h += metric('FY26 Target', dollar(FY26_TARGET));
    h += metric('Awarded YTD', dollar(awardedTotal), awarded.length + ' projects');
    h += metric('Run Rate', dollar(runRate), pct(runRate / FY26_TARGET * 100) + ' of target');
    h += metric('Gap to Target', dollar(Math.abs(gap)), gap > 0 ? '<span style="color:#e74c3c">Behind</span>' : '<span style="color:#27ae60">Ahead</span>');
    h += '</div>';
    h += '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:16px">';
    h += bar('Revenue Pace', pacePct);
    h += bar('FY Elapsed', Math.round(months / 12 * 100), months.toFixed(1) + ' / 12 months');
    h += '</div></div>';

    // Break-Even
    h += '<div class="card" style="margin-bottom:16px"><div class="card-header"><span class="card-title">Break-Even Analysis</span><span class="card-subtitle">Fixed costs vs. contribution margin</span></div>';
    h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">';
    h += metric('Fixed Costs (Monthly)', dollar(fm), dollar(fa) + '/year');
    h += metric('Contribution Margin', '17%', 'Revenue minus variable costs');
    h += metric('Break-Even Revenue', dollar(breakEven), dollar(Math.round(breakEven / 12)) + '/month');
    h += '</div>';
    h += '<div class="table-wrap" style="margin-top:12px"><table style="width:100%;border-collapse:collapse;font-size:0.82rem">';
    h += '<thead><tr>';
    ['Expense','Monthly','Annual','% of Fixed'].forEach(function (c) { h += '<th style="background:#2B3E50;color:#fff;padding:8px 12px;text-align:left;font-size:0.72rem;text-transform:uppercase">' + c + '</th>'; });
    h += '</tr></thead><tbody>';
    FIXED.forEach(function (f) {
      h += '<tr><td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + f.name + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + dollar(f.monthly) + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + dollar(f.monthly * 12) + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + pct(f.monthly / fm * 100) + '</td></tr>';
    });
    h += '</tbody></table></div></div>';

    // Capacity
    h += '<div class="card" style="margin-bottom:16px"><div class="card-header"><span class="card-title">Capacity Model</span><span class="card-subtitle">200 working days/year, $166K avg, 18-day avg</span></div>';
    h += '<div class="table-wrap"><table style="width:100%;border-collapse:collapse;font-size:0.82rem">';
    h += '<thead><tr>';
    ['Rigs','Max Days','Max Projects','Max Revenue','At 85%','At 70%'].forEach(function (c) { h += '<th style="background:#2B3E50;color:#fff;padding:8px 12px;text-align:left;font-size:0.72rem;text-transform:uppercase">' + c + '</th>'; });
    h += '</tr></thead><tbody>';
    [1,2,3].forEach(function (r) {
      var days = r * 200, proj = Math.floor(days / 18), rev = proj * 166000;
      h += '<tr><td style="padding:8px 12px;border-bottom:1px solid #E2EAF0;font-weight:600">' + r + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + days + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + proj + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + dollar(rev) + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + dollar(rev * 0.85) + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + dollar(rev * 0.70) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div style="font-size:0.75rem;color:#8A9AAB;margin-top:8px">Note: $6M target requires 3 rigs at 85%+ utilization or larger average project size.</div></div>';

    // Cash Flow
    var monthlyRev = awardedTotal > 0 ? Math.round(runRate / 12) : 0;
    var monthlyVar = Math.round(monthlyRev * 0.83);
    var monthlyNet = monthlyRev - fm - monthlyVar;
    h += '<div class="card"><div class="card-header"><span class="card-title">Monthly Cash Flow Summary</span></div>';
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">';
    h += metric('Monthly Revenue', dollar(monthlyRev), 'Based on run rate');
    h += metric('Fixed Costs', dollar(fm), 'Monthly fixed');
    h += metric('Variable Costs', dollar(monthlyVar), '83% of revenue');
    h += metric('Net Monthly', dollar(monthlyNet), monthlyNet >= 0 ? '<span style="color:#27ae60">Positive</span>' : '<span style="color:#e74c3c">Negative</span>');
    h += '</div></div>';

    app.innerHTML = h;
  }

  render();
})();
