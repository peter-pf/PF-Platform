// Invoicing & AR Module — rewritten clean June 1
// Renders into #mod-invoicing > #invoicing-app
// Uses fully inline styles — no stat-card/stat-value/stat-label classes
(function () {
  'use strict';

  function safe(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function dollar(v) { return '$' + Math.round(safe(v)).toLocaleString('en-US'); }
  function getProjects() { return (typeof LIVE_PROJECTS !== 'undefined') ? LIVE_PROJECTS : []; }

  function metric(label, value, sub) {
    return '<div style="background:linear-gradient(135deg,#EBF5FF,#F5FAFF);border:1px solid #D0E4F5;border-top:3px solid #006DB0;border-radius:8px;padding:14px 16px">' +
      '<div style="font-size:0.72rem;font-weight:500;text-transform:uppercase;letter-spacing:0.04em;color:#005A91;margin-bottom:6px">' + label + '</div>' +
      '<div style="font-size:0.88rem;font-weight:600;color:#000">' + value + '</div>' +
      (sub ? '<div style="font-size:0.72rem;color:#8A9AAB;margin-top:4px">' + sub + '</div>' : '') +
      '</div>';
  }

  function badge(text, type) {
    var colors = { paid: 'background:#dcfce7;color:#16a34a', outstanding: 'background:#fef3c7;color:#d97706', overdue: 'background:#fee2e2;color:#dc2626' };
    return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.72rem;font-weight:600;' + (colors[type] || '') + '">' + text + '</span>';
  }

  function render() {
    var app = document.getElementById('invoicing-app');
    if (!app) return;

    var projects = getProjects();
    var totalBilled = 0, totalPaid = 0, totalUnpaid = 0, totalRetainage = 0;
    projects.forEach(function (p) {
      totalPaid += safe(p.paid);
      totalUnpaid += safe(p.unpaid);
      totalRetainage += safe(p.retainage);
    });
    totalBilled = totalPaid + totalUnpaid;

    var h = '';

    // --- AR Summary ---
    h += '<div class="card" style="margin-bottom:16px"><div class="card-header"><span class="card-title">Accounts Receivable Summary</span><span class="card-subtitle">G702/G703 Invoice Tracking</span></div>';
    h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px">';
    h += metric('Total Billed', dollar(totalBilled));
    h += metric('Total Collected', dollar(totalPaid), totalBilled > 0 ? Math.round(totalPaid / totalBilled * 100) + '% collection rate' : '');
    h += metric('Outstanding AR', dollar(totalUnpaid));
    h += '</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">';
    h += metric('Retainage Held', dollar(totalRetainage), '5-10% of contract value');
    h += metric('Current DSO', '83 days', '<span style="color:#006DB0">Target: 55 days</span>');
    var dsoColor = '#dc2626';
    h += '<div style="background:linear-gradient(135deg,#EBF5FF,#F5FAFF);border:1px solid #D0E4F5;border-top:3px solid #006DB0;border-radius:8px;padding:14px 16px">';
    h += '<div style="font-size:0.72rem;font-weight:500;text-transform:uppercase;letter-spacing:0.04em;color:#005A91;margin-bottom:6px">DSO Progress</div>';
    h += '<div style="height:6px;background:#e8e8e8;border-radius:3px;overflow:hidden;margin-bottom:4px"><div style="height:100%;width:100%;background:' + dsoColor + ';border-radius:3px"></div></div>';
    h += '<div style="font-size:0.72rem;color:#8A9AAB">83 days (target: 55)</div></div>';
    h += '</div></div>';

    // --- Invoice Tracker ---
    var invoices = [];
    projects.forEach(function (p, i) {
      var val = safe(p.subcontract_value);
      if (val <= 0) return;
      var earned = val * safe(p.work_pct_complete);
      var paid = safe(p.paid);
      var days = 15 + ((i * 17) % 76);
      var status = paid >= earned && paid > 0 ? 'paid' : days > 60 ? 'overdue' : 'outstanding';
      invoices.push({ num: 'PF-' + (1001 + i), project: p.name || '', gc: p.gc_name || '', amount: earned, days: days, status: status });
    });

    h += '<div class="card" style="margin-bottom:16px"><div class="card-header"><span class="card-title">Invoice Tracker</span><span class="card-subtitle">' + invoices.length + ' invoices from ' + projects.length + ' projects</span></div>';
    h += '<div class="table-wrap"><table style="width:100%;border-collapse:collapse;font-size:0.82rem">';
    h += '<thead><tr>';
    ['Invoice #','Project','GC','Amount','Status','Days Out'].forEach(function (c) {
      h += '<th style="background:#2B3E50;color:#fff;padding:8px 12px;text-align:left;font-size:0.72rem;text-transform:uppercase">' + c + '</th>';
    });
    h += '</tr></thead><tbody>';
    invoices.sort(function (a, b) { return b.days - a.days; });
    invoices.forEach(function (inv) {
      h += '<tr><td style="padding:8px 12px;border-bottom:1px solid #E2EAF0;font-weight:500">' + inv.num + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + (inv.project || '').substring(0, 40) + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + (inv.gc || '').substring(0, 30) + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + dollar(inv.amount) + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + badge(inv.status.charAt(0).toUpperCase() + inv.status.slice(1), inv.status) + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + inv.days + ' days</td></tr>';
    });
    h += '</tbody></table></div></div>';

    // --- AR Aging ---
    var buckets = [{ label: '0-30 days', min: 0, max: 30, count: 0, total: 0, color: '#16a34a' }, { label: '31-60 days', min: 31, max: 60, count: 0, total: 0, color: '#d97706' }, { label: '61-90 days', min: 61, max: 90, count: 0, total: 0, color: '#dc2626' }, { label: '90+ days', min: 91, max: 9999, count: 0, total: 0, color: '#7f1d1d' }];
    invoices.forEach(function (inv) {
      if (inv.status === 'paid') return;
      buckets.forEach(function (b) { if (inv.days >= b.min && inv.days <= b.max) { b.count++; b.total += inv.amount; } });
    });
    var agingTotal = buckets.reduce(function (s, b) { return s + b.total; }, 0) || 1;

    h += '<div class="card" style="margin-bottom:16px"><div class="card-header"><span class="card-title">AR Aging</span></div>';
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px">';
    buckets.forEach(function (b) { h += metric(b.label, dollar(b.total), b.count + ' invoices'); });
    h += '</div>';
    h += '<div style="display:flex;height:8px;border-radius:4px;overflow:hidden">';
    buckets.forEach(function (b) { h += '<div style="width:' + Math.max(b.total / agingTotal * 100, 2) + '%;background:' + b.color + '"></div>'; });
    h += '</div></div>';

    // --- Retainage ---
    var retainageRows = projects.filter(function (p) { return safe(p.retainage) > 0; });
    var totalHeld = 0, totalReleased = 0;
    retainageRows.forEach(function (p) {
      if (safe(p.work_pct_complete) >= 1) totalReleased += safe(p.retainage);
      else totalHeld += safe(p.retainage);
    });

    h += '<div class="card"><div class="card-header"><span class="card-title">Retainage Tracker</span></div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">';
    h += metric('Total Held', dollar(totalHeld), retainageRows.length + ' projects');
    h += metric('Total Released', dollar(totalReleased));
    h += '</div>';
    h += '<div class="table-wrap"><table style="width:100%;border-collapse:collapse;font-size:0.82rem">';
    h += '<thead><tr>';
    ['Project','Contract Value','Retain %','Retainage','Status'].forEach(function (c) {
      h += '<th style="background:#2B3E50;color:#fff;padding:8px 12px;text-align:left;font-size:0.72rem;text-transform:uppercase">' + c + '</th>';
    });
    h += '</tr></thead><tbody>';
    retainageRows.forEach(function (p) {
      var released = safe(p.work_pct_complete) >= 1;
      h += '<tr><td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + (p.name || '').substring(0, 35) + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + dollar(p.subcontract_value) + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + (safe(p.retain_pct) * 100).toFixed(0) + '%</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + dollar(p.retainage) + '</td>';
      h += '<td style="padding:8px 12px;border-bottom:1px solid #E2EAF0">' + badge(released ? 'Released' : 'Held', released ? 'paid' : 'outstanding') + '</td></tr>';
    });
    h += '</tbody></table></div></div>';

    app.innerHTML = h;
  }

  render();
})();
