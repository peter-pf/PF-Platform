// ============================================================
// Pier Foundations — Subcontractor Coordination Module
// Renders into #mod-subs > #subs-app
// ============================================================

(function () {
  'use strict';

  // ---- VENDOR DATA ----
  var VENDORS = [
    { id: 1, name: 'Miller Land Surveying', contact: 'Brett Miller', service: 'Layout & Staking', phone: '260-555-0101', email: 'brett@millerlandsurveying.com', status: 'Active', rate: '$8-14/column', notes: 'Primary surveyor. Reliable turnaround. Used on all IN projects.', projects: ['POET Shelbyville', 'The Granary', 'Stadium Flats'] },
    { id: 2, name: 'Paddacks', contact: 'Miah', service: 'Equipment Transport', phone: '260-555-0102', email: 'miah@paddacks.com', status: 'Active', rate: 'Per trip', notes: 'Primary hauler for Cat 336 and vibro setup. Good availability.', projects: ['POET Shelbyville', 'Airport Hangar Expansion'] },
    { id: 3, name: 'Stephan Trucking', contact: 'Mark Maller', service: 'Equipment Transport', phone: '260-555-0103', email: 'mmaller@stephantruck.com', status: 'Active', rate: 'Per trip', notes: 'Secondary hauler. Use when Paddacks unavailable or for OH/MI jobs.', projects: ['Dollar General Distribution'] },
    { id: 4, name: 'Willis Dirt Works', contact: 'Willis', service: 'Site Work Support', phone: '260-555-0104', email: 'willis@willisdirt.com', status: 'Active', rate: 'Retainer (CC 5215)', notes: 'Retainer arrangement. Site prep, spoils management, grading support.', projects: ['The Granary', 'Wabash Place'] },
    { id: 5, name: 'Garbin GeoStructural Group', contact: 'Dr. Ed Garbin', service: 'Engineering', phone: '(844) 4-GEODOC', email: 'Ed@GarbinGeo.com', status: 'Active', rate: '$3,500 prelim', notes: 'Engineer of Record. PE in 39 states. 5-day min for prelim design, 2+ weeks preferred. D.GE credential.', projects: ['POET Shelbyville', 'The Granary', 'Elanco HQ Expansion', 'Cummins Testing Facility'] },
    { id: 6, name: 'Heidelberg Materials', contact: 'Sales Desk', service: 'Stone Supplier', phone: '800-555-0110', email: 'orders@heidelberg.com', status: 'Active', rate: 'Per ton', notes: '#57 washed/no fines. IN #8s available. Primary supplier for IN projects.', projects: ['POET Shelbyville', 'IU Launch Accelerator'] },
    { id: 7, name: 'IMI (Irving Materials)', contact: 'Sales Desk', service: 'Stone Supplier', phone: '317-555-0111', email: 'orders@irvmat.com', status: 'Active', rate: 'Per ton', notes: 'Central IN coverage. Competitive pricing on larger volumes.', projects: ['The Granary'] },
    { id: 8, name: 'US Aggregates', contact: 'Sales Desk', service: 'Stone Supplier', phone: '260-555-0112', email: 'orders@usagg.com', status: 'Active', rate: 'Per ton', notes: 'NE Indiana coverage. Good for Fort Wayne area projects.', projects: [] },
    { id: 9, name: 'StoneCo / Shelly', contact: 'Sales Desk', service: 'Stone Supplier', phone: '419-555-0113', email: 'orders@stoneco.com', status: 'Active', rate: 'Per ton', notes: 'OH projects. Competitive on MI 6-AA spec.', projects: ['Dollar General Distribution'] },
    { id: 10, name: 'Piqua Materials', contact: 'Sales Desk', service: 'Stone Supplier', phone: '937-555-0114', email: 'orders@piquamaterials.com', status: 'Active', rate: 'Per ton', notes: 'Western OH coverage. CA-7 equivalent available.', projects: [] },
    { id: 11, name: 'Yellow Creek Gravel', contact: 'Sales Desk', service: 'Stone Supplier', phone: '330-555-0115', email: 'orders@yellowcreek.com', status: 'Inactive', rate: 'Per ton', notes: 'NE Ohio. Not used recently — pricing review needed.', projects: [] },
    { id: 12, name: 'Martin Marietta', contact: 'Sales Desk', service: 'Stone Supplier', phone: '800-555-0116', email: 'orders@martinmarietta.com', status: 'Active', rate: 'Per ton', notes: 'Multi-state coverage. Backup supplier for large volume jobs.', projects: [] }
  ];

  var nextId = VENDORS.length + 1;
  var showForm = false;

  // ---- HELPERS ----
  function statusClass(status) {
    switch (status) {
      case 'Active': return 'active';
      case 'Inactive': return 'closed';
      case 'On Hold': return 'pending';
      default: return 'pending';
    }
  }

  function serviceIcon(service) {
    if (service.indexOf('Stone') > -1) return '&#9830;';
    if (service.indexOf('Transport') > -1) return '&#9654;';
    if (service.indexOf('Engineering') > -1) return '&#9881;';
    if (service.indexOf('Survey') > -1 || service.indexOf('Layout') > -1) return '&#9673;';
    if (service.indexOf('Site') > -1) return '&#9632;';
    return '&#9679;';
  }

  // ---- RENDER ----
  function render() {
    var container = document.getElementById('subs-app');
    if (!container) return;

    var activeCount = VENDORS.filter(function (v) { return v.status === 'Active'; }).length;
    var stoneCount = VENDORS.filter(function (v) { return v.service === 'Stone Supplier'; }).length;
    var withProjects = VENDORS.filter(function (v) { return v.projects.length > 0; }).length;

    var html = '';

    // ---- STAT CARDS ----
    html += '<div class="grid grid-4">';
    html += '<div class="stat-card"><div class="stat-label">Total Vendors</div><div class="stat-value">' + VENDORS.length + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Active</div><div class="stat-value">' + activeCount + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Stone Suppliers</div><div class="stat-value">' + stoneCount + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">On Active Projects</div><div class="stat-value">' + withProjects + '</div></div>';
    html += '</div>';

    // ---- VENDOR ROSTER TABLE ----
    html += '<div class="card">';
    html += '<div class="card-header">';
    html += '<div><span class="card-title">Vendor Roster</span><br><span class="card-subtitle">Subcontractors, suppliers, and service providers</span></div>';
    html += '<button class="btn btn-primary" onclick="window._subsToggleForm()">' + (showForm ? 'Cancel' : '+ Add Vendor') + '</button>';
    html += '</div>';

    // ---- ADD VENDOR FORM ----
    if (showForm) {
      html += '<div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-1)">';
      html += '<div class="grid grid-3">';
      html += '<div class="form-group"><label class="form-label">Vendor Name</label><input class="form-input" id="sub-name" placeholder="Company name"></div>';
      html += '<div class="form-group"><label class="form-label">Contact Person</label><input class="form-input" id="sub-contact" placeholder="Primary contact"></div>';
      html += '<div class="form-group"><label class="form-label">Service</label><select class="form-select" id="sub-service"><option value="Layout & Staking">Layout & Staking</option><option value="Equipment Transport">Equipment Transport</option><option value="Site Work Support">Site Work Support</option><option value="Engineering">Engineering</option><option value="Stone Supplier">Stone Supplier</option><option value="Other">Other</option></select></div>';
      html += '</div>';
      html += '<div class="grid grid-3">';
      html += '<div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="sub-phone" placeholder="Phone number"></div>';
      html += '<div class="form-group"><label class="form-label">Email</label><input class="form-input" id="sub-email" placeholder="Email address"></div>';
      html += '<div class="form-group"><label class="form-label">Rate / Pricing</label><input class="form-input" id="sub-rate" placeholder="e.g. $8-14/column"></div>';
      html += '</div>';
      html += '<div class="form-group"><label class="form-label">Notes</label><input class="form-input" id="sub-notes" placeholder="Performance notes, coverage area, etc."></div>';
      html += '<button class="btn btn-primary" onclick="window._subsAddVendor()">Save Vendor</button>';
      html += ' <button class="btn btn-secondary" onclick="window._subsToggleForm()">Cancel</button>';
      html += '</div>';
    }

    // ---- TABLE ----
    html += '<div class="table-wrap">';
    html += '<table>';
    html += '<thead><tr><th></th><th>Vendor</th><th>Service</th><th>Contact</th><th>Phone</th><th>Email</th><th>Rate</th><th>Status</th><th>Active Projects</th></tr></thead>';
    html += '<tbody>';

    VENDORS.forEach(function (v) {
      html += '<tr>';
      html += '<td>' + serviceIcon(v.service) + '</td>';
      html += '<td><strong>' + v.name + '</strong></td>';
      html += '<td>' + v.service + '</td>';
      html += '<td>' + v.contact + '</td>';
      html += '<td>' + v.phone + '</td>';
      html += '<td>' + (v.email ? '<a href="mailto:' + v.email + '">' + v.email + '</a>' : '--') + '</td>';
      html += '<td>' + v.rate + '</td>';
      html += '<td><span class="badge-status ' + statusClass(v.status) + '">' + v.status + '</span></td>';
      html += '<td>' + (v.projects.length > 0 ? v.projects.join(', ') : '<span style="color:var(--text-3)">None</span>') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
    html += '</div></div>';

    // ---- PERFORMANCE NOTES ----
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Performance Notes</span><span class="card-subtitle">Key observations from field experience</span></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Vendor</th><th>Category</th><th>Note</th></tr></thead>';
    html += '<tbody>';
    VENDORS.forEach(function (v) {
      if (v.notes) {
        html += '<tr><td><strong>' + v.name + '</strong></td><td>' + v.service + '</td><td>' + v.notes + '</td></tr>';
      }
    });
    html += '</tbody></table></div></div>';

    container.innerHTML = html;
  }

  // ---- GLOBAL HANDLERS ----
  window._subsToggleForm = function () {
    showForm = !showForm;
    render();
  };

  window._subsAddVendor = function () {
    var name = document.getElementById('sub-name').value.trim();
    var contact = document.getElementById('sub-contact').value.trim();
    var service = document.getElementById('sub-service').value;
    var phone = document.getElementById('sub-phone').value.trim();
    var email = document.getElementById('sub-email').value.trim();
    var rate = document.getElementById('sub-rate').value.trim();
    var notes = document.getElementById('sub-notes').value.trim();

    if (!name) { alert('Vendor name is required.'); return; }

    VENDORS.push({
      id: nextId++,
      name: name,
      contact: contact || '--',
      service: service,
      phone: phone || '--',
      email: email || '',
      status: 'Active',
      rate: rate || '--',
      notes: notes || '',
      projects: []
    });

    showForm = false;
    render();
  };

  // ---- INIT ----
  render();

  // Re-render when module becomes visible
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        var el = m.target;
        if (el.id === 'mod-subs' && el.classList.contains('active')) {
          render();
        }
      }
    });
  });

  var modEl = document.getElementById('mod-subs');
  if (modEl) {
    observer.observe(modEl, { attributes: true });
  }
})();
