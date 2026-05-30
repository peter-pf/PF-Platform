// ============================================================
// Pier Foundations — Permitting & Inspections Module
// Renders into #mod-permits > #permits-app
// ============================================================

(function () {
  'use strict';

  // ---- PERMIT DATA ----
  var PERMITS = [
    { id: 1, project: 'POET Shelbyville', type: 'Utility Locate (811)', status: 'Active', issueDate: '2026-05-15', expDate: '2026-05-29', notes: 'Ticket #IN26-84201. Marked clear — no conflicts. Renew before mobilization if delayed.' },
    { id: 2, project: 'POET Shelbyville', type: 'Building Permit', status: 'Active', issueDate: '2026-04-28', expDate: '2027-04-28', notes: 'Pulled by POET D&C (GC). PF verified — subcontractor scope covered under master permit.' },
    { id: 3, project: 'POET Shelbyville', type: 'DOT Oversize Transport', status: 'Active', issueDate: '2026-05-10', expDate: '2026-06-10', notes: 'Cat 336 transport from Monroeville yard. Paddacks handling — route approved on US-36.' },
    { id: 4, project: 'The Granary', type: 'Utility Locate (811)', status: 'Expired', issueDate: '2026-03-01', expDate: '2026-03-15', notes: 'EXPIRED — must renew before any additional site work. Original ticket #IN26-71044.' },
    { id: 5, project: 'The Granary', type: 'Building Permit', status: 'Active', issueDate: '2026-02-15', expDate: '2027-02-15', notes: 'Pulled by Flaherty & Collins. PF scope covered. Hamilton County.' },
    { id: 6, project: 'The Granary', type: 'Environmental', status: 'Active', issueDate: '2026-02-01', expDate: '2026-08-01', notes: 'Wetland-adjacent site. 50ft buffer zone maintained. IDEM stormwater permit under GC.' },
    { id: 7, project: 'Stadium Flats', type: 'Utility Locate (811)', status: 'Pending', issueDate: '', expDate: '', notes: 'Not yet requested. Must call 811 minimum 2 business days before mobilization.' },
    { id: 8, project: 'Stadium Flats', type: 'Building Permit', status: 'Active', issueDate: '2026-04-10', expDate: '2027-04-10', notes: 'Pulled by Weigand Construction. St. Joseph County. PF verified scope inclusion.' },
    { id: 9, project: 'Stadium Flats', type: 'DOT Oversize Transport', status: 'Pending', issueDate: '', expDate: '', notes: 'Needed for Cat 336 transport to South Bend. Apply 5 business days before move.' },
    { id: 10, project: 'POET Shelbyville', type: 'OSHA Inspection', status: 'Active', issueDate: '2026-05-20', expDate: '', notes: 'Unannounced visit 5/20. No citations. Inspector noted good PPE compliance and trench shoring.' },
    { id: 11, project: 'The Granary', type: 'County Inspection', status: 'Active', issueDate: '2026-04-05', expDate: '', notes: 'Hamilton County foundation inspection passed. Inspector: R. Thompson. No deficiencies.' }
  ];

  var nextId = PERMITS.length + 1;

  // ---- HELPERS ----
  function statusClass(status) {
    switch (status) {
      case 'Active': return 'active';
      case 'Expired': return 'no-bid';
      case 'Pending': return 'pending';
      default: return 'pending';
    }
  }

  function fmtDate(d) {
    if (!d) return '--';
    var parts = d.split('-');
    return parts[1] + '/' + parts[2] + '/' + parts[0].slice(2);
  }

  function isExpired(expDate) {
    if (!expDate) return false;
    return new Date(expDate) < new Date();
  }

  function daysUntilExpiry(expDate) {
    if (!expDate) return null;
    var diff = new Date(expDate) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  // ---- RENDER ----
  function render() {
    var container = document.getElementById('permits-app');
    if (!container) return;

    var activeCount = PERMITS.filter(function (p) { return p.status === 'Active'; }).length;
    var expiredCount = PERMITS.filter(function (p) { return p.status === 'Expired'; }).length;
    var pendingCount = PERMITS.filter(function (p) { return p.status === 'Pending'; }).length;

    // Count expiring soon (within 14 days)
    var expiringSoon = PERMITS.filter(function (p) {
      if (p.status !== 'Active' || !p.expDate) return false;
      var days = daysUntilExpiry(p.expDate);
      return days !== null && days <= 14 && days > 0;
    }).length;

    var html = '';

    // ---- STAT CARDS ----
    html += '<div class="grid grid-4">';
    html += '<div class="stat-card"><div class="stat-label">Total Permits</div><div class="stat-value">' + PERMITS.length + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Active</div><div class="stat-value">' + activeCount + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value">' + pendingCount + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Expired / Expiring Soon</div><div class="stat-value">' + expiredCount + (expiringSoon > 0 ? ' / ' + expiringSoon : '') + '</div></div>';
    html += '</div>';

    // ---- PERMIT TRACKER TABLE ----
    html += '<div class="card">';
    html += '<div class="card-header"><div><span class="card-title">Permit & Inspection Tracker</span><br><span class="card-subtitle">Utility locates, building permits, environmental, OSHA, DOT, and inspections</span></div></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Project</th><th>Permit Type</th><th>Status</th><th>Issue Date</th><th>Expiration</th><th>Days Left</th><th>Notes</th></tr></thead>';
    html += '<tbody>';

    PERMITS.forEach(function (p) {
      var days = daysUntilExpiry(p.expDate);
      var daysText = '--';
      var rowStyle = '';

      if (p.status === 'Expired' || (days !== null && days <= 0)) {
        daysText = '<strong style="color:var(--red)">EXPIRED</strong>';
        rowStyle = ' style="background:var(--red-light)"';
      } else if (days !== null && days <= 14) {
        daysText = '<strong style="color:var(--amber)">' + days + ' days</strong>';
      } else if (days !== null) {
        daysText = days + ' days';
      }

      // Override status display for auto-expired
      var displayStatus = p.status;
      var displayStatusClass = statusClass(p.status);
      if (p.status === 'Active' && days !== null && days <= 0) {
        displayStatus = 'Expired';
        displayStatusClass = 'no-bid';
      }

      html += '<tr' + rowStyle + '>';
      html += '<td><strong>' + p.project + '</strong></td>';
      html += '<td>' + p.type + '</td>';
      html += '<td><span class="badge-status ' + displayStatusClass + '">' + displayStatus + '</span></td>';
      html += '<td>' + fmtDate(p.issueDate) + '</td>';
      html += '<td>' + fmtDate(p.expDate) + '</td>';
      html += '<td>' + daysText + '</td>';
      html += '<td>' + p.notes + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div></div>';

    // ---- PERMIT TYPE REFERENCE ----
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Permit Type Reference</span><span class="card-subtitle">VSC-specific permitting requirements</span></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Type</th><th>Responsibility</th><th>Validity</th><th>Lead Time</th><th>Notes</th></tr></thead>';
    html += '<tbody>';
    html += '<tr><td><strong>Utility Locate (811)</strong></td><td>PF Crew</td><td>14 days</td><td>2 business days</td><td>Required before ANY excavation. Call 811 — free service. Must renew if work extends past 14 days.</td></tr>';
    html += '<tr><td><strong>Building Permit</strong></td><td>GC (PF verifies)</td><td>12 months typical</td><td>Varies by county</td><td>Usually pulled by GC. PF must verify subcontractor scope is covered under master permit.</td></tr>';
    html += '<tr><td><strong>Environmental</strong></td><td>GC / Owner</td><td>6 months typical</td><td>30+ days</td><td>Rare for VSC. Required for wetland-adjacent sites. IDEM stormwater permits under GC.</td></tr>';
    html += '<tr><td><strong>OSHA Inspection</strong></td><td>N/A (unannounced)</td><td>N/A</td><td>N/A</td><td>Track all OSHA visits and outcomes. Maintain PPE compliance, trench shoring, and fall protection.</td></tr>';
    html += '<tr><td><strong>County/Township</strong></td><td>Varies</td><td>Varies</td><td>Varies</td><td>Foundation inspections, setback verifications. Coordinate with GC on scheduling.</td></tr>';
    html += '<tr><td><strong>DOT Oversize Transport</strong></td><td>Hauler / PF</td><td>30 days typical</td><td>5 business days</td><td>Required for Cat 336 (98K lbs) transport. Route approval needed. Paddacks or Stephan handles.</td></tr>';
    html += '</tbody></table></div></div>';

    container.innerHTML = html;
  }

  // ---- INIT ----
  render();

  // Re-render when module becomes visible
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        var el = m.target;
        if (el.id === 'mod-permits' && el.classList.contains('active')) {
          render();
        }
      }
    });
  });

  var modEl = document.getElementById('mod-permits');
  if (modEl) {
    observer.observe(modEl, { attributes: true });
  }
})();
