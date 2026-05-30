// ============================================================
// Pier Foundations — Safety Checklists Module
// Renders into #mod-safety > #safety-app
// ============================================================

(function () {
  'use strict';

  // ---- PRE-SHIFT CHECKLIST TEMPLATE ----
  var PRESHIFT_ITEMS = [
    { id: 'ps01', text: 'Walk-around inspection of Cat 336 (98,000 lbs) — no leaks, damage, or loose fittings', category: 'Equipment' },
    { id: 'ps02', text: 'Hydraulic hoses and connections inspected — no cracks, bulges, or weeping', category: 'Equipment' },
    { id: 'ps03', text: 'Vibroflot / vibro probe checked — wear tips, eccentric weights, vibration dampeners', category: 'Equipment' },
    { id: 'ps04', text: 'Mast / leader fully inspected — pins, sheaves, wire rope condition, anti-two-block device', category: 'Equipment' },
    { id: 'ps05', text: 'Sany predrill unit inspected — auger teeth, kelly bar, rotary head', category: 'Equipment' },
    { id: 'ps06', text: 'Track loader / skid steer — ROPS intact, backup alarm functional, mirrors set', category: 'Equipment' },
    { id: 'ps07', text: 'Fire extinguisher on each unit — charged and accessible', category: 'Safety Equip' },
    { id: 'ps08', text: 'Utility locate verification — 811 ticket valid, marks visible, no conflicts', category: 'Utilities' },
    { id: 'ps09', text: 'All PPE accounted for — hard hat, safety glasses, steel toes, high-vis, hearing protection, gloves', category: 'PPE' },
    { id: 'ps10', text: 'Hearing protection available for all crew — vibro exceeds 85 dB at operating speed', category: 'PPE' },
    { id: 'ps11', text: 'Silica dust controls in place — wet methods or respiratory protection for stone handling', category: 'Health' },
    { id: 'ps12', text: 'Exclusion zone marked around operating mast — 1.5x mast height minimum', category: 'Zone' },
    { id: 'ps13', text: 'Ground conditions assessed — stable footing for 98K lb excavator, no voids or soft spots', category: 'Site' },
    { id: 'ps14', text: 'Communication established — radio/horn signals agreed between operator and ground crew', category: 'Comms' },
    { id: 'ps15', text: 'Emergency action plan reviewed — nearest hospital, muster point, first aid kit location', category: 'Emergency' }
  ];

  // ---- VSC-SPECIFIC HAZARDS ----
  var HAZARDS = [
    { hazard: 'Vibration Exposure', risk: 'High', controls: 'Limit continuous operation to 4 hrs; anti-vibration gloves; rotate operators', icon: '&#9888;' },
    { hazard: 'Silica Dust (Crystalline)', risk: 'High', controls: 'Wet suppression on stone piles; P100 respirators when dry-handling #57 stone', icon: '&#9888;' },
    { hazard: 'Overhead Mast Operation', risk: 'High', controls: 'Exclusion zone 1.5x mast height; no personnel under suspended loads; anti-two-block', icon: '&#9888;' },
    { hazard: 'Underground Utilities', risk: 'Critical', controls: '811 call minimum 48 hrs prior; hand-dig within 18" of marks; pothole verify', icon: '&#9888;' },
    { hazard: 'Crane/Rigging (Vibroflot)', risk: 'High', controls: 'Qualified rigger required; inspect slings daily; rated capacity never exceeded', icon: '&#9888;' },
    { hazard: 'Struck-By (Stone Discharge)', risk: 'Medium', controls: 'Clear zone during bottom-feed operation; face shield when near hopper', icon: '&#9888;' },
    { hazard: 'Caught-In (Rotating Auger)', risk: 'High', controls: 'Lockout/tagout before clearing jams; no loose clothing near predrill', icon: '&#9888;' },
    { hazard: 'Heat Stress', risk: 'Medium', controls: 'Water coolers on site; shade breaks every 2 hrs in summer; buddy system', icon: '&#9888;' },
    { hazard: 'Noise (>90 dB)', risk: 'High', controls: 'Mandatory hearing protection within 25 ft of operating vibro; annual audiograms', icon: '&#9888;' },
    { hazard: 'Spoils Pile Collapse', risk: 'Medium', controls: 'Grade spoils away from excavation; no stacking above 4 ft without benching', icon: '&#9888;' }
  ];

  // ---- PPE REQUIREMENTS ----
  var PPE = [
    { item: 'Hard Hat (ANSI Z89.1 Type I)', required: 'Always', notes: 'Replace after any impact; no modifications' },
    { item: 'Safety Glasses (ANSI Z87.1)', required: 'Always', notes: 'Side shields required; tinted lenses OK outdoors' },
    { item: 'Steel-Toe Boots (ASTM F2413)', required: 'Always', notes: 'Minimum 6" height; metatarsal guards recommended' },
    { item: 'High-Vis Vest (ANSI 107 Class 2)', required: 'Always', notes: 'Class 3 required near traffic/heavy equipment' },
    { item: 'Hearing Protection (NRR 25+)', required: 'Within 25 ft of vibro', notes: 'Dual protection (plugs + muffs) recommended during operation' },
    { item: 'Leather Gloves', required: 'Material handling', notes: 'Anti-vibration gloves for operator; cut-resistant for rigging' },
    { item: 'Respirator (P100 / N95)', required: 'Silica exposure', notes: 'Fit-tested annually; clean-shaven seal area required' },
    { item: 'Face Shield', required: 'Near stone discharge', notes: 'Over safety glasses during bottom-feed hopper work' }
  ];

  // ---- OSHA REQUIREMENTS ----
  var OSHA = [
    { requirement: 'OSHA 10-Hour Construction', who: 'All crew', notes: 'Minimum for any person on site' },
    { requirement: 'OSHA 30-Hour Construction', who: 'Supervisors / Foremen', notes: 'Required for anyone directing work' },
    { requirement: 'Competent Person (Excavation)', who: 'Site Superintendent', notes: 'Per 29 CFR 1926 Subpart P' },
    { requirement: 'Qualified Rigger', who: 'Designated rigger', notes: 'For vibroflot lifting operations' },
    { requirement: 'Silica Exposure Plan', who: 'Employer', notes: 'Written plan per 29 CFR 1926.1153 Table 1' },
    { requirement: 'Hearing Conservation Program', who: 'Employer', notes: 'When TWA exceeds 85 dB (vibro operations)' },
    { requirement: 'Emergency Action Plan', who: 'Site-specific', notes: 'Posted and reviewed at each new project' }
  ];

  // ---- TOOLBOX TALK LOG ----
  var TOOLBOX_TALKS = [
    { date: '2026-05-26', topic: 'Silica Dust Awareness — Crystalline Silica from #57 Stone', presenter: 'Brad Reinking', attendees: 6, project: 'POET Shelbyville', notes: 'Reviewed wet suppression methods, respirator requirements, and PEL of 50 ug/m3 over 8-hr TWA. Crew reminded to wet stone piles before loading hopper.' },
    { date: '2026-05-23', topic: 'Mast Operation & Exclusion Zones', presenter: 'Derek (Foreman)', attendees: 5, project: 'POET Shelbyville', notes: 'Walked exclusion zone boundaries. Reviewed anti-two-block device function. Reminded ground crew: never position under mast even when not operating.' },
    { date: '2026-05-20', topic: 'Underground Utility Safety — 811 Process', presenter: 'Brad Reinking', attendees: 6, project: 'POET Shelbyville', notes: 'Reviewed 811 ticket #IN-2026-184522 (expires 5/30). Discussed hand-dig protocol within 18" of marks. Gas line identified at B-row — flagged with orange paint.' },
    { date: '2026-05-17', topic: 'Heat Stress Prevention', presenter: 'Derek (Foreman)', attendees: 5, project: 'POET Shelbyville', notes: 'Summer operations approaching. Reviewed signs of heat exhaustion vs heat stroke. Water coolers staged at mast and stone pile. Break schedule: 15 min every 2 hrs when heat index > 90F.' },
    { date: '2026-05-14', topic: 'Hearing Conservation — Vibro Operations', presenter: 'Brad Reinking', attendees: 6, project: 'POET Shelbyville', notes: 'Sound level readings taken: 92 dB at operator seat, 88 dB at 25 ft, 82 dB at 50 ft. Mandatory dual protection (plugs + muffs) within 25 ft. Annual audiograms due next month.' }
  ];

  // ---- JSA TEMPLATE ----
  var JSA_STEPS = [
    { step: 'Mobilization & Setup', hazards: 'Struck by during offload; pinch points; overhead lines', controls: 'Spotter for offload; gloves required; check overhead clearance before mast erection' },
    { step: 'Utility Verification', hazards: 'Contact with underground utilities (gas, electric, fiber)', controls: 'Valid 811 ticket; pothole verify within 5 ft of marks; hand-dig within 18"' },
    { step: 'Predrill (if required)', hazards: 'Rotating auger caught-in; spoils ejection; auger drop', controls: 'Lockout before clearing jams; exclusion zone; pin auger before detach' },
    { step: 'Stone Column Installation', hazards: 'Vibration exposure; silica dust; noise; mast tip-over', controls: 'Rotate operators; wet stone; hearing protection; level ground pad' },
    { step: 'Stone Delivery & Hopper Loading', hazards: 'Struck by truck; crushed by hopper; dust exposure', controls: 'Spotter for backing; stay clear of hopper swing; wet suppression' },
    { step: 'Modulus Testing', hazards: 'Hydraulic pressure release; pinch points at jack', controls: 'Bleed pressure before disconnect; fingers clear of jack plates' },
    { step: 'Spoils Removal', hazards: 'Struck by loader; pile collapse; trip hazards', controls: 'Spotter for loader; grade piles flat; housekeeping on travel paths' },
    { step: 'Demobilization', hazards: 'Overhead lines; load shift on trailer; pinch points', controls: 'Route plan verified; chains/binders checked; mast fully retracted' }
  ];

  // ---- EMERGENCY CONTACTS ----
  var EMERGENCY_CONTACTS = [
    { name: 'Emergency Services', phone: '911', role: 'Fire / EMS / Police' },
    { name: 'Brad Reinking', phone: '260-413-8442', role: 'Owner / CEO' },
    { name: 'Derek (Foreman)', phone: '260-555-0188', role: 'Site Supervisor' },
    { name: 'Jonathan', phone: '260-555-0199', role: 'Project Manager' },
    { name: 'Poison Control', phone: '1-800-222-1222', role: 'Chemical/Silica Exposure' },
    { name: 'Indiana 811 (Utility Locate)', phone: '811 or 1-800-382-5544', role: 'Utility Emergencies' },
    { name: 'OSHA Area Office (Indianapolis)', phone: '317-226-7290', role: 'Incident Reporting (fatality/hospitalization)' }
  ];

  // ---- INCIDENT FORM STATE ----
  var incidentForm = {
    date: '', time: '', project: '', location: '',
    type: 'Near Miss', severity: 'Low',
    description: '', immediateAction: '', rootCause: '',
    witnesses: '', reportedBy: ''
  };

  // ---- UTILITY LOCATE STATE ----
  var utilityLocate = {
    ticket: '', callDate: '', expirationDate: '',
    markTypes: [], notes: '', verified: false
  };

  // ---- CHECKLIST STATE ----
  var checkStates = {};

  // ---- VIEW STATE ----
  var currentView = 'overview'; // overview | checklist | jsa | incident | locate

  // ---- FORMAT HELPERS ----
  function fmtDate(d) {
    if (!d) return '--';
    var parts = d.split('-');
    return parts[1] + '/' + parts[2] + '/' + parts[0];
  }

  // ---- RENDER ----
  function render() {
    var app = document.getElementById('safety-app');
    if (!app) return;

    var html = '';

    // ---- TABS ----
    html += '<div class="card" style="margin-bottom:0;border-radius:8px 8px 0 0">';
    html += '<div style="display:flex;gap:4px;flex-wrap:wrap;padding:4px">';
    var tabs = [
      { id: 'overview', label: 'Overview' },
      { id: 'checklist', label: 'Pre-Shift Checklist' },
      { id: 'jsa', label: 'JSA Template' },
      { id: 'incident', label: 'Incident Report' },
      { id: 'locate', label: 'Utility Locate' }
    ];
    for (var t = 0; t < tabs.length; t++) {
      var cls = currentView === tabs[t].id ? 'btn btn-primary' : 'btn btn-secondary';
      html += '<button class="' + cls + '" onclick="window.__safetyView(\'' + tabs[t].id + '\')">' + tabs[t].label + '</button>';
    }
    html += '</div></div>';

    if (currentView === 'overview') {
      html += renderOverview();
    } else if (currentView === 'checklist') {
      html += renderChecklist();
    } else if (currentView === 'jsa') {
      html += renderJSA();
    } else if (currentView === 'incident') {
      html += renderIncidentForm();
    } else if (currentView === 'locate') {
      html += renderLocate();
    }

    app.innerHTML = html;
  }

  // ---- OVERVIEW ----
  function renderOverview() {
    var html = '';

    // Stats
    var checked = 0;
    for (var k in checkStates) { if (checkStates[k]) checked++; }
    var pct = Math.round(checked / PRESHIFT_ITEMS.length * 100);

    html += '<div class="grid grid-4" style="margin-top:16px">';
    html += statCard('Pre-Shift Items', PRESHIFT_ITEMS.length, 'Total checklist items');
    html += statCard('Completed Today', checked + ' / ' + PRESHIFT_ITEMS.length, pct + '% complete');
    html += statCard('Toolbox Talks', TOOLBOX_TALKS.length, 'Logged this month');
    html += statCard('Hazards Tracked', HAZARDS.length, 'VSC-specific');
    html += '</div>';

    // Pre-shift progress
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Pre-Shift Inspection Progress</span></div>';
    html += '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>';
    html += '<div style="padding:8px 16px;font-size:0.8rem;color:var(--text-muted)">' + checked + ' of ' + PRESHIFT_ITEMS.length + ' items checked</div>';
    html += '</div>';

    // VSC Hazards
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">VSC-Specific Hazards</span><span class="card-subtitle">Vibratory Stone Column Installation Risks</span></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th></th><th>Hazard</th><th>Risk Level</th><th>Controls</th></tr></thead><tbody>';
    for (var h = 0; h < HAZARDS.length; h++) {
      var hz = HAZARDS[h];
      var riskBadge = hz.risk === 'Critical' ? 'overdue' : hz.risk === 'High' ? 'pending' : 'active';
      html += '<tr>';
      html += '<td>' + hz.icon + '</td>';
      html += '<td><strong>' + hz.hazard + '</strong></td>';
      html += '<td><span class="badge-status ' + riskBadge + '">' + hz.risk + '</span></td>';
      html += '<td style="font-size:0.82rem">' + hz.controls + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';

    // PPE Requirements
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">PPE Requirements</span><span class="card-subtitle">Personal Protective Equipment for VSC Operations</span></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>PPE Item</th><th>When Required</th><th>Notes</th></tr></thead><tbody>';
    for (var p = 0; p < PPE.length; p++) {
      html += '<tr>';
      html += '<td><strong>' + PPE[p].item + '</strong></td>';
      html += '<td>' + PPE[p].required + '</td>';
      html += '<td style="font-size:0.82rem">' + PPE[p].notes + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';

    // OSHA Requirements
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">OSHA Requirements</span><span class="card-subtitle">Regulatory compliance for VSC contractors</span></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Requirement</th><th>Applies To</th><th>Reference / Notes</th></tr></thead><tbody>';
    for (var o = 0; o < OSHA.length; o++) {
      html += '<tr>';
      html += '<td><strong>' + OSHA[o].requirement + '</strong></td>';
      html += '<td>' + OSHA[o].who + '</td>';
      html += '<td style="font-size:0.82rem">' + OSHA[o].notes + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';

    // Toolbox Talk Log
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Toolbox Talk Log</span><span class="card-subtitle">Daily safety briefings — May 2026</span></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Date</th><th>Topic</th><th>Presenter</th><th>Attendees</th><th>Project</th></tr></thead><tbody>';
    for (var tt = 0; tt < TOOLBOX_TALKS.length; tt++) {
      var talk = TOOLBOX_TALKS[tt];
      html += '<tr style="cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'table-row\':\'none\'">';
      html += '<td>' + fmtDate(talk.date) + '</td>';
      html += '<td><strong>' + talk.topic + '</strong></td>';
      html += '<td>' + talk.presenter + '</td>';
      html += '<td>' + talk.attendees + '</td>';
      html += '<td>' + talk.project + '</td>';
      html += '</tr>';
      html += '<tr style="display:none"><td colspan="5" style="background:var(--bg-main);padding:12px;font-size:0.82rem">' + talk.notes + '</td></tr>';
    }
    html += '</tbody></table></div></div>';

    // Emergency Contacts
    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Emergency Contacts</span><span class="card-subtitle">Post at job trailer and on each unit</span></div>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Name</th><th>Phone</th><th>Role</th></tr></thead><tbody>';
    for (var e = 0; e < EMERGENCY_CONTACTS.length; e++) {
      var ec = EMERGENCY_CONTACTS[e];
      var bold = e === 0 ? ' style="color:var(--red);font-weight:600"' : '';
      html += '<tr' + bold + '>';
      html += '<td><strong>' + ec.name + '</strong></td>';
      html += '<td>' + ec.phone + '</td>';
      html += '<td>' + ec.role + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';

    return html;
  }

  // ---- PRE-SHIFT CHECKLIST ----
  function renderChecklist() {
    var html = '';
    var checked = 0;
    for (var k in checkStates) { if (checkStates[k]) checked++; }
    var pct = Math.round(checked / PRESHIFT_ITEMS.length * 100);
    var allDone = checked === PRESHIFT_ITEMS.length;

    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Pre-Shift Equipment Inspection</span><span class="card-subtitle">Cat 336 (98,000 lbs) + Vibroflot + Support Equipment</span></div>';

    // Progress bar
    html += '<div style="padding:0 16px">';
    html += '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%;background:' + (allDone ? 'var(--green)' : 'var(--accent)') + '"></div></div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-muted);margin-top:4px">';
    html += '<span>' + checked + ' / ' + PRESHIFT_ITEMS.length + ' complete</span>';
    html += '<span>' + pct + '%</span>';
    html += '</div></div>';

    // Reset button
    html += '<div style="padding:8px 16px;text-align:right">';
    html += '<button class="btn btn-secondary" onclick="window.__safetyResetChecklist()">Reset All</button>';
    html += '</div>';

    // Checklist items grouped by category
    var categories = [];
    var catMap = {};
    for (var i = 0; i < PRESHIFT_ITEMS.length; i++) {
      var item = PRESHIFT_ITEMS[i];
      if (!catMap[item.category]) {
        catMap[item.category] = [];
        categories.push(item.category);
      }
      catMap[item.category].push(item);
    }

    for (var c = 0; c < categories.length; c++) {
      var cat = categories[c];
      var items = catMap[cat];
      html += '<div style="padding:4px 16px"><div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;color:var(--text-muted);margin:12px 0 4px">' + cat + '</div>';
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        var isChecked = !!checkStates[it.id];
        html += '<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">';
        html += '<input type="checkbox" ' + (isChecked ? 'checked' : '') + ' onchange="window.__safetyCheck(\'' + it.id + '\', this.checked)" style="margin-top:3px;cursor:pointer;width:18px;height:18px">';
        html += '<span style="font-size:0.88rem;' + (isChecked ? 'text-decoration:line-through;color:var(--text-muted)' : '') + '">' + it.text + '</span>';
        html += '</div>';
      }
      html += '</div>';
    }

    // Status
    if (allDone) {
      html += '<div style="padding:16px;text-align:center;background:var(--green);color:#fff;margin:16px;border-radius:6px;font-weight:600">';
      html += 'PRE-SHIFT INSPECTION COMPLETE — All ' + PRESHIFT_ITEMS.length + ' items verified';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // ---- JSA TEMPLATE ----
  function renderJSA() {
    var html = '';

    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Job Safety Analysis (JSA)</span><span class="card-subtitle">VSC Installation — Standard Template</span></div>';

    // Header form
    html += '<div class="grid grid-3" style="padding:16px">';
    html += formField('Project Name', 'text', 'jsa-project', '');
    html += formField('Date', 'date', 'jsa-date', '');
    html += formField('Prepared By', 'text', 'jsa-preparer', '');
    html += '</div>';
    html += '<div class="grid grid-3" style="padding:0 16px 16px">';
    html += formField('Location', 'text', 'jsa-location', '');
    html += formField('Supervisor', 'text', 'jsa-supervisor', '');
    html += formField('Reviewed By', 'text', 'jsa-reviewer', '');
    html += '</div>';

    // Steps table
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th style="width:5%">#</th><th style="width:25%">Job Step</th><th style="width:35%">Potential Hazards</th><th style="width:35%">Hazard Controls</th></tr></thead><tbody>';
    for (var s = 0; s < JSA_STEPS.length; s++) {
      var step = JSA_STEPS[s];
      html += '<tr>';
      html += '<td>' + (s + 1) + '</td>';
      html += '<td><strong>' + step.step + '</strong></td>';
      html += '<td style="font-size:0.82rem">' + step.hazards + '</td>';
      html += '<td style="font-size:0.82rem">' + step.controls + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';

    // Signature section
    html += '<div style="padding:16px;border-top:1px solid var(--border-light)">';
    html += '<div style="font-weight:600;margin-bottom:12px">Crew Acknowledgment</div>';
    html += '<div class="grid grid-2">';
    for (var sig = 1; sig <= 8; sig++) {
      html += '<div style="display:flex;gap:8px;align-items:center;padding:4px 0">';
      html += '<span style="font-size:0.82rem;width:20px">' + sig + '.</span>';
      html += '<div style="flex:1;border-bottom:1px solid var(--border-light);padding:4px 0;font-size:0.82rem;color:var(--text-muted)">Name / Signature</div>';
      html += '</div>';
    }
    html += '</div></div>';

    html += '</div>';
    return html;
  }

  // ---- INCIDENT / NEAR-MISS REPORT ----
  function renderIncidentForm() {
    var html = '';

    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Incident / Near-Miss Report</span><span class="card-subtitle">Document all incidents and near-misses — required per OSHA</span></div>';

    html += '<div class="grid grid-3" style="padding:16px">';
    html += formField('Date of Incident', 'date', 'inc-date', incidentForm.date);
    html += formField('Time', 'time', 'inc-time', incidentForm.time);
    html += selectField('Incident Type', 'inc-type', ['Near Miss', 'First Aid', 'Recordable', 'Lost Time', 'Fatality'], incidentForm.type);
    html += '</div>';

    html += '<div class="grid grid-3" style="padding:0 16px 16px">';
    html += formField('Project', 'text', 'inc-project', incidentForm.project);
    html += formField('Location on Site', 'text', 'inc-location', incidentForm.location);
    html += selectField('Severity', 'inc-severity', ['Low', 'Medium', 'High', 'Critical'], incidentForm.severity);
    html += '</div>';

    html += '<div style="padding:0 16px 16px">';
    html += '<div class="form-group"><label class="form-label">Description of Incident</label>';
    html += '<textarea class="form-input" rows="4" placeholder="What happened? Be specific about actions, conditions, and sequence of events." onchange="window.__safetyIncident(\'description\', this.value)">' + incidentForm.description + '</textarea></div>';
    html += '</div>';

    html += '<div class="grid grid-2" style="padding:0 16px 16px">';
    html += '<div class="form-group"><label class="form-label">Immediate Action Taken</label>';
    html += '<textarea class="form-input" rows="3" placeholder="What corrective actions were taken immediately?" onchange="window.__safetyIncident(\'immediateAction\', this.value)">' + incidentForm.immediateAction + '</textarea></div>';
    html += '<div class="form-group"><label class="form-label">Root Cause Analysis</label>';
    html += '<textarea class="form-input" rows="3" placeholder="Why did this happen? Contributing factors?" onchange="window.__safetyIncident(\'rootCause\', this.value)">' + incidentForm.rootCause + '</textarea></div>';
    html += '</div>';

    html += '<div class="grid grid-2" style="padding:0 16px 16px">';
    html += formField('Witnesses', 'text', 'inc-witnesses', incidentForm.witnesses);
    html += formField('Reported By', 'text', 'inc-reporter', incidentForm.reportedBy);
    html += '</div>';

    // OSHA Reporting reminder
    html += '<div style="padding:0 16px 16px">';
    html += '<div style="background:var(--bg-main);border-left:3px solid var(--amber);padding:12px;border-radius:4px;font-size:0.82rem">';
    html += '<strong>OSHA Reporting Requirements:</strong> Fatalities must be reported within 8 hours. ';
    html += 'Hospitalizations, amputations, and eye losses must be reported within 24 hours. ';
    html += 'Call OSHA Indianapolis: 317-226-7290 or 1-800-321-OSHA.';
    html += '</div></div>';

    html += '<div style="padding:0 16px 16px;text-align:right">';
    html += '<button class="btn btn-primary" onclick="alert(\'Incident report saved locally.\')">Save Report</button>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  // ---- UTILITY LOCATE ----
  function renderLocate() {
    var html = '';

    html += '<div class="card" style="margin-top:16px">';
    html += '<div class="card-header"><span class="card-title">Utility Locate Verification</span><span class="card-subtitle">811 Call-Before-You-Dig — Indiana Law requires 48-hr notice</span></div>';

    html += '<div class="grid grid-3" style="padding:16px">';
    html += formField('811 Ticket #', 'text', 'loc-ticket', utilityLocate.ticket);
    html += formField('Call Date', 'date', 'loc-calldate', utilityLocate.callDate);
    html += formField('Expiration Date', 'date', 'loc-expdate', utilityLocate.expirationDate);
    html += '</div>';

    html += '<div style="padding:0 16px 16px">';
    html += '<div class="form-group"><label class="form-label">Utility Types Marked</label>';
    html += '<div class="grid grid-4" style="margin-top:4px">';
    var markTypes = [
      { code: 'RED', label: 'Electric', color: '#e74c3c' },
      { code: 'YEL', label: 'Gas / Oil', color: '#f39c12' },
      { code: 'ORG', label: 'Telecom / CATV', color: '#e67e22' },
      { code: 'BLU', label: 'Water', color: '#3498db' },
      { code: 'GRN', label: 'Sewer / Drain', color: '#27ae60' },
      { code: 'PUR', label: 'Reclaimed Water', color: '#8e44ad' },
      { code: 'WHT', label: 'Proposed Excavation', color: '#7f8c8d' },
      { code: 'PNK', label: 'Survey / Reference', color: '#e91e8e' }
    ];
    for (var m = 0; m < markTypes.length; m++) {
      var mt = markTypes[m];
      html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0">';
      html += '<input type="checkbox" style="cursor:pointer">';
      html += '<span style="width:12px;height:12px;border-radius:2px;background:' + mt.color + ';display:inline-block"></span>';
      html += '<span style="font-size:0.82rem">' + mt.label + '</span>';
      html += '</div>';
    }
    html += '</div></div></div>';

    html += '<div style="padding:0 16px 16px">';
    html += '<div class="form-group"><label class="form-label">Verification Notes</label>';
    html += '<textarea class="form-input" rows="3" placeholder="Document any conflicts, unclear marks, or hand-dig requirements"></textarea></div>';
    html += '</div>';

    // Verification checklist
    html += '<div style="padding:0 16px 16px">';
    html += '<div style="font-weight:600;margin-bottom:8px">Verification Steps</div>';
    var locateChecks = [
      'All utility marks visible and undisturbed',
      'Marks match ticket description (utility types, approximate locations)',
      'No conflicts with planned pier locations',
      'Hand-dig zones identified within 18" of marks',
      'Photos taken of all marks before work begins',
      'Ticket posted at job trailer'
    ];
    for (var lc = 0; lc < locateChecks.length; lc++) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-light)">';
      html += '<input type="checkbox" style="cursor:pointer;width:16px;height:16px">';
      html += '<span style="font-size:0.85rem">' + locateChecks[lc] + '</span>';
      html += '</div>';
    }
    html += '</div>';

    // Expiration warning
    html += '<div style="padding:0 16px 16px">';
    html += '<div style="background:var(--bg-main);border-left:3px solid var(--red);padding:12px;border-radius:4px;font-size:0.82rem">';
    html += '<strong>Indiana Law (IC 8-1-26):</strong> Locate tickets expire after 20 calendar days. ';
    html += 'You MUST call 811 again before expiration. Working with expired marks is a violation and ';
    html += 'shifts all liability for utility strikes to the excavator.';
    html += '</div></div>';

    html += '<div style="padding:0 16px 16px;text-align:right">';
    html += '<button class="btn btn-primary" onclick="alert(\'Utility locate verification saved.\')">Save Verification</button>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  // ---- HELPERS ----
  function statCard(label, value, sub) {
    return '<div class="stat-card"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + '</div><div style="font-size:0.75rem;color:var(--text-muted)">' + sub + '</div></div>';
  }

  function formField(label, type, id, value) {
    return '<div class="form-group"><label class="form-label">' + label + '</label><input class="form-input" type="' + type + '" id="' + id + '" value="' + (value || '') + '"></div>';
  }

  function selectField(label, id, options, selected) {
    var html = '<div class="form-group"><label class="form-label">' + label + '</label><select class="form-select" id="' + id + '">';
    for (var i = 0; i < options.length; i++) {
      html += '<option' + (options[i] === selected ? ' selected' : '') + '>' + options[i] + '</option>';
    }
    html += '</select></div>';
    return html;
  }

  // ---- GLOBAL HANDLERS ----
  window.__safetyView = function (view) {
    currentView = view;
    render();
  };

  window.__safetyCheck = function (id, checked) {
    checkStates[id] = checked;
    render();
  };

  window.__safetyResetChecklist = function () {
    checkStates = {};
    render();
  };

  window.__safetyIncident = function (field, value) {
    incidentForm[field] = value;
  };

  // ---- INIT ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  // Re-render when module view becomes active
  var safetyView = document.getElementById('mod-safety');
  if (safetyView) {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName === 'class' && safetyView.classList.contains('active')) {
          render();
          break;
        }
      }
    });
    observer.observe(safetyView, { attributes: true });
  }

})();
