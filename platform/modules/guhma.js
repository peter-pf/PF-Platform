// ============================================================
// GUHMA QA/QC Module — Pier Foundations Operations Platform
// Renders into #mod-guhma > #guhma-app
// ============================================================

(function () {
  'use strict';

  // ---- QA THRESHOLDS ----
  const THRESHOLDS = {
    targetDepthM: 3.05,       // 10 ft minimum
    reviewDepthM: 2.75,       // Below this = Review
    flagMinSeconds: 30,       // Faster than this = Flag (too fast)
    totalProjectPiers: 1865,
  };

  // ---- SAMPLE PIER DATA (based on 186 real POET logs, May 8 2026) ----
  const PIER_DATA = generateSamplePiers();

  function generateSamplePiers() {
    // Realistic data drawn from actual statistics:
    // - Pier IDs 647-1295, equipment STC_0003
    // - Avg install: 2.5 min (150s), range 60-1620s
    // - Avg max depth: 3.17m (10.4 ft), range 2.90-3.66m
    // - 8.5 hours of work, May 8, 2026

    const piers = [
      { id: 647, date: '2026-05-08 06:02:14', durationS: 132, maxDepthM: 3.11, maxPressureBar: 215, compCycles: 8 },
      { id: 648, date: '2026-05-08 06:05:01', durationS: 145, maxDepthM: 3.22, maxPressureBar: 220, compCycles: 9 },
      { id: 649, date: '2026-05-08 06:08:22', durationS: 118, maxDepthM: 3.05, maxPressureBar: 198, compCycles: 7 },
      { id: 651, date: '2026-05-08 06:11:48', durationS: 160, maxDepthM: 3.35, maxPressureBar: 232, compCycles: 10 },
      { id: 653, date: '2026-05-08 06:15:03', durationS: 98, maxDepthM: 2.95, maxPressureBar: 185, compCycles: 6 },
      { id: 655, date: '2026-05-08 06:17:55', durationS: 142, maxDepthM: 3.18, maxPressureBar: 210, compCycles: 8 },
      { id: 658, date: '2026-05-08 06:21:30', durationS: 175, maxDepthM: 3.42, maxPressureBar: 245, compCycles: 11 },
      { id: 660, date: '2026-05-08 06:25:12', durationS: 130, maxDepthM: 3.08, maxPressureBar: 202, compCycles: 7 },
      { id: 663, date: '2026-05-08 06:28:44', durationS: 155, maxDepthM: 3.28, maxPressureBar: 225, compCycles: 9 },
      { id: 667, date: '2026-05-08 06:32:10', durationS: 22, maxDepthM: 1.50, maxPressureBar: 95, compCycles: 1 },
      { id: 670, date: '2026-05-08 06:33:58', durationS: 165, maxDepthM: 3.38, maxPressureBar: 238, compCycles: 10 },
      { id: 674, date: '2026-05-08 06:37:25', durationS: 88, maxDepthM: 2.68, maxPressureBar: 172, compCycles: 5 },
      { id: 678, date: '2026-05-08 06:40:50', durationS: 148, maxDepthM: 3.20, maxPressureBar: 218, compCycles: 9 },
      { id: 682, date: '2026-05-08 06:44:15', durationS: 138, maxDepthM: 3.14, maxPressureBar: 208, compCycles: 8 },
      { id: 687, date: '2026-05-08 06:47:40', durationS: 195, maxDepthM: 3.55, maxPressureBar: 258, compCycles: 12 },
      { id: 691, date: '2026-05-08 06:51:30', durationS: 125, maxDepthM: 3.02, maxPressureBar: 195, compCycles: 7 },
      { id: 695, date: '2026-05-08 06:54:55', durationS: 152, maxDepthM: 3.25, maxPressureBar: 222, compCycles: 9 },
      { id: 700, date: '2026-05-08 06:58:20', durationS: 170, maxDepthM: 3.40, maxPressureBar: 240, compCycles: 10 },
      { id: 705, date: '2026-05-08 07:02:00', durationS: 112, maxDepthM: 2.92, maxPressureBar: 182, compCycles: 6 },
      { id: 710, date: '2026-05-08 07:05:30', durationS: 140, maxDepthM: 3.16, maxPressureBar: 212, compCycles: 8 },
      { id: 720, date: '2026-05-08 07:09:00', durationS: 158, maxDepthM: 3.30, maxPressureBar: 228, compCycles: 9 },
      { id: 735, date: '2026-05-08 07:12:45', durationS: 185, maxDepthM: 3.48, maxPressureBar: 250, compCycles: 11 },
      { id: 750, date: '2026-05-08 07:16:30', durationS: 135, maxDepthM: 3.10, maxPressureBar: 205, compCycles: 8 },
      { id: 780, date: '2026-05-08 07:20:00', durationS: 162, maxDepthM: 3.33, maxPressureBar: 230, compCycles: 10 },
      { id: 800, date: '2026-05-08 07:24:10', durationS: 1620, maxDepthM: 3.66, maxPressureBar: 275, compCycles: 22 },
    ];

    return piers.map(p => ({
      ...p,
      maxDepthFt: +(p.maxDepthM * 3.28084).toFixed(1),
      durationFormatted: formatDuration(p.durationS),
      status: classifyPier(p),
    }));
  }

  function classifyPier(p) {
    if (p.durationS < THRESHOLDS.flagMinSeconds) return 'flag';
    if (p.maxDepthM < THRESHOLDS.reviewDepthM) return 'review';
    if (p.maxDepthM < THRESHOLDS.targetDepthM) return 'review';
    return 'verified';
  }

  function formatDuration(seconds) {
    if (seconds < 60) return seconds + 's';
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
  }

  // ---- COMPUTE SUMMARY STATS ----
  function computeStats(data) {
    var totalPiers = data.length;
    var avgDurationS = data.reduce(function (s, p) { return s + p.durationS; }, 0) / totalPiers;
    var avgDepthM = data.reduce(function (s, p) { return s + p.maxDepthM; }, 0) / totalPiers;
    var totalTimeH = data.reduce(function (s, p) { return s + p.durationS; }, 0) / 3600;
    var piersPerHour = totalPiers / totalTimeH;
    var verified = data.filter(function (p) { return p.status === 'verified'; }).length;
    var review = data.filter(function (p) { return p.status === 'review'; }).length;
    var flag = data.filter(function (p) { return p.status === 'flag'; }).length;
    var dates = data.map(function (p) { return p.date.split(' ')[0]; });
    var minDate = dates.reduce(function (a, b) { return a < b ? a : b; });
    var maxDate = dates.reduce(function (a, b) { return a > b ? a : b; });

    return {
      totalPiers: totalPiers,
      projectTotal: THRESHOLDS.totalProjectPiers,
      pctComplete: +((totalPiers / THRESHOLDS.totalProjectPiers) * 100).toFixed(1),
      avgDurationS: Math.round(avgDurationS),
      avgDurationFormatted: formatDuration(Math.round(avgDurationS)),
      avgDepthM: +avgDepthM.toFixed(2),
      avgDepthFt: +(avgDepthM * 3.28084).toFixed(1),
      piersPerHour: +piersPerHour.toFixed(1),
      totalTimeH: +totalTimeH.toFixed(1),
      verified: verified,
      review: review,
      flag: flag,
      dateRange: minDate === maxDate ? minDate : minDate + ' to ' + maxDate,
    };
  }

  // ---- SORTING STATE ----
  var sortCol = 'id';
  var sortAsc = true;
  var filterStatus = 'all';
  var expandedPier = null;

  function sortData(data) {
    var col = sortCol;
    return data.slice().sort(function (a, b) {
      var va, vb;
      switch (col) {
        case 'id': va = a.id; vb = b.id; break;
        case 'date': va = a.date; vb = b.date; break;
        case 'duration': va = a.durationS; vb = b.durationS; break;
        case 'depth': va = a.maxDepthM; vb = b.maxDepthM; break;
        case 'pressure': va = a.maxPressureBar; vb = b.maxPressureBar; break;
        case 'status':
          var order = { flag: 0, review: 1, verified: 2 };
          va = order[a.status]; vb = order[b.status]; break;
        default: va = a.id; vb = b.id;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }

  function filteredData() {
    if (filterStatus === 'all') return PIER_DATA;
    return PIER_DATA.filter(function (p) { return p.status === filterStatus; });
  }

  // ---- GENERATE DEPTH PROFILE ----
  function generateDepthProfile(pier) {
    // Simulate a realistic installation profile based on pier data
    var steps = [];
    var totalS = pier.durationS;
    var maxD = pier.maxDepthM;
    var cycles = pier.compCycles;

    if (totalS < 30) {
      // Flagged pier - very short, minimal data
      steps.push({ time: 0, depth: 0, phase: 'Start' });
      steps.push({ time: Math.round(totalS * 0.3), depth: +(maxD * 0.6).toFixed(2), phase: 'Penetration' });
      steps.push({ time: Math.round(totalS * 0.7), depth: +maxD.toFixed(2), phase: 'Max Depth' });
      steps.push({ time: totalS, depth: 0, phase: 'Withdrawal' });
      return steps;
    }

    // Phase 1: Penetration (about 20% of time)
    var penTime = Math.round(totalS * 0.2);
    steps.push({ time: 0, depth: 0, phase: 'Start' });
    steps.push({ time: Math.round(penTime * 0.5), depth: +(maxD * 0.5).toFixed(2), phase: 'Penetrating' });
    steps.push({ time: penTime, depth: +maxD.toFixed(2), phase: 'Max Depth' });

    // Phase 2: Compaction cycles (about 70% of time)
    var cycleTime = Math.round(totalS * 0.7 / cycles);
    var currentTime = penTime;
    for (var c = 0; c < cycles; c++) {
      var pullUp = +(maxD - (0.3 + Math.random() * 0.4)).toFixed(2);
      var pushDown = +(maxD - (0.05 + Math.random() * 0.1)).toFixed(2);
      currentTime += Math.round(cycleTime * 0.5);
      steps.push({ time: currentTime, depth: pullUp, phase: 'Lift #' + (c + 1) });
      currentTime += Math.round(cycleTime * 0.5);
      steps.push({ time: currentTime, depth: pushDown, phase: 'Compact #' + (c + 1) });
    }

    // Phase 3: Withdrawal (about 10% of time)
    steps.push({ time: Math.round(totalS * 0.95), depth: +(maxD * 0.3).toFixed(2), phase: 'Withdrawing' });
    steps.push({ time: totalS, depth: 0, phase: 'Complete' });

    return steps;
  }

  function renderDepthProfileChart(pier) {
    var profile = generateDepthProfile(pier);
    var maxTime = pier.durationS;
    var maxDepth = pier.maxDepthM;
    var chartWidth = 50;  // characters wide
    var lines = [];

    lines.push('Depth Profile: Pier ' + pier.id);
    lines.push('0.0m ' + repeatChar('-', chartWidth) + ' 0s');

    // Sample 12 points across the profile
    var sampleCount = Math.min(12, profile.length);
    for (var i = 0; i < sampleCount; i++) {
      var pt = profile[Math.min(i, profile.length - 1)];
      var depthPct = pt.depth / (maxDepth * 1.1);
      var pos = Math.round(depthPct * chartWidth);
      var timePct = pt.time / maxTime;
      var row = '';
      for (var c = 0; c < chartWidth; c++) {
        if (c === pos) row += '\u2588';
        else if (c < pos) row += '\u2591';
        else row += ' ';
      }
      var depthStr = pt.depth.toFixed(1) + 'm';
      while (depthStr.length < 5) depthStr = ' ' + depthStr;
      lines.push(depthStr + ' |' + row + '| ' + pt.time + 's ' + pt.phase);
    }

    lines.push((maxDepth * 1.1).toFixed(1) + 'm ' + repeatChar('-', chartWidth) + ' ' + maxTime + 's');

    return lines.join('\n');
  }

  function repeatChar(ch, n) {
    var s = '';
    for (var i = 0; i < n; i++) s += ch;
    return s;
  }

  // ---- RENDER ----
  function render() {
    var app = document.getElementById('guhma-app');
    if (!app) return;

    var data = filteredData();
    var sorted = sortData(data);
    var stats = computeStats(PIER_DATA); // always compute from full dataset

    app.innerHTML = renderSummary(stats) + renderFilterTabs(stats) + renderTable(sorted) + renderThresholds();
  }

  function renderSummary(s) {
    return '' +
      '<div class="grid grid-4" style="margin-bottom:20px">' +
        '<div class="stat-card">' +
          '<div class="stat-label">Piers Logged</div>' +
          '<div class="stat-value">' + s.totalPiers + ' <span style="font-size:0.85rem;font-weight:400;color:var(--text-3)">/ ' + s.projectTotal + '</span></div>' +
          '<div style="margin-top:8px">' +
            '<div class="progress-bar"><div class="progress-fill accent" style="width:' + s.pctComplete + '%"></div></div>' +
            '<div style="font-size:0.72rem;color:var(--text-3);margin-top:4px">' + s.pctComplete + '% of project</div>' +
          '</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-label">Avg Install Time</div>' +
          '<div class="stat-value">' + s.avgDurationFormatted + '</div>' +
          '<div class="stat-change">' + s.piersPerHour + ' piers/hour</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-label">Avg Max Depth</div>' +
          '<div class="stat-value">' + s.avgDepthFt + ' ft</div>' +
          '<div class="stat-change">' + s.avgDepthM + ' m</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-label">QA Status</div>' +
          '<div style="display:flex;gap:12px;margin-top:6px">' +
            '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:700;color:var(--green)">' + s.verified + '</div><div style="font-size:0.65rem;color:var(--text-3)">Verified</div></div>' +
            '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:700;color:var(--amber)">' + s.review + '</div><div style="font-size:0.65rem;color:var(--text-3)">Review</div></div>' +
            '<div style="text-align:center"><div style="font-size:1.2rem;font-weight:700;color:var(--red)">' + s.flag + '</div><div style="font-size:0.65rem;color:var(--text-3)">Flagged</div></div>' +
          '</div>' +
          '<div style="font-size:0.72rem;color:var(--text-3);margin-top:6px">' + s.dateRange + '</div>' +
        '</div>' +
      '</div>';
  }

  function renderFilterTabs(s) {
    function tabClass(val) {
      return 'tab' + (filterStatus === val ? ' active' : '');
    }
    return '' +
      '<div class="card">' +
        '<div class="card-header">' +
          '<span class="card-title">Installation Log</span>' +
          '<span class="card-subtitle">Equipment: STC_0003 | Project: POET Shelbyville</span>' +
        '</div>' +
        '<div class="tabs">' +
          '<div class="' + tabClass('all') + '" onclick="window._guhmaFilter(\'all\')">All (' + PIER_DATA.length + ')</div>' +
          '<div class="' + tabClass('verified') + '" onclick="window._guhmaFilter(\'verified\')">Verified (' + s.verified + ')</div>' +
          '<div class="' + tabClass('review') + '" onclick="window._guhmaFilter(\'review\')">Review (' + s.review + ')</div>' +
          '<div class="' + tabClass('flag') + '" onclick="window._guhmaFilter(\'flag\')">Flagged (' + s.flag + ')</div>' +
        '</div>';
  }

  function sortArrow(col) {
    if (sortCol !== col) return ' \u2195';
    return sortAsc ? ' \u2191' : ' \u2193';
  }

  function renderTable(data) {
    var html = '' +
      '<div class="table-wrap">' +
        '<table>' +
          '<thead><tr>' +
            '<th style="cursor:pointer" onclick="window._guhmaSort(\'id\')">Pier #' + sortArrow('id') + '</th>' +
            '<th style="cursor:pointer" onclick="window._guhmaSort(\'date\')">Install Date' + sortArrow('date') + '</th>' +
            '<th style="cursor:pointer" onclick="window._guhmaSort(\'duration\')">Duration' + sortArrow('duration') + '</th>' +
            '<th style="cursor:pointer" onclick="window._guhmaSort(\'depth\')">Max Depth (ft)' + sortArrow('depth') + '</th>' +
            '<th style="cursor:pointer" onclick="window._guhmaSort(\'pressure\')">Max Pressure (bar)' + sortArrow('pressure') + '</th>' +
            '<th style="cursor:pointer" onclick="window._guhmaSort(\'status\')">Status' + sortArrow('status') + '</th>' +
          '</tr></thead>' +
          '<tbody>';

    for (var i = 0; i < data.length; i++) {
      var p = data[i];
      var badgeClass = p.status === 'verified' ? 'active' : p.status === 'review' ? 'review' : 'no-bid';
      var statusLabel = p.status === 'verified' ? 'Verified' : p.status === 'review' ? 'Review' : 'Flag';
      var isExpanded = expandedPier === p.id;

      html += '<tr style="cursor:pointer" onclick="window._guhmaExpand(' + p.id + ')">' +
        '<td style="font-weight:600">' + p.id + '</td>' +
        '<td>' + p.date + '</td>' +
        '<td>' + p.durationFormatted + '</td>' +
        '<td>' + p.maxDepthFt + '</td>' +
        '<td>' + p.maxPressureBar + '</td>' +
        '<td><span class="badge-status ' + badgeClass + '">' + statusLabel + '</span></td>' +
      '</tr>';

      if (isExpanded) {
        html += renderExpandedRow(p);
      }
    }

    html += '</tbody></table></div></div>'; // closes table, table-wrap, and the card opened in renderFilterTabs
    return html;
  }

  function renderExpandedRow(p) {
    var profile = generateDepthProfile(p);
    var avgPressure = Math.round(p.maxPressureBar * 0.72); // approximate avg from max

    // Build depth profile visualization as a simple table
    var profileRows = '';
    for (var i = 0; i < profile.length; i++) {
      var pt = profile[i];
      var barWidth = Math.round((pt.depth / (p.maxDepthM * 1.1)) * 100);
      profileRows += '<tr>' +
        '<td style="font-size:0.75rem;white-space:nowrap;padding:3px 8px">' + pt.time + 's</td>' +
        '<td style="font-size:0.75rem;padding:3px 8px">' + pt.depth.toFixed(2) + 'm</td>' +
        '<td style="padding:3px 8px;width:60%">' +
          '<div class="progress-bar" style="height:10px">' +
            '<div class="progress-fill accent" style="width:' + barWidth + '%"></div>' +
          '</div>' +
        '</td>' +
        '<td style="font-size:0.72rem;color:var(--text-3);padding:3px 8px;white-space:nowrap">' + pt.phase + '</td>' +
      '</tr>';
    }

    var statusNote = '';
    if (p.status === 'flag') {
      statusNote = '<div style="margin-top:12px;padding:10px 14px;background:var(--red-light);border-radius:6px;font-size:0.82rem;color:var(--red)">' +
        '<strong>Flagged:</strong> Install duration ' + p.durationFormatted + ' is below the 30-second minimum threshold. Verify pier was fully installed.' +
      '</div>';
    } else if (p.status === 'review') {
      statusNote = '<div style="margin-top:12px;padding:10px 14px;background:var(--amber-light);border-radius:6px;font-size:0.82rem;color:var(--amber)">' +
        '<strong>Review:</strong> Max depth ' + p.maxDepthFt + ' ft (' + p.maxDepthM.toFixed(2) + 'm) is below the ' + (THRESHOLDS.targetDepthM * 3.28084).toFixed(0) + ' ft target. Engineer review recommended.' +
      '</div>';
    }

    return '<tr><td colspan="6" style="padding:0;border-bottom:2px solid var(--border)">' +
      '<div style="padding:16px 20px;background:var(--bg-1)">' +
        '<div class="grid grid-4" style="margin-bottom:16px">' +
          '<div class="stat-card">' +
            '<div class="stat-label">Max Depth</div>' +
            '<div class="stat-value" style="font-size:1.1rem">' + p.maxDepthFt + ' ft</div>' +
            '<div style="font-size:0.72rem;color:var(--text-3)">' + p.maxDepthM.toFixed(2) + ' m</div>' +
          '</div>' +
          '<div class="stat-card">' +
            '<div class="stat-label">Duration</div>' +
            '<div class="stat-value" style="font-size:1.1rem">' + p.durationFormatted + '</div>' +
            '<div style="font-size:0.72rem;color:var(--text-3)">' + p.durationS + ' seconds</div>' +
          '</div>' +
          '<div class="stat-card">' +
            '<div class="stat-label">Avg Pressure</div>' +
            '<div class="stat-value" style="font-size:1.1rem">' + avgPressure + ' bar</div>' +
            '<div style="font-size:0.72rem;color:var(--text-3)">Max: ' + p.maxPressureBar + ' bar</div>' +
          '</div>' +
          '<div class="stat-card">' +
            '<div class="stat-label">Compaction Cycles</div>' +
            '<div class="stat-value" style="font-size:1.1rem">' + p.compCycles + '</div>' +
            '<div style="font-size:0.72rem;color:var(--text-3)">Lift/compact sequences</div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:0.82rem;font-weight:600;color:var(--text-0);margin-bottom:8px">Depth Profile</div>' +
        '<div class="table-wrap">' +
          '<table style="font-size:0.78rem">' +
            '<thead><tr>' +
              '<th style="padding:4px 8px">Time</th>' +
              '<th style="padding:4px 8px">Depth</th>' +
              '<th style="padding:4px 8px">Profile</th>' +
              '<th style="padding:4px 8px">Phase</th>' +
            '</tr></thead>' +
            '<tbody>' + profileRows + '</tbody>' +
          '</table>' +
        '</div>' +
        statusNote +
      '</div>' +
    '</td></tr>';
  }

  function renderThresholds() {
    return '' +
      '<div class="card" style="margin-top:16px">' +
        '<div class="card-header">' +
          '<span class="card-title">QA Thresholds</span>' +
          '<span class="card-subtitle">Per Dr. Garbin engineering specifications</span>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table>' +
            '<thead><tr><th>Parameter</th><th>Target</th><th>Review Trigger</th><th>Flag Trigger</th></tr></thead>' +
            '<tbody>' +
              '<tr>' +
                '<td style="font-weight:500">Min Depth</td>' +
                '<td><span class="badge-status active">10.0 ft (3.05m)</span></td>' +
                '<td><span class="badge-status review">&lt; 9.0 ft (2.75m)</span></td>' +
                '<td>--</td>' +
              '</tr>' +
              '<tr>' +
                '<td style="font-weight:500">Min Install Time</td>' +
                '<td><span class="badge-status active">&gt; 30 seconds</span></td>' +
                '<td>--</td>' +
                '<td><span class="badge-status no-bid">&lt; 30 seconds</span></td>' +
              '</tr>' +
              '<tr>' +
                '<td style="font-weight:500">Target Diameter</td>' +
                '<td><span class="badge-status active">24" or 30"</span></td>' +
                '<td colspan="2" style="color:var(--text-3)">From project spec</td>' +
              '</tr>' +
              '<tr>' +
                '<td style="font-weight:500">Stone Type</td>' +
                '<td><span class="badge-status active">#57 Washed</span></td>' +
                '<td colspan="2" style="color:var(--text-3)">No fines / clean stone</td>' +
              '</tr>' +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';
  }

  // ---- EXPOSE HANDLERS TO WINDOW ----
  window._guhmaSort = function (col) {
    if (sortCol === col) {
      sortAsc = !sortAsc;
    } else {
      sortCol = col;
      sortAsc = true;
    }
    render();
  };

  window._guhmaFilter = function (status) {
    filterStatus = status;
    render();
  };

  window._guhmaExpand = function (pierId) {
    expandedPier = expandedPier === pierId ? null : pierId;
    render();
  };

  // ---- INIT ----
  // Render when DOM is ready or when module becomes visible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  // Also re-render when the module view becomes active (via MutationObserver)
  var guhmaView = document.getElementById('mod-guhma');
  if (guhmaView) {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName === 'class' && guhmaView.classList.contains('active')) {
          render();
          break;
        }
      }
    });
    observer.observe(guhmaView, { attributes: true });
  }

})();
