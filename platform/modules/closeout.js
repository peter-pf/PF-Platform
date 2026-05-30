// ============================================================
// Pier Foundations — Punch List & Closeout Module
// Renders into #mod-closeout > #closeout-app
// Based on Jonathan's Project Closeout SOP
// ============================================================

(function () {
  'use strict';

  // ---- CLOSEOUT PHASES (ordered) ----
  var PHASES = [
    'Documents Sent to GGG',
    'GGG Review',
    'PF Verification',
    'Corrections',
    'Sent to GC',
    'Final Invoice',
    'Complete'
  ];

  // ---- CHECKLIST ITEMS (from Jonathan's SOP) ----
  var CHECKLIST_ITEMS = [
    'As-builts with actual depths compiled',
    'GUHMA computer data exported to PDF',
    'Modulus test results compiled',
    'Documents sent to GGG for review',
    'GGG review complete (10 business days expected)',
    'PF verified GGG closeout against QA/QC doc',
    'Corrections sent to GGG (if needed)',
    'Closeout package + column logs sent to GC',
    'Final invoice with retainage submitted'
  ];

  // ---- PROJECT DATA ----
  var PROJECTS = [
    {
      id: 1,
      name: 'POET Shelbyville',
      bidId: '26-001',
      gc: 'POET D&C',
      contractValue: 343037,
      retainageRate: 0.10,
      retainageAmount: 34304,
      retainageReleased: false,
      phase: 'PF Verification',
      daysInPhase: 4,
      phaseEnteredDate: '2026-05-26',
      checklist: [true, true, true, true, true, false, false, false, false],
      notes: 'GGG returned review 5/25. PF QA/QC team verifying column logs against as-builts.'
    },
    {
      id: 2,
      name: 'The Granary',
      bidId: '26-002',
      gc: 'Flaherty & Collins',
      contractValue: 326200,
      retainageRate: 0.10,
      retainageAmount: 32620,
      retainageReleased: true,
      phase: 'Complete',
      daysInPhase: 0,
      phaseEnteredDate: '2026-05-10',
      checklist: [true, true, true, true, true, true, false, true, true],
      notes: 'Closeout complete. Retainage released 5/15. No corrections needed.'
    },
    {
      id: 3,
      name: 'Stadium Flats',
      bidId: '26-004',
      gc: 'Weigand Construction',
      contractValue: 137879,
      retainageRate: 0.05,
      retainageAmount: 6894,
      retainageReleased: false,
      phase: 'Documents Sent to GGG',
      daysInPhase: 2,
      phaseEnteredDate: '2026-05-28',
      checklist: [true, true, true, true, false, false, false, false, false],
      notes: 'As-builts and GUHMA data sent to Dr. Garbin 5/28. Expect 10 business day review.'
    }
  ];

  // ---- HELPERS ----
  function fmtCurrency(v) {
    if (!v) return '--';
    return '$' + v.toLocaleString('en-US');
  }

  function phaseIndex(phase) {
    return PHASES.indexOf(phase);
  }

  function phaseProgress(phase) {
    var idx = phaseIndex(phase);
    if (idx < 0) return 0;
    return Math.round(((idx + 1) / PHASES.length) * 100);
  }

  function phaseBadgeClass(phase) {
    switch (phase) {
      case 'Complete': return 'active';
      case 'Final Invoice': return 'review';
      case 'Sent to GC': return 'review';
      case 'Corrections': return 'pending';
      case 'PF Verification': return 'pending';
      case 'GGG Review': return 'review';
      case 'Documents Sent to GGG': return 'bid';
      default: return 'pending';
    }
  }

  // ---- RENDER ----
  function render() {
    var container = document.getElementById('closeout-app');
    if (!container) return;

    // Retainage calculations
    var totalHeld = 0;
    var totalReleased = 0;
    var totalPending = 0;
    var activeCloseouts = 0;
    var completedCloseouts = 0;

    PROJECTS.forEach(function (p) {
      if (p.retainageReleased) {
        totalReleased += p.retainageAmount;
      } else {
        totalPending += p.retainageAmount;
      }
      totalHeld += p.retainageAmount;
      if (p.phase === 'Complete') {
        completedCloseouts++;
      } else {
        activeCloseouts++;
      }
    });

    var html = '';

    // ---- STAT CARDS ----
    html += '<div class="grid grid-4">';
    html += '<div class="stat-card"><div class="stat-label">Active Closeouts</div><div class="stat-value">' + activeCloseouts + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Completed</div><div class="stat-value">' + completedCloseouts + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Retainage Pending</div><div class="stat-value">' + fmtCurrency(totalPending) + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Retainage Released</div><div class="stat-value">' + fmtCurrency(totalReleased) + '</div></div>';
    html += '</div>';

    // ---- RETAINAGE SUMMARY ----
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Retainage Summary</span><span class="card-subtitle">Financial closeout tracking</span></div>';
    html += '<div class="grid grid-3">';
    html += '<div class="stat-card"><div class="stat-label">Total Held</div><div class="stat-value">' + fmtCurrency(totalHeld) + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Total Released</div><div class="stat-value">' + fmtCurrency(totalReleased) + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Total Pending</div><div class="stat-value">' + fmtCurrency(totalPending) + '</div></div>';
    html += '</div></div>';

    // ---- PROJECT CLOSEOUT TRACKER ----
    html += '<div class="card">';
    html += '<div class="card-header"><div><span class="card-title">Project Closeout Tracker</span><br><span class="card-subtitle">Based on Jonathan\'s Project Closeout SOP</span></div></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Project</th><th>GC</th><th>Phase</th><th>Progress</th><th>Days in Phase</th><th>Retainage</th><th>Rate</th><th>Status</th><th>Notes</th></tr></thead>';
    html += '<tbody>';

    PROJECTS.forEach(function (p) {
      var pct = phaseProgress(p.phase);

      html += '<tr>';
      html += '<td><strong>' + p.name + '</strong><br><span style="font-size:0.75rem;color:var(--text-3)">' + p.bidId + '</span></td>';
      html += '<td>' + p.gc + '</td>';
      html += '<td><span class="badge-status ' + phaseBadgeClass(p.phase) + '">' + p.phase + '</span></td>';
      html += '<td><div class="progress-bar"><div class="progress-fill' + (pct === 100 ? ' green' : pct >= 50 ? ' amber' : '') + '" style="width:' + pct + '%"></div></div><span style="font-size:0.72rem;color:var(--text-3)">' + pct + '%</span></td>';
      html += '<td>' + (p.phase === 'Complete' ? '--' : p.daysInPhase + ' days') + '</td>';
      html += '<td>' + fmtCurrency(p.retainageAmount) + '</td>';
      html += '<td>' + (p.retainageRate * 100) + '%</td>';
      html += '<td><span class="badge-status ' + (p.retainageReleased ? 'active' : 'pending') + '">' + (p.retainageReleased ? 'Released' : 'Held') + '</span></td>';
      html += '<td>' + p.notes + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div></div>';

    // ---- CLOSEOUT CHECKLISTS PER PROJECT ----
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Closeout Checklists</span><span class="card-subtitle">SOP compliance per project</span></div>';

    PROJECTS.forEach(function (p) {
      html += '<div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:var(--radius)">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
      html += '<strong>' + p.name + '</strong>';

      var checked = p.checklist.filter(function (c) { return c; }).length;
      var total = p.checklist.length;
      html += '<span style="font-size:0.75rem;color:var(--text-3)">' + checked + ' / ' + total + ' complete</span>';
      html += '</div>';

      // Progress bar for checklist
      var checkPct = Math.round((checked / total) * 100);
      html += '<div class="progress-bar" style="margin-bottom:12px"><div class="progress-fill' + (checkPct === 100 ? ' green' : checkPct >= 50 ? ' amber' : '') + '" style="width:' + checkPct + '%"></div></div>';

      CHECKLIST_ITEMS.forEach(function (item, idx) {
        var isChecked = p.checklist[idx];
        var checkId = 'chk-' + p.id + '-' + idx;
        html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0">';
        html += '<input type="checkbox" id="' + checkId + '" ' + (isChecked ? 'checked' : '') + ' onchange="window._closeoutToggle(' + p.id + ',' + idx + ')">';
        html += '<label for="' + checkId + '" style="font-size:0.82rem;' + (isChecked ? 'color:var(--text-3);text-decoration:line-through' : '') + '">' + item + '</label>';
        html += '</div>';
      });

      html += '</div>';
    });

    html += '</div>';

    // ---- SOP WORKFLOW REFERENCE ----
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Closeout SOP Workflow</span><span class="card-subtitle">Jonathan\'s Project Closeout Standard Operating Procedure</span></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Step</th><th>Phase</th><th>Owner</th><th>Expected Duration</th><th>Description</th></tr></thead>';
    html += '<tbody>';
    html += '<tr><td>1</td><td><span class="badge-status bid">Documents Sent to GGG</span></td><td>PF Field</td><td>1-3 days</td><td>Compile as-builts with actual depths, GUHMA computer data (PDF export), and modulus test results. Send complete package to Dr. Garbin.</td></tr>';
    html += '<tr><td>2</td><td><span class="badge-status review">GGG Review</span></td><td>GGG (Dr. Garbin)</td><td>10 business days</td><td>GGG reviews all submitted data against design specifications. May request additional data.</td></tr>';
    html += '<tr><td>3</td><td><span class="badge-status pending">PF Verification</span></td><td>PF QA/QC</td><td>2-5 days</td><td>PF verifies GGG closeout report against internal QA/QC documentation. Cross-check column logs.</td></tr>';
    html += '<tr><td>4</td><td><span class="badge-status pending">Corrections</span></td><td>PF / GGG</td><td>Varies</td><td>If discrepancies found, send corrections back to GGG. May skip if no issues found.</td></tr>';
    html += '<tr><td>5</td><td><span class="badge-status review">Sent to GC</span></td><td>PF Office</td><td>1-2 days</td><td>Send finalized closeout package and column logs to General Contractor.</td></tr>';
    html += '<tr><td>6</td><td><span class="badge-status review">Final Invoice</span></td><td>PF Office</td><td>1-3 days</td><td>Submit final invoice including retainage release request to GC.</td></tr>';
    html += '<tr><td>7</td><td><span class="badge-status active">Complete</span></td><td>--</td><td>--</td><td>All documents delivered, final invoice paid, retainage released. Project archived.</td></tr>';
    html += '</tbody></table></div></div>';

    container.innerHTML = html;
  }

  // ---- GLOBAL HANDLERS ----
  window._closeoutToggle = function (projectId, checklistIdx) {
    var proj = PROJECTS.filter(function (p) { return p.id === projectId; })[0];
    if (!proj) return;
    proj.checklist[checklistIdx] = !proj.checklist[checklistIdx];

    // Auto-advance phase based on checklist
    var checked = proj.checklist.filter(function (c) { return c; }).length;
    if (checked === 9) {
      proj.phase = 'Complete';
      proj.daysInPhase = 0;
    } else if (checked >= 8) {
      proj.phase = 'Final Invoice';
    } else if (checked >= 7) {
      proj.phase = 'Sent to GC';
    } else if (checked >= 6) {
      proj.phase = 'Corrections';
    } else if (checked >= 5) {
      proj.phase = 'PF Verification';
    } else if (checked >= 4) {
      proj.phase = 'GGG Review';
    } else {
      proj.phase = 'Documents Sent to GGG';
    }

    render();
  };

  // ---- INIT ----
  render();

  // Re-render when module becomes visible
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        var el = m.target;
        if (el.id === 'mod-closeout' && el.classList.contains('active')) {
          render();
        }
      }
    });
  });

  var modEl = document.getElementById('mod-closeout');
  if (modEl) {
    observer.observe(modEl, { attributes: true });
  }
})();
