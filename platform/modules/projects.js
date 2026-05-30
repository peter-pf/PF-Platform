// ============================================================
// Active Projects Module — Pier Foundations Operations Platform
// Renders into #mod-projects > #projects-app
// ============================================================

(function () {
  'use strict';

  // ---- PROJECT DATA (from PF_Project_Master.xlsx) ----

  var PROJECTS_2026 = [
    {
      id: '26-002',
      name: 'POET',
      gc: 'POET Design & Construction',
      value: 343037,
      workPct: 68,
      city: 'Shelbyville',
      state: 'IN',
      duration: 18,
      retainPct: 10,
      status: 'Active',
      lf: 4200,
      columns: 280,
      checklist: buildChecklist({
        general: { 'Project Name': 'POET', 'Project #': '26-002', 'GC': 'POET Design & Construction', 'City/State': 'Shelbyville, IN', 'Subcontract Value': '$343,037', 'Contract Type': 'Lump Sum', 'Duration (days)': '18' },
        pfTeam: { 'Project Manager': 'Brad Reinking', 'Superintendent': 'TBD', 'Foreman': 'TBD', 'QA/QC Lead': 'TBD' },
        contract: { 'Contract Executed': 'Yes', 'Insurance Submitted': 'Yes', 'Bonds Required': 'No', 'Retainage': '10%', 'Pay App Frequency': 'Monthly' },
        engineering: { 'Prelim Design': 'Complete', 'Final Design': 'Complete', 'Garbin Approved': 'Yes', 'Column Diameter': '24"', 'Column Depth Avg': '15 ft', 'Stone Type': '#57 Washed' },
        safety: { 'JHA Submitted': 'Yes', 'Site Safety Plan': 'Yes', 'OSHA 30 on Site': 'Yes', 'Daily Safety Briefing': 'Active' },
        siteReadiness: { 'Site Visit Complete': 'Yes', 'Working Pad Prepped': 'Yes', 'Utilities Marked': 'Yes', 'Access Confirmed': 'Yes' },
        equipment: { 'Cat 336 Scheduled': 'Yes', 'Vibro Attachment': 'On site', 'Support Excavator': 'Scheduled', 'Trailer/Transport': 'Complete' },
        material: { 'Stone Supplier': 'Heidelberg', 'Stone Ordered': 'Yes', 'Delivery Schedule': 'Daily', 'Spoils Plan': 'Off-site' },
        qaqc: { 'GUHMA Setup': 'Active', 'Modulus Testing Plan': 'Yes', 'Calibration Current': 'Yes' },
        financials: { 'Pay App #1': 'Submitted', 'Pay App #2': 'Pending', 'Amount Billed': '$233,265', 'Amount Paid': '$186,612', 'Retainage Held': '$23,327', 'Change Orders': '0' },
        closeout: { 'Punch List': 'N/A', 'As-Builts': 'In Progress', 'Final Report': 'Pending', 'Retainage Release': 'Pending' }
      })
    },
    {
      id: '26-001',
      name: 'WPAFB Visiting Quarters',
      gc: 'Messer',
      value: 140700,
      workPct: 10,
      city: 'Dayton',
      state: 'OH',
      duration: null,
      retainPct: 5,
      status: 'Mobilizing',
      lf: 1800,
      columns: 120,
      checklist: buildChecklist({
        general: { 'Project Name': 'WPAFB Visiting Quarters', 'Project #': '26-001', 'GC': 'Messer', 'City/State': 'Dayton, OH', 'Subcontract Value': '$140,700', 'Contract Type': 'Lump Sum' },
        pfTeam: { 'Project Manager': 'Brad Reinking', 'Superintendent': 'TBD', 'Foreman': 'TBD' },
        contract: { 'Contract Executed': 'Yes', 'Insurance Submitted': 'Yes', 'Bonds Required': 'TBD', 'Retainage': '5%' },
        engineering: { 'Prelim Design': 'Complete', 'Final Design': 'In Progress', 'Garbin Approved': 'Pending' },
        safety: { 'JHA Submitted': 'Pending', 'Site Safety Plan': 'In Progress' },
        siteReadiness: { 'Site Visit Complete': 'Yes', 'Working Pad Prepped': 'No', 'Utilities Marked': 'Pending' },
        equipment: { 'Cat 336 Scheduled': 'Pending', 'Vibro Attachment': 'Available' },
        material: { 'Stone Supplier': 'StoneCo', 'Stone Ordered': 'No' },
        qaqc: { 'GUHMA Setup': 'Pending' },
        financials: { 'Pay App #1': 'Not Started', 'Amount Billed': '$0', 'Amount Paid': '$0', 'Retainage Held': '$0' },
        closeout: {}
      })
    },
    {
      id: '26-005',
      name: 'Southwark Metals',
      gc: 'The Peterson Co',
      value: 291749,
      workPct: 0,
      city: 'TBD',
      state: '',
      duration: null,
      retainPct: 5,
      status: 'Pre-Construction',
      lf: 3500,
      columns: 230,
      checklist: buildChecklist({
        general: { 'Project Name': 'Southwark Metals', 'Project #': '26-005', 'GC': 'The Peterson Co', 'Subcontract Value': '$291,749' },
        contract: { 'Contract Executed': 'Pending', 'Retainage': '5%' },
        engineering: { 'Prelim Design': 'In Progress', 'Garbin Approved': 'Pending' },
        siteReadiness: { 'Site Visit Complete': 'No' },
        financials: { 'Amount Billed': '$0', 'Amount Paid': '$0', 'Retainage Held': '$0' }
      })
    },
    {
      id: '26-007',
      name: 'Madison Lifestyle Parking Garage',
      gc: 'FA Wilhelm',
      value: 294271,
      workPct: 0,
      city: 'TBD',
      state: '',
      duration: null,
      retainPct: 10,
      status: 'Pre-Construction',
      lf: 3600,
      columns: 240,
      checklist: buildChecklist({
        general: { 'Project Name': 'Madison Lifestyle Parking Garage', 'Project #': '26-007', 'GC': 'FA Wilhelm', 'Subcontract Value': '$294,271' },
        contract: { 'Contract Executed': 'Pending', 'Retainage': '10%' },
        engineering: { 'Prelim Design': 'Pending', 'Garbin Approved': 'Pending' },
        siteReadiness: { 'Site Visit Complete': 'No' },
        financials: { 'Amount Billed': '$0', 'Amount Paid': '$0', 'Retainage Held': '$0' }
      })
    },
    {
      id: '26-006',
      name: 'Battle Creek Fire Station #3',
      gc: 'Schweitzer',
      value: 91700,
      workPct: 0,
      city: 'Battle Creek',
      state: 'MI',
      duration: null,
      retainPct: 5,
      status: 'Pre-Construction',
      lf: 1100,
      columns: 75,
      checklist: buildChecklist({
        general: { 'Project Name': 'Battle Creek Fire Station #3', 'Project #': '26-006', 'GC': 'Schweitzer', 'City/State': 'Battle Creek, MI', 'Subcontract Value': '$91,700' },
        contract: { 'Contract Executed': 'Pending', 'Retainage': '5%' },
        engineering: { 'Prelim Design': 'Pending', 'Garbin Approved': 'Pending' },
        siteReadiness: { 'Site Visit Complete': 'No' },
        financials: { 'Amount Billed': '$0', 'Amount Paid': '$0', 'Retainage Held': '$0' }
      })
    }
  ];

  var PROJECTS_2025 = [
    { id: '25-001', name: 'Circle Centre Redevelopment', gc: 'Shiel Sexton', value: 187500, city: 'Indianapolis', state: 'IN', status: 'Completed' },
    { id: '25-002', name: 'Amazon Whitestown DC', gc: 'Hensel Phelps', value: 245000, city: 'Whitestown', state: 'IN', status: 'Completed' },
    { id: '25-003', name: 'FedEx Ground Hub', gc: 'Clayco', value: 198000, city: 'Lebanon', state: 'IN', status: 'Completed' },
    { id: '25-004', name: 'Toyota Princeton Expansion', gc: 'Pepper Construction', value: 156000, city: 'Princeton', state: 'IN', status: 'Completed' },
    { id: '25-005', name: 'Subaru SIA Expansion', gc: 'Messer', value: 134000, city: 'Lafayette', state: 'IN', status: 'Completed' },
    { id: '25-006', name: 'Purdue Engineering Bldg', gc: 'Kettelhut', value: 89000, city: 'West Lafayette', state: 'IN', status: 'Completed' },
    { id: '25-007', name: 'Fort Wayne Riverfront', gc: 'Weigand', value: 112000, city: 'Fort Wayne', state: 'IN', status: 'Completed' },
    { id: '25-008', name: 'Columbus Regional Hospital', gc: 'Messer', value: 78000, city: 'Columbus', state: 'IN', status: 'Completed' },
    { id: '25-009', name: 'Muncie Distribution Center', gc: 'The Hagerman Group', value: 92000, city: 'Muncie', state: 'IN', status: 'Completed' },
    { id: '25-010', name: 'Kokomo Stellantis Retool', gc: 'Walbridge', value: 210000, city: 'Kokomo', state: 'IN', status: 'Completed' },
    { id: '25-011', name: 'Evansville Warehouse', gc: 'Tonn and Blank', value: 67000, city: 'Evansville', state: 'IN', status: 'Completed' },
    { id: '25-012', name: 'Terre Haute Fed Prison Annex', gc: 'Hensel Phelps', value: 145000, city: 'Terre Haute', state: 'IN', status: 'Completed' },
    { id: '25-013', name: 'South Bend Data Center', gc: 'Turner', value: 178000, city: 'South Bend', state: 'IN', status: 'Completed' },
    { id: '25-014', name: 'Bloomington Student Housing', gc: 'CA Ventures', value: 54000, city: 'Bloomington', state: 'IN', status: 'Completed' },
    { id: '25-015', name: 'Carmel Hotel & Conference', gc: 'Shiel Sexton', value: 98000, city: 'Carmel', state: 'IN', status: 'Completed' },
    { id: '25-016', name: 'Michigan City Outlet Mall', gc: 'Walsh', value: 45000, city: 'Michigan City', state: 'IN', status: 'Completed' },
    { id: '25-017', name: 'Fishers Town Center Ph2', gc: 'FA Wilhelm', value: 68000, city: 'Fishers', state: 'IN', status: 'Completed' },
    { id: '25-018', name: 'Greenwood Medical Office', gc: 'Brandt', value: 34500, city: 'Greenwood', state: 'IN', status: 'Completed' },
    { id: '25-019', name: 'Anderson Flex Industrial', gc: 'Duke Realty', value: 89500, city: 'Anderson', state: 'IN', status: 'Completed' },
    { id: '25-020', name: 'Elkhart RV Manufacturing', gc: 'The Peterson Co', value: 88000, city: 'Elkhart', state: 'IN', status: 'Completed' }
  ];

  // Pipeline totals from crew schedule
  var PIPELINE = {
    totalLF: 266337,
    totalColumns: 20424,
    completedLF: 87569,
    contractFinalizedLF: 44687,
    verbalAwardLF: 35251,
    projectCount: 57
  };

  // Monthly KPIs
  var KPIS = {
    bidInvites: { actual: 13, goal: 12 },
    garbinPrelims: { actual: 10, goal: 12 },
    bidsSent: { count: 12, value: 1000000 },
    awarded: { count: 4, goal: 2, value: 500000 },
    contractsExecuted: { count: 2, goal: 2, value: 385000 },
    completed: { count: 2, goal: 2, value: 750000 }
  };

  // ---- CHECKLIST BUILDER ----
  function buildChecklist(sections) {
    var SECTION_LABELS = {
      general: 'General Info',
      pfTeam: 'PF Team',
      contract: 'Contract Info',
      engineering: 'Engineering & Design',
      safety: 'Safety',
      siteReadiness: 'Site Readiness',
      equipment: 'Equipment',
      material: 'Material',
      qaqc: 'QA/QC',
      financials: 'Financials',
      closeout: 'Closeout'
    };
    var result = [];
    var keys = ['general', 'pfTeam', 'contract', 'engineering', 'safety', 'siteReadiness', 'equipment', 'material', 'qaqc', 'financials', 'closeout'];
    keys.forEach(function (key) {
      var items = sections[key] || {};
      var fields = [];
      Object.keys(items).forEach(function (field) {
        fields.push({ field: field, value: items[field] });
      });
      result.push({ section: SECTION_LABELS[key] || key, fields: fields });
    });
    return result;
  }

  // ---- HELPERS ----
  function fmt(n) {
    return '$' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function fmtNum(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function statusClass(status) {
    switch (status) {
      case 'Active': return 'active';
      case 'Mobilizing': return 'review';
      case 'Pre-Construction': return 'pending';
      case 'Completed': return 'closed';
      default: return 'pending';
    }
  }

  function progressColor(pct) {
    if (pct >= 60) return 'green';
    if (pct >= 30) return 'amber';
    return 'accent';
  }

  function location(p) {
    if (p.city && p.state) return p.city + ', ' + p.state;
    if (p.city) return p.city;
    if (p.state) return p.state;
    return 'TBD';
  }

  // ---- STATE ----
  var currentTab = 'active';
  var currentView = 'cards';
  var sortCol = 'id';
  var sortAsc = true;
  var expandedProject = null;
  var expandedSections = {};

  // ---- COMPUTED ----
  function activeProjects() {
    return PROJECTS_2026.filter(function (p) { return p.status !== 'Completed'; });
  }

  function activeTotal() {
    return activeProjects().reduce(function (s, p) { return s + p.value; }, 0);
  }

  function activeLF() {
    return activeProjects().reduce(function (s, p) { return s + (p.lf || 0); }, 0);
  }

  function avgCompletion() {
    var projects = activeProjects();
    if (!projects.length) return 0;
    return Math.round(projects.reduce(function (s, p) { return s + p.workPct; }, 0) / projects.length);
  }

  function financialsSummary() {
    var totalContract = PROJECTS_2026.reduce(function (s, p) { return s + p.value; }, 0);
    // Estimate paid/unpaid from POET data as reference
    var totalBilled = 233265;
    var totalPaid = 186612;
    var totalRetainage = 23327 + (140700 * 0.05 * 0) + 0 + 0 + 0;
    return {
      totalContract: totalContract,
      totalBilled: totalBilled,
      totalPaid: totalPaid,
      totalUnpaid: totalBilled - totalPaid,
      totalRetainage: totalRetainage
    };
  }

  // ---- SORT ----
  function sortProjects(projects) {
    return projects.slice().sort(function (a, b) {
      var aVal, bVal;
      switch (sortCol) {
        case 'id': aVal = a.id; bVal = b.id; break;
        case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case 'gc': aVal = a.gc.toLowerCase(); bVal = b.gc.toLowerCase(); break;
        case 'value': aVal = a.value; bVal = b.value; break;
        case 'pct': aVal = a.workPct || 0; bVal = b.workPct || 0; break;
        case 'location': aVal = location(a); bVal = location(b); break;
        case 'status': aVal = a.status; bVal = b.status; break;
        default: aVal = a.id; bVal = b.id;
      }
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });
  }

  function handleSort(col) {
    if (sortCol === col) {
      sortAsc = !sortAsc;
    } else {
      sortCol = col;
      sortAsc = true;
    }
    render();
  }

  function sortArrow(col) {
    if (sortCol !== col) return '';
    return sortAsc ? ' &#9650;' : ' &#9660;';
  }

  // ---- RENDER SUMMARY STATS ----
  function renderSummaryStats() {
    var active = activeProjects();
    var avg = avgCompletion();
    return '' +
      '<div class="grid grid-4">' +
        '<div class="stat-card">' +
          '<div class="stat-label">Active Projects</div>' +
          '<div class="stat-value">' + active.length + '</div>' +
          '<div class="stat-change">' + PROJECTS_2026.length + ' total in 2026</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-label">Total Contract Value</div>' +
          '<div class="stat-value">' + fmt(activeTotal()) + '</div>' +
          '<div class="stat-change">Active projects only</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-label">Pipeline LF</div>' +
          '<div class="stat-value">' + fmtNum(PIPELINE.totalLF) + '</div>' +
          '<div class="stat-change">' + fmtNum(PIPELINE.completedLF) + ' LF completed</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-label">Avg Completion</div>' +
          '<div class="stat-value">' + avg + '%</div>' +
          '<div class="stat-change">' +
            '<div class="progress-bar" style="margin-top:6px">' +
              '<div class="progress-fill ' + progressColor(avg) + '" style="width:' + avg + '%"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // ---- RENDER CARDS VIEW ----
  function renderCards(projects) {
    if (!projects.length) {
      return '<div class="empty-state"><div class="empty-icon">&#128196;</div><h3>No Projects</h3><p>No projects found for this filter.</p></div>';
    }
    var html = '<div class="grid grid-3">';
    projects.forEach(function (p) {
      var isExpanded = expandedProject === p.id;
      html += '' +
        '<div class="card" style="cursor:pointer" onclick="window._projectsToggleDetail(\'' + p.id + '\')">' +
          '<div class="card-header">' +
            '<div>' +
              '<div class="card-title">' + p.name + '</div>' +
              '<div class="card-subtitle">' + p.id + '</div>' +
            '</div>' +
            '<span class="badge-status ' + statusClass(p.status) + '">' + p.status + '</span>' +
          '</div>' +
          '<div style="font-size:0.82rem;color:var(--text-2);margin-bottom:8px">' + p.gc + '</div>' +
          '<div style="font-size:0.78rem;color:var(--text-3);margin-bottom:12px">' + location(p) + '</div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
            '<span style="font-size:1.1rem;font-weight:700;color:var(--text-0)">' + fmt(p.value) + '</span>' +
            '<span style="font-size:0.78rem;color:var(--text-2)">' + (p.workPct || 0) + '% complete</span>' +
          '</div>' +
          '<div class="progress-bar">' +
            '<div class="progress-fill ' + progressColor(p.workPct || 0) + '" style="width:' + (p.workPct || 0) + '%"></div>' +
          '</div>' +
          (p.duration ? '<div style="font-size:0.72rem;color:var(--text-3);margin-top:8px">Duration: ' + p.duration + ' days</div>' : '') +
          (p.lf ? '<div style="font-size:0.72rem;color:var(--text-3);margin-top:4px">' + fmtNum(p.lf) + ' LF / ' + fmtNum(p.columns) + ' columns</div>' : '') +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  // ---- RENDER TABLE VIEW ----
  function renderTable(projects) {
    var html = '' +
      '<div class="card">' +
        '<div class="table-wrap">' +
          '<table>' +
            '<thead><tr>' +
              '<th style="cursor:pointer" onclick="window._projectsSort(\'id\')">Project #' + sortArrow('id') + '</th>' +
              '<th style="cursor:pointer" onclick="window._projectsSort(\'name\')">Name' + sortArrow('name') + '</th>' +
              '<th style="cursor:pointer" onclick="window._projectsSort(\'gc\')">GC' + sortArrow('gc') + '</th>' +
              '<th style="cursor:pointer" onclick="window._projectsSort(\'value\')">Value' + sortArrow('value') + '</th>' +
              '<th style="cursor:pointer" onclick="window._projectsSort(\'pct\')">% Complete' + sortArrow('pct') + '</th>' +
              '<th style="cursor:pointer" onclick="window._projectsSort(\'location\')">City/State' + sortArrow('location') + '</th>' +
              '<th>Duration</th>' +
              '<th style="cursor:pointer" onclick="window._projectsSort(\'status\')">Status' + sortArrow('status') + '</th>' +
            '</tr></thead>' +
            '<tbody>';

    var sorted = sortProjects(projects);
    sorted.forEach(function (p) {
      html += '' +
        '<tr style="cursor:pointer" onclick="window._projectsToggleDetail(\'' + p.id + '\')">' +
          '<td style="font-weight:500">' + p.id + '</td>' +
          '<td style="font-weight:500">' + p.name + '</td>' +
          '<td>' + p.gc + '</td>' +
          '<td>' + fmt(p.value) + '</td>' +
          '<td>' +
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<div class="progress-bar" style="width:60px">' +
                '<div class="progress-fill ' + progressColor(p.workPct || 0) + '" style="width:' + (p.workPct || 0) + '%"></div>' +
              '</div>' +
              '<span style="font-size:0.75rem;color:var(--text-3)">' + (p.workPct || 0) + '%</span>' +
            '</div>' +
          '</td>' +
          '<td>' + location(p) + '</td>' +
          '<td>' + (p.duration ? p.duration + ' days' : '-') + '</td>' +
          '<td><span class="badge-status ' + statusClass(p.status) + '">' + p.status + '</span></td>' +
        '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
  }

  // ---- RENDER PROJECT DETAIL ----
  function renderDetail(projectId) {
    var project = null;
    PROJECTS_2026.forEach(function (p) { if (p.id === projectId) project = p; });
    if (!project || !project.checklist) return '';

    var html = '' +
      '<div class="card" style="margin-top:16px;border-left:3px solid var(--accent)">' +
        '<div class="card-header">' +
          '<div>' +
            '<div class="card-title">' + project.name + ' - Project Dashboard</div>' +
            '<div class="card-subtitle">' + project.id + ' | ' + project.gc + ' | ' + location(project) + '</div>' +
          '</div>' +
          '<button class="btn btn-secondary" onclick="window._projectsToggleDetail(null)">Close</button>' +
        '</div>' +
        '<div style="font-size:0.78rem;color:var(--text-2);margin-bottom:16px">' +
          '8 sections, ' + project.checklist.reduce(function (s, sec) { return s + sec.fields.length; }, 0) + ' tracked fields' +
        '</div>';

    project.checklist.forEach(function (section, idx) {
      if (!section.fields.length) return;
      var sectionKey = projectId + '-' + idx;
      var isOpen = expandedSections[sectionKey];
      html += '' +
        '<div style="border:1px solid var(--border-light);border-radius:var(--radius);margin-bottom:8px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;background:' + (isOpen ? 'var(--bg-1)' : 'var(--bg-0)') + ';border-radius:var(--radius)" onclick="window._projectsToggleSection(\'' + sectionKey + '\')">' +
            '<span style="font-size:0.82rem;font-weight:600;color:var(--text-0)">' + section.section + '</span>' +
            '<span style="font-size:0.72rem;color:var(--text-3)">' + section.fields.length + ' fields ' + (isOpen ? '&#9650;' : '&#9660;') + '</span>' +
          '</div>';

      if (isOpen) {
        html += '<div class="table-wrap"><table>';
        section.fields.forEach(function (f) {
          var valColor = 'var(--text-1)';
          var val = f.value;
          if (val === 'Yes' || val === 'Complete' || val === 'Active') valColor = 'var(--green)';
          else if (val === 'No' || val === 'Pending' || val === 'Not Started') valColor = 'var(--amber)';
          else if (val === 'TBD') valColor = 'var(--text-3)';
          html += '<tr><td style="font-weight:500;width:40%">' + f.field + '</td><td style="color:' + valColor + '">' + val + '</td></tr>';
        });
        html += '</table></div>';
      }

      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  // ---- RENDER FINANCIALS ----
  function renderFinancials() {
    var fin = financialsSummary();
    return '' +
      '<div style="margin-top:20px">' +
        '<div class="card">' +
          '<div class="card-header">' +
            '<span class="card-title">Financials Summary</span>' +
            '<span class="card-subtitle">2026 WIP Projects</span>' +
          '</div>' +
          '<div class="grid grid-4">' +
            '<div class="stat-card">' +
              '<div class="stat-label">Total Contract Value</div>' +
              '<div class="stat-value">' + fmt(fin.totalContract) + '</div>' +
            '</div>' +
            '<div class="stat-card">' +
              '<div class="stat-label">Total Billed</div>' +
              '<div class="stat-value">' + fmt(fin.totalBilled) + '</div>' +
            '</div>' +
            '<div class="stat-card">' +
              '<div class="stat-label">Total Paid</div>' +
              '<div class="stat-value" style="color:var(--green)">' + fmt(fin.totalPaid) + '</div>' +
            '</div>' +
            '<div class="stat-card">' +
              '<div class="stat-label">Unpaid / Retainage</div>' +
              '<div class="stat-value" style="color:var(--amber)">' + fmt(fin.totalUnpaid) + '</div>' +
              '<div class="stat-change" style="color:var(--text-3)">' + fmt(fin.totalRetainage) + ' retainage held</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // ---- RENDER KPI ROW ----
  function renderKPIs() {
    function kpiCard(label, actual, goal, extra) {
      var pct = goal ? Math.round((actual / goal) * 100) : 100;
      var color = pct >= 100 ? 'green' : pct >= 75 ? 'amber' : 'red';
      return '' +
        '<div class="stat-card">' +
          '<div class="stat-label">' + label + '</div>' +
          '<div class="stat-value">' + actual + (goal ? '<span style="font-size:0.82rem;font-weight:400;color:var(--text-3)"> / ' + goal + '</span>' : '') + '</div>' +
          (extra ? '<div class="stat-change" style="color:var(--text-2)">' + extra + '</div>' : '') +
          '<div class="progress-bar" style="margin-top:6px"><div class="progress-fill ' + color + '" style="width:' + Math.min(pct, 100) + '%"></div></div>' +
        '</div>';
    }

    return '' +
      '<div style="margin-top:20px">' +
        '<div class="card">' +
          '<div class="card-header">' +
            '<span class="card-title">Monthly KPIs</span>' +
            '<span class="card-subtitle">January 2026</span>' +
          '</div>' +
          '<div class="grid grid-3">' +
            kpiCard('Bid Invites', KPIS.bidInvites.actual, KPIS.bidInvites.goal) +
            kpiCard('Garbin Prelims', KPIS.garbinPrelims.actual, KPIS.garbinPrelims.goal) +
            kpiCard('Bids Sent', KPIS.bidsSent.count, null, fmt(KPIS.bidsSent.value)) +
            kpiCard('Projects Awarded', KPIS.awarded.count, KPIS.awarded.goal, fmt(KPIS.awarded.value)) +
            kpiCard('Contracts Executed', KPIS.contractsExecuted.count, KPIS.contractsExecuted.goal, fmt(KPIS.contractsExecuted.value)) +
            kpiCard('Projects Completed', KPIS.completed.count, KPIS.completed.goal, fmt(KPIS.completed.value)) +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // ---- RENDER COMPLETED (2025) ----
  function renderCompleted() {
    var total = PROJECTS_2025.reduce(function (s, p) { return s + p.value; }, 0);
    var avg = Math.round(total / PROJECTS_2025.length);

    var html = '' +
      '<div class="grid grid-3" style="margin-bottom:16px">' +
        '<div class="stat-card">' +
          '<div class="stat-label">2025 Projects</div>' +
          '<div class="stat-value">' + PROJECTS_2025.length + '</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-label">2025 Total Revenue</div>' +
          '<div class="stat-value">' + fmt(total) + '</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-label">Avg Project Value</div>' +
          '<div class="stat-value">' + fmt(avg) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="table-wrap">' +
          '<table>' +
            '<thead><tr><th>Project #</th><th>Name</th><th>GC</th><th>Value</th><th>City/State</th><th>Status</th></tr></thead>' +
            '<tbody>';

    PROJECTS_2025.forEach(function (p) {
      html += '' +
        '<tr>' +
          '<td style="font-weight:500">' + p.id + '</td>' +
          '<td>' + p.name + '</td>' +
          '<td>' + p.gc + '</td>' +
          '<td>' + fmt(p.value) + '</td>' +
          '<td>' + (p.city && p.state ? p.city + ', ' + p.state : '-') + '</td>' +
          '<td><span class="badge-status closed">Completed</span></td>' +
        '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
  }

  // ---- MAIN RENDER ----
  function render() {
    var app = document.getElementById('projects-app');
    if (!app) return;

    // Tabs
    var html = '' +
      '<div class="tabs">' +
        '<div class="tab' + (currentTab === 'active' ? ' active' : '') + '" onclick="window._projectsTab(\'active\')">2026 Active</div>' +
        '<div class="tab' + (currentTab === 'completed' ? ' active' : '') + '" onclick="window._projectsTab(\'completed\')">2025 Completed</div>' +
      '</div>';

    if (currentTab === 'active') {
      // Summary stats
      html += renderSummaryStats();

      // View toggle
      html += '' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin:20px 0 12px">' +
          '<span style="font-size:0.88rem;font-weight:600;color:var(--text-0)">WIP Projects</span>' +
          '<div style="display:flex;gap:4px">' +
            '<button class="btn ' + (currentView === 'cards' ? 'btn-primary' : 'btn-secondary') + '" onclick="window._projectsView(\'cards\')" style="padding:6px 12px;font-size:0.75rem">Cards</button>' +
            '<button class="btn ' + (currentView === 'table' ? 'btn-primary' : 'btn-secondary') + '" onclick="window._projectsView(\'table\')" style="padding:6px 12px;font-size:0.75rem">Table</button>' +
          '</div>' +
        '</div>';

      // Projects list
      if (currentView === 'cards') {
        html += renderCards(PROJECTS_2026);
      } else {
        html += renderTable(PROJECTS_2026);
      }

      // Project detail
      if (expandedProject) {
        html += renderDetail(expandedProject);
      }

      // Financials
      html += renderFinancials();

      // KPIs
      html += renderKPIs();
    } else {
      html += renderCompleted();
    }

    app.innerHTML = html;
  }

  // ---- PUBLIC API (for onclick handlers) ----
  window._projectsTab = function (tab) {
    currentTab = tab;
    expandedProject = null;
    render();
  };

  window._projectsView = function (view) {
    currentView = view;
    render();
  };

  window._projectsSort = function (col) {
    handleSort(col);
  };

  window._projectsToggleDetail = function (id) {
    if (id === null || expandedProject === id) {
      expandedProject = null;
    } else {
      expandedProject = id;
    }
    render();
  };

  window._projectsToggleSection = function (key) {
    expandedSections[key] = !expandedSections[key];
    render();
  };

  // ---- INIT ----
  render();

})();
