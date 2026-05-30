// ============================================================
// Pier Foundations — Bid Pipeline Module
// Renders into #mod-pipeline
// ============================================================

(function () {
  'use strict';

  // ---- BID DATA ----
  // Modeled from Jonathan's Project_Bid_Log.xlsx
  var BIDS = [
    { id:'26-001', name:'POET Shelbyville (Garbin)', city:'Shelbyville', state:'IN', sf:28000, lf:17003, cols:1865, stoneTN:680, duration:17, feed:'Bottom', tax:'Exempt', inviteDate:'2025-10-12', dueDate:'2025-10-28', submitted:'2025-10-27', status:'Awarded', value:343037, gc:'POET D&C', contact:'Mike Harrison', email:'mharrison@poetdc.com', phone:'317-555-0142', engineer:'Garbin', prelimFee:3500, designCompleted:'2025-10-20' },
    { id:'26-002', name:'The Granary (Garbin)', city:'Noblesville', state:'IN', sf:32000, lf:17656, cols:1593, stoneTN:710, duration:18, feed:'Bottom', tax:'Exempt', inviteDate:'2025-11-03', dueDate:'2025-11-18', submitted:'2025-11-17', status:'Awarded', value:326200, gc:'Flaherty & Collins', contact:'Sarah Webb', email:'swebb@flaherty.com', phone:'317-555-0198', engineer:'Garbin', prelimFee:3500, designCompleted:'2025-11-10' },
    { id:'26-003', name:'IU Launch Accelerator', city:'Indianapolis', state:'IN', sf:18500, lf:12200, cols:980, stoneTN:488, duration:12, feed:'Bottom', tax:'Exempt', inviteDate:'2025-12-01', dueDate:'2025-12-15', submitted:'2025-12-14', status:'Awarded', value:285200, gc:'Pepper Construction', contact:'Tom Reynolds', email:'treynolds@pepperconstruction.com', phone:'317-555-0211', engineer:'Garbin', prelimFee:3500, designCompleted:'2025-12-08' },
    { id:'26-004', name:'Stadium Flats', city:'South Bend', state:'IN', sf:9200, lf:6800, cols:612, stoneTN:272, duration:7, feed:'Top', tax:'Taxable', inviteDate:'2026-01-10', dueDate:'2026-01-24', submitted:'2026-01-23', status:'Awarded', value:137879, gc:'Weigand Construction', contact:'Dave Weigand', email:'dweigand@weigandco.com', phone:'574-555-0133', engineer:'Garbin', prelimFee:3500, designCompleted:'2026-01-17' },
    { id:'26-005', name:'Airport Hangar Expansion', city:'Terre Haute', state:'IN', sf:22000, lf:11400, cols:920, stoneTN:456, duration:11, feed:'Bottom', tax:'Exempt', inviteDate:'2026-01-20', dueDate:'2026-02-05', submitted:'2026-02-04', status:'Awarded', value:223897, gc:'Garmong Construction', contact:'Brian Garmong', email:'bgarmong@garmong.com', phone:'812-555-0177', engineer:'Garbin', prelimFee:3500, designCompleted:'2026-01-28' },
    { id:'26-006', name:'Wabash Place', city:'Terre Haute', state:'IN', sf:16000, lf:9800, cols:840, stoneTN:392, duration:10, feed:'Bottom', tax:'Exempt', inviteDate:'2026-02-01', dueDate:'2026-02-14', submitted:'2026-02-13', status:'Awarded', value:192000, gc:'Hannig Construction', contact:'Jeff Hannig', email:'jhannig@hannig.com', phone:'812-555-0155', engineer:'Garbin', prelimFee:3500, designCompleted:'2026-02-07' },
    { id:'26-007', name:'Dollar General Distribution', city:'Strongsville', state:'OH', sf:12500, lf:7200, cols:580, stoneTN:288, duration:7, feed:'Top', tax:'Taxable', inviteDate:'2026-02-15', dueDate:'2026-03-01', submitted:'2026-02-28', status:'Awarded', value:108000, gc:'Bowen Engineering', contact:'Rick Bowen', email:'rbowen@bowenengineering.com', phone:'216-555-0199', engineer:'Independent', prelimFee:0, designCompleted:'' },
    { id:'26-008', name:'Parkview Health Regional (Garbin)', city:'West Lafayette', state:'IN', sf:14000, lf:6194, cols:496, stoneTN:248, duration:6, feed:'Bottom', tax:'Exempt', inviteDate:'2026-03-10', dueDate:'2026-03-28', submitted:'', status:'Will Bid', value:175000, gc:'FA Wilhelm', contact:'Joe Wilhelm', email:'jwilhelm@fawilhelm.com', phone:'317-555-0166', engineer:'Garbin', prelimFee:3500, designCompleted:'' },
    { id:'26-009', name:'Amazon Fulfillment Center', city:'Whitestown', state:'IN', sf:85000, lf:42000, cols:3200, stoneTN:1680, duration:42, feed:'Bottom', tax:'Exempt', inviteDate:'2026-03-01', dueDate:'2026-03-20', submitted:'2026-03-19', status:'Submitted', value:890000, gc:'Hensel Phelps', contact:'Amy Chen', email:'achen@henselphelps.com', phone:'317-555-0244', engineer:'Garbin', prelimFee:5000, designCompleted:'2026-03-12' },
    { id:'26-010', name:'Google Data Center — Phase 1', city:'Fort Wayne', state:'IN', sf:120000, lf:58000, cols:4400, stoneTN:2320, duration:58, feed:'Bottom', tax:'Exempt', inviteDate:'', dueDate:'', submitted:'', status:'New Lead', value:1800000, gc:'Mortenson', contact:'Dan Mortenson', email:'dmortenson@mortenson.com', phone:'612-555-0188', engineer:'TBD', prelimFee:0, designCompleted:'' },
    { id:'26-011', name:'Meta Data Center', city:'Lebanon', state:'IN', sf:95000, lf:48000, cols:3600, stoneTN:1920, duration:48, feed:'Bottom', tax:'Exempt', inviteDate:'', dueDate:'', submitted:'', status:'New Lead', value:1450000, gc:'Turner Construction', contact:'Lisa Park', email:'lpark@tcco.com', phone:'212-555-0299', engineer:'TBD', prelimFee:0, designCompleted:'' },
    { id:'26-012', name:'Elanco HQ Expansion (Garbin)', city:'Greenfield', state:'IN', sf:18000, lf:9600, cols:780, stoneTN:384, duration:10, feed:'Bottom', tax:'Exempt', inviteDate:'2026-03-15', dueDate:'2026-04-01', submitted:'2026-03-31', status:'Submitted', value:245000, gc:'Messer Construction', contact:'Pat Messer', email:'pmesser@messer.com', phone:'513-555-0177', engineer:'Garbin', prelimFee:3500, designCompleted:'2026-03-22' },
    { id:'26-013', name:'Subaru Expansion Lot B', city:'Lafayette', state:'IN', sf:42000, lf:22000, cols:1700, stoneTN:880, duration:22, feed:'Bottom', tax:'Exempt', inviteDate:'2026-02-20', dueDate:'2026-03-10', submitted:'2026-03-09', status:'Submitted', value:520000, gc:'Shiel Sexton', contact:'Chris Shiel', email:'cshiel@shielsexton.com', phone:'317-555-0122', engineer:'Garbin', prelimFee:5000, designCompleted:'2026-02-28' },
    { id:'26-014', name:'Meijer Cold Storage', city:'Tipp City', state:'OH', sf:16000, lf:8400, cols:700, stoneTN:336, duration:8, feed:'Top', tax:'Taxable', inviteDate:'2026-04-01', dueDate:'2026-04-15', submitted:'2026-04-14', status:'Submitted - Edging', value:198000, gc:'Danis Building', contact:'Troy Danis', email:'tdanis@danisbuilding.com', phone:'937-555-0144', engineer:'Independent', prelimFee:0, designCompleted:'' },
    { id:'26-015', name:'Cummins Testing Facility (Garbin)', city:'Columbus', state:'IN', sf:24000, lf:13200, cols:1060, stoneTN:528, duration:13, feed:'Bottom', tax:'Exempt', inviteDate:'2026-04-10', dueDate:'2026-04-28', submitted:'', status:'Will Bid', value:310000, gc:'Hunt Construction', contact:'Kevin Hunt', email:'khunt@huntconstruction.com', phone:'317-555-0203', engineer:'Garbin', prelimFee:3500, designCompleted:'' },
    { id:'26-016', name:'Purdue Ag Sciences Building', city:'West Lafayette', state:'IN', sf:11000, lf:5800, cols:464, stoneTN:232, duration:6, feed:'Bottom', tax:'Exempt', inviteDate:'2026-04-05', dueDate:'2026-04-20', submitted:'2026-04-19', status:'Not Awarded - Not Low', value:158000, gc:'Kettelhut Construction', contact:'Carl Kettelhut', email:'ckettelhut@kettelhut.com', phone:'765-555-0188', engineer:'Independent', prelimFee:0, designCompleted:'' },
    { id:'26-017', name:'Indiana Packers Expansion', city:'Delphi', state:'IN', sf:38000, lf:19600, cols:1540, stoneTN:784, duration:20, feed:'Bottom', tax:'Exempt', inviteDate:'2026-03-25', dueDate:'2026-04-10', submitted:'2026-04-09', status:'Not Awarded - Canceled', value:0, gc:'Gray Construction', contact:'Mark Gray', email:'mgray@grayconstruction.com', phone:'859-555-0133', engineer:'Garbin', prelimFee:3500, designCompleted:'2026-04-01' },
    { id:'26-018', name:'Rivian Service Center', city:'Normal', state:'IL', sf:8500, lf:4200, cols:340, stoneTN:168, duration:4, feed:'Top', tax:'Taxable', inviteDate:'2026-04-20', dueDate:'2026-05-05', submitted:'', status:'Will Not Bid', value:95000, gc:'Power Construction', contact:'Jim Power', email:'jpower@powerconstruction.net', phone:'312-555-0211', engineer:'Independent', prelimFee:0, designCompleted:'' },
    { id:'26-019', name:'Stellantis Lot Rehab', city:'Kokomo', state:'IN', sf:52000, lf:26000, cols:2080, stoneTN:1040, duration:26, feed:'Bottom', tax:'Exempt', inviteDate:'2026-05-01', dueDate:'2026-05-15', submitted:'2026-05-14', status:'Submitted', value:620000, gc:'Tonn and Blank', contact:'Steve Tonn', email:'stonn@tonnandblank.com', phone:'260-555-0177', engineer:'Garbin', prelimFee:5000, designCompleted:'2026-05-08' },
    { id:'26-020', name:'FedEx Sorting Hub', city:'Plainfield', state:'IN', sf:72000, lf:36000, cols:2880, stoneTN:1440, duration:36, feed:'Bottom', tax:'Exempt', inviteDate:'2026-05-10', dueDate:'2026-05-28', submitted:'', status:'NEED FOLLOW UP', value:780000, gc:'Clayco', contact:'Bob Clark', email:'bclark@claycorp.com', phone:'314-555-0266', engineer:'TBD', prelimFee:0, designCompleted:'' },
    { id:'26-021', name:'ToyotaIN Logistics', city:'Princeton', state:'IN', sf:30000, lf:15600, cols:1248, stoneTN:624, duration:16, feed:'Bottom', tax:'Exempt', inviteDate:'2026-05-15', dueDate:'2026-06-01', submitted:'', status:'Budget Pricing', value:365000, gc:'Lend Lease', contact:'Anna Lend', email:'alend@lendlease.com', phone:'212-555-0300', engineer:'TBD', prelimFee:0, designCompleted:'' },
    { id:'26-022', name:'Ball State Rec Center', city:'Muncie', state:'IN', sf:9800, lf:5100, cols:408, stoneTN:204, duration:5, feed:'Top', tax:'Exempt', inviteDate:'2026-05-20', dueDate:'2026-06-05', submitted:'', status:'Will Bid', value:128000, gc:'Bruns-Gutzwiller', contact:'Dean Bruns', email:'dbruns@brunsgutzwiller.com', phone:'513-555-0188', engineer:'Garbin', prelimFee:3500, designCompleted:'' },
    { id:'26-023', name:'Rolls-Royce Test Stand (Garbin)', city:'Indianapolis', state:'IN', sf:6500, lf:3400, cols:272, stoneTN:136, duration:3, feed:'Bottom', tax:'Exempt', inviteDate:'2026-01-05', dueDate:'2026-01-20', submitted:'2026-01-19', status:"Didn't Bid to Awarded GC", value:88000, gc:'Harley Ellis Devereaux', contact:'N/A', email:'', phone:'', engineer:'Garbin', prelimFee:3500, designCompleted:'2026-01-12' },
    { id:'25-018', name:'Heartland Crossing Retail', city:'Camby', state:'IN', sf:14500, lf:7600, cols:608, stoneTN:304, duration:8, feed:'Top', tax:'Taxable', inviteDate:'2025-09-10', dueDate:'2025-09-25', submitted:'2025-09-24', status:'Completed', value:165800, gc:'Hagerman Group', contact:'Bill Hagerman', email:'bhagerman@hagerman.com', phone:'317-555-0144', engineer:'Garbin', prelimFee:3500, designCompleted:'2025-09-18' }
  ];

  // ---- FY GOALS ----
  var FY = {
    fy25Goal: 3000000,
    fy26Goal: 6000000,
    fy26Actual: 0, // calculated below
    winRate: 0,
    winRateGarbin: 0,
    totalPipeline: 0,
    avgAward: 0
  };

  // ---- CALCULATIONS ----
  function recalcFY() {
    var awarded = BIDS.filter(function(b){ return b.status === 'Awarded' || b.status === 'Completed'; });
    FY.fy26Actual = awarded.reduce(function(s,b){ return s + b.value; }, 0);

    var submitted = BIDS.filter(function(b){
      return b.status === 'Submitted' || b.status === 'Submitted - Edging' ||
             b.status === 'Awarded' || b.status === 'Completed' ||
             b.status === 'Not Awarded - Not Low' || b.status === 'Not Awarded - Canceled' ||
             b.status === 'Not Awarded - Low' || b.status === "Didn't Bid to Awarded GC";
    });
    FY.winRate = submitted.length > 0 ? (awarded.length / submitted.length * 100) : 0;

    var garbinSubmitted = submitted.filter(function(b){ return b.engineer === 'Garbin'; });
    var garbinAwarded = awarded.filter(function(b){ return b.engineer === 'Garbin'; });
    FY.winRateGarbin = garbinSubmitted.length > 0 ? (garbinAwarded.length / garbinSubmitted.length * 100) : 0;

    var activePipeline = BIDS.filter(function(b){
      return b.status !== 'Will Not Bid' && b.status !== 'Not Awarded - Canceled' &&
             b.status !== 'Not Awarded - Not Low' && b.status !== 'Not Awarded - Low' &&
             b.status !== "Didn't Bid to Awarded GC" && b.status !== 'Completed';
    });
    FY.totalPipeline = activePipeline.reduce(function(s,b){ return s + b.value; }, 0);
    FY.avgAward = awarded.length > 0 ? Math.round(FY.fy26Actual / awarded.length) : 0;
  }

  // ---- STATUS HELPERS ----
  function statusBadgeClass(status) {
    switch (status) {
      case 'Awarded': return 'bid';
      case 'Completed': return 'bid';
      case 'Submitted': return 'review';
      case 'Submitted - Edging': return 'review';
      case 'Will Bid': return 'active';
      case 'New Lead': return 'active';
      case 'NEED FOLLOW UP': return 'pending';
      case 'Budget Pricing': return 'pending';
      case 'Will Not Bid': return 'no-bid';
      case 'Not Awarded - Not Low': return 'closed';
      case 'Not Awarded - Canceled': return 'closed';
      case 'Not Awarded - Low': return 'closed';
      case "Didn't Bid to Awarded GC": return 'closed';
      default: return 'pending';
    }
  }

  function statusGroup(status) {
    switch (status) {
      case 'Will Bid':
      case 'New Lead':
      case 'NEED FOLLOW UP':
      case 'Budget Pricing':
        return 'active';
      case 'Submitted':
      case 'Submitted - Edging':
        return 'submitted';
      case 'Awarded':
      case 'Completed':
        return 'awarded';
      case 'Not Awarded - Not Low':
      case 'Not Awarded - Canceled':
      case 'Not Awarded - Low':
      case "Didn't Bid to Awarded GC":
        return 'not-awarded';
      case 'Will Not Bid':
        return 'will-not-bid';
      default:
        return 'all';
    }
  }

  function fmtCurrency(v) {
    if (!v) return '--';
    return '$' + v.toLocaleString('en-US');
  }

  function fmtCurrencyShort(v) {
    if (v >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return '$' + (v / 1000).toFixed(0) + 'K';
    return '$' + v;
  }

  function fmtDate(d) {
    if (!d) return '--';
    var parts = d.split('-');
    return parts[1] + '/' + parts[2] + '/' + parts[0].slice(2);
  }

  function calcPerUnit(value, units) {
    if (!value || !units) return '--';
    return '$' + Math.round(value / units).toLocaleString('en-US');
  }

  // ---- STATE ----
  var currentFilter = 'all';
  var sortCol = 'id';
  var sortDir = -1; // -1 = descending
  var expandedRow = null;

  // ---- SORTING ----
  function sortBids(bids) {
    return bids.slice().sort(function(a, b) {
      var va = a[sortCol];
      var vb = b[sortCol];
      if (va == null) va = '';
      if (vb == null) vb = '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * sortDir;
      }
      return String(va).localeCompare(String(vb)) * sortDir;
    });
  }

  // ---- FILTER ----
  function filterBids() {
    if (currentFilter === 'all') return BIDS;
    return BIDS.filter(function(b) {
      return statusGroup(b.status) === currentFilter;
    });
  }

  // ---- COUNT HELPERS ----
  function countByGroup(group) {
    return BIDS.filter(function(b){ return statusGroup(b.status) === group; }).length;
  }

  // ---- RENDER ----
  function render() {
    recalcFY();
    var container = document.getElementById('mod-pipeline');
    if (!container) return;

    var activeBids = BIDS.filter(function(b){
      return b.status === 'Will Bid' || b.status === 'New Lead' ||
             b.status === 'NEED FOLLOW UP' || b.status === 'Budget Pricing' ||
             b.status === 'Submitted' || b.status === 'Submitted - Edging';
    });
    var pct = Math.min((FY.fy26Actual / FY.fy26Goal) * 100, 100);
    var progressColor = pct > 50 ? 'green' : pct > 25 ? 'amber' : 'red';

    var html = '';

    // ---- FY26 Progress ----
    html += '<div class="card" style="margin-bottom:16px">';
    html += '  <div class="card-header"><span class="card-title">FY26 Revenue Progress</span>';
    html += '    <span class="card-subtitle">' + fmtCurrency(FY.fy26Actual) + ' of ' + fmtCurrencyShort(FY.fy26Goal) + ' (' + pct.toFixed(1) + '%)</span></div>';
    html += '  <div class="progress-bar" style="height:10px"><div class="progress-fill ' + progressColor + '" style="width:' + pct + '%"></div></div>';
    html += '</div>';

    // ---- Summary Stats ----
    html += '<div class="grid grid-4" style="margin-bottom:16px">';
    html += statCard('Active Bids', activeBids.length, activeBids.length + ' needing action');
    html += statCard('Pipeline Value', fmtCurrencyShort(FY.totalPipeline), 'All non-closed bids');
    html += statCard('Win Rate', FY.winRate.toFixed(1) + '%', FY.winRateGarbin.toFixed(1) + '% with Garbin prelim');
    html += statCard('Avg. Award', fmtCurrencyShort(FY.avgAward), BIDS.filter(function(b){ return b.status === 'Awarded' || b.status === 'Completed'; }).length + ' projects won');
    html += '</div>';

    // ---- Filter Tabs ----
    html += '<div class="card">';
    html += '  <div class="card-header"><span class="card-title">Bid Pipeline</span>';
    html += '    <span class="card-subtitle">' + BIDS.length + ' total bids</span></div>';

    html += '<div class="tabs">';
    html += tabBtn('all', 'All (' + BIDS.length + ')');
    html += tabBtn('active', 'Actively Bidding (' + countByGroup('active') + ')');
    html += tabBtn('submitted', 'Submitted (' + countByGroup('submitted') + ')');
    html += tabBtn('awarded', 'Awarded (' + countByGroup('awarded') + ')');
    html += tabBtn('not-awarded', 'Not Awarded (' + countByGroup('not-awarded') + ')');
    html += tabBtn('will-not-bid', 'Will Not Bid (' + countByGroup('will-not-bid') + ')');
    html += '</div>';

    // ---- Table ----
    var filtered = sortBids(filterBids());

    html += '<div class="table-wrap"><table>';
    html += '<thead><tr>';
    html += thSortable('id', 'Bid #');
    html += thSortable('name', 'Project');
    html += thSortable('gc', 'GC');
    html += '<th>Location</th>';
    html += thSortable('dueDate', 'Due Date');
    html += thSortable('status', 'Status');
    html += thSortable('value', 'Value');
    html += '</tr></thead>';
    html += '<tbody>';

    if (filtered.length === 0) {
      html += '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-3)">No bids match this filter</td></tr>';
    }

    for (var i = 0; i < filtered.length; i++) {
      var b = filtered[i];
      var isExpanded = expandedRow === b.id;

      html += '<tr style="cursor:pointer" onclick="window.__pipelineToggle(\'' + b.id + '\')">';
      html += '  <td style="font-weight:500;white-space:nowrap;color:var(--accent)">' + b.id + '</td>';
      html += '  <td style="font-weight:500">' + escHtml(b.name) + '</td>';
      html += '  <td>' + escHtml(b.gc) + '</td>';
      html += '  <td style="white-space:nowrap">' + b.city + ', ' + b.state + '</td>';
      html += '  <td style="white-space:nowrap">' + fmtDate(b.dueDate) + '</td>';
      html += '  <td><span class="badge-status ' + statusBadgeClass(b.status) + '">' + b.status + '</span></td>';
      html += '  <td style="font-weight:600;white-space:nowrap">' + fmtCurrency(b.value) + '</td>';
      html += '</tr>';

      // Expanded detail row
      if (isExpanded) {
        html += '<tr><td colspan="7" style="padding:0;border-bottom:2px solid var(--accent)">';
        html += renderDetail(b);
        html += '</td></tr>';
      }
    }

    html += '</tbody></table></div>';
    html += '</div>'; // close card

    container.innerHTML = html;
  }

  function statCard(label, value, change) {
    return '<div class="stat-card">' +
      '<div class="stat-label">' + label + '</div>' +
      '<div class="stat-value">' + value + '</div>' +
      '<div class="stat-change">' + change + '</div>' +
    '</div>';
  }

  function tabBtn(filter, label) {
    var cls = 'tab' + (currentFilter === filter ? ' active' : '');
    return '<div class="' + cls + '" onclick="window.__pipelineFilter(\'' + filter + '\')">' + label + '</div>';
  }

  function thSortable(col, label) {
    var arrow = '';
    if (sortCol === col) {
      arrow = sortDir === 1 ? ' &#9650;' : ' &#9660;';
    }
    return '<th style="cursor:pointer;user-select:none" onclick="window.__pipelineSort(\'' + col + '\')">' + label + arrow + '</th>';
  }

  function renderDetail(b) {
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:16px 12px;background:var(--bg-1)">';

    // Column 1: Project Details
    html += '<div>';
    html += '<div style="font-weight:600;font-size:0.78rem;color:var(--text-0);margin-bottom:8px">Project Details</div>';
    html += detailRow('Total SF', b.sf ? b.sf.toLocaleString() : '--');
    html += detailRow('Total LF', b.lf ? b.lf.toLocaleString() : '--');
    html += detailRow('Columns', b.cols ? b.cols.toLocaleString() : '--');
    html += detailRow('Stone (TN)', b.stoneTN ? b.stoneTN.toLocaleString() : '--');
    html += detailRow('Duration', b.duration ? b.duration + ' days' : '--');
    html += detailRow('Feed', b.feed || '--');
    html += detailRow('Tax', b.tax || '--');
    html += '</div>';

    // Column 2: Pricing
    html += '<div>';
    html += '<div style="font-weight:600;font-size:0.78rem;color:var(--text-0);margin-bottom:8px">Pricing</div>';
    html += detailRow('Bid Total', fmtCurrency(b.value));
    html += detailRow('$/SF', calcPerUnit(b.value, b.sf));
    html += detailRow('$/LF', calcPerUnit(b.value, b.lf));
    html += detailRow('$/Column', calcPerUnit(b.value, b.cols));
    html += detailRow('$/Day', calcPerUnit(b.value, b.duration));
    html += detailRow('Invited', fmtDate(b.inviteDate));
    html += detailRow('Submitted', fmtDate(b.submitted));
    html += '</div>';

    // Column 3: Contact & Engineering
    html += '<div>';
    html += '<div style="font-weight:600;font-size:0.78rem;color:var(--text-0);margin-bottom:8px">Contact & Engineering</div>';
    html += detailRow('GC', b.gc);
    html += detailRow('Contact', b.contact || '--');
    if (b.email) {
      html += detailRow('Email', '<a href="mailto:' + b.email + '" style="color:var(--blue);text-decoration:none">' + b.email + '</a>');
    }
    html += detailRow('Phone', b.phone || '--');
    html += detailRow('Engineer', b.engineer || '--');
    html += detailRow('Prelim Fee', b.prelimFee ? fmtCurrency(b.prelimFee) : '--');
    html += detailRow('Design Done', fmtDate(b.designCompleted));
    html += '</div>';

    html += '</div>';
    return html;
  }

  function detailRow(label, value) {
    return '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.78rem;border-bottom:1px solid var(--border-light)">' +
      '<span style="color:var(--text-3)">' + label + '</span>' +
      '<span style="color:var(--text-1);font-weight:500">' + value + '</span>' +
    '</div>';
  }

  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ---- GLOBAL HANDLERS ----
  window.__pipelineFilter = function(filter) {
    currentFilter = filter;
    expandedRow = null;
    render();
  };

  window.__pipelineSort = function(col) {
    if (sortCol === col) {
      sortDir = sortDir * -1;
    } else {
      sortCol = col;
      sortDir = col === 'value' ? -1 : 1;
    }
    render();
  };

  window.__pipelineToggle = function(id) {
    expandedRow = expandedRow === id ? null : id;
    render();
  };

  // Also override the existing filterPipeline if the shell calls it
  window.filterPipeline = function(filter) {
    if (filter === 'active') filter = 'active';
    else if (filter === 'awarded') filter = 'awarded';
    else filter = 'all';
    window.__pipelineFilter(filter);
  };

  // ---- INIT ----
  render();
})();
