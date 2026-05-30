// ============================================================
// Feasibility / No-Go Tool — Pier Foundations Operations Platform
// Renders into #mod-feasibility > #feasibility-app
// ============================================================

(function () {
  'use strict';

  // ---- CONSTANTS ----
  var STORAGE_KEY = 'pf_feasibility_history';

  var PROJECT_TYPES = [
    'Commercial', 'Industrial', 'Infrastructure', 'Data Center',
    'Warehouse', 'Wind Energy', 'Residential', 'Other'
  ];

  var SOIL_TYPES = [
    { value: 'soft_clay',    label: 'Soft Clay' },
    { value: 'stiff_clay',   label: 'Stiff Clay' },
    { value: 'loose_sand',   label: 'Loose Sand' },
    { value: 'dense_sand',   label: 'Dense Sand' },
    { value: 'silt',         label: 'Silt' },
    { value: 'peat_organic', label: 'Peat/Organic' },
    { value: 'fill',         label: 'Fill' },
    { value: 'mixed_unknown',label: 'Mixed/Unknown' }
  ];

  var CU_OPTIONS = [
    { value: 'lt15',    label: '<15 kPa (too soft)' },
    { value: '15_25',   label: '15-25 kPa (marginal)' },
    { value: '25_50',   label: '25-50 kPa (ideal)' },
    { value: '50_plus', label: '50+ kPa (may not need AP)' },
    { value: 'unknown', label: 'Unknown' }
  ];

  var SPT_OPTIONS = [
    { value: 'lt4',     label: '<4 (very soft)' },
    { value: '4_10',    label: '4-10 (good candidate)' },
    { value: '10_30',   label: '10-30 (maybe)' },
    { value: 'gt30',    label: '>30 (doesn\'t need AP)' },
    { value: 'unknown', label: 'Unknown' }
  ];

  var STRUCTURAL_LOADS = [
    { value: 'light',      label: 'Light (<100 kPa)' },
    { value: 'moderate',   label: 'Moderate (100-200 kPa)' },
    { value: 'heavy',      label: 'Heavy (200-400 kPa)' },
    { value: 'very_heavy', label: 'Very Heavy (>400 kPa)' },
    { value: 'unknown',    label: 'Unknown' }
  ];

  var GC_RELATIONSHIPS = [
    { value: 'existing', label: 'Existing' },
    { value: 'known',    label: 'Known' },
    { value: 'new',      label: 'New' },
    { value: 'referred', label: 'Referred' }
  ];

  var PAYMENT_TERMS = [
    { value: 'net30',   label: 'Net 30' },
    { value: 'net45',   label: 'Net 45' },
    { value: 'net60',   label: 'Net 60' },
    { value: 'net90',   label: 'Net 90+' },
    { value: 'pwp',     label: 'Pay-when-paid' },
    { value: 'unknown', label: 'Unknown' }
  ];

  var COMPETITION_LEVELS = [
    { value: 'low',     label: 'Low (1-2 competitors)' },
    { value: 'medium',  label: 'Medium (3-5 competitors)' },
    { value: 'high',    label: 'High (5+ competitors)' },
    { value: 'unknown', label: 'Unknown' }
  ];

  var SCHEDULE_CONFLICTS = [
    { value: 'none',      label: 'No conflict' },
    { value: 'minor',     label: 'Minor overlap' },
    { value: 'major',     label: 'Major overlap' },
    { value: 'committed', label: 'Crew fully committed' }
  ];

  var MOB_TIMELINES = [
    { value: '4_plus', label: '4+ weeks' },
    { value: '2_4',    label: '2-4 weeks' },
    { value: 'lt2',    label: '<2 weeks' }
  ];

  // ---- SCORING MAPS ----
  var SCORE_DISTANCE = [
    { max: 50,  score: 100 },
    { max: 100, score: 85 },
    { max: 200, score: 70 },
    { max: 300, score: 50 },
    { max: 500, score: 30 },
    { max: Infinity, score: 10 }
  ];

  var SCORE_SOIL = {
    soft_clay:     100,
    loose_sand:    90,
    silt:          85,
    fill:          70,
    mixed_unknown: 60,
    stiff_clay:    50,
    dense_sand:    20,
    peat_organic:  0
  };

  var SCORE_DEPTH = [
    { min: 5,  max: 20, score: 100 },
    { min: 20, max: 25, score: 80 },
    { min: 25, max: 30, score: 60 },
    { min: 30, max: 35, score: 30 },
    { min: 35, max: Infinity, score: 0 }
  ];

  var SCORE_CU = {
    lt15:    10,
    '15_25': 60,
    '25_50': 100,
    '50_plus': 30,
    unknown: 50
  };

  var SCORE_SPT = {
    lt4:     80,
    '4_10':  100,
    '10_30': 50,
    gt30:    10,
    unknown: 50
  };

  var SCORE_GEOTECH = { yes: 100, no: 30 };

  var SCORE_LOADS = {
    light:      90,
    moderate:   100,
    heavy:      70,
    very_heavy: 40,
    unknown:    50
  };

  var SCORE_GC = {
    existing: 100,
    referred: 80,
    known:    60,
    'new':    30
  };

  var SCORE_PAYMENT = {
    net30:   100,
    net45:   80,
    net60:   50,
    net90:   20,
    pwp:     10,
    unknown: 40
  };

  var SCORE_BONDING = { no: 100, unknown: 60, yes: 40 };

  var SCORE_PREVAILING = { no: 100, unknown: 60, yes: 50 };

  var SCORE_COMPETITION = {
    low:     100,
    medium:  70,
    high:    30,
    unknown: 50
  };

  var SCORE_SCHEDULE = {
    none:      100,
    minor:     70,
    major:     30,
    committed: 0
  };

  var SCORE_MOB = {
    '4_plus': 100,
    '2_4':    60,
    lt2:      20
  };

  // ---- WEIGHT STRUCTURE ----
  // Technical 55%, Commercial 25%, Operational 15%, Risk 5%
  var WEIGHTS = {
    // Section B: Technical (55%)
    soil:       0.15,
    depth:      0.15,
    cu:         0.10,
    spt:        0.05,
    geotech:    0.05,
    loads:      0.05,
    // Section C: Commercial (25%)
    gc:         0.10,
    payment:    0.05,
    bonding:    0.03,
    prevailing: 0.02,
    competition:0.05,
    // Section D: Operational (15%)
    schedule:   0.10,
    mob:        0.05,
    // Section E: Risk (5%)
    site_access:  0.02,
    environmental:0.02,
    unusual_specs:0.01
  };

  // ---- STATE ----
  var currentStep = 0;
  var quickMode = false;
  var formData = {};
  var viewMode = 'form'; // 'form' | 'results' | 'history'

  // ---- HELPERS ----
  function el(id) { return document.getElementById(id); }

  function fmt(n) {
    return '$' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(entry) {
    var history = getHistory();
    history.unshift(entry);
    if (history.length > 100) history = history.slice(0, 100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }

  function deleteHistoryItem(idx) {
    var history = getHistory();
    history.splice(idx, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    render();
  }

  function businessDaysUntil(dateStr) {
    if (!dateStr) return 999;
    var target = new Date(dateStr + 'T00:00:00');
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var days = 0;
    var cursor = new Date(now);
    while (cursor < target) {
      cursor.setDate(cursor.getDate() + 1);
      var dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) days++;
    }
    return days;
  }

  // ---- SCORING ENGINE ----
  function scoreDistance(miles) {
    if (miles === '' || miles === undefined || miles === null) return 50;
    miles = parseFloat(miles);
    for (var i = 0; i < SCORE_DISTANCE.length; i++) {
      if (miles <= SCORE_DISTANCE[i].max) return SCORE_DISTANCE[i].score;
    }
    return 10;
  }

  function scoreSoil(soils) {
    if (!soils || soils.length === 0) return 50;
    var total = 0;
    for (var i = 0; i < soils.length; i++) {
      total += (SCORE_SOIL[soils[i]] || 50);
    }
    return Math.round(total / soils.length);
  }

  function scoreDepth(ft) {
    if (ft === '' || ft === undefined || ft === null) return 50;
    ft = parseFloat(ft);
    if (ft < 5) return 60;
    for (var i = 0; i < SCORE_DEPTH.length; i++) {
      if (ft >= SCORE_DEPTH[i].min && ft < SCORE_DEPTH[i].max) return SCORE_DEPTH[i].score;
    }
    return 0;
  }

  function checkDisqualifiers(data) {
    var dq = [];

    // Peat/Organic only
    if (data.soils && data.soils.length === 1 && data.soils[0] === 'peat_organic') {
      dq.push('Soil type is Peat/Organic only -- VSC not viable');
    }

    // Treatment depth > 35 ft
    if (data.depth !== '' && data.depth !== undefined && parseFloat(data.depth) > 35) {
      dq.push('Treatment depth exceeds 35 feet -- outside equipment capability');
    }

    // cu < 15 kPa with no other soil types
    if (data.cu === 'lt15' && (!data.soils || data.soils.length <= 1)) {
      dq.push('Undrained shear strength <15 kPa with single soil type -- too soft for aggregate piers');
    }

    // Crew fully committed
    if (data.schedule === 'committed') {
      dq.push('Crew fully committed with no relief available');
    }

    // Bid due < 3 business days
    if (data.bidDueDate) {
      var bdLeft = businessDaysUntil(data.bidDueDate);
      if (bdLeft < 3) {
        dq.push('Bid due in fewer than 3 business days -- insufficient time for Dr. Ed prelim design');
      }
    }

    return dq;
  }

  function computeScores(data) {
    var fields = {
      soil:       scoreSoil(data.soils),
      depth:      scoreDepth(data.depth),
      cu:         SCORE_CU[data.cu] || 50,
      spt:        SCORE_SPT[data.spt] || 50,
      geotech:    SCORE_GEOTECH[data.geotechReport] || 50,
      loads:      SCORE_LOADS[data.loads] || 50,
      gc:         SCORE_GC[data.gcRelationship] || 50,
      payment:    SCORE_PAYMENT[data.paymentTerms] || 40,
      bonding:    SCORE_BONDING[data.bonding] || 60,
      prevailing: SCORE_PREVAILING[data.prevailingWage] || 60,
      competition:SCORE_COMPETITION[data.competition] || 50,
      schedule:   SCORE_SCHEDULE[data.schedule] || 50,
      mob:        SCORE_MOB[data.mobTimeline] || 50,
      site_access:  data.siteAccess === 'yes' ? 30 : 100,
      environmental:data.environmental === 'yes' ? 30 : 100,
      unusual_specs:data.unusualSpecs === 'yes' ? 30 : 100
    };

    // Distance is informational but affects score through distance bonus
    var distScore = scoreDistance(data.distance);

    // Calculate weighted score
    var totalWeighted = 0;
    var keys = Object.keys(WEIGHTS);
    for (var i = 0; i < keys.length; i++) {
      totalWeighted += fields[keys[i]] * WEIGHTS[keys[i]];
    }

    // Category scores
    var technical = (
      fields.soil * 0.15 + fields.depth * 0.15 +
      fields.cu * 0.10 + fields.spt * 0.05 +
      fields.geotech * 0.05 + fields.loads * 0.05
    ) / 0.55 ;

    var commercial = (
      fields.gc * 0.10 + fields.payment * 0.05 +
      fields.bonding * 0.03 + fields.prevailing * 0.02 +
      fields.competition * 0.05
    ) / 0.25;

    var operational = (
      fields.schedule * 0.10 + fields.mob * 0.05
    ) / 0.15;

    var risk = (
      fields.site_access * 0.02 + fields.environmental * 0.02 +
      fields.unusual_specs * 0.01
    ) / 0.05;

    // Final score adjusted by distance factor
    var distFactor = distScore / 100;
    var finalScore = Math.round(totalWeighted * (0.85 + 0.15 * distFactor));

    return {
      total: finalScore,
      distance: distScore,
      technical: Math.round(technical),
      commercial: Math.round(commercial),
      operational: Math.round(operational),
      risk: Math.round(risk),
      fields: fields
    };
  }

  function getRecommendation(score, disqualifiers) {
    if (disqualifiers.length > 0) return { label: 'NO-BID', cls: 'no-bid', color: 'red', confidence: 'High' };
    if (score >= 75) return { label: 'BID', cls: 'bid', color: 'green', confidence: score >= 90 ? 'High' : 'Moderate' };
    if (score >= 50) return { label: 'REVIEW', cls: 'review', color: 'amber', confidence: 'Moderate' };
    return { label: 'NO-BID', cls: 'no-bid', color: 'red', confidence: score < 30 ? 'High' : 'Moderate' };
  }

  function getTopRisks(data, fields) {
    var risks = [];
    if (fields.schedule < 50) risks.push({ factor: 'Schedule Conflict', score: fields.schedule, detail: 'Crew availability is a concern' });
    if (fields.depth < 50)    risks.push({ factor: 'Treatment Depth',   score: fields.depth,    detail: 'Depth approaching or exceeding equipment limits' });
    if (fields.soil < 50)     risks.push({ factor: 'Soil Conditions',   score: fields.soil,     detail: 'Soil type not ideal for aggregate piers' });
    if (fields.payment < 50)  risks.push({ factor: 'Payment Terms',     score: fields.payment,  detail: 'Extended or risky payment terms' });
    if (fields.competition > 0 && fields.competition < 50) risks.push({ factor: 'Competition', score: fields.competition, detail: 'High number of competitors expected' });
    if (fields.cu < 50)       risks.push({ factor: 'Shear Strength',    score: fields.cu,       detail: 'Soil strength may limit VSC effectiveness' });
    if (fields.gc < 50)       risks.push({ factor: 'GC Relationship',   score: fields.gc,       detail: 'No established relationship with general contractor' });
    if (fields.mob < 50)      risks.push({ factor: 'Mobilization',      score: fields.mob,      detail: 'Tight mobilization timeline' });
    if (scoreDistance(data.distance) < 50) risks.push({ factor: 'Distance', score: scoreDistance(data.distance), detail: 'Project is far from yard in Monroeville' });
    if (fields.site_access < 50)   risks.push({ factor: 'Site Access',      score: fields.site_access,   detail: data.siteAccessNotes || 'Site access concerns noted' });
    if (fields.environmental < 50) risks.push({ factor: 'Environmental',    score: fields.environmental, detail: data.environmentalNotes || 'Environmental/permitting issues noted' });
    if (fields.unusual_specs < 50) risks.push({ factor: 'Unusual Specs',    score: fields.unusual_specs, detail: data.unusualSpecsNotes || 'Non-standard specifications noted' });

    risks.sort(function (a, b) { return a.score - b.score; });
    return risks.slice(0, 3);
  }

  // ---- FORM BUILDING ----
  function buildSelect(name, options, selected, placeholder) {
    var html = '<select class="form-select" name="' + name + '" data-field="' + name + '">';
    html += '<option value="">' + (placeholder || '-- Select --') + '</option>';
    for (var i = 0; i < options.length; i++) {
      var sel = selected === options[i].value ? ' selected' : '';
      html += '<option value="' + options[i].value + '"' + sel + '>' + options[i].label + '</option>';
    }
    html += '</select>';
    return html;
  }

  function buildRadioGroup(name, options, selected) {
    var html = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">';
    for (var i = 0; i < options.length; i++) {
      var checked = selected === options[i].value ? ' checked' : '';
      html += '<label style="display:flex;align-items:center;gap:4px;font-size:0.82rem;cursor:pointer">';
      html += '<input type="radio" name="' + name + '" value="' + options[i].value + '"' + checked + ' data-field="' + name + '"> ';
      html += options[i].label + '</label>';
    }
    html += '</div>';
    return html;
  }

  function buildMultiSelect(name, options, selected) {
    selected = selected || [];
    var html = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">';
    for (var i = 0; i < options.length; i++) {
      var checked = selected.indexOf(options[i].value) >= 0;
      var cls = checked ? 'btn btn-primary' : 'btn btn-secondary';
      html += '<button type="button" class="' + cls + '" ';
      html += 'data-multi="' + name + '" data-value="' + options[i].value + '" ';
      html += 'style="padding:6px 12px;font-size:0.78rem">';
      html += options[i].label + '</button>';
    }
    html += '</div>';
    return html;
  }

  // ---- STEP DEFINITIONS ----
  function getSteps() {
    if (quickMode) {
      return [
        { id: 'quick', title: 'Quick Assessment', icon: '&#9889;' }
      ];
    }
    return [
      { id: 'info',        title: 'A. Project Info',     icon: '&#9632;' },
      { id: 'technical',   title: 'B. Technical',        icon: '&#9670;' },
      { id: 'commercial',  title: 'C. Commercial',       icon: '&#9679;' },
      { id: 'operational', title: 'D. Operational',      icon: '&#9650;' },
      { id: 'risk',        title: 'E. Risk Factors',     icon: '&#9888;' }
    ];
  }

  function renderStepContent(stepId) {
    var d = formData;

    if (stepId === 'quick') {
      return '' +
        '<div class="grid grid-2">' +
          '<div class="form-group">' +
            '<label class="form-label">Project Name *</label>' +
            '<input class="form-input" type="text" data-field="projectName" value="' + (d.projectName || '') + '" placeholder="e.g., Google Fort Wayne Phase 1">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Distance from Yard (miles)</label>' +
            '<input class="form-input" type="number" data-field="distance" value="' + (d.distance || '') + '" placeholder="Monroeville, IN 46773">' +
          '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Soil Types *</label>' +
          buildMultiSelect('soils', SOIL_TYPES, d.soils) +
        '</div>' +
        '<div class="grid grid-2">' +
          '<div class="form-group">' +
            '<label class="form-label">Treatment Depth (ft)</label>' +
            '<input class="form-input" type="number" data-field="depth" value="' + (d.depth || '') + '" placeholder="0-50+">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Schedule Conflict</label>' +
            buildSelect('schedule', SCHEDULE_CONFLICTS, d.schedule) +
          '</div>' +
        '</div>';
    }

    if (stepId === 'info') {
      return '' +
        '<div class="grid grid-2">' +
          '<div class="form-group">' +
            '<label class="form-label">Project Name *</label>' +
            '<input class="form-input" type="text" data-field="projectName" value="' + (d.projectName || '') + '" placeholder="e.g., Google Fort Wayne Phase 1">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">GC Name *</label>' +
            '<input class="form-input" type="text" data-field="gcName" value="' + (d.gcName || '') + '" placeholder="General Contractor">' +
          '</div>' +
        '</div>' +
        '<div class="grid grid-2">' +
          '<div class="form-group">' +
            '<label class="form-label">Project Location *</label>' +
            '<input class="form-input" type="text" data-field="location" value="' + (d.location || '') + '" placeholder="City, State">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Distance from Yard (miles)</label>' +
            '<input class="form-input" type="number" data-field="distance" value="' + (d.distance || '') + '" placeholder="From 14308 Figel Rd, Monroeville">' +
          '</div>' +
        '</div>' +
        '<div class="grid grid-3">' +
          '<div class="form-group">' +
            '<label class="form-label">Bid Due Date</label>' +
            '<input class="form-input" type="date" data-field="bidDueDate" value="' + (d.bidDueDate || '') + '">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Estimated Project Value</label>' +
            '<input class="form-input" type="number" data-field="projectValue" value="' + (d.projectValue || '') + '" placeholder="$">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Project Type</label>' +
            buildSelect('projectType', PROJECT_TYPES.map(function (t) { return { value: t.toLowerCase().replace(/ /g, '_'), label: t }; }), d.projectType) +
          '</div>' +
        '</div>';
    }

    if (stepId === 'technical') {
      return '' +
        '<div class="form-group">' +
          '<label class="form-label">Soil Types * (select all that apply)</label>' +
          buildMultiSelect('soils', SOIL_TYPES, d.soils) +
        '</div>' +
        '<div class="grid grid-2">' +
          '<div class="form-group">' +
            '<label class="form-label">Treatment Depth Required (ft) *</label>' +
            '<input class="form-input" type="number" data-field="depth" value="' + (d.depth || '') + '" placeholder="0-50+">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Undrained Shear Strength (cu)</label>' +
            buildSelect('cu', CU_OPTIONS, d.cu) +
          '</div>' +
        '</div>' +
        '<div class="grid grid-2">' +
          '<div class="form-group">' +
            '<label class="form-label">SPT N-value Range</label>' +
            buildSelect('spt', SPT_OPTIONS, d.spt) +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Structural Loads</label>' +
            buildSelect('loads', STRUCTURAL_LOADS, d.loads) +
          '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Geotech Report Available?</label>' +
          buildRadioGroup('geotechReport', [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], d.geotechReport) +
        '</div>';
    }

    if (stepId === 'commercial') {
      return '' +
        '<div class="grid grid-2">' +
          '<div class="form-group">' +
            '<label class="form-label">GC Relationship *</label>' +
            buildSelect('gcRelationship', GC_RELATIONSHIPS, d.gcRelationship) +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Payment Terms</label>' +
            buildSelect('paymentTerms', PAYMENT_TERMS, d.paymentTerms) +
          '</div>' +
        '</div>' +
        '<div class="grid grid-3">' +
          '<div class="form-group">' +
            '<label class="form-label">Bonding Required?</label>' +
            buildRadioGroup('bonding', [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Unknown' }], d.bonding) +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Prevailing Wage?</label>' +
            buildRadioGroup('prevailingWage', [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Unknown' }], d.prevailingWage) +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Competition Level</label>' +
            buildSelect('competition', COMPETITION_LEVELS, d.competition) +
          '</div>' +
        '</div>';
    }

    if (stepId === 'operational') {
      return '' +
        '<div class="grid grid-2">' +
          '<div class="form-group">' +
            '<label class="form-label">Schedule Conflict *</label>' +
            buildSelect('schedule', SCHEDULE_CONFLICTS, d.schedule) +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Mobilization Timeline</label>' +
            buildSelect('mobTimeline', MOB_TIMELINES, d.mobTimeline) +
          '</div>' +
        '</div>' +
        '<div class="grid grid-2">' +
          '<div class="form-group">' +
            '<label class="form-label">Column Count Estimate</label>' +
            '<input class="form-input" type="number" data-field="columnCount" value="' + (d.columnCount || '') + '" placeholder="Approximate columns">' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Project Duration Estimate (days)</label>' +
            '<input class="form-input" type="number" data-field="duration" value="' + (d.duration || '') + '" placeholder="Working days">' +
          '</div>' +
        '</div>';
    }

    if (stepId === 'risk') {
      return '' +
        '<div class="form-group">' +
          '<label class="form-label">Site Access Concerns?</label>' +
          buildRadioGroup('siteAccess', [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], d.siteAccess) +
          '<input class="form-input" type="text" data-field="siteAccessNotes" value="' + (d.siteAccessNotes || '') + '" placeholder="Notes (optional)" style="margin-top:8px">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Environmental / Permitting Issues?</label>' +
          buildRadioGroup('environmental', [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], d.environmental) +
          '<input class="form-input" type="text" data-field="environmentalNotes" value="' + (d.environmentalNotes || '') + '" placeholder="Notes (optional)" style="margin-top:8px">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Unusual Specifications?</label>' +
          buildRadioGroup('unusualSpecs', [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], d.unusualSpecs) +
          '<input class="form-input" type="text" data-field="unusualSpecsNotes" value="' + (d.unusualSpecsNotes || '') + '" placeholder="Notes (optional)" style="margin-top:8px">' +
        '</div>';
    }

    return '';
  }

  // ---- LIVE SCORE PREVIEW ----
  function renderScorePreview() {
    var scores = computeScores(formData);
    var dq = checkDisqualifiers(formData);
    var rec = getRecommendation(scores.total, dq);

    return '' +
      '<div class="stat-card" style="text-align:center;padding:12px 16px">' +
        '<div class="stat-label">Live Score</div>' +
        '<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:4px">' +
          '<div class="score-ring ' + rec.color + '" style="width:48px;height:48px;font-size:1rem">' +
            scores.total +
          '</div>' +
          '<span class="badge-status ' + rec.cls + '" style="font-size:0.78rem">' + rec.label + '</span>' +
        '</div>' +
        (dq.length > 0 ? '<div style="font-size:0.72rem;color:var(--red);margin-top:6px">Disqualifier triggered</div>' : '') +
      '</div>';
  }

  // ---- RESULTS VIEW ----
  function renderResults() {
    var scores = computeScores(formData);
    var dq = checkDisqualifiers(formData);
    var rec = getRecommendation(scores.total, dq);
    var risks = getTopRisks(formData, scores.fields);

    var catBarHTML = function (label, score, weight) {
      var color = score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red';
      return '' +
        '<div style="margin-bottom:12px">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
            '<span style="font-size:0.78rem;font-weight:500">' + label + ' (' + weight + ')</span>' +
            '<span style="font-size:0.78rem;font-weight:600;color:var(--' + color + ')">' + score + '/100</span>' +
          '</div>' +
          '<div class="progress-bar"><div class="progress-fill ' + color + '" style="width:' + score + '%"></div></div>' +
        '</div>';
    };

    var html = '' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
        '<div>' +
          '<h2 style="font-size:1.1rem;font-weight:700;color:var(--text-0);margin-bottom:2px">' +
            (formData.projectName || 'Untitled Assessment') +
          '</h2>' +
          '<span style="font-size:0.78rem;color:var(--text-3)">' +
            (formData.gcName ? formData.gcName + ' &mdash; ' : '') +
            (formData.location || '') +
          '</span>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-secondary" onclick="window._feasEditResult()">Edit</button>' +
          '<button class="btn btn-primary" onclick="window._feasNewAssessment()">New Assessment</button>' +
        '</div>' +
      '</div>';

    // Score + Recommendation
    html += '<div class="grid grid-3" style="margin-bottom:20px">';

    // Score ring card
    html += '' +
      '<div class="card" style="text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center">' +
        '<div class="score-ring ' + rec.color + '" style="width:96px;height:96px;font-size:2rem;margin-bottom:8px">' +
          scores.total +
        '</div>' +
        '<span class="badge-status ' + rec.cls + '" style="font-size:0.88rem;padding:4px 14px">' + rec.label + '</span>' +
        '<div style="font-size:0.72rem;color:var(--text-3);margin-top:6px">Confidence: ' + rec.confidence + '</div>' +
      '</div>';

    // Category breakdown
    html += '' +
      '<div class="card">' +
        '<div class="card-title" style="margin-bottom:12px">Score Breakdown</div>' +
        catBarHTML('Technical', scores.technical, '55%') +
        catBarHTML('Commercial', scores.commercial, '25%') +
        catBarHTML('Operational', scores.operational, '15%') +
        catBarHTML('Risk', scores.risk, '5%') +
        '<div style="border-top:1px solid var(--border-light);padding-top:8px;margin-top:4px">' +
          '<div style="display:flex;justify-content:space-between">' +
            '<span style="font-size:0.78rem;font-weight:500">Distance Factor</span>' +
            '<span style="font-size:0.78rem;font-weight:600">' + scores.distance + '/100' +
              (formData.distance ? ' (' + formData.distance + ' mi)' : '') +
            '</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Risks + disqualifiers
    html += '<div class="card">';
    if (dq.length > 0) {
      html += '<div class="card-title" style="margin-bottom:8px;color:var(--red)">Disqualifiers Triggered</div>';
      for (var i = 0; i < dq.length; i++) {
        html += '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;padding:8px;background:var(--red-light);border-radius:6px">' +
          '<span style="color:var(--red);font-weight:700;flex-shrink:0">&#10005;</span>' +
          '<span style="font-size:0.78rem;color:var(--red)">' + dq[i] + '</span>' +
        '</div>';
      }
    }
    if (risks.length > 0) {
      html += '<div class="card-title" style="margin-bottom:8px;' + (dq.length > 0 ? 'margin-top:12px' : '') + '">Top Risk Factors</div>';
      for (var j = 0; j < risks.length; j++) {
        var rColor = risks[j].score < 30 ? 'red' : risks[j].score < 60 ? 'amber' : 'green';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
          '<div class="score-ring ' + rColor + '" style="width:32px;height:32px;font-size:0.7rem;flex-shrink:0">' + risks[j].score + '</div>' +
          '<div>' +
            '<div style="font-size:0.78rem;font-weight:600">' + risks[j].factor + '</div>' +
            '<div style="font-size:0.72rem;color:var(--text-3)">' + risks[j].detail + '</div>' +
          '</div>' +
        '</div>';
      }
    }
    if (dq.length === 0 && risks.length === 0) {
      html += '<div style="text-align:center;padding:20px;color:var(--text-3);font-size:0.82rem">No significant risks identified</div>';
    }
    html += '</div>';

    html += '</div>'; // close grid-3

    // Project details summary
    html += '<div class="card">';
    html += '<div class="card-title" style="margin-bottom:12px">Assessment Details</div>';
    html += '<div class="grid grid-4">';

    var details = [
      { label: 'Project Type',  value: formData.projectType ? formData.projectType.replace(/_/g, ' ') : '--' },
      { label: 'Est. Value',    value: formData.projectValue ? fmt(parseFloat(formData.projectValue)) : '--' },
      { label: 'Bid Due',       value: formData.bidDueDate || '--' },
      { label: 'Distance',      value: formData.distance ? formData.distance + ' mi' : '--' },
      { label: 'Soil Types',    value: formData.soils && formData.soils.length > 0 ? formData.soils.map(function (s) { return s.replace(/_/g, ' '); }).join(', ') : '--' },
      { label: 'Depth',         value: formData.depth ? formData.depth + ' ft' : '--' },
      { label: 'Columns',       value: formData.columnCount || '--' },
      { label: 'Duration',      value: formData.duration ? formData.duration + ' days' : '--' }
    ];

    for (var k = 0; k < details.length; k++) {
      html += '<div class="stat-card" style="padding:10px 14px">' +
        '<div class="stat-label">' + details[k].label + '</div>' +
        '<div style="font-size:0.88rem;font-weight:600;color:var(--text-0);margin-top:2px;text-transform:capitalize">' + details[k].value + '</div>' +
      '</div>';
    }
    html += '</div></div>';

    return html;
  }

  // ---- HISTORY VIEW ----
  function renderHistoryView() {
    var history = getHistory();

    if (history.length === 0) {
      return '' +
        '<div class="empty-state">' +
          '<div class="empty-icon">&#9670;</div>' +
          '<h3>No Assessments Yet</h3>' +
          '<p>Run your first feasibility assessment to see history here.</p>' +
        '</div>';
    }

    var html = '' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<span style="font-size:0.82rem;color:var(--text-3)">' + history.length + ' assessment' + (history.length !== 1 ? 's' : '') + '</span>' +
        '<button class="btn btn-primary" onclick="window._feasNewAssessment()">New Assessment</button>' +
      '</div>';

    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Date</th><th>Project</th><th>GC</th><th>Score</th><th>Recommendation</th><th>Distance</th><th></th></tr></thead>';
    html += '<tbody>';

    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      var rec = getRecommendation(h.score, h.disqualifiers || []);
      html += '<tr>' +
        '<td style="white-space:nowrap">' + (h.date || '--') + '</td>' +
        '<td style="font-weight:500">' + (h.projectName || '--') + '</td>' +
        '<td>' + (h.gcName || '--') + '</td>' +
        '<td><div class="score-ring ' + rec.color + '" style="width:36px;height:36px;font-size:0.78rem">' + h.score + '</div></td>' +
        '<td><span class="badge-status ' + rec.cls + '">' + rec.label + '</span></td>' +
        '<td>' + (h.distance ? h.distance + ' mi' : '--') + '</td>' +
        '<td><button class="btn btn-secondary" style="padding:4px 8px;font-size:0.72rem" onclick="window._feasDeleteHistory(' + i + ')">Remove</button></td>' +
      '</tr>';
    }

    html += '</tbody></table></div>';
    return html;
  }

  // ---- MAIN RENDER ----
  function render() {
    var app = document.getElementById('feasibility-app');
    if (!app) return;

    var html = '';

    // Top tabs
    html += '<div class="tabs">';
    html += '<div class="tab' + (viewMode === 'form' || viewMode === 'results' ? ' active' : '') + '" onclick="window._feasSetView(\'form\')">Assessment</div>';
    html += '<div class="tab' + (viewMode === 'history' ? ' active' : '') + '" onclick="window._feasSetView(\'history\')">History</div>';
    html += '</div>';

    if (viewMode === 'history') {
      html += renderHistoryView();
      app.innerHTML = html;
      return;
    }

    if (viewMode === 'results') {
      html += renderResults();
      app.innerHTML = html;
      return;
    }

    // Form view
    var steps = getSteps();

    // Mode toggle
    html += '' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn ' + (!quickMode ? 'btn-primary' : 'btn-secondary') + '" onclick="window._feasSetMode(false)">Full Assessment</button>' +
          '<button class="btn ' + (quickMode ? 'btn-primary' : 'btn-secondary') + '" onclick="window._feasSetMode(true)">Quick Mode</button>' +
        '</div>' +
        renderScorePreview() +
      '</div>';

    // Step indicators (full mode only)
    if (!quickMode) {
      html += '<div style="display:flex;gap:4px;margin-bottom:20px">';
      for (var s = 0; s < steps.length; s++) {
        var stepActive = s === currentStep;
        var stepDone = s < currentStep;
        var bgColor = stepActive ? 'var(--accent)' : stepDone ? 'var(--green)' : 'var(--bg-2)';
        var textColor = stepActive || stepDone ? 'white' : 'var(--text-3)';
        html += '<div style="flex:1;text-align:center;padding:8px 4px;border-radius:6px;background:' + bgColor + ';color:' + textColor + ';font-size:0.75rem;font-weight:600;cursor:pointer" onclick="window._feasGoStep(' + s + ')">';
        html += '<span>' + steps[s].icon + '</span> ' + steps[s].title;
        html += '</div>';
      }
      html += '</div>';
    }

    // Step content
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">' + steps[quickMode ? 0 : currentStep].title + '</span></div>';
    html += renderStepContent(steps[quickMode ? 0 : currentStep].id);
    html += '</div>';

    // Navigation buttons
    html += '<div style="display:flex;justify-content:space-between;margin-top:16px">';
    if (!quickMode && currentStep > 0) {
      html += '<button class="btn btn-secondary" onclick="window._feasPrev()">Previous</button>';
    } else {
      html += '<div></div>';
    }

    if (quickMode || currentStep === steps.length - 1) {
      html += '<button class="btn btn-primary" onclick="window._feasSubmit()">Calculate Score</button>';
    } else {
      html += '<button class="btn btn-primary" onclick="window._feasNext()">Next</button>';
    }
    html += '</div>';

    app.innerHTML = html;
    bindFormEvents();
  }

  // ---- EVENT BINDING ----
  function bindFormEvents() {
    var app = document.getElementById('feasibility-app');
    if (!app) return;

    // Text/number/date inputs
    var inputs = app.querySelectorAll('input[data-field]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('input', function () {
        formData[this.getAttribute('data-field')] = this.value;
        updatePreview();
      });
    }

    // Select elements
    var selects = app.querySelectorAll('select[data-field]');
    for (var j = 0; j < selects.length; j++) {
      selects[j].addEventListener('change', function () {
        formData[this.getAttribute('data-field')] = this.value;
        updatePreview();
      });
    }

    // Radio buttons
    var radios = app.querySelectorAll('input[type="radio"][data-field]');
    for (var k = 0; k < radios.length; k++) {
      radios[k].addEventListener('change', function () {
        formData[this.getAttribute('data-field')] = this.value;
        updatePreview();
      });
    }

    // Multi-select buttons
    var multiButtons = app.querySelectorAll('[data-multi]');
    for (var m = 0; m < multiButtons.length; m++) {
      multiButtons[m].addEventListener('click', function () {
        var field = this.getAttribute('data-multi');
        var val = this.getAttribute('data-value');
        if (!formData[field]) formData[field] = [];

        var idx = formData[field].indexOf(val);
        if (idx >= 0) {
          formData[field].splice(idx, 1);
          this.className = 'btn btn-secondary';
        } else {
          formData[field].push(val);
          this.className = 'btn btn-primary';
        }
        this.style.padding = '6px 12px';
        this.style.fontSize = '0.78rem';
        updatePreview();
      });
    }
  }

  function updatePreview() {
    var previewEl = document.querySelector('.stat-card[style*="text-align:center"]');
    if (!previewEl) return;

    var scores = computeScores(formData);
    var dq = checkDisqualifiers(formData);
    var rec = getRecommendation(scores.total, dq);

    previewEl.innerHTML = '' +
      '<div class="stat-label">Live Score</div>' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:4px">' +
        '<div class="score-ring ' + rec.color + '" style="width:48px;height:48px;font-size:1rem">' +
          scores.total +
        '</div>' +
        '<span class="badge-status ' + rec.cls + '" style="font-size:0.78rem">' + rec.label + '</span>' +
      '</div>' +
      (dq.length > 0 ? '<div style="font-size:0.72rem;color:var(--red);margin-top:6px">Disqualifier triggered</div>' : '');
  }

  // ---- GLOBAL HANDLERS ----
  window._feasSetView = function (v) {
    viewMode = v;
    if (v === 'form') {
      currentStep = 0;
    }
    render();
  };

  window._feasSetMode = function (q) {
    quickMode = q;
    currentStep = 0;
    render();
  };

  window._feasGoStep = function (s) {
    currentStep = s;
    render();
  };

  window._feasNext = function () {
    var steps = getSteps();
    if (currentStep < steps.length - 1) {
      currentStep++;
      render();
    }
  };

  window._feasPrev = function () {
    if (currentStep > 0) {
      currentStep--;
      render();
    }
  };

  window._feasSubmit = function () {
    var scores = computeScores(formData);
    var dq = checkDisqualifiers(formData);
    var rec = getRecommendation(scores.total, dq);

    // Save to history
    var entry = {
      date: new Date().toISOString().split('T')[0],
      projectName: formData.projectName || 'Untitled',
      gcName: formData.gcName || '',
      location: formData.location || '',
      distance: formData.distance || '',
      score: scores.total,
      recommendation: rec.label,
      disqualifiers: dq,
      scores: scores,
      formData: JSON.parse(JSON.stringify(formData))
    };
    saveHistory(entry);

    viewMode = 'results';
    render();
  };

  window._feasNewAssessment = function () {
    formData = {};
    currentStep = 0;
    viewMode = 'form';
    render();
  };

  window._feasEditResult = function () {
    currentStep = 0;
    viewMode = 'form';
    render();
  };

  window._feasDeleteHistory = function (idx) {
    deleteHistoryItem(idx);
  };

  // ---- INIT ----
  render();

})();
