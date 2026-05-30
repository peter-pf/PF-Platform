// ============================================================
// Equipment & Fleet Tracking Module — Pier Foundations Operations Platform
// Renders into #mod-equipment > #equipment-app
// ============================================================

(function () {
  'use strict';

  // ---- EQUIPMENT ROSTER ----
  // Real PF equipment from SOPs and Project Master

  var EQUIPMENT = [
    // OWNED — Heavy
    { id: 'EQ-001', name: 'Deere 350G', type: 'Owned', category: 'Heavy', role: 'VSC Rig (mast + vibroflot assembly)', status: 'Deployed', project: 'Stellantis Lot Rehab', lastService: '2026-05-10', nextService: '2026-06-10', dailyRate: 500, hours: 4280, specs: 'Primary installation rig — 79,300 lbs operating weight, mast + vibroflot assembly mounted', serviceHistory: [
      { date: '2026-05-10', type: 'Scheduled', desc: 'Hydraulic fluid change, filter replacement, track tension check', cost: 1850 },
      { date: '2026-03-22', type: 'Repair', desc: 'Replaced hydraulic hose on mast cylinder', cost: 620 },
      { date: '2026-01-15', type: 'Scheduled', desc: '4000-hr service — full fluid change, undercarriage inspection', cost: 4200 }
    ]},
    { id: 'EQ-002', name: 'Sany Predrill Rig', type: 'Owned', category: 'Heavy', role: 'Pre-drilling for bottom feed columns', status: 'Available', project: '', lastService: '2026-04-28', nextService: '2026-05-28', dailyRate: 400, hours: 2140, specs: 'Predrill rig for bottom-feed stone column installation — opens hole before vibroflot insertion', serviceHistory: [
      { date: '2026-04-28', type: 'Scheduled', desc: 'Engine oil, hydraulic filter, air filter replacement', cost: 1400 },
      { date: '2026-02-10', type: 'Repair', desc: 'Drill attachment bearing replacement', cost: 980 }
    ]},
    { id: 'EQ-003', name: 'CAT 308', type: 'Owned', category: 'Heavy', role: 'Support excavator with drill attachment', status: 'Deployed', project: 'Stellantis Lot Rehab', lastService: '2026-05-05', nextService: '2026-06-05', dailyRate: 250, hours: 3560, specs: '8-ton class mini excavator — support excavator with drill attachment for site prep', serviceHistory: [
      { date: '2026-05-05', type: 'Scheduled', desc: 'Oil change, bucket pin inspection, track adjustment', cost: 850 },
      { date: '2026-03-01', type: 'Scheduled', desc: 'Hydraulic system flush, new filters', cost: 1100 }
    ]},

    // OWNED — Vehicles & Transport
    { id: 'EQ-004', name: 'F450 Crew Truck', type: 'Owned', category: 'Vehicle', role: 'Crew transport', status: 'Deployed', project: 'Stellantis Lot Rehab', lastService: '2026-04-15', nextService: '2026-07-15', dailyRate: 0, hours: 0, specs: 'Ford F-450 — crew cab, diesel, crew transport to job sites', serviceHistory: [
      { date: '2026-04-15', type: 'Scheduled', desc: 'Oil change, tire rotation, brake inspection', cost: 380 }
    ]},
    { id: 'EQ-005', name: 'F550 Hauler', type: 'Owned', category: 'Vehicle', role: 'Equipment hauling', status: 'Available', project: '', lastService: '2026-04-15', nextService: '2026-07-15', dailyRate: 0, hours: 0, specs: 'Ford F-550 — flatbed body, equipment hauling and parts transport', serviceHistory: [
      { date: '2026-04-15', type: 'Scheduled', desc: 'Oil change, DEF fill, brake check', cost: 420 }
    ]},
    { id: 'EQ-006', name: 'Gooseneck Trailer', type: 'Owned', category: 'Transport', role: 'Parts and tooling transport', status: 'Available', project: '', lastService: '2026-03-01', nextService: '2026-09-01', dailyRate: 68, hours: 0, specs: 'Gooseneck flatbed trailer — parts, tooling, and small equipment transport', serviceHistory: [
      { date: '2026-03-01', type: 'Scheduled', desc: 'Bearing repack, brake check, light inspection', cost: 350 }
    ]},
    { id: 'EQ-007', name: 'Flatbed Trailer', type: 'Owned', category: 'Transport', role: 'Equipment transport', status: 'Available', project: '', lastService: '2026-03-01', nextService: '2026-09-01', dailyRate: 68, hours: 0, specs: 'Flatbed equipment trailer — heavy equipment transport for mobilization', serviceHistory: [
      { date: '2026-03-01', type: 'Scheduled', desc: 'Axle inspection, tire replacement (2), lights', cost: 780 }
    ]},

    // OWNED — Specialty
    { id: 'EQ-008', name: 'Vibroflot (DFG)', type: 'Owned', category: 'Specialty', role: 'Vibrating probe for stone column installation', status: 'Deployed', project: 'Stellantis Lot Rehab', lastService: '2026-05-12', nextService: '2026-06-12', dailyRate: 0, hours: 3200, specs: 'Deep Foundation Group vibroflot — SerCPU 000016601886, ID STC_0003. Vibrating probe that densifies stone and surrounding soil', serviceHistory: [
      { date: '2026-05-12', type: 'Scheduled', desc: 'Eccentric weight inspection, bearing check, nose cone measurement', cost: 2200 },
      { date: '2026-04-01', type: 'Repair', desc: 'Replaced water swivel seal', cost: 450 },
      { date: '2026-02-20', type: 'Scheduled', desc: 'Full teardown inspection — bearings, eccentric, motor windings', cost: 5800 }
    ]},
    { id: 'EQ-009', name: 'Chicago Jack (Small)', type: 'Owned', category: 'Testing', role: 'Modulus testing <175 kips', status: 'Available', project: '', lastService: '2026-04-01', nextService: '2026-10-01', dailyRate: 0, hours: 0, specs: 'Calibration factor: 49.84 psi/kip. For modulus tests under 175 kips capacity. Used with GUHMA QA/QC system', serviceHistory: [
      { date: '2026-04-01', type: 'Calibration', desc: 'Annual calibration — cal factor verified 49.84 psi/kip', cost: 600 }
    ]},
    { id: 'EQ-010', name: 'Chicago Jack (Large)', type: 'Owned', category: 'Testing', role: 'Modulus testing >175 kips', status: 'Available', project: '', lastService: '2026-04-01', nextService: '2026-10-01', dailyRate: 0, hours: 0, specs: 'Calibration factor: 32.88 psi/kip. For modulus tests over 175 kips capacity. Used with GUHMA QA/QC system', serviceHistory: [
      { date: '2026-04-01', type: 'Calibration', desc: 'Annual calibration — cal factor verified 32.88 psi/kip', cost: 600 }
    ]},

    // COMMONLY RENTED
    { id: 'EQ-R01', name: 'CAT 289 Track Loader #1', type: 'Rental', category: 'Heavy', role: 'Stone placement on site', status: 'Deployed', project: 'Stellantis Lot Rehab', lastService: '2026-05-20', nextService: '', dailyRate: 203, hours: 0, specs: 'CAT 289D3 compact track loader — stone placement and site material handling. Rental ~$1,423/week. CAT dealer acct: 3200669', serviceHistory: [] },
    { id: 'EQ-R02', name: 'CAT 289 Track Loader #2', type: 'Rental', category: 'Heavy', role: 'Stone placement on site', status: 'Deployed', project: 'Stellantis Lot Rehab', lastService: '2026-05-20', nextService: '', dailyRate: 203, hours: 0, specs: 'CAT 289D3 compact track loader — second unit for stone placement. Rental ~$1,423/week. CAT dealer acct: 3200669', serviceHistory: [] },
    { id: 'EQ-R03', name: 'Air Compressor', type: 'Rental', category: 'Support', role: 'Pneumatic tools and cleaning', status: 'Not Rented', project: '', lastService: '', nextService: '', dailyRate: 85, hours: 0, specs: '185 CFM towable air compressor — pneumatic tool operation and equipment cleaning', serviceHistory: [] },
    { id: 'EQ-R04', name: 'Telehandler', type: 'Rental', category: 'Support', role: 'Material handling', status: 'Not Rented', project: '', lastService: '', nextService: '', dailyRate: 175, hours: 0, specs: 'Telehandler/reach forklift — material handling, stone bag placement, equipment support', serviceHistory: [] },
    { id: 'EQ-R05', name: 'Mini Excavator', type: 'Rental', category: 'Heavy', role: 'Site support excavation', status: 'Not Rented', project: '', lastService: '', nextService: '', dailyRate: 150, hours: 0, specs: 'Mini excavator (3-5 ton class) — site support, spoils management, utility work', serviceHistory: [] }
  ];

  // ---- DAILY RATES (from POET estimate) ----
  var DAILY_RATES = {
    'VSC Rig': 500,
    'CAT 308': 250,
    'Trailer & Tooling': 68,
    'Maintenance': 100, // per hour
    'Fuel — VSC Rig': 275,
    'Fuel — CAT 308': 275,
    'Fuel — Loader': 80
  };

  // ---- TRANSPORT CONTACTS ----
  var TRANSPORT = [
    { company: 'Paddacks Trucking', contact: 'Miah', phone: '', role: 'Primary equipment transport — mobilization and demobilization', notes: 'Preferred hauler for heavy equipment moves' },
    { company: 'Stephan Trucking', contact: 'Mark Maller', phone: '', role: 'Secondary transport and stone delivery coordination', notes: 'Backup hauler, also coordinates stone trucking logistics' }
  ];

  // ---- STATE ----
  var activeTab = 'roster';
  var expandedRow = null;
  var filterStatus = 'all';
  var filterType = 'all';

  // ---- HELPERS ----
  function fmt(n) {
    if (n === undefined || n === null || isNaN(n)) return '$0';
    return '$' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function daysBetween(dateStr1, dateStr2) {
    if (!dateStr1 || !dateStr2) return null;
    var d1 = new Date(dateStr1);
    var d2 = new Date(dateStr2);
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  function isOverdue(nextServiceDate) {
    if (!nextServiceDate) return false;
    return daysBetween(today(), nextServiceDate) < 0;
  }

  function isDueSoon(nextServiceDate) {
    if (!nextServiceDate) return false;
    var days = daysBetween(today(), nextServiceDate);
    return days !== null && days >= 0 && days <= 14;
  }

  function statusBadgeClass(status) {
    switch (status) {
      case 'Deployed': return 'active';
      case 'Available': return 'bid';
      case 'Maintenance': return 'review';
      case 'Not Rented': return 'closed';
      default: return 'pending';
    }
  }

  function maintenanceBadge(eq) {
    if (!eq.nextService) return '';
    if (isOverdue(eq.nextService)) {
      return '<span class="badge-status no-bid">OVERDUE</span>';
    }
    if (isDueSoon(eq.nextService)) {
      return '<span class="badge-status review">Due Soon</span>';
    }
    return '';
  }

  // ---- COMPUTED STATS ----
  function getStats() {
    var owned = EQUIPMENT.filter(function (e) { return e.type === 'Owned'; });
    var deployed = EQUIPMENT.filter(function (e) { return e.status === 'Deployed'; });
    var maintenance = EQUIPMENT.filter(function (e) { return e.status === 'Maintenance'; });
    var rentalActive = EQUIPMENT.filter(function (e) { return e.type === 'Rental' && e.status === 'Deployed'; });
    var overdue = EQUIPMENT.filter(function (e) { return isOverdue(e.nextService); });

    return {
      totalOwned: owned.length,
      deployed: deployed.length,
      maintenance: maintenance.length,
      rentalActive: rentalActive.length,
      overdue: overdue.length
    };
  }

  // ---- FILTER ----
  function getFiltered() {
    return EQUIPMENT.filter(function (e) {
      if (filterStatus !== 'all' && e.status !== filterStatus) return false;
      if (filterType !== 'all' && e.type !== filterType) return false;
      return true;
    });
  }

  // ---- RENDER ----
  function render() {
    var root = document.getElementById('equipment-app');
    if (!root) return;

    var stats = getStats();
    var filtered = getFiltered();

    var html = '';

    // ---- STATS ROW ----
    html += '<div class="grid grid-4" style="margin-bottom:20px">';
    html += '<div class="stat-card"><div class="stat-label">Total Owned</div><div class="stat-value">' + stats.totalOwned + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Currently Deployed</div><div class="stat-value">' + stats.deployed + '</div>';
    if (stats.deployed > 0) {
      html += '<div class="stat-change up">Active on job sites</div>';
    }
    html += '</div>';
    html += '<div class="stat-card"><div class="stat-label">In Maintenance</div><div class="stat-value">' + stats.maintenance + '</div>';
    if (stats.overdue > 0) {
      html += '<div class="stat-change down">' + stats.overdue + ' service overdue</div>';
    }
    html += '</div>';
    html += '<div class="stat-card"><div class="stat-label">Rentals Active</div><div class="stat-value">' + stats.rentalActive + '</div></div>';
    html += '</div>';

    // ---- TABS ----
    html += '<div class="tabs">';
    html += '<div class="tab' + (activeTab === 'roster' ? ' active' : '') + '" onclick="window._eqTab(\'roster\')">Equipment Roster</div>';
    html += '<div class="tab' + (activeTab === 'rates' ? ' active' : '') + '" onclick="window._eqTab(\'rates\')">Daily Rates</div>';
    html += '<div class="tab' + (activeTab === 'transport' ? ' active' : '') + '" onclick="window._eqTab(\'transport\')">Transport Coordination</div>';
    html += '<div class="tab' + (activeTab === 'maintenance' ? ' active' : '') + '" onclick="window._eqTab(\'maintenance\')">Maintenance Alerts</div>';
    html += '</div>';

    // ---- TAB CONTENT ----
    if (activeTab === 'roster') {
      html += renderRoster(filtered);
    } else if (activeTab === 'rates') {
      html += renderRates();
    } else if (activeTab === 'transport') {
      html += renderTransport();
    } else if (activeTab === 'maintenance') {
      html += renderMaintenance();
    }

    root.innerHTML = html;
  }

  // ---- ROSTER TAB ----
  function renderRoster(filtered) {
    var html = '';

    // Filters
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Equipment Roster</span><span class="card-subtitle">' + EQUIPMENT.length + ' total items tracked</span></div>';
    html += '<div class="grid grid-2" style="margin-bottom:16px">';
    html += '<div class="form-group" style="margin-bottom:0"><label class="form-label">Status</label>';
    html += '<select class="form-select" onchange="window._eqFilterStatus(this.value)">';
    html += '<option value="all"' + (filterStatus === 'all' ? ' selected' : '') + '>All Statuses</option>';
    html += '<option value="Available"' + (filterStatus === 'Available' ? ' selected' : '') + '>Available</option>';
    html += '<option value="Deployed"' + (filterStatus === 'Deployed' ? ' selected' : '') + '>Deployed</option>';
    html += '<option value="Maintenance"' + (filterStatus === 'Maintenance' ? ' selected' : '') + '>Maintenance</option>';
    html += '<option value="Not Rented"' + (filterStatus === 'Not Rented' ? ' selected' : '') + '>Not Rented</option>';
    html += '</select></div>';
    html += '<div class="form-group" style="margin-bottom:0"><label class="form-label">Type</label>';
    html += '<select class="form-select" onchange="window._eqFilterType(this.value)">';
    html += '<option value="all"' + (filterType === 'all' ? ' selected' : '') + '>All Types</option>';
    html += '<option value="Owned"' + (filterType === 'Owned' ? ' selected' : '') + '>Owned</option>';
    html += '<option value="Rental"' + (filterType === 'Rental' ? ' selected' : '') + '>Rental</option>';
    html += '</select></div>';
    html += '</div>';

    // Table
    html += '<div class="table-wrap">';
    html += '<table><thead><tr>';
    html += '<th>Equipment</th><th>Type</th><th>Category</th><th>Status</th><th>Current Project</th><th>Next Service</th><th>Maintenance</th><th></th>';
    html += '</tr></thead><tbody>';

    filtered.forEach(function (eq) {
      var isExpanded = expandedRow === eq.id;
      html += '<tr style="cursor:pointer" onclick="window._eqExpand(\'' + eq.id + '\')">';
      html += '<td style="font-weight:600;color:var(--text-0)">' + eq.name + '<div style="font-size:0.7rem;color:var(--text-3);font-weight:400">' + eq.role + '</div></td>';
      html += '<td><span class="badge-status ' + (eq.type === 'Owned' ? 'active' : 'pending') + '">' + eq.type + '</span></td>';
      html += '<td>' + eq.category + '</td>';
      html += '<td><span class="badge-status ' + statusBadgeClass(eq.status) + '">' + eq.status + '</span></td>';
      html += '<td>' + (eq.project || '<span style="color:var(--text-3)">--</span>') + '</td>';
      html += '<td>' + (eq.nextService || '<span style="color:var(--text-3)">N/A</span>') + '</td>';
      html += '<td>' + maintenanceBadge(eq) + '</td>';
      html += '<td style="font-size:0.75rem;color:var(--text-3)">' + (isExpanded ? '&#9650;' : '&#9660;') + '</td>';
      html += '</tr>';

      // Expanded detail row
      if (isExpanded) {
        html += '<tr><td colspan="8" style="padding:0;background:var(--bg-1)">';
        html += renderDetail(eq);
        html += '</td></tr>';
      }
    });

    if (filtered.length === 0) {
      html += '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-3)">No equipment matches the current filters.</td></tr>';
    }

    html += '</tbody></table></div></div>';
    return html;
  }

  // ---- DETAIL PANEL ----
  function renderDetail(eq) {
    var html = '<div style="padding:20px">';

    // Specs + Info
    html += '<div class="grid grid-3" style="margin-bottom:16px">';

    // Specs card
    html += '<div class="card" style="margin-bottom:0"><div class="card-title" style="margin-bottom:8px">Specifications</div>';
    html += '<div style="font-size:0.82rem;color:var(--text-1)">' + eq.specs + '</div>';
    if (eq.hours > 0) {
      html += '<div style="margin-top:8px;font-size:0.78rem"><strong>Hours:</strong> ' + eq.hours.toLocaleString() + '</div>';
    }
    html += '</div>';

    // Financials card
    html += '<div class="card" style="margin-bottom:0"><div class="card-title" style="margin-bottom:8px">Financials</div>';
    html += '<div style="font-size:0.82rem">';
    if (eq.dailyRate > 0) {
      html += '<div><span style="color:var(--text-3)">Daily Rate:</span> <strong>' + fmt(eq.dailyRate) + '/day</strong></div>';
    }
    var totalServiceCost = eq.serviceHistory.reduce(function (s, h) { return s + h.cost; }, 0);
    html += '<div style="margin-top:4px"><span style="color:var(--text-3)">Total Service Cost:</span> <strong>' + fmt(totalServiceCost) + '</strong></div>';
    html += '<div style="margin-top:4px"><span style="color:var(--text-3)">Service Events:</span> ' + eq.serviceHistory.length + '</div>';
    html += '</div></div>';

    // Service status card
    html += '<div class="card" style="margin-bottom:0"><div class="card-title" style="margin-bottom:8px">Service Status</div>';
    html += '<div style="font-size:0.82rem">';
    html += '<div><span style="color:var(--text-3)">Last Service:</span> ' + (eq.lastService || 'N/A') + '</div>';
    html += '<div style="margin-top:4px"><span style="color:var(--text-3)">Next Service:</span> ' + (eq.nextService || 'N/A') + '</div>';
    if (eq.nextService) {
      var daysUntil = daysBetween(today(), eq.nextService);
      if (daysUntil !== null) {
        var urgencyColor = daysUntil < 0 ? 'var(--red)' : daysUntil <= 14 ? 'var(--amber)' : 'var(--green)';
        var urgencyText = daysUntil < 0 ? (Math.abs(daysUntil) + ' days overdue') : (daysUntil + ' days remaining');
        html += '<div style="margin-top:8px;font-weight:600;color:' + urgencyColor + '">' + urgencyText + '</div>';
        // Progress bar for service interval
        if (eq.lastService) {
          var totalInterval = daysBetween(eq.lastService, eq.nextService);
          var elapsed = daysBetween(eq.lastService, today());
          var pct = totalInterval > 0 ? Math.min(Math.max((elapsed / totalInterval) * 100, 0), 100) : 0;
          var barClass = pct >= 100 ? 'red' : pct >= 75 ? 'amber' : 'green';
          html += '<div style="margin-top:6px"><div class="progress-bar"><div class="progress-fill ' + barClass + '" style="width:' + pct + '%"></div></div></div>';
        }
      }
    }
    html += '</div></div>';
    html += '</div>'; // end grid

    // Service history table
    if (eq.serviceHistory.length > 0) {
      html += '<div class="card" style="margin-bottom:0"><div class="card-title" style="margin-bottom:12px">Service History</div>';
      html += '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Cost</th></tr></thead><tbody>';
      eq.serviceHistory.forEach(function (h) {
        var typeClass = h.type === 'Repair' ? 'review' : h.type === 'Calibration' ? 'pending' : 'bid';
        html += '<tr>';
        html += '<td>' + h.date + '</td>';
        html += '<td><span class="badge-status ' + typeClass + '">' + h.type + '</span></td>';
        html += '<td>' + h.desc + '</td>';
        html += '<td style="font-weight:600">' + fmt(h.cost) + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div></div>';
    }

    html += '</div>'; // end padding wrapper
    return html;
  }

  // ---- DAILY RATES TAB ----
  function renderRates() {
    var html = '';
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Daily Equipment Rates</span><span class="card-subtitle">From POET Turnover Budget</span></div>';

    html += '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Daily Rate</th><th>Unit</th><th>Notes</th></tr></thead><tbody>';

    var rates = [
      { item: 'VSC Rig (Deere 350G)', rate: 500, unit: '/day', notes: 'Primary installation rig daily charge' },
      { item: 'CAT 308 Support Excavator', rate: 250, unit: '/day', notes: 'Support excavator with drill attachment' },
      { item: 'Trailer & Tooling', rate: 68, unit: '/day', notes: 'Gooseneck or flatbed trailer daily charge' },
      { item: 'Maintenance Labor', rate: 100, unit: '/hour', notes: 'Budget 1 hr/working day for field maintenance' },
      { item: 'Fuel — VSC Rig', rate: 275, unit: '/day', notes: 'Diesel fuel for Deere 350G during operation' },
      { item: 'Fuel — CAT 308', rate: 275, unit: '/day', notes: 'Diesel fuel for CAT 308 during operation' },
      { item: 'Fuel — Track Loader', rate: 80, unit: '/day', notes: 'Diesel fuel for rental CAT 289/299 loader' },
      { item: 'CAT 289/299 Loader Rental', rate: 1423, unit: '/week', notes: 'Track loader for stone placement — usually rent 2 units. CAT acct: 3200669' }
    ];

    rates.forEach(function (r) {
      html += '<tr>';
      html += '<td style="font-weight:600;color:var(--text-0)">' + r.item + '</td>';
      html += '<td style="font-weight:700;color:var(--accent)">' + fmt(r.rate) + '</td>';
      html += '<td>' + r.unit + '</td>';
      html += '<td style="font-size:0.78rem;color:var(--text-2)">' + r.notes + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';

    // Daily burn summary
    var dailyBurn = 500 + 250 + 68 + 100 + 275 + 275 + 80 + Math.round((1423 * 2) / 7);
    html += '<div style="margin-top:16px;padding:12px 16px;background:var(--bg-1);border-radius:var(--radius);display:flex;justify-content:space-between;align-items:center">';
    html += '<span style="font-size:0.82rem;font-weight:600">Estimated Daily Equipment Burn (full spread)</span>';
    html += '<span style="font-size:1.1rem;font-weight:700;color:var(--accent)">' + fmt(dailyBurn) + '/day</span>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  // ---- TRANSPORT TAB ----
  function renderTransport() {
    var html = '';
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Transport Coordination</span><span class="card-subtitle">Haulers and mobilization contacts</span></div>';

    html += '<div class="grid grid-2">';
    TRANSPORT.forEach(function (t) {
      html += '<div class="card" style="margin-bottom:0">';
      html += '<div style="font-weight:700;font-size:0.95rem;color:var(--text-0);margin-bottom:4px">' + t.company + '</div>';
      html += '<div style="font-size:0.82rem;color:var(--text-2);margin-bottom:12px">' + t.role + '</div>';
      html += '<div style="font-size:0.82rem"><strong>Contact:</strong> ' + t.contact + '</div>';
      if (t.phone) {
        html += '<div style="font-size:0.82rem;margin-top:4px"><strong>Phone:</strong> ' + t.phone + '</div>';
      }
      html += '<div style="font-size:0.78rem;color:var(--text-3);margin-top:8px;font-style:italic">' + t.notes + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // Mobilization rates
    html += '<div style="margin-top:16px"><div class="card-title" style="margin-bottom:12px">Mobilization Rates (from POET)</div>';
    html += '<div class="table-wrap"><table><thead><tr><th>Mobilization Item</th><th>Rate per Trip</th></tr></thead><tbody>';
    html += '<tr><td>VSC Rig Mobilization</td><td style="font-weight:600">$2,310</td></tr>';
    html += '<tr><td>Predrill Rig Mobilization</td><td style="font-weight:600">$1,685</td></tr>';
    html += '<tr><td>Fall Off / Demob</td><td style="font-weight:600">$1,225</td></tr>';
    html += '<tr><td>Misc Mob Items</td><td style="font-weight:600">$1,500 each</td></tr>';
    html += '</tbody></table></div>';

    html += '</div></div>';
    return html;
  }

  // ---- MAINTENANCE ALERTS TAB ----
  function renderMaintenance() {
    var html = '';
    var overdue = EQUIPMENT.filter(function (e) { return isOverdue(e.nextService); });
    var dueSoon = EQUIPMENT.filter(function (e) { return isDueSoon(e.nextService) && !isOverdue(e.nextService); });
    var upcoming = EQUIPMENT.filter(function (e) {
      if (!e.nextService) return false;
      var d = daysBetween(today(), e.nextService);
      return d !== null && d > 14;
    });

    // Overdue
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Overdue Maintenance</span>';
    if (overdue.length > 0) {
      html += '<span class="badge-status no-bid">' + overdue.length + ' Overdue</span>';
    } else {
      html += '<span class="badge-status active">All Clear</span>';
    }
    html += '</div>';

    if (overdue.length > 0) {
      html += '<div class="table-wrap"><table><thead><tr><th>Equipment</th><th>Due Date</th><th>Days Overdue</th><th>Last Service</th><th>Status</th></tr></thead><tbody>';
      overdue.forEach(function (eq) {
        var daysOver = Math.abs(daysBetween(today(), eq.nextService));
        html += '<tr>';
        html += '<td style="font-weight:600;color:var(--text-0)">' + eq.name + '</td>';
        html += '<td>' + eq.nextService + '</td>';
        html += '<td style="font-weight:700;color:var(--red)">' + daysOver + ' days</td>';
        html += '<td>' + (eq.lastService || 'N/A') + '</td>';
        html += '<td><span class="badge-status ' + statusBadgeClass(eq.status) + '">' + eq.status + '</span></td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div style="text-align:center;padding:20px;color:var(--text-3);font-size:0.82rem">No overdue maintenance items.</div>';
    }
    html += '</div>';

    // Due Soon (within 14 days)
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Due Within 14 Days</span>';
    if (dueSoon.length > 0) {
      html += '<span class="badge-status review">' + dueSoon.length + ' Upcoming</span>';
    }
    html += '</div>';

    if (dueSoon.length > 0) {
      html += '<div class="table-wrap"><table><thead><tr><th>Equipment</th><th>Due Date</th><th>Days Remaining</th><th>Current Status</th></tr></thead><tbody>';
      dueSoon.forEach(function (eq) {
        var daysLeft = daysBetween(today(), eq.nextService);
        html += '<tr>';
        html += '<td style="font-weight:600;color:var(--text-0)">' + eq.name + '</td>';
        html += '<td>' + eq.nextService + '</td>';
        html += '<td style="font-weight:600;color:var(--amber)">' + daysLeft + ' days</td>';
        html += '<td><span class="badge-status ' + statusBadgeClass(eq.status) + '">' + eq.status + '</span></td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div style="text-align:center;padding:20px;color:var(--text-3);font-size:0.82rem">No items due within the next 14 days.</div>';
    }
    html += '</div>';

    // All scheduled
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Full Maintenance Schedule</span><span class="card-subtitle">All equipment with scheduled service</span></div>';
    html += '<div class="table-wrap"><table><thead><tr><th>Equipment</th><th>Last Service</th><th>Next Service</th><th>Interval Progress</th><th>Status</th></tr></thead><tbody>';

    var allWithService = EQUIPMENT.filter(function (e) { return e.nextService; }).sort(function (a, b) {
      return new Date(a.nextService) - new Date(b.nextService);
    });

    allWithService.forEach(function (eq) {
      var daysLeft = daysBetween(today(), eq.nextService);
      var totalInterval = eq.lastService ? daysBetween(eq.lastService, eq.nextService) : null;
      var elapsed = eq.lastService ? daysBetween(eq.lastService, today()) : null;
      var pct = (totalInterval && totalInterval > 0) ? Math.min(Math.max((elapsed / totalInterval) * 100, 0), 100) : 0;
      var barClass = pct >= 100 ? 'red' : pct >= 75 ? 'amber' : 'green';

      html += '<tr>';
      html += '<td style="font-weight:600;color:var(--text-0)">' + eq.name + '</td>';
      html += '<td>' + (eq.lastService || 'N/A') + '</td>';
      html += '<td>' + eq.nextService + '</td>';
      html += '<td style="min-width:120px"><div class="progress-bar"><div class="progress-fill ' + barClass + '" style="width:' + pct + '%"></div></div>';
      html += '<div style="font-size:0.7rem;color:var(--text-3);margin-top:2px">' + Math.round(pct) + '% of interval elapsed</div></td>';
      html += '<td>' + maintenanceBadge(eq) + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div></div>';

    return html;
  }

  // ---- GLOBAL HANDLERS ----
  window._eqTab = function (tab) {
    activeTab = tab;
    render();
  };

  window._eqExpand = function (id) {
    expandedRow = expandedRow === id ? null : id;
    render();
  };

  window._eqFilterStatus = function (val) {
    filterStatus = val;
    render();
  };

  window._eqFilterType = function (val) {
    filterType = val;
    render();
  };

  // ---- INIT ----
  render();

})();
