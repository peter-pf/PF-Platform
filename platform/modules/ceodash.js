// ============================================================
// Pier Foundations — CEO Dashboard Module
// Renders into #mod-ceodash > #ceodash-app
// ============================================================

(function () {
  'use strict';

  // ---- DATA SOURCE: master-derived, same as the main dashboard (single source of truth) ----
  var P = (typeof window !== 'undefined' && window.PF_PROJECTS) ? window.PF_PROJECTS : null;
  var syncMeta = (typeof LIVE_SYNC_META !== 'undefined') ? LIVE_SYNC_META : {};

  // ---- CONSTANTS ----
  var MONTHLY_DEBT = 12398;

  // ---- SAFE NUMBER HELPERS ----
  function safe(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function $(v) { return '$' + safe(v).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function $s(v) { v = safe(v); if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'; if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'K'; return '$' + v; }
  function pct(v) { return Math.round(safe(v) * 100) + '%'; }

  var root = document.querySelector('#mod-ceodash #ceodash-app');
  if (!root) return;
  if (!P) { root.innerHTML = '<div style="color:#888;padding:1rem">Project data unavailable (projects-data.js not loaded).</div>'; return; }

  // ---- COMPUTED VALUES (from PF_PROJECTS — match the main dashboard exactly) ----
  var K = P.kpis || {};
  var wip = P.wip || [];
  var completed = P.completed || [];
  var outstanding = P.outstandingBids || [];
  var activeProjects = wip.filter(function (p) { return p.phase === 'active'; });

  var FY26_TARGET = safe(K.fy26Goal);            // consistent with the dashboard ($5.25M)
  var pipelineValue = safe(K.pipelineValue);      // awarded, not yet complete
  var winRate = safe(K.winRate);                  // from full bid log: awarded/(awarded+not awarded)
  var bidsOutstanding = safe(K.outstandingBidsCount);
  var fy26Revenue = safe(K.fy26Revenue);          // completed in FY
  var fy26Pct = FY26_TARGET > 0 ? Math.min(fy26Revenue / FY26_TARGET, 1) : 0;

  var backlog = activeProjects.reduce(function (sum, p) {
    return sum + safe(p.value) * (1 - safe(p.pctComplete));
  }, 0);

  var totalContractValue = pipelineValue + safe(K.completedValue);
  var totalCollected = safe(K.paidTotal);
  var outstandingAR = safe(K.arTotal);
  var retainageHeld = safe(K.retainDue);
  var cashOwed = outstandingAR + retainageHeld;

  // ---- INLINE STYLE CONSTANTS ----
  var STAT_VALUE = 'font-size:0.88rem;font-weight:700;color:#000';
  var STAT_LABEL = 'font-size:0.72rem;font-weight:500;text-transform:uppercase;letter-spacing:0.04em;color:#005A91;margin-bottom:6px';

  // ---- RENDER ----
  var html = '';

  // ===== SECTION: Last Sync =====
  var syncText = syncMeta.last_sync ? new Date(syncMeta.last_sync).toLocaleString() : 'No sync data';
  html += '<div style="text-align:right;font-size:0.7rem;color:#888;margin-bottom:0.5rem">Last sync: ' + syncText + '</div>';

  // ===== ROW 1: Operations KPIs =====
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem">';

  html += statCard('Active Projects', activeProjects.length);
  html += statCard('Pipeline Value', $s(pipelineValue));
  html += statCard('Win Rate', winRate + '%');
  html += statCard('Backlog', $s(backlog));
  html += statCard('Bids Outstanding', bidsOutstanding);
  html += statCardProgress('FY26 Progress', $s(fy26Revenue) + ' / ' + $s(FY26_TARGET), fy26Pct);

  html += '</div>';

  // ===== ROW 2: Financial KPIs =====
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem">';

  html += statCard('Total Contract Value', $s(totalContractValue));
  html += statCard('Total Collected', $s(totalCollected));
  html += statCard('Outstanding AR', $s(outstandingAR));
  html += statCard('Retainage Held', $s(retainageHeld));
  html += statCard('Monthly Debt', $(MONTHLY_DEBT));
  html += statCard('Cash Owed to PF', $s(cashOwed));

  html += '</div>';

  // ===== ROW 3: Two side-by-side tables =====
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem">';

  // -- Left: Active Projects Table --
  html += '<div class="stat-card" style="padding:1rem">';
  html += '<div style="' + STAT_LABEL + ';margin-bottom:0.75rem">Active Projects</div>';

  var sortedActive = activeProjects.slice().sort(function (a, b) { return safe(b.pctComplete) - safe(a.pctComplete); });

  if (sortedActive.length === 0) {
    html += '<div style="color:#888;font-size:0.8rem">No active projects</div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-size:0.78rem">';
    html += '<thead><tr style="border-bottom:1px solid #e0e0e0;text-align:left">';
    html += '<th style="padding:0.3rem 0.4rem">Project #</th>';
    html += '<th style="padding:0.3rem 0.4rem">Name</th>';
    html += '<th style="padding:0.3rem 0.4rem;text-align:right">Value</th>';
    html += '<th style="padding:0.3rem 0.4rem;text-align:center">% Complete</th>';
    html += '<th style="padding:0.3rem 0.4rem">GC</th>';
    html += '</tr></thead><tbody>';
    sortedActive.forEach(function (p) {
      var w = safe(p.pctComplete);
      html += '<tr style="border-bottom:1px solid #f0f0f0">';
      html += '<td style="padding:0.3rem 0.4rem">' + esc(p.projectNo) + '</td>';
      html += '<td style="padding:0.3rem 0.4rem">' + esc(p.name) + '</td>';
      html += '<td style="padding:0.3rem 0.4rem;text-align:right">' + $(p.value) + '</td>';
      html += '<td style="padding:0.3rem 0.4rem;text-align:center">';
      html += '<div style="display:flex;align-items:center;gap:0.3rem;justify-content:center">';
      html += '<div style="width:50px;height:6px;background:#e8e8e8;border-radius:3px;overflow:hidden">';
      html += '<div style="width:' + Math.round(w * 100) + '%;height:100%;background:#005A91;border-radius:3px"></div>';
      html += '</div>';
      html += '<span style="font-size:0.72rem">' + pct(w) + '</span>';
      html += '</div>';
      html += '</td>';
      html += '<td style="padding:0.3rem 0.4rem">' + esc(p.gc) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  // -- Right: Outstanding Bids Table (live submitted) --
  html += '<div class="stat-card" style="padding:1rem">';
  html += '<div style="' + STAT_LABEL + ';margin-bottom:0.75rem">Outstanding Bids</div>';

  var sortedBids = outstanding.slice(0, 8);

  if (sortedBids.length === 0) {
    html += '<div style="color:#888;font-size:0.8rem">No outstanding bids</div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-size:0.78rem">';
    html += '<thead><tr style="border-bottom:1px solid #e0e0e0;text-align:left">';
    html += '<th style="padding:0.3rem 0.4rem">Project</th>';
    html += '<th style="padding:0.3rem 0.4rem">GC</th>';
    html += '<th style="padding:0.3rem 0.4rem;text-align:center">Status</th>';
    html += '<th style="padding:0.3rem 0.4rem;text-align:right">Value</th>';
    html += '</tr></thead><tbody>';
    sortedBids.forEach(function (b) {
      html += '<tr style="border-bottom:1px solid #f0f0f0">';
      html += '<td style="padding:0.3rem 0.4rem">' + esc(b.name) + '</td>';
      html += '<td style="padding:0.3rem 0.4rem">' + esc(b.gc) + '</td>';
      html += '<td style="padding:0.3rem 0.4rem;text-align:center">' + badge(b.status) + '</td>';
      html += '<td style="padding:0.3rem 0.4rem;text-align:right">' + $(b.value) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  html += '</div>'; // end grid-2

  // ===== ALERTS =====
  var alerts = [];

  // Projects > 80% complete
  activeProjects.forEach(function (p) {
    if (safe(p.pctComplete) > 0.8) {
      alerts.push({ color: '#e67e22', text: esc(p.name) + ' is ' + pct(p.pctComplete) + ' complete -- closeout soon' });
    }
  });

  // Bids due within 7 days (CEO follow-up)
  (P.upcomingBids || []).forEach(function (b) {
    alerts.push({ color: '#e74c3c', text: esc(b.name) + ' bid due ' + esc(b.dueDate) + ' (' + esc(b.status) + ')' });
  });

  // Retainage > $50K
  if (retainageHeld > 50000) {
    alerts.push({ color: '#2ecc71', text: 'Total retainage ' + $(retainageHeld) + ' -- recovery opportunity' });
  }

  if (alerts.length > 0) {
    html += '<div class="stat-card" style="padding:1rem">';
    html += '<div style="' + STAT_LABEL + ';margin-bottom:0.75rem">Alerts</div>';
    html += '<ul style="list-style:none;padding:0;margin:0">';
    alerts.forEach(function (a) {
      html += '<li style="padding:0.35rem 0;font-size:0.8rem;display:flex;align-items:center;gap:0.5rem">';
      html += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + a.color + ';flex-shrink:0"></span>';
      html += a.text;
      html += '</li>';
    });
    html += '</ul>';
    html += '</div>';
  }

  root.innerHTML = html;

  // ---- HELPER: stat card ----
  function statCard(label, value) {
    return '<div class="stat-card" style="padding:0.75rem 1rem">'
      + '<div style="' + STAT_LABEL + '">' + label + '</div>'
      + '<div style="' + STAT_VALUE + '">' + value + '</div>'
      + '</div>';
  }

  // ---- HELPER: stat card with progress bar ----
  function statCardProgress(label, value, ratio) {
    var w = Math.round(safe(ratio) * 100);
    return '<div class="stat-card" style="padding:0.75rem 1rem">'
      + '<div style="' + STAT_LABEL + '">' + label + '</div>'
      + '<div style="' + STAT_VALUE + '">' + value + '</div>'
      + '<div style="width:100%;height:6px;background:#e8e8e8;border-radius:3px;margin-top:0.4rem;overflow:hidden">'
      + '<div style="width:' + w + '%;height:100%;background:#005A91;border-radius:3px"></div>'
      + '</div>'
      + '</div>';
  }

  // ---- HELPER: badge ----
  function badge(status) {
    var s = (status || '').trim();
    var type = 'closed';
    if (s === 'Awarded' || s === 'Completed') type = 'bid';
    else if (s === 'Submitted' || s === 'Submitted - Edging') type = 'review';
    else if (s === 'Will Bid' || s === 'New Lead') type = 'active';
    else if (s === 'Budget Pricing' || s === 'NEED FOLLOW UP') type = 'pending';

    var colors = {
      bid: 'background:#d4edda;color:#155724',
      review: 'background:#cce5ff;color:#004085',
      active: 'background:#fff3cd;color:#856404',
      pending: 'background:#fce4ec;color:#7f1d1d',
      closed: 'background:#e8e8e8;color:#555'
    };

    return '<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:4px;font-size:0.7rem;font-weight:600;' + colors[type] + '">' + esc(s) + '</span>';
  }

  // ---- HELPER: escape HTML ----
  function esc(v) {
    if (v == null) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
