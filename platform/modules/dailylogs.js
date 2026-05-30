// ============================================================
// Pier Foundations — Daily Logs & Field Reporting Module
// Renders into #mod-dailylogs > #dailylogs-app
// ============================================================

(function () {
  'use strict';

  // ---- SAMPLE DAILY LOG DATA (POET Shelbyville) ----
  var LOGS = [
    {
      id: 'DL-001',
      date: '2026-05-12',
      project: 'POET Bioprocessing - Shelbyville',
      jobNumber: '26-001',
      weather: 'Clear, 72F, Wind SW 8 mph',
      crewOnSite: ['Brad Reinking (Superintendent)', 'Derek (Foreman)', 'Mike T. (Operator)', 'Jason R. (Ground)', 'Cody M. (Ground)', 'Travis L. (Loader)'],
      production: {
        columnsToday: 42,
        pierRange: 'B-001 through B-042',
        lfToday: 378,
        lfCumulative: 378,
        totalColumns: 42,
        targetLF: 17003,
        stoneDelivered: 85,
        stoneUsed: 34,
        stoneCumulative: 34,
        diameter: '30"',
        feedMethod: 'Bottom'
      },
      equipment: {
        cat336: 'Operational — no issues',
        predrill: 'Not required (competent soils)',
        loader: 'Operational — fueled at end of shift',
        fuelGallons: 82,
        downtimeHrs: 0.5,
        downtimeReason: 'Morning setup / mast erection'
      },
      delays: {
        weatherHrs: 0,
        gcHoldHrs: 0,
        equipmentHrs: 0.5,
        materialHrs: 0,
        otherHrs: 0,
        notes: 'First stone delivery arrived 7:30 AM (85 tons Heidelberg #57). Mobilization complete by 9:00 AM.'
      },
      safety: {
        incidents: false,
        nearMisses: false,
        toolboxTopic: 'Site Orientation — Emergency Action Plan, muster point, hospital route',
        toolboxAttendees: 6
      },
      notes: 'Mobilization day. Cat 336 offloaded and mast erected. Layout verified by Miller Land Surveying (Brett Miller on site). First 42 columns installed in B-row — competent silty clay at 8-9 ft depth. GC (Mike Harrison) walked site at 2 PM, no concerns. Stone supplier confirmed daily deliveries through duration.',
      photos: 3,
      submittedBy: 'Brad Reinking'
    },
    {
      id: 'DL-005',
      date: '2026-05-16',
      project: 'POET Bioprocessing - Shelbyville',
      jobNumber: '26-001',
      weather: 'Partly cloudy, 68F, Wind NW 12 mph',
      crewOnSite: ['Brad Reinking (Superintendent)', 'Derek (Foreman)', 'Mike T. (Operator)', 'Jason R. (Ground)', 'Cody M. (Ground)', 'Travis L. (Loader)'],
      production: {
        columnsToday: 98,
        pierRange: 'B-185 through B-282',
        lfToday: 882,
        lfCumulative: 4200,
        totalColumns: 468,
        targetLF: 17003,
        stoneDelivered: 90,
        stoneUsed: 79,
        stoneCumulative: 378,
        diameter: '30"',
        feedMethod: 'Bottom'
      },
      equipment: {
        cat336: 'Operational — hydraulic temp gauge checked (normal)',
        predrill: 'Deployed for B-217 area — soft zone required predrill to 6 ft',
        loader: 'Operational',
        fuelGallons: 95,
        downtimeHrs: 0.75,
        downtimeReason: 'Predrill setup at B-217 soft zone'
      },
      delays: {
        weatherHrs: 0,
        gcHoldHrs: 0,
        equipmentHrs: 0.75,
        materialHrs: 0,
        otherHrs: 0,
        notes: 'Predrill deployed at B-217 due to soft organic layer at 3-4 ft. 45 min setup/predrill.'
      },
      safety: {
        incidents: false,
        nearMisses: false,
        toolboxTopic: 'Underground Utility Safety — 811 ticket review and mark verification',
        toolboxAttendees: 6
      },
      notes: 'Hit soft zone near B-217 — organic silt layer at 3-4 ft not shown on boring logs. Predrilled 8 piers in that area to penetrate through soft zone. Notified Dr. Ed Garbin by email with photos and GPS coordinates. Dr. Ed confirmed predrill approach is appropriate; no design changes needed. Production pace strong otherwise — crew hitting stride at 98 columns/day.',
      photos: 7,
      submittedBy: 'Brad Reinking'
    },
    {
      id: 'DL-010',
      date: '2026-05-23',
      project: 'POET Bioprocessing - Shelbyville',
      jobNumber: '26-001',
      weather: 'Sunny, 78F, Wind S 6 mph',
      crewOnSite: ['Derek (Foreman)', 'Mike T. (Operator)', 'Jason R. (Ground)', 'Cody M. (Ground)', 'Travis L. (Loader)', 'Kyle P. (QC Tech)'],
      production: {
        columnsToday: 112,
        pierRange: 'C-044 through C-155',
        lfToday: 1008,
        lfCumulative: 9450,
        totalColumns: 1050,
        targetLF: 17003,
        stoneDelivered: 95,
        stoneUsed: 91,
        stoneCumulative: 847,
        diameter: '30"',
        feedMethod: 'Bottom'
      },
      equipment: {
        cat336: 'Operational — greased all pins at lunch',
        predrill: 'Standby (not needed today)',
        loader: 'Operational — new bucket teeth installed',
        fuelGallons: 105,
        downtimeHrs: 0,
        downtimeReason: 'None'
      },
      delays: {
        weatherHrs: 0,
        gcHoldHrs: 0,
        equipmentHrs: 0,
        materialHrs: 0,
        otherHrs: 0.5,
        notes: 'Modulus test Tp01 performed mid-morning — 30 min production pause for setup.'
      },
      safety: {
        incidents: false,
        nearMisses: false,
        toolboxTopic: 'Silica Dust Awareness — wet suppression and respirator requirements',
        toolboxAttendees: 6
      },
      notes: 'Best production day so far — 112 columns (1,008 LF). Modulus test Tp01 performed at C-088: PASS with Kp = 419 pci (design minimum 150 pci, ratio 2.80x). Dr. Ed notified of results. Kyle P. (QC) logged all GUHMA data for C-row. Soil conditions consistent: silty clay, N-values 8-12. 55.6% of total LF complete.',
      photos: 5,
      submittedBy: 'Derek'
    },
    {
      id: 'DL-015',
      date: '2026-05-28',
      project: 'POET Bioprocessing - Shelbyville',
      jobNumber: '26-001',
      weather: 'Rain AM, clearing PM, 65F, Wind NE 15 mph',
      crewOnSite: ['Brad Reinking (Superintendent)', 'Derek (Foreman)', 'Mike T. (Operator)', 'Jason R. (Ground)', 'Cody M. (Ground)', 'Travis L. (Loader)'],
      production: {
        columnsToday: 95,
        pierRange: 'D-112 through D-206',
        lfToday: 855,
        lfCumulative: 14100,
        totalColumns: 1568,
        targetLF: 17003,
        stoneDelivered: 90,
        stoneUsed: 77,
        stoneCumulative: 1265,
        diameter: '30"',
        feedMethod: 'Bottom'
      },
      equipment: {
        cat336: 'Operational — tracks cleaned of mud after rain',
        predrill: 'Standby',
        loader: 'Operational',
        fuelGallons: 88,
        downtimeHrs: 0,
        downtimeReason: 'None'
      },
      delays: {
        weatherHrs: 2,
        gcHoldHrs: 0,
        equipmentHrs: 0,
        materialHrs: 0,
        otherHrs: 0,
        notes: 'Rain from 6:30-8:30 AM. Ground dried enough to work by 9:00 AM. Adjusted schedule.'
      },
      safety: {
        incidents: false,
        nearMisses: true,
        toolboxTopic: 'Wet weather operations — ground stability and slip/trip hazards',
        toolboxAttendees: 6
      },
      notes: 'Rain delay 2 hours in morning. Started dewatering operations near grain bin area — standing water at D-180 through D-195 required sump pump. Pumped to approved discharge point per GC stormwater plan. Near-miss documented: Travis slipped on wet spoils pile, caught himself — no injury. Added grit to travel paths. 82.9% of total LF complete. On track for 3-day finish.',
      photos: 4,
      submittedBy: 'Brad Reinking'
    },
    {
      id: 'DL-018',
      date: '2026-05-31',
      project: 'POET Bioprocessing - Shelbyville',
      jobNumber: '26-001',
      weather: 'Clear, 74F, Wind W 5 mph',
      crewOnSite: ['Brad Reinking (Superintendent)', 'Derek (Foreman)', 'Mike T. (Operator)', 'Jason R. (Ground)', 'Cody M. (Ground)', 'Travis L. (Loader)', 'Kyle P. (QC Tech)'],
      production: {
        columnsToday: 78,
        pierRange: 'D-310 through E-022',
        lfToday: 702,
        lfCumulative: 16802,
        totalColumns: 1843,
        targetLF: 17003,
        stoneDelivered: 0,
        stoneUsed: 63,
        stoneCumulative: 1468,
        diameter: '30"',
        feedMethod: 'Bottom'
      },
      equipment: {
        cat336: 'Operational — final day ops',
        predrill: 'Already loaded on trailer',
        loader: 'Operational — will load tomorrow AM',
        fuelGallons: 45,
        downtimeHrs: 1.5,
        downtimeReason: 'Final QC walkthrough and demob prep'
      },
      delays: {
        weatherHrs: 0,
        gcHoldHrs: 0,
        equipmentHrs: 0,
        materialHrs: 0,
        otherHrs: 1.5,
        notes: 'Production stopped at 2:30 PM for final QC walkthrough with Kyle P. and GC.'
      },
      safety: {
        incidents: false,
        nearMisses: false,
        toolboxTopic: 'Demobilization safety — load securement, overhead lines on exit route',
        toolboxAttendees: 7
      },
      notes: 'Final production day. 78 columns installed to close out E-row and remaining D-row piers. QC walkthrough with Kyle P. — all GUHMA data logged, 2 modulus tests PASS, zero rejected piers. Final pier count: 1,843 of 1,865 (22 piers deleted by design revision per Dr. Ed). Cumulative LF: 16,802. GC signed daily log acknowledging production complete. Demob scheduled tomorrow 6:00 AM — Paddacks (Miah) confirmed trailer pickup. Spoils removal by GC earthwork sub. Outstanding: final invoice to Jonathan for processing.',
      photos: 8,
      submittedBy: 'Brad Reinking'
    }
  ];

  // ---- VIEW STATE ----
  var currentView = 'history'; // history | detail | newlog
  var selectedLogId = null;
  var newLog = {
    date: '', project: '', jobNumber: '', weather: '',
    crew: '',
    columnsToday: '', pierRange: '', lfToday: '', lfCumulative: '',
    stoneDelivered: '', stoneUsed: '', diameter: '30"', feedMethod: 'Bottom',
    cat336Status: '', predrillStatus: '', loaderStatus: '',
    fuelGallons: '', downtimeHrs: '', downtimeReason: '',
    weatherDelayHrs: '', gcHoldHrs: '', equipDelayHrs: '', materialDelayHrs: '',
    delayNotes: '',
    incidents: 'No', nearMisses: 'No', toolboxTopic: '', toolboxAttendees: '',
    notes: '', soilConditions: '', gcComms: '', visitors: ''
  };

  // ---- FORMAT HELPERS ----
  function fmtDate(d) {
    if (!d) return '--';
    var p = d.split('-');
    return p[1] + '/' + p[2] + '/' + p[0];
  }

  function fmtNum(n) {
    if (n === undefined || n === null) return '--';
    return n.toLocaleString();
  }

  function pct(current, target) {
    if (!target) return 0;
    return Math.min(100, Math.round(current / target * 100));
  }

  // ---- RENDER ----
  function render() {
    var app = document.getElementById('dailylogs-app');
    if (!app) return;

    var html = '';

    // Tabs
    html += '<div class="card" style="margin-bottom:0;border-radius:8px 8px 0 0">';
    html += '<div style="display:flex;gap:4px;flex-wrap:wrap;padding:4px;align-items:center">';
    var tabs = [
      { id: 'history', label: 'Log History' },
      { id: 'newlog', label: 'New Daily Log' }
    ];
    for (var t = 0; t < tabs.length; t++) {
      var cls = currentView === tabs[t].id || (currentView === 'detail' && tabs[t].id === 'history')
        ? 'btn btn-primary' : 'btn btn-secondary';
      html += '<button class="' + cls + '" onclick="window.__dailyView(\'' + tabs[t].id + '\')">' + tabs[t].label + '</button>';
    }
    if (currentView === 'detail') {
      html += '<button class="btn btn-secondary" onclick="window.__dailyView(\'history\')" style="margin-left:auto">Back to History</button>';
    }
    html += '</div></div>';

    if (currentView === 'history') {
      html += renderHistory();
    } else if (currentView === 'detail') {
      html += renderDetail();
    } else if (currentView === 'newlog') {
      html += renderNewLog();
    }

    app.innerHTML = html;
  }

  // ---- HISTORY VIEW ----
  function renderHistory() {
    var html = '';

    // Summary stats across all logs
    var totalCols = 0, totalLF = 0, totalStone = 0, totalDelayHrs = 0;
    for (var i = 0; i < LOGS.length; i++) {
      totalCols += LOGS[i].production.columnsToday;
      totalLF += LOGS[i].production.lfToday;
      totalStone += LOGS[i].production.stoneUsed;
      totalDelayHrs += LOGS[i].delays.weatherHrs + LOGS[i].delays.gcHoldHrs +
                       LOGS[i].delays.equipmentHrs + LOGS[i].delays.materialHrs +
                       LOGS[i].delays.otherHrs;
    }

    var lastLog = LOGS[LOGS.length - 1];
    var lfPct = pct(lastLog.production.lfCumulative, lastLog.production.targetLF);

    html += '<div class="grid grid-4" style="margin-top:16px">';
    html += '<div class="stat-card"><div class="stat-label">Columns (Logged Days)</div><div class="stat-value">' + fmtNum(totalCols) + '</div><div style="font-size:0.75rem;color:var(--text-muted)">Across ' + LOGS.length + ' reported days</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Linear Feet (Logged)</div><div class="stat-value">' + fmtNum(totalLF) + '</div><div style="font-size:0.75rem;color:var(--text-muted)">Avg ' + Math.round(totalLF / LOGS.length) + ' LF/day</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Stone Used (tons)</div><div class="stat-value">' + fmtNum(totalStone) + '</div><div style="font-size:0.75rem;color:var(--text-muted)">Cumulative: ' + fmtNum(lastLog.production.stoneCumulative) + ' T</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Project Progress</div><div class="stat-value">' + lfPct + '%</div>';
    html += '<div class="progress-bar" style="margin-top:6px"><div class="progress-fill" style="width:' + lfPct + '%"></div></div>';
    html += '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">' + fmtNum(lastLog.production.lfCumulative) + ' / ' + fmtNum(lastLog.production.targetLF) + ' LF</div></div>';
    html += '</div>';

    // Delay summary
    if (totalDelayHrs > 0) {
      html += '<div class="card" style="margin-top:16px">';
      html += '<div class="card-header"><span class="card-title">Delay Summary</span><span class="card-subtitle">' + totalDelayHrs + ' total hours across all logged days</span></div>';
      var delayTypes = { weather: 0, gc: 0, equipment: 0, material: 0, other: 0 };
      for (var d = 0; d < LOGS.length; d++) {
        delayTypes.weather += LOGS[d].delays.weatherHrs;
        delayTypes.gc += LOGS[d].delays.gcHoldHrs;
        delayTypes.equipment += LOGS[d].delays.equipmentHrs;
        delayTypes.material += LOGS[d].delays.materialHrs;
        delayTypes.other += LOGS[d].delays.otherHrs;
      }
      html += '<div class="grid grid-4" style="padding:12px 16px">';
      if (delayTypes.weather > 0) html += miniStat('Weather', delayTypes.weather + ' hrs');
      if (delayTypes.gc > 0) html += miniStat('GC Hold', delayTypes.gc + ' hrs');
      if (delayTypes.equipment > 0) html += miniStat('Equipment', delayTypes.equipment + ' hrs');
      if (delayTypes.material > 0) html += miniStat('Material', delayTypes.material + ' hrs');
      if (delayTypes.other > 0) html += miniStat('Other', delayTypes.other + ' hrs');
      html += '</div></div>';
    }

    // Log table
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Daily Log History</span><span class="card-subtitle">POET Bioprocessing - Shelbyville (Job #26-001)</span></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr>';
    html += '<th>Date</th><th>Day</th><th>Columns</th><th>LF</th><th>Cumulative LF</th><th>Stone (T)</th><th>Delays</th><th>Safety</th><th>Photos</th>';
    html += '</tr></thead><tbody>';

    for (var r = 0; r < LOGS.length; r++) {
      var log = LOGS[r];
      var delayHrs = log.delays.weatherHrs + log.delays.gcHoldHrs +
                     log.delays.equipmentHrs + log.delays.materialHrs + log.delays.otherHrs;
      var safetyStatus = log.safety.incidents ? 'overdue' : log.safety.nearMisses ? 'pending' : 'active';
      var safetyLabel = log.safety.incidents ? 'INCIDENT' : log.safety.nearMisses ? 'Near Miss' : 'Clear';

      html += '<tr style="cursor:pointer" onclick="window.__dailyDetail(\'' + log.id + '\')">';
      html += '<td>' + fmtDate(log.date) + '</td>';
      html += '<td>' + log.id.split('-')[1] + '</td>';
      html += '<td><strong>' + log.production.columnsToday + '</strong></td>';
      html += '<td>' + fmtNum(log.production.lfToday) + '</td>';
      html += '<td>' + fmtNum(log.production.lfCumulative) + '</td>';
      html += '<td>' + log.production.stoneUsed + '</td>';
      html += '<td>' + (delayHrs > 0 ? '<span class="badge-status pending">' + delayHrs + ' hrs</span>' : '<span class="badge-status active">None</span>') + '</td>';
      html += '<td><span class="badge-status ' + safetyStatus + '">' + safetyLabel + '</span></td>';
      html += '<td>' + log.photos + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table></div></div>';

    return html;
  }

  // ---- DETAIL VIEW ----
  function renderDetail() {
    var log = null;
    for (var i = 0; i < LOGS.length; i++) {
      if (LOGS[i].id === selectedLogId) { log = LOGS[i]; break; }
    }
    if (!log) return '<div class="card" style="margin-top:16px;padding:20px">Log not found.</div>';

    var html = '';
    var lfPct = pct(log.production.lfCumulative, log.production.targetLF);
    var delayHrs = log.delays.weatherHrs + log.delays.gcHoldHrs +
                   log.delays.equipmentHrs + log.delays.materialHrs + log.delays.otherHrs;

    // Header
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">' + log.project + '</span><span class="card-subtitle">Daily Log ' + log.id + ' | ' + fmtDate(log.date) + ' | Job #' + log.jobNumber + '</span></div>';

    // Top-level info
    html += '<div class="grid grid-3" style="padding:12px 16px">';
    html += miniStat('Weather', log.weather);
    html += miniStat('Crew Size', log.crewOnSite.length + ' on site');
    html += miniStat('Submitted By', log.submittedBy);
    html += '</div>';
    html += '</div>';

    // Production
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Production</span></div>';
    html += '<div class="grid grid-4" style="padding:12px 16px">';
    html += '<div class="stat-card"><div class="stat-label">Columns Today</div><div class="stat-value">' + log.production.columnsToday + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">LF Today</div><div class="stat-value">' + fmtNum(log.production.lfToday) + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Cumulative LF</div><div class="stat-value">' + fmtNum(log.production.lfCumulative) + '</div>';
    html += '<div class="progress-bar" style="margin-top:4px"><div class="progress-fill" style="width:' + lfPct + '%"></div></div>';
    html += '<div style="font-size:0.7rem;color:var(--text-muted)">' + lfPct + '% of ' + fmtNum(log.production.targetLF) + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Total Columns</div><div class="stat-value">' + fmtNum(log.production.totalColumns) + '</div></div>';
    html += '</div>';

    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Pier Range</th><th>Diameter</th><th>Feed</th><th>Stone Delivered</th><th>Stone Used</th><th>Stone Cumulative</th></tr></thead>';
    html += '<tbody><tr>';
    html += '<td>' + log.production.pierRange + '</td>';
    html += '<td>' + log.production.diameter + '</td>';
    html += '<td>' + log.production.feedMethod + '</td>';
    html += '<td>' + log.production.stoneDelivered + ' T</td>';
    html += '<td>' + log.production.stoneUsed + ' T</td>';
    html += '<td>' + fmtNum(log.production.stoneCumulative) + ' T</td>';
    html += '</tr></tbody></table></div>';
    html += '</div>';

    // Crew
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Crew on Site</span><span class="card-subtitle">' + log.crewOnSite.length + ' personnel</span></div>';
    html += '<div class="grid grid-3" style="padding:12px 16px">';
    for (var c = 0; c < log.crewOnSite.length; c++) {
      html += '<div style="padding:4px 0;font-size:0.85rem">' + log.crewOnSite[c] + '</div>';
    }
    html += '</div></div>';

    // Equipment
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Equipment Status</span></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Unit</th><th>Status</th></tr></thead><tbody>';
    html += '<tr><td><strong>Cat 336 (98K lbs)</strong></td><td>' + log.equipment.cat336 + '</td></tr>';
    html += '<tr><td><strong>Sany Predrill</strong></td><td>' + log.equipment.predrill + '</td></tr>';
    html += '<tr><td><strong>Track Loader</strong></td><td>' + log.equipment.loader + '</td></tr>';
    html += '</tbody></table></div>';
    html += '<div class="grid grid-3" style="padding:8px 16px">';
    html += miniStat('Fuel', log.equipment.fuelGallons + ' gal');
    html += miniStat('Downtime', log.equipment.downtimeHrs + ' hrs');
    html += miniStat('Reason', log.equipment.downtimeReason || 'None');
    html += '</div></div>';

    // Delays
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Delays</span><span class="card-subtitle">' + delayHrs + ' total hours</span></div>';
    if (delayHrs > 0) {
      html += '<div class="grid grid-4" style="padding:12px 16px">';
      if (log.delays.weatherHrs > 0) html += miniStat('Weather', log.delays.weatherHrs + ' hrs');
      if (log.delays.gcHoldHrs > 0) html += miniStat('GC Hold', log.delays.gcHoldHrs + ' hrs');
      if (log.delays.equipmentHrs > 0) html += miniStat('Equipment', log.delays.equipmentHrs + ' hrs');
      if (log.delays.materialHrs > 0) html += miniStat('Material', log.delays.materialHrs + ' hrs');
      if (log.delays.otherHrs > 0) html += miniStat('Other', log.delays.otherHrs + ' hrs');
      html += '</div>';
    }
    if (log.delays.notes) {
      html += '<div style="padding:0 16px 12px;font-size:0.85rem">' + log.delays.notes + '</div>';
    }
    html += '</div>';

    // Safety
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Safety</span></div>';
    html += '<div class="grid grid-4" style="padding:12px 16px">';
    var incBadge = log.safety.incidents ? 'overdue' : 'active';
    var nmBadge = log.safety.nearMisses ? 'pending' : 'active';
    html += '<div style="text-align:center"><div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">Incidents</div><span class="badge-status ' + incBadge + '">' + (log.safety.incidents ? 'YES' : 'None') + '</span></div>';
    html += '<div style="text-align:center"><div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">Near Misses</div><span class="badge-status ' + nmBadge + '">' + (log.safety.nearMisses ? 'YES' : 'None') + '</span></div>';
    html += miniStat('Toolbox Topic', log.safety.toolboxTopic);
    html += miniStat('Attendees', log.safety.toolboxAttendees);
    html += '</div></div>';

    // Notes
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Field Notes</span><span class="card-subtitle">Soil conditions, GC communications, observations</span></div>';
    html += '<div style="padding:12px 16px;font-size:0.88rem;line-height:1.6">' + log.notes + '</div>';
    html += '<div style="padding:0 16px 12px;font-size:0.82rem;color:var(--text-muted)">' + log.photos + ' photos attached</div>';
    html += '</div>';

    return html;
  }

  // ---- NEW LOG FORM ----
  function renderNewLog() {
    var html = '';

    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">New Daily Field Report</span><span class="card-subtitle">VSC Installation Daily Log</span></div>';

    // Project Info
    html += '<div style="padding:8px 16px 0"><div style="font-weight:600;font-size:0.9rem;border-bottom:1px solid var(--border-light);padding-bottom:4px;margin-bottom:8px">Project Information</div></div>';
    html += '<div class="grid grid-4" style="padding:0 16px 12px">';
    html += formField('Date', 'date', 'nl-date');
    html += formField('Project Name', 'text', 'nl-project');
    html += formField('Job Number', 'text', 'nl-jobnumber');
    html += formField('Weather', 'text', 'nl-weather');
    html += '</div>';

    html += '<div style="padding:0 16px 12px">';
    html += '<div class="form-group"><label class="form-label">Crew Members on Site</label>';
    html += '<textarea class="form-input" rows="2" placeholder="One per line or comma-separated"></textarea></div>';
    html += '</div>';

    // Production
    html += '<div style="padding:8px 16px 0"><div style="font-weight:600;font-size:0.9rem;border-bottom:1px solid var(--border-light);padding-bottom:4px;margin-bottom:8px">Production</div></div>';
    html += '<div class="grid grid-4" style="padding:0 16px 12px">';
    html += formField('Columns Installed', 'number', 'nl-cols');
    html += formField('Pier Range (e.g. B-001 to B-042)', 'text', 'nl-pierrange');
    html += formField('LF Today', 'number', 'nl-lftoday');
    html += formField('Cumulative LF', 'number', 'nl-lfcum');
    html += '</div>';
    html += '<div class="grid grid-4" style="padding:0 16px 12px">';
    html += formField('Stone Delivered (T)', 'number', 'nl-stonedel');
    html += formField('Stone Used (T)', 'number', 'nl-stoneused');
    html += selectField('Diameter', 'nl-diameter', ['24"', '30"']);
    html += selectField('Feed Method', 'nl-feed', ['Bottom', 'Top']);
    html += '</div>';

    // Equipment
    html += '<div style="padding:8px 16px 0"><div style="font-weight:600;font-size:0.9rem;border-bottom:1px solid var(--border-light);padding-bottom:4px;margin-bottom:8px">Equipment Status</div></div>';
    html += '<div class="grid grid-3" style="padding:0 16px 12px">';
    html += formField('Cat 336 Status', 'text', 'nl-cat336');
    html += formField('Predrill Status', 'text', 'nl-predrill');
    html += formField('Loader Status', 'text', 'nl-loader');
    html += '</div>';
    html += '<div class="grid grid-3" style="padding:0 16px 12px">';
    html += formField('Fuel (gallons)', 'number', 'nl-fuel');
    html += formField('Downtime (hrs)', 'number', 'nl-downtime');
    html += formField('Downtime Reason', 'text', 'nl-downreason');
    html += '</div>';

    // Delays
    html += '<div style="padding:8px 16px 0"><div style="font-weight:600;font-size:0.9rem;border-bottom:1px solid var(--border-light);padding-bottom:4px;margin-bottom:8px">Delays</div></div>';
    html += '<div class="grid grid-4" style="padding:0 16px 12px">';
    html += formField('Weather (hrs)', 'number', 'nl-delayweather');
    html += formField('GC Hold (hrs)', 'number', 'nl-delaygc');
    html += formField('Equipment (hrs)', 'number', 'nl-delayequip');
    html += formField('Material (hrs)', 'number', 'nl-delaymat');
    html += '</div>';
    html += '<div style="padding:0 16px 12px">';
    html += '<div class="form-group"><label class="form-label">Delay Notes</label>';
    html += '<textarea class="form-input" rows="2" placeholder="Describe cause and impact of any delays"></textarea></div>';
    html += '</div>';

    // Safety
    html += '<div style="padding:8px 16px 0"><div style="font-weight:600;font-size:0.9rem;border-bottom:1px solid var(--border-light);padding-bottom:4px;margin-bottom:8px">Safety</div></div>';
    html += '<div class="grid grid-4" style="padding:0 16px 12px">';
    html += selectField('Incidents', 'nl-incidents', ['No', 'Yes']);
    html += selectField('Near Misses', 'nl-nearmiss', ['No', 'Yes']);
    html += formField('Toolbox Talk Topic', 'text', 'nl-toolbox');
    html += formField('Attendees', 'number', 'nl-attendees');
    html += '</div>';

    // Notes
    html += '<div style="padding:8px 16px 0"><div style="font-weight:600;font-size:0.9rem;border-bottom:1px solid var(--border-light);padding-bottom:4px;margin-bottom:8px">Field Notes</div></div>';
    html += '<div style="padding:0 16px 12px">';
    html += '<div class="form-group"><label class="form-label">Soil Conditions Encountered</label>';
    html += '<textarea class="form-input" rows="2" placeholder="Describe soil types, consistency, N-values if known, any surprises"></textarea></div>';
    html += '<div class="form-group"><label class="form-label">GC Communications</label>';
    html += '<textarea class="form-input" rows="2" placeholder="Conversations with GC, RFIs, change directives, site meetings"></textarea></div>';
    html += '<div class="form-group"><label class="form-label">Visitors on Site</label>';
    html += '<textarea class="form-input" rows="1" placeholder="Engineers, inspectors, owners, GC reps who visited today"></textarea></div>';
    html += '<div class="form-group"><label class="form-label">General Notes</label>';
    html += '<textarea class="form-input" rows="3" placeholder="Any other observations, issues, or items to document"></textarea></div>';
    html += '</div>';

    // Photos placeholder
    html += '<div style="padding:0 16px 12px">';
    html += '<div style="background:var(--bg-main);border:2px dashed var(--border-light);border-radius:8px;padding:24px;text-align:center;color:var(--text-muted);font-size:0.85rem">';
    html += 'Photo upload capability will be available when connected to SharePoint.<br>';
    html += 'For now, email photos to peter@pierfoundations.com with the daily log date in subject.';
    html += '</div></div>';

    // Submit
    html += '<div style="padding:8px 16px 16px;display:flex;gap:8px;justify-content:flex-end">';
    html += '<button class="btn btn-secondary" onclick="window.__dailyView(\'history\')">Cancel</button>';
    html += '<button class="btn btn-primary" onclick="alert(\'Daily log saved locally.\')">Save Daily Log</button>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  // ---- HELPERS ----
  function miniStat(label, value) {
    return '<div><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase">' + label + '</div><div style="font-size:0.85rem;font-weight:500">' + value + '</div></div>';
  }

  function formField(label, type, id) {
    return '<div class="form-group"><label class="form-label">' + label + '</label><input class="form-input" type="' + type + '" id="' + id + '"></div>';
  }

  function selectField(label, id, options) {
    var html = '<div class="form-group"><label class="form-label">' + label + '</label><select class="form-select" id="' + id + '">';
    for (var i = 0; i < options.length; i++) {
      html += '<option>' + options[i] + '</option>';
    }
    html += '</select></div>';
    return html;
  }

  // ---- GLOBAL HANDLERS ----
  window.__dailyView = function (view) {
    currentView = view;
    selectedLogId = null;
    render();
  };

  window.__dailyDetail = function (logId) {
    selectedLogId = logId;
    currentView = 'detail';
    render();
  };

  // ---- INIT ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  // Re-render when module view becomes active
  var dailylogsView = document.getElementById('mod-dailylogs');
  if (dailylogsView) {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName === 'class' && dailylogsView.classList.contains('active')) {
          render();
          break;
        }
      }
    });
    observer.observe(dailylogsView, { attributes: true });
  }

})();
