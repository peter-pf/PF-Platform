// ============================================================
// Pier Foundations — Change Order Management Module
// Renders into #mod-changeorders > #changeorders-app
// ============================================================

(function () {
  'use strict';

  // ---- CHANGE ORDER DATA ----
  // Based on real PF project types and SOP workflow
  var CHANGE_ORDERS = [
    {
      id: 'CO-26-001',
      project: 'POET Bioprocessing - Shelbyville',
      description: '28 additional columns due to soft zone near B-217',
      reason: 'Differing conditions',
      amount: 28000,
      status: 'Approved',
      dateSubmitted: '2026-02-28',
      dateResolved: '2026-03-05',
      docsNotes: 'SPT logs showed N=3 in zone not captured by original borings. Photos of auger refusal at 6ft vs design 10ft. Dr. Garbin confirmed additional columns required per revised bearing analysis.'
    },
    {
      id: 'CO-26-002',
      project: 'POET Bioprocessing - Shelbyville',
      description: 'Dewatering required at grain bin area (GWT higher than boring data)',
      reason: 'Differing conditions',
      amount: 15500,
      status: 'Approved',
      dateSubmitted: '2026-03-04',
      dateResolved: '2026-03-10',
      docsNotes: 'Groundwater encountered at 4ft vs boring report showing 9ft. Pump and wellpoint system required for 3 days. Time-stamped photos of standing water in excavation. Pump rental and operator invoices attached.'
    },
    {
      id: 'CO-26-003',
      project: 'Parkview Health Hospital',
      description: '12 columns relocated due to underground utility conflict',
      reason: 'Differing conditions',
      amount: 4200,
      status: 'Pending',
      dateSubmitted: '2026-05-22',
      dateResolved: '',
      docsNotes: 'Unmarked 8" storm sewer discovered at grid C-4 through C-7. Potholing confirmed location conflicts with 12 column positions. Revised layout by Dr. Garbin required. Utility locate photos and revised column plan attached.'
    },
    {
      id: 'CO-26-004',
      project: 'The Granary',
      description: 'Additional mobilization for phase 2 work',
      reason: 'GC-directed',
      amount: 23860,
      status: 'Approved',
      dateSubmitted: '2026-01-15',
      dateResolved: '2026-01-22',
      docsNotes: 'GC requested phased construction not in original scope. Second mob includes Cat 336 transport, crew travel, and setup. Signed GC directive letter and mobilization cost breakdown attached.'
    },
    {
      id: 'CO-26-005',
      project: 'Stadium Flats',
      description: 'Depth increase from 8ft to 12ft on east building',
      reason: 'Design revision',
      amount: 18400,
      status: 'Negotiating',
      dateSubmitted: '2026-04-10',
      dateResolved: '',
      docsNotes: 'Structural engineer revised bearing pressures after load re-analysis. All east building columns increased from 8 LF to 12 LF. Additional 2,448 LF of stone column installation. Revised structural letter and unit price backup attached.'
    },
    {
      id: 'CO-26-006',
      project: 'WPAFB Hangar Rehab',
      description: 'Prevailing wage rate adjustment (incorrect classification)',
      reason: 'Scope addition',
      amount: 6800,
      status: 'Pending',
      dateSubmitted: '2026-05-18',
      dateResolved: '',
      docsNotes: 'Davis-Bacon wage determination updated after bid. Operators reclassified from Group 2 to Group 1. Rate differential applied to estimated 340 crew-hours remaining. DOL wage determination printout and crew hour log attached.'
    }
  ];

  // ---- REASON OPTIONS ----
  var REASONS = [
    'Differing conditions',
    'Design revision',
    'GC-directed',
    'Scope addition'
  ];

  // ---- PROJECT LIST (from active bids) ----
  var PROJECTS = [
    'POET Bioprocessing - Shelbyville',
    'The Granary',
    'IU Launch Accelerator',
    'Stadium Flats',
    'Airport Hangar Expansion',
    'Wabash Place',
    'Parkview Health Hospital',
    'WPAFB Hangar Rehab'
  ];

  // ---- HELPERS ----
  function fmtCurrency(v) {
    if (!v && v !== 0) return '--';
    return '$' + v.toLocaleString('en-US');
  }

  function fmtDate(d) {
    if (!d) return '--';
    var parts = d.split('-');
    return parts[1] + '/' + parts[2] + '/' + parts[0].slice(2);
  }

  function statusBadgeClass(status) {
    switch (status) {
      case 'Approved': return 'bid';
      case 'Pending': return 'pending';
      case 'Rejected': return 'no-bid';
      case 'Negotiating': return 'review';
      default: return 'pending';
    }
  }

  // ---- STATE ----
  var currentFilter = 'all';
  var showForm = false;
  var nextId = 7;

  // ---- CALCULATIONS ----
  function calcStats() {
    var total = CHANGE_ORDERS.length;
    var totalValue = CHANGE_ORDERS.reduce(function (s, co) { return s + co.amount; }, 0);
    var approved = CHANGE_ORDERS.filter(function (co) { return co.status === 'Approved'; });
    var approvedValue = approved.reduce(function (s, co) { return s + co.amount; }, 0);
    var pendingCount = CHANGE_ORDERS.filter(function (co) {
      return co.status === 'Pending' || co.status === 'Negotiating';
    }).length;
    return {
      total: total,
      totalValue: totalValue,
      approvedValue: approvedValue,
      pendingCount: pendingCount
    };
  }

  // ---- FILTER ----
  function filterCOs() {
    if (currentFilter === 'all') return CHANGE_ORDERS;
    return CHANGE_ORDERS.filter(function (co) {
      return co.status === currentFilter;
    });
  }

  // ---- RENDER ----
  function render() {
    var app = document.getElementById('changeorders-app');
    if (!app) return;

    var stats = calcStats();
    var filtered = filterCOs();
    var html = '';

    // ---- Summary Stats ----
    html += '<div class="grid grid-4" style="margin-bottom:16px">';

    html += '<div class="stat-card">';
    html += '  <div class="stat-label">Total COs</div>';
    html += '  <div class="stat-value">' + stats.total + '</div>';
    html += '</div>';

    html += '<div class="stat-card">';
    html += '  <div class="stat-label">Total Value</div>';
    html += '  <div class="stat-value">' + fmtCurrency(stats.totalValue) + '</div>';
    html += '</div>';

    html += '<div class="stat-card">';
    html += '  <div class="stat-label">Approved Value</div>';
    html += '  <div class="stat-value">' + fmtCurrency(stats.approvedValue) + '</div>';
    html += '  <div class="stat-change">' + Math.round(stats.approvedValue / (stats.totalValue || 1) * 100) + '% of total</div>';
    html += '</div>';

    html += '<div class="stat-card">';
    html += '  <div class="stat-label">Pending / Negotiating</div>';
    html += '  <div class="stat-value">' + stats.pendingCount + '</div>';
    html += '</div>';

    html += '</div>';

    // ---- SOP Reminder ----
    html += '<div class="card" style="margin-bottom:16px">';
    html += '  <div class="card-header">';
    html += '    <span class="card-title">Change Order SOP</span>';
    html += '  </div>';
    html += '  <div style="padding:12px 16px;font-size:13px;line-height:1.6">';
    html += '    <strong>1.</strong> Field identifies changed condition &rarr; ';
    html += '    <strong>2.</strong> Document with photos (same day) &rarr; ';
    html += '    <strong>3.</strong> Notify PM same day &rarr; ';
    html += '    <strong>4.</strong> PM prices within 24 hrs &rarr; ';
    html += '    <strong>5.</strong> Submit to GC within 48 hrs &rarr; ';
    html += '    <strong>6.</strong> <em>No work on changed scope until approved</em>';
    html += '  </div>';
    html += '</div>';

    // ---- Filter Tabs + New CO Button ----
    html += '<div class="card" style="margin-bottom:16px">';
    html += '  <div class="card-header">';
    html += '    <span class="card-title">Change Orders</span>';
    html += '    <button class="btn btn-primary" onclick="window.__CO_toggleForm()">' + (showForm ? 'Cancel' : '+ New CO') + '</button>';
    html += '  </div>';

    // Tabs
    html += '  <div class="tabs" style="padding:0 16px">';
    var filters = [
      { key: 'all', label: 'All' },
      { key: 'Pending', label: 'Pending' },
      { key: 'Negotiating', label: 'Negotiating' },
      { key: 'Approved', label: 'Approved' },
      { key: 'Rejected', label: 'Rejected' }
    ];
    filters.forEach(function (f) {
      var cls = 'tab' + (currentFilter === f.key ? ' active' : '');
      html += '<button class="' + cls + '" onclick="window.__CO_filter(\'' + f.key + '\')">' + f.label + '</button>';
    });
    html += '  </div>';

    // ---- New CO Form (conditional) ----
    if (showForm) {
      html += '<div style="padding:16px;border-bottom:1px solid var(--border)">';
      html += '  <div class="grid grid-2" style="margin-bottom:12px">';

      html += '    <div class="form-group">';
      html += '      <label class="form-label">Project</label>';
      html += '      <select class="form-select" id="co-project">';
      html += '        <option value="">Select project...</option>';
      PROJECTS.forEach(function (p) {
        html += '      <option value="' + p + '">' + p + '</option>';
      });
      html += '      </select>';
      html += '    </div>';

      html += '    <div class="form-group">';
      html += '      <label class="form-label">Reason</label>';
      html += '      <select class="form-select" id="co-reason">';
      html += '        <option value="">Select reason...</option>';
      REASONS.forEach(function (r) {
        html += '      <option value="' + r + '">' + r + '</option>';
      });
      html += '      </select>';
      html += '    </div>';

      html += '  </div>';

      html += '  <div class="form-group" style="margin-bottom:12px">';
      html += '    <label class="form-label">Description</label>';
      html += '    <input class="form-input" type="text" id="co-desc" placeholder="Brief description of the change...">';
      html += '  </div>';

      html += '  <div class="grid grid-2" style="margin-bottom:12px">';

      html += '    <div class="form-group">';
      html += '      <label class="form-label">Amount ($)</label>';
      html += '      <input class="form-input" type="number" id="co-amount" placeholder="0">';
      html += '    </div>';

      html += '    <div class="form-group">';
      html += '      <label class="form-label">Supporting Docs / Notes</label>';
      html += '      <input class="form-input" type="text" id="co-docs" placeholder="Photos, revised plans, invoices...">';
      html += '    </div>';

      html += '  </div>';

      html += '  <button class="btn btn-primary" onclick="window.__CO_submit()">Submit Change Order</button>';
      html += '  <button class="btn btn-secondary" onclick="window.__CO_toggleForm()" style="margin-left:8px">Cancel</button>';
      html += '</div>';
    }

    // ---- CO Table ----
    html += '  <div class="table-wrap">';
    html += '    <table>';
    html += '      <thead><tr>';
    html += '        <th>CO#</th>';
    html += '        <th>Project</th>';
    html += '        <th>Description</th>';
    html += '        <th>Reason</th>';
    html += '        <th style="text-align:right">Amount</th>';
    html += '        <th>Status</th>';
    html += '        <th>Submitted</th>';
    html += '        <th>Resolved</th>';
    html += '      </tr></thead>';
    html += '      <tbody>';

    if (filtered.length === 0) {
      html += '      <tr><td colspan="8" style="text-align:center;padding:24px;opacity:0.5">No change orders match this filter</td></tr>';
    }

    filtered.forEach(function (co) {
      html += '      <tr>';
      html += '        <td><strong>' + co.id + '</strong></td>';
      html += '        <td>' + co.project + '</td>';
      html += '        <td>' + co.description + '</td>';
      html += '        <td>' + co.reason + '</td>';
      html += '        <td style="text-align:right">' + fmtCurrency(co.amount) + '</td>';
      html += '        <td><span class="badge-status ' + statusBadgeClass(co.status) + '">' + co.status + '</span></td>';
      html += '        <td>' + fmtDate(co.dateSubmitted) + '</td>';
      html += '        <td>' + fmtDate(co.dateResolved) + '</td>';
      html += '      </tr>';
      // Expandable docs row
      if (co.docsNotes) {
        html += '      <tr class="co-docs-row" id="docs-' + co.id + '" style="display:none">';
        html += '        <td></td>';
        html += '        <td colspan="7" style="font-size:12px;padding:8px 12px;opacity:0.8;border-top:none">';
        html += '          <strong>Supporting Documentation:</strong> ' + co.docsNotes;
        html += '        </td>';
        html += '      </tr>';
      }
    });

    html += '      </tbody>';
    html += '    </table>';
    html += '  </div>';
    html += '</div>';

    // ---- Approval Progress ----
    var approvedPct = stats.total > 0 ? Math.round(stats.approvedValue / stats.totalValue * 100) : 0;
    html += '<div class="card" style="margin-bottom:16px">';
    html += '  <div class="card-header">';
    html += '    <span class="card-title">Approval Rate</span>';
    html += '    <span class="card-subtitle">' + fmtCurrency(stats.approvedValue) + ' approved of ' + fmtCurrency(stats.totalValue) + ' total</span>';
    html += '  </div>';
    html += '  <div style="padding:12px 16px">';
    html += '    <div class="progress-bar" style="height:10px"><div class="progress-fill" style="width:' + approvedPct + '%"></div></div>';
    html += '  </div>';
    html += '</div>';

    app.innerHTML = html;

    // ---- Row click to expand docs ----
    var rows = app.querySelectorAll('tbody tr:not(.co-docs-row)');
    rows.forEach(function (row, i) {
      var co = filtered[i];
      if (!co || !co.docsNotes) return;
      row.style.cursor = 'pointer';
      row.addEventListener('click', function () {
        var docsRow = document.getElementById('docs-' + co.id);
        if (docsRow) {
          docsRow.style.display = docsRow.style.display === 'none' ? '' : 'none';
        }
      });
    });
  }

  // ---- GLOBAL HANDLERS ----
  window.__CO_filter = function (key) {
    currentFilter = key;
    render();
  };

  window.__CO_toggleForm = function () {
    showForm = !showForm;
    render();
  };

  window.__CO_submit = function () {
    var project = document.getElementById('co-project').value;
    var desc = document.getElementById('co-desc').value;
    var reason = document.getElementById('co-reason').value;
    var amount = parseFloat(document.getElementById('co-amount').value) || 0;
    var docs = document.getElementById('co-docs').value;

    if (!project || !desc || !reason || !amount) {
      alert('Please fill in all required fields: Project, Description, Reason, and Amount.');
      return;
    }

    var today = new Date();
    var dateStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    CHANGE_ORDERS.unshift({
      id: 'CO-26-' + String(nextId).padStart(3, '0'),
      project: project,
      description: desc,
      reason: reason,
      amount: amount,
      status: 'Pending',
      dateSubmitted: dateStr,
      dateResolved: '',
      docsNotes: docs || ''
    });

    nextId++;
    showForm = false;
    currentFilter = 'all';
    render();
  };

  // ---- INIT ----
  render();

})();
