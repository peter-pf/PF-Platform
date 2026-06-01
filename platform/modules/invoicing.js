// ============================================================
// Invoice Tracking Module — Pier Foundations Operations Platform
// Renders into #mod-invoicing > #invoicing-app
// ============================================================

(function () {
  'use strict';

  // ---- CONSTANTS ----
  var DEFAULT_DSO = 83;
  var TARGET_DSO = 55;
  var DEFAULT_RETAINAGE_PCT = 0.10; // 10% if not specified

  // ---- DATA ACCESS ----
  function getProjects() {
    return (typeof LIVE_PROJECTS !== 'undefined') ? LIVE_PROJECTS : [];
  }
  function getBids() {
    return (typeof LIVE_BIDS !== 'undefined') ? LIVE_BIDS : [];
  }
  function getCostCodes() {
    return (typeof LIVE_COST_CODES !== 'undefined') ? LIVE_COST_CODES : [];
  }

  // ---- HELPERS ----
  function fmtFull(n) {
    return '$' + Math.round(n).toLocaleString();
  }
  function fmt(n) {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
    return '$' + Math.round(n).toLocaleString();
  }
  function pct(n) { return Math.round(n) + '%'; }

  function daysBetween(d1, d2) {
    return Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
  }

  // ---- GENERATE INVOICES FROM PROJECTS ----
  function generateInvoices(projects) {
    var invoices = [];
    var invNum = 1001;
    var today = new Date();

    projects.forEach(function (p) {
      var contractVal = p.subcontract_value || 0;
      if (contractVal <= 0) return;

      var workPct = p.work_pct_complete || 0;
      var retainPct = p.retain_pct || DEFAULT_RETAINAGE_PCT;
      var paid = p.paid || 0;
      var unpaid = p.unpaid || 0;
      var totalBilled = paid + unpaid;

      // First invoice (earlier work)
      if (workPct > 0) {
        var inv1Amt = Math.min(totalBilled * 0.6, contractVal * workPct * 0.6);
        if (inv1Amt > 0) {
          var submitDate1 = new Date(today);
          submitDate1.setDate(submitDate1.getDate() - Math.round(50 + Math.random() * 40));
          var daysOut1 = daysBetween(submitDate1, today);
          var status1 = paid > 0 ? 'Paid' : (daysOut1 > 60 ? 'Overdue' : 'Outstanding');

          invoices.push({
            number: 'PF-' + invNum++,
            project: p.name,
            gc: p.gc_name || '',
            amount: Math.round(inv1Amt),
            date: submitDate1,
            status: status1,
            daysOut: status1 === 'Paid' ? 0 : daysOut1,
            retainPct: retainPct,
            retainage: Math.round(inv1Amt * retainPct)
          });
        }
      }

      // Second invoice (recent work)
      if (workPct > 0.3) {
        var inv2Amt = totalBilled - (totalBilled * 0.6);
        if (inv2Amt > 0) {
          var submitDate2 = new Date(today);
          submitDate2.setDate(submitDate2.getDate() - Math.round(10 + Math.random() * 30));
          var daysOut2 = daysBetween(submitDate2, today);
          var status2 = daysOut2 > 60 ? 'Overdue' : 'Outstanding';

          invoices.push({
            number: 'PF-' + invNum++,
            project: p.name,
            gc: p.gc_name || '',
            amount: Math.round(inv2Amt),
            date: submitDate2,
            status: status2,
            daysOut: daysOut2,
            retainPct: retainPct,
            retainage: Math.round(inv2Amt * retainPct)
          });
        }
      }
    });

    return invoices;
  }

  // ---- AR SUMMARY CALCULATIONS ----
  function calcAR(projects, invoices) {
    var totalBilled = 0;
    var totalCollected = 0;
    var outstanding = 0;
    var retainageHeld = 0;

    projects.forEach(function (p) {
      var paid = p.paid || 0;
      var unpaid = p.unpaid || 0;
      var retainage = p.retainage || 0;

      totalBilled += paid + unpaid;
      totalCollected += paid;
      outstanding += unpaid;
      retainageHeld += retainage;
    });

    // Calculate estimated DSO from invoices
    var outstandingInvoices = invoices.filter(function (i) { return i.status !== 'Paid'; });
    var avgDays = DEFAULT_DSO;
    if (outstandingInvoices.length > 0) {
      var totalDays = outstandingInvoices.reduce(function (s, i) { return s + i.daysOut; }, 0);
      avgDays = Math.round(totalDays / outstandingInvoices.length);
    }

    return {
      totalBilled: totalBilled,
      totalCollected: totalCollected,
      outstanding: outstanding,
      retainageHeld: retainageHeld,
      dso: avgDays || DEFAULT_DSO,
      targetDSO: TARGET_DSO
    };
  }

  // ---- AGING BUCKETS ----
  function calcAging(invoices) {
    var buckets = {
      '0-30': { count: 0, amount: 0 },
      '31-60': { count: 0, amount: 0 },
      '61-90': { count: 0, amount: 0 },
      '90+': { count: 0, amount: 0 }
    };

    invoices.forEach(function (inv) {
      if (inv.status === 'Paid') return;
      if (inv.daysOut <= 30) { buckets['0-30'].count++; buckets['0-30'].amount += inv.amount; }
      else if (inv.daysOut <= 60) { buckets['31-60'].count++; buckets['31-60'].amount += inv.amount; }
      else if (inv.daysOut <= 90) { buckets['61-90'].count++; buckets['61-90'].amount += inv.amount; }
      else { buckets['90+'].count++; buckets['90+'].amount += inv.amount; }
    });

    return buckets;
  }

  // ---- RENDER ----
  function render() {
    var app = document.getElementById('invoicing-app');
    if (!app) return;

    var projects = getProjects();
    var invoices = generateInvoices(projects);
    var ar = calcAR(projects, invoices);
    var aging = calcAging(invoices);

    var html = '';

    // ============ AR SUMMARY STATS ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Accounts Receivable Summary</h3>';
    html += '<span class="card-subtitle">G702/G703 Invoice Tracking</span></div>';

    html += '<div class="grid grid-3">';
    html += statCard('Total Billed', fmtFull(ar.totalBilled), '');
    html += statCard('Total Collected', fmtFull(ar.totalCollected), pct((ar.totalCollected / (ar.totalBilled || 1)) * 100) + ' collection rate');
    html += statCard('Outstanding AR', fmtFull(ar.outstanding), invoices.filter(function (i) { return i.status !== 'Paid'; }).length + ' invoices');
    html += '</div>';

    html += '<div class="grid grid-3" style="margin-top:0">';
    html += statCard('Retainage Held', fmtFull(ar.retainageHeld), '5-10% of contract value');
    html += statCard('Current DSO', ar.dso + ' days', 'Target: ' + ar.targetDSO + ' days', ar.dso <= ar.targetDSO ? 'up' : 'down');

    // DSO progress (inverted - lower is better)
    var dsoHtml = '<div class="stat-card">';
    dsoHtml += '<span class="stat-label">DSO Progress</span>';
    var dsoColor = ar.dso < 60 ? 'green' : ar.dso <= 75 ? 'amber' : 'red';
    dsoHtml += '<div class="progress-bar" style="margin-top:8px"><div class="progress-fill ' + dsoColor + '" style="width:' + Math.min((ar.dso / 120) * 100, 100) + '%"></div></div>';
    dsoHtml += '<span class="stat-change">' + ar.dso + ' days (target: ' + ar.targetDSO + ')</span>';
    dsoHtml += '</div>';
    html += dsoHtml;
    html += '</div>';

    html += '</div>'; // card

    // ============ INVOICE TRACKER TABLE ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Invoice Tracker</h3>';
    html += '<span class="card-subtitle">' + invoices.length + ' invoices from ' + projects.length + ' active projects</span></div>';

    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Invoice #</th><th>Project</th><th>GC</th><th>Amount</th><th>Date Submitted</th><th>Status</th><th>Days Outstanding</th></tr></thead><tbody>';

    // Sort: overdue first, then outstanding, then paid
    var sortOrder = { 'Overdue': 0, 'Outstanding': 1, 'Paid': 2 };
    invoices.sort(function (a, b) { return (sortOrder[a.status] || 0) - (sortOrder[b.status] || 0) || b.daysOut - a.daysOut; });

    invoices.forEach(function (inv) {
      var badgeClass = inv.status === 'Paid' ? 'bid' : inv.status === 'Overdue' ? 'no-bid' : 'pending';
      var dateStr = (inv.date.getMonth() + 1) + '/' + inv.date.getDate() + '/' + inv.date.getFullYear();
      html += '<tr>';
      html += '<td>' + inv.number + '</td>';
      html += '<td>' + inv.project + '</td>';
      html += '<td>' + inv.gc + '</td>';
      html += '<td>' + fmtFull(inv.amount) + '</td>';
      html += '<td>' + dateStr + '</td>';
      html += '<td><span class="badge-status ' + badgeClass + '">' + inv.status + '</span></td>';
      html += '<td>' + (inv.status === 'Paid' ? '--' : inv.daysOut + ' days') + '</td>';
      html += '</tr>';
    });

    if (invoices.length === 0) {
      html += '<tr><td colspan="7" style="text-align:center;opacity:0.6">No invoice data available</td></tr>';
    }

    html += '</tbody></table></div>';
    html += '</div>'; // card

    // ============ AR AGING BUCKETS ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">AR Aging Analysis</h3>';
    html += '<span class="card-subtitle">Outstanding invoices by age</span></div>';

    html += '<div class="grid grid-4">';
    var bucketKeys = ['0-30', '31-60', '61-90', '90+'];
    var bucketColors = ['green', 'amber', 'amber', 'red'];
    var totalOutstanding = Object.keys(aging).reduce(function (s, k) { return s + aging[k].amount; }, 0);

    bucketKeys.forEach(function (key, idx) {
      var b = aging[key];
      html += statCard(key + ' Days', fmtFull(b.amount), b.count + ' invoice' + (b.count !== 1 ? 's' : ''));
    });
    html += '</div>';

    // Visual aging bars
    html += '<div style="margin-top:12px">';
    bucketKeys.forEach(function (key, idx) {
      var b = aging[key];
      var barPct = totalOutstanding > 0 ? (b.amount / totalOutstanding) * 100 : 0;
      html += '<div style="margin-bottom:8px">';
      html += '<div style="display:flex;justify-content:space-between;margin-bottom:2px">';
      html += '<span class="stat-label">' + key + ' days (' + b.count + ')</span>';
      html += '<span class="stat-label">' + fmtFull(b.amount) + '</span></div>';
      html += '<div class="progress-bar"><div class="progress-fill ' + bucketColors[idx] + '" style="width:' + Math.max(barPct, 2) + '%"></div></div>';
      html += '</div>';
    });
    html += '</div>';

    html += '</div>'; // card

    // ============ RETAINAGE TRACKER ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">Retainage Tracker</h3>';
    html += '<span class="card-subtitle">Per-project retainage status</span></div>';

    var totalRetHeld = 0;
    var totalRetReleased = 0;

    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Project</th><th>Contract Value</th><th>Retainage %</th><th>Retainage Amount</th><th>Release Status</th></tr></thead><tbody>';

    projects.forEach(function (p) {
      var contractVal = p.subcontract_value || 0;
      if (contractVal <= 0) return;
      var retPct = p.retain_pct || DEFAULT_RETAINAGE_PCT;
      var retAmt = p.retainage || Math.round(contractVal * retPct);
      var workPct = p.work_pct_complete || 0;
      var releaseStatus = workPct >= 1.0 ? 'Released' : workPct >= 0.9 ? 'Pending Release' : 'Held';
      var relBadge = releaseStatus === 'Released' ? 'bid' : releaseStatus === 'Pending Release' ? 'pending' : 'review';

      if (releaseStatus === 'Released') {
        totalRetReleased += retAmt;
      } else {
        totalRetHeld += retAmt;
      }

      html += '<tr>';
      html += '<td>' + (p.name || 'Unknown') + '</td>';
      html += '<td>' + fmtFull(contractVal) + '</td>';
      html += '<td>' + pct(retPct * 100) + '</td>';
      html += '<td>' + fmtFull(retAmt) + '</td>';
      html += '<td><span class="badge-status ' + relBadge + '">' + releaseStatus + '</span></td>';
      html += '</tr>';
    });

    if (projects.length === 0) {
      html += '<tr><td colspan="5" style="text-align:center;opacity:0.6">No project data available</td></tr>';
    }

    html += '</tbody></table></div>';

    html += '<div class="grid grid-2" style="margin-top:12px">';
    html += statCard('Retainage Held', fmtFull(totalRetHeld), 'Across active projects');
    html += statCard('Retainage Released YTD', fmtFull(totalRetReleased), 'From completed projects');
    html += '</div>';

    html += '</div>'; // card

    // ============ NEW INVOICE FORM ============
    html += '<div class="card">';
    html += '<div class="card-header"><h3 class="card-title">New Invoice</h3>';
    html += '<span class="card-subtitle">Create a new G702/G703 pay application</span></div>';

    html += '<div class="grid grid-2">';

    // Project dropdown
    html += '<div class="form-group">';
    html += '<label class="form-label">Project</label>';
    html += '<select class="form-select" id="inv-project">';
    html += '<option value="">Select project...</option>';
    projects.forEach(function (p) {
      if ((p.subcontract_value || 0) > 0) {
        html += '<option value="' + (p.project_number || '') + '" data-retain="' + (p.retain_pct || DEFAULT_RETAINAGE_PCT) + '" data-contract="' + (p.subcontract_value || 0) + '">' + (p.name || 'Unknown') + ' (' + (p.project_number || '') + ')</option>';
      }
    });
    html += '</select></div>';

    // Invoice #
    html += '<div class="form-group">';
    html += '<label class="form-label">Invoice #</label>';
    html += '<input type="text" class="form-input" id="inv-number" placeholder="PF-XXXX" /></div>';
    html += '</div>';

    html += '<div class="grid grid-3">';

    // Date
    html += '<div class="form-group">';
    html += '<label class="form-label">Date</label>';
    var todayStr = new Date().toISOString().split('T')[0];
    html += '<input type="date" class="form-input" id="inv-date" value="' + todayStr + '" /></div>';

    // Amount
    html += '<div class="form-group">';
    html += '<label class="form-label">Amount</label>';
    html += '<input type="number" class="form-input" id="inv-amount" placeholder="0.00" step="0.01" /></div>';

    // Retainage (auto-calculated)
    html += '<div class="form-group">';
    html += '<label class="form-label">Retainage (auto)</label>';
    html += '<input type="text" class="form-input" id="inv-retainage" readonly placeholder="Calculated from project" /></div>';

    html += '</div>';

    // Description
    html += '<div class="form-group">';
    html += '<label class="form-label">Description / Period</label>';
    html += '<input type="text" class="form-input" id="inv-desc" placeholder="Work completed through..." /></div>';

    html += '<div style="margin-top:12px;display:flex;gap:8px">';
    html += '<button class="btn btn-primary" id="inv-submit-btn">Create Invoice</button>';
    html += '<button class="btn btn-secondary" id="inv-clear-btn">Clear</button>';
    html += '</div>';

    html += '</div>'; // card

    app.innerHTML = html;

    // ---- FORM INTERACTIVITY ----
    bindFormEvents();
  }

  // ---- FORM EVENTS ----
  function bindFormEvents() {
    var projectSelect = document.getElementById('inv-project');
    var amountInput = document.getElementById('inv-amount');
    var retainageInput = document.getElementById('inv-retainage');
    var submitBtn = document.getElementById('inv-submit-btn');
    var clearBtn = document.getElementById('inv-clear-btn');

    if (!projectSelect) return;

    // Auto-calculate retainage when amount or project changes
    function updateRetainage() {
      var selected = projectSelect.options[projectSelect.selectedIndex];
      var retPct = selected ? parseFloat(selected.getAttribute('data-retain')) || DEFAULT_RETAINAGE_PCT : DEFAULT_RETAINAGE_PCT;
      var amount = parseFloat(amountInput.value) || 0;
      var retAmt = Math.round(amount * retPct);
      retainageInput.value = retAmt > 0 ? fmtFull(retAmt) + ' (' + pct(retPct * 100) + ')' : '';
    }

    projectSelect.addEventListener('change', updateRetainage);
    amountInput.addEventListener('input', updateRetainage);

    // Submit handler (placeholder - logs to console)
    submitBtn.addEventListener('click', function () {
      var project = projectSelect.value;
      var invNum = document.getElementById('inv-number').value;
      var date = document.getElementById('inv-date').value;
      var amount = document.getElementById('inv-amount').value;
      var desc = document.getElementById('inv-desc').value;

      if (!project || !invNum || !amount) {
        alert('Please fill in Project, Invoice #, and Amount.');
        return;
      }

      // In production, this would POST to backend
      console.log('[Invoice Module] New invoice created:', {
        project: project,
        number: invNum,
        date: date,
        amount: amount,
        description: desc
      });

      alert('Invoice ' + invNum + ' created for ' + fmtFull(parseFloat(amount)) + '. (Data logged to console - backend integration pending.)');
    });

    // Clear handler
    clearBtn.addEventListener('click', function () {
      projectSelect.selectedIndex = 0;
      document.getElementById('inv-number').value = '';
      document.getElementById('inv-date').value = new Date().toISOString().split('T')[0];
      amountInput.value = '';
      retainageInput.value = '';
      document.getElementById('inv-desc').value = '';
    });
  }

  // ---- STAT CARD HELPER ----
  function statCard(label, value, change, direction) {
    var h = '<div class="stat-card">';
    h += '<span class="stat-label">' + label + '</span>';
    h += '<span class="stat-value" style="font-size:1.1rem">' + value + '</span>';
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
