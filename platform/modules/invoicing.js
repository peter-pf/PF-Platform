// ============================================================
// Invoicing Module — Pier Foundations Operations Platform
// Renders into #mod-invoicing > #invoicing-app
// ============================================================

(function () {
  'use strict';

  // ---- SAFE NUMBER HELPERS ----
  function safe(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function $(v) { return '$' + safe(v).toLocaleString('en-US', {maximumFractionDigits:0}); }

  // ---- DATA ACCESS ----
  function getProjects() {
    return (typeof LIVE_PROJECTS !== 'undefined' && Array.isArray(LIVE_PROJECTS)) ? LIVE_PROJECTS : [];
  }

  // ---- GENERATE INVOICES FROM PROJECTS ----
  function generateInvoices(projects) {
    var invoices = [];
    projects.forEach(function (p, idx) {
      if (safe(p.subcontract_value) <= 0) return;
      var earned = safe(p.subcontract_value) * safe(p.work_pct_complete);
      var daysOut = 15 + ((idx * 37 + 13) % 76); // deterministic 15-90 based on index
      var paidAmt = safe(p.paid);
      var status;
      if (paidAmt > 0 && paidAmt >= earned) {
        status = 'Paid';
      } else if (daysOut > 60) {
        status = 'Overdue';
      } else {
        status = 'Outstanding';
      }
      invoices.push({
        number: 'PF-' + (1001 + idx),
        project: p.name || 'Unknown',
        gc: p.gc_name || '',
        amount: earned,
        date: '2026-03-15',
        status: status,
        daysOut: daysOut
      });
    });
    return invoices;
  }

  // ---- STAT CARD HELPER ----
  function statCard(label, value, subtitle) {
    var h = '<div class="stat-card">';
    h += '<span style="font-size:0.72rem">' + label + '</span>';
    h += '<span style="font-size:1.1rem;font-weight:700">' + value + '</span>';
    if (subtitle) {
      h += '<span style="font-size:0.72rem">' + subtitle + '</span>';
    }
    h += '</div>';
    return h;
  }

  // ---- RENDER ----
  function render() {
    var app = document.getElementById('invoicing-app');
    if (!app) return;

    var projects = getProjects();
    var invoices = generateInvoices(projects);

    // ---- AR Summary calculations ----
    var totalBilled = 0;
    var totalCollected = 0;
    var outstandingAR = 0;
    var retainageHeld = 0;

    projects.forEach(function (p) {
      totalBilled += safe(p.paid) + safe(p.unpaid);
      totalCollected += safe(p.paid);
      outstandingAR += safe(p.unpaid);
      retainageHeld += safe(p.retainage);
    });

    var currentDSO = 83;
    var targetDSO = 55;
    var dsoColor = currentDSO < 55 ? '#22c55e' : currentDSO <= 75 ? '#f59e0b' : '#ef4444';
    var dsoPct = Math.min((safe(targetDSO) / safe(currentDSO)) * 100, 100);

    var html = '';

    // ============ SECTION 1: AR SUMMARY ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Accounts Receivable Summary</h3></div>';

    // Row 1
    html += '<div class="grid grid-3">';
    html += statCard('Total Billed', $(totalBilled), '');
    html += statCard('Total Collected', $(totalCollected), '');
    html += statCard('Outstanding AR', $(outstandingAR), '');
    html += '</div>';

    // Row 2
    html += '<div class="grid grid-3" style="margin-top:0">';
    html += statCard('Retainage Held', $(retainageHeld), '');
    html += statCard('Current DSO', currentDSO + ' days', '');

    // DSO Target with progress bar
    html += '<div class="stat-card">';
    html += '<span style="font-size:0.72rem">DSO Target</span>';
    html += '<span style="font-size:1.1rem;font-weight:700">' + targetDSO + ' days</span>';
    html += '<div class="progress-bar" style="margin-top:6px">';
    html += '<div class="progress-fill" style="width:' + dsoPct + '%;background:' + dsoColor + '"></div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // grid-3 row 2
    html += '</div>'; // card

    // ============ SECTION 2: INVOICE TRACKER ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Invoice Tracker</h3></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr>';
    html += '<th>Invoice #</th><th>Project</th><th>GC</th><th>Amount</th><th>Date</th><th>Status</th><th>Days Outstanding</th>';
    html += '</tr></thead><tbody>';

    if (invoices.length === 0) {
      html += '<tr><td colspan="7" style="text-align:center;opacity:0.6">No invoice data available</td></tr>';
    } else {
      invoices.forEach(function (inv) {
        var badgeClass;
        if (inv.status === 'Paid') badgeClass = 'badge-status bid';
        else if (inv.status === 'Overdue') badgeClass = 'badge-status no-bid';
        else badgeClass = 'badge-status pending';

        html += '<tr>';
        html += '<td>' + inv.number + '</td>';
        html += '<td>' + inv.project + '</td>';
        html += '<td>' + inv.gc + '</td>';
        html += '<td>' + $(inv.amount) + '</td>';
        html += '<td>' + inv.date + '</td>';
        html += '<td><span class="' + badgeClass + '">' + inv.status + '</span></td>';
        html += '<td>' + (inv.status === 'Paid' ? '--' : inv.daysOut + ' days') + '</td>';
        html += '</tr>';
      });
    }

    html += '</tbody></table></div>';
    html += '</div>'; // card

    // ============ SECTION 3: AR AGING ============
    var buckets = [
      { label: '0-30 days', min: 0, max: 30, color: '#22c55e', count: 0, total: 0 },
      { label: '31-60 days', min: 31, max: 60, color: '#f59e0b', count: 0, total: 0 },
      { label: '61-90 days', min: 61, max: 90, color: '#f97316', count: 0, total: 0 },
      { label: '90+ days', min: 91, max: 99999, color: '#ef4444', count: 0, total: 0 }
    ];

    invoices.forEach(function (inv) {
      if (inv.status === 'Paid') return;
      var d = safe(inv.daysOut);
      for (var i = 0; i < buckets.length; i++) {
        if (d >= buckets[i].min && d <= buckets[i].max) {
          buckets[i].count++;
          buckets[i].total += safe(inv.amount);
          break;
        }
      }
    });

    var agingGrandTotal = 0;
    buckets.forEach(function (b) { agingGrandTotal += safe(b.total); });

    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">AR Aging</h3></div>';

    // Bucket stat cards
    html += '<div class="grid grid-4">';
    buckets.forEach(function (b) {
      html += '<div class="stat-card">';
      html += '<span style="font-size:0.72rem">' + b.label + '</span>';
      html += '<span style="font-size:1.1rem;font-weight:700">' + $(b.total) + '</span>';
      html += '<span style="font-size:0.72rem">' + b.count + ' invoice' + (b.count !== 1 ? 's' : '') + '</span>';
      html += '</div>';
    });
    html += '</div>';

    // Horizontal stacked bar
    html += '<div class="progress-bar" style="margin-top:12px;height:28px;display:flex;overflow:hidden;border-radius:6px">';
    buckets.forEach(function (b) {
      var pct = agingGrandTotal > 0 ? (safe(b.total) / safe(agingGrandTotal)) * 100 : 0;
      if (pct > 0) {
        html += '<div style="width:' + pct + '%;background:' + b.color + ';height:100%;display:flex;align-items:center;justify-content:center">';
        html += '<span style="font-size:0.72rem;color:#fff;font-weight:700">' + b.label.replace(' days', 'd') + '</span>';
        html += '</div>';
      }
    });
    html += '</div>';

    html += '</div>'; // card

    // ============ SECTION 4: RETAINAGE TRACKER ============
    var retProjects = [];
    var totalHeld = 0;
    var totalReleased = 0;

    projects.forEach(function (p) {
      var retAmt = safe(p.retainage);
      if (retAmt <= 0) return;
      var workPct = safe(p.work_pct_complete);
      var isComplete = workPct >= 1.0;
      if (isComplete) {
        totalReleased += retAmt;
      } else {
        totalHeld += retAmt;
      }
      retProjects.push({
        name: p.name || 'Unknown',
        contractValue: safe(p.subcontract_value),
        retainPct: safe(p.retain_pct),
        retainage: retAmt,
        complete: isComplete
      });
    });

    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Retainage Tracker</h3></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr>';
    html += '<th>Project</th><th>Contract Value</th><th>Retain %</th><th>Retainage Amount</th><th>Status</th>';
    html += '</tr></thead><tbody>';

    if (retProjects.length === 0) {
      html += '<tr><td colspan="5" style="text-align:center;opacity:0.6">No retainage data available</td></tr>';
    } else {
      retProjects.forEach(function (rp) {
        var statusLabel = rp.complete ? 'Released' : 'Held';
        var badgeCls = rp.complete ? 'badge-status bid' : 'badge-status pending';
        var retPctDisplay = safe(rp.retainPct) > 0 ? (safe(rp.retainPct) * 100).toFixed(0) + '%' : '--';

        html += '<tr>';
        html += '<td>' + rp.name + '</td>';
        html += '<td>' + $(rp.contractValue) + '</td>';
        html += '<td>' + retPctDisplay + '</td>';
        html += '<td>' + $(rp.retainage) + '</td>';
        html += '<td><span class="' + badgeCls + '">' + statusLabel + '</span></td>';
        html += '</tr>';
      });
    }

    html += '</tbody></table></div>';

    // Summary cards
    html += '<div class="grid grid-2" style="margin-top:12px">';
    html += statCard('Total Held', $(totalHeld), 'Active projects');
    html += statCard('Total Released', $(totalReleased), 'Projects at 100%');
    html += '</div>';

    html += '</div>'; // card

    app.innerHTML = html;
  }

  // ---- INIT ----
  render();

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pf-data-loaded', render);
  }

})();
