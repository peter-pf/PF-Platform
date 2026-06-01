// ============================================================
// Pier Foundations — CEO Dashboard Module
// Renders into #mod-ceodash > #ceodash-app
// Harvard MBA COO Framework: 6 Ops + 6 Financial KPIs
// ============================================================

(function () {
  'use strict';

  // ---- DATA SOURCES (SharePoint live data with fallbacks) ----
  var bids = (typeof LIVE_BIDS !== 'undefined') ? LIVE_BIDS : [];
  var projects = (typeof LIVE_PROJECTS !== 'undefined') ? LIVE_PROJECTS : [];
  var syncMeta = (typeof LIVE_SYNC_META !== 'undefined') ? LIVE_SYNC_META : {};

  // ---- CONSTANTS ----
  var FY26_TARGET = 6000000;
  var MONTHLY_DEBT_SERVICE = 12398;

  // ---- HELPERS ----
  function fmtCurrency(v) {
    if (v == null || isNaN(v)) return '--';
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function fmtShort(v) {
    if (v == null || isNaN(v)) return '--';
    if (v >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return '$' + Math.round(v / 1000) + 'K';
    return '$' + Math.round(v);
  }

  function fmtPct(v) {
    if (v == null || isNaN(v)) return '--';
    return v.toFixed(1) + '%';
  }

  function fmtDate(d) {
    if (!d) return '--';
    var s = d.split(' ')[0]; // strip time
    var parts = s.split('-');
    if (parts.length < 3) return d;
    return parts[1] + '/' + parts[2] + '/' + parts[0].slice(2);
  }

  // ---- STATUS BADGE MAPPING ----
  function statusBadgeClass(status) {
    if (!status) return 'pending';
    switch (status) {
      case 'Awarded': return 'bid';
      case 'Completed': return 'bid';
      case 'Submitted': return 'review';
      case 'Submitted - Edging': return 'review';
      case 'Will Bid': return 'active';
      case 'New Lead': return 'active';
      case 'NEED FOLLOW UP': return 'pending';
      case 'Budget Pricing': return 'pending';
      case 'Will Not Bid': return 'closed';
      case 'Not Awarded - Not Low': return 'closed';
      case 'Not Awarded - Canceled': return 'closed';
      case 'Not Awarded - Low': return 'closed';
      case "Didn't Bid to Awarded GC": return 'closed';
      default: return 'pending';
    }
  }

  // ---- STAT CARD BUILDER ----
  function statCard(label, value, subtitle) {
    return '<div class="stat-card">' +
      '<div class="stat-label">' + label + '</div>' +
      '<div class="stat-value">' + value + '</div>' +
      (subtitle ? '<div class="stat-change">' + subtitle + '</div>' : '') +
      '</div>';
  }

  // ---- COMPUTE KPIs ----
  function computeKPIs() {
    var kpi = {};

    // --- Operations KPIs ---

    // 1. Active Projects: work_pct_complete > 0 and < 1.0
    var activeProjects = projects.filter(function (p) {
      return p.work_pct_complete > 0 && p.work_pct_complete < 1.0;
    });
    kpi.activeProjectCount = activeProjects.length;

    // 2. Pipeline Value: sum bid_value for active bid statuses
    var pipelineStatuses = [
      'Will Bid', 'Submitted', 'Budget Pricing',
      'Submitted - Edging', 'New Lead', 'NEED FOLLOW UP'
    ];
    var pipelineBids = bids.filter(function (b) {
      return pipelineStatuses.indexOf(b.bid_status) !== -1;
    });
    kpi.pipelineValue = pipelineBids.reduce(function (s, b) {
      return s + (b.bid_value || 0);
    }, 0);

    // 3. Win Rate: awarded / (awarded + not awarded)
    var awardedBids = bids.filter(function (b) {
      return b.bid_status === 'Awarded' || b.bid_status === 'Completed';
    });
    var notAwardedBids = bids.filter(function (b) {
      return b.bid_status === 'Not Awarded - Not Low' ||
        b.bid_status === 'Not Awarded - Canceled' ||
        b.bid_status === 'Not Awarded - Low';
    });
    var decidedCount = awardedBids.length + notAwardedBids.length;
    kpi.winRate = decidedCount > 0 ? (awardedBids.length / decidedCount) * 100 : 0;
    kpi.winRateLabel = awardedBids.length + ' of ' + decidedCount + ' decided';

    // 4. Backlog: sum of (subcontract_value * (1 - work_pct_complete)) for active projects
    kpi.backlog = activeProjects.reduce(function (s, p) {
      var remaining = 1 - (p.work_pct_complete || 0);
      return s + ((p.subcontract_value || 0) * remaining);
    }, 0);

    // 5. Bids Outstanding: Submitted or Submitted - Edging
    var outstandingBids = bids.filter(function (b) {
      return b.bid_status === 'Submitted' || b.bid_status === 'Submitted - Edging';
    });
    kpi.bidsOutstanding = outstandingBids.length;
    var outstandingValue = outstandingBids.reduce(function (s, b) {
      return s + (b.bid_value || 0);
    }, 0);
    kpi.bidsOutstandingValue = outstandingValue;

    // 6. FY26 Progress: awarded + completed value / $6M
    var fy26Value = awardedBids.reduce(function (s, b) {
      return s + (b.bid_value || 0);
    }, 0);
    kpi.fy26Revenue = fy26Value;
    kpi.fy26Pct = (fy26Value / FY26_TARGET) * 100;

    // --- Financial KPIs ---

    // 7. Total Contract Value
    kpi.totalContractValue = projects.reduce(function (s, p) {
      return s + (p.subcontract_value || 0);
    }, 0);

    // 8. Total Billed (paid)
    kpi.totalBilled = projects.reduce(function (s, p) {
      return s + (p.paid || 0);
    }, 0);

    // 9. Total Unpaid (AR)
    kpi.totalUnpaid = projects.reduce(function (s, p) {
      return s + (p.unpaid || 0);
    }, 0);

    // 10. Retainage Held
    kpi.retainageHeld = projects.reduce(function (s, p) {
      return s + (p.retainage || 0);
    }, 0);

    // 11. Monthly Debt Service
    kpi.monthlyDebtService = MONTHLY_DEBT_SERVICE;

    // 12. Cash Needed (money owed to PF)
    kpi.cashNeeded = kpi.totalUnpaid + kpi.retainageHeld;

    // Store filtered lists for tables
    kpi.activeProjects = activeProjects.sort(function (a, b) {
      return (b.work_pct_complete || 0) - (a.work_pct_complete || 0);
    });

    kpi.recentBids = bids.slice().sort(function (a, b) {
      var da = a.invite_date || '';
      var db = b.invite_date || '';
      return db.localeCompare(da);
    }).slice(0, 8);

    // Alerts
    kpi.alerts = buildAlerts(kpi);

    return kpi;
  }

  // ---- BUILD ALERTS ----
  function buildAlerts(kpi) {
    var alerts = [];

    // Projects nearing completion (>80%)
    var nearComplete = projects.filter(function (p) {
      return p.work_pct_complete > 0.8 && p.work_pct_complete < 1.0;
    });
    nearComplete.forEach(function (p) {
      alerts.push({
        type: 'review',
        text: p.name + ' is ' + Math.round(p.work_pct_complete * 100) + '% complete -- closeout prep needed'
      });
    });

    // Bids needing follow up
    var followUp = bids.filter(function (b) {
      return b.bid_status === 'NEED FOLLOW UP';
    });
    followUp.forEach(function (b) {
      alerts.push({
        type: 'pending',
        text: b.name + ' (' + (b.gc_name || 'Unknown GC') + ') -- needs follow up'
      });
    });

    // Retainage > $50K
    if (kpi.retainageHeld > 50000) {
      alerts.push({
        type: 'active',
        text: 'Retainage held: ' + fmtCurrency(kpi.retainageHeld) + ' -- cash recovery opportunity'
      });
    }

    // FY26 pace check (behind 50% at midyear)
    if (kpi.fy26Pct < 50) {
      alerts.push({
        type: 'pending',
        text: 'FY26 at ' + fmtPct(kpi.fy26Pct) + ' of $6M target -- evaluate pipeline acceleration'
      });
    }

    return alerts;
  }

  // ---- RENDER ----
  function render() {
    var root = document.getElementById('mod-ceodash');
    if (!root) return;

    var kpi = computeKPIs();

    var html = '<div id="ceodash-app">';

    // ---- SYNC META ----
    var syncLabel = syncMeta.last_sync
      ? 'Last sync: ' + syncMeta.last_sync.replace('T', ' ').split('.')[0] + ' UTC'
      : 'No sync data';
    html += '<div style="text-align:right;opacity:0.5;font-size:12px;margin-bottom:12px">' + syncLabel + '</div>';

    // ==== OPERATIONS KPIs (Row 1) ====
    html += '<div class="card" style="margin-bottom:16px">';
    html += '<div class="card-header"><span class="card-title">Operations</span><span class="card-subtitle">Real-time field metrics</span></div>';
    html += '<div class="grid grid-3" style="padding:12px;gap:12px">';

    html += statCard('Active Projects', kpi.activeProjectCount, kpi.activeProjectCount + ' in progress');
    html += statCard('Pipeline Value', fmtShort(kpi.pipelineValue), pipelineBidsCount() + ' active bids');
    html += statCard('Win Rate', fmtPct(kpi.winRate), kpi.winRateLabel);

    html += '</div>';
    html += '<div class="grid grid-3" style="padding:0 12px 12px;gap:12px">';

    html += statCard('Backlog', fmtShort(kpi.backlog), 'Work remaining ($)');
    html += statCard('Bids Outstanding', kpi.bidsOutstanding, fmtShort(kpi.bidsOutstandingValue) + ' pending decision');

    // FY26 Progress with progress bar
    var fy26Pct = Math.min(kpi.fy26Pct, 100);
    var fy26Color = fy26Pct >= 50 ? 'green' : fy26Pct >= 30 ? 'amber' : 'red';
    html += '<div class="stat-card">';
    html += '<div class="stat-label">FY26 Progress</div>';
    html += '<div class="stat-value">' + fmtPct(kpi.fy26Pct) + '</div>';
    html += '<div class="progress-bar" style="height:6px;margin-top:4px"><div class="progress-fill ' + fy26Color + '" style="width:' + fy26Pct + '%"></div></div>';
    html += '<div class="stat-change">' + fmtShort(kpi.fy26Revenue) + ' of $6M</div>';
    html += '</div>';

    html += '</div></div>';

    // ==== FINANCIAL KPIs (Row 2) ====
    html += '<div class="card" style="margin-bottom:16px">';
    html += '<div class="card-header"><span class="card-title">Financial</span><span class="card-subtitle">Cash position and obligations</span></div>';
    html += '<div class="grid grid-3" style="padding:12px;gap:12px">';

    html += statCard('Total Contract Value', fmtShort(kpi.totalContractValue), projects.length + ' projects');
    html += statCard('Total Billed', fmtShort(kpi.totalBilled), 'Cash received');
    html += statCard('Unpaid AR', fmtShort(kpi.totalUnpaid), 'Money owed to PF');

    html += '</div>';
    html += '<div class="grid grid-3" style="padding:0 12px 12px;gap:12px">';

    html += statCard('Retainage Held', fmtShort(kpi.retainageHeld), 'Locked until closeout');
    html += statCard('Monthly Debt Service', fmtCurrency(kpi.monthlyDebtService), 'SBA loan @ 11%');
    html += statCard('Cash Needed', fmtShort(kpi.cashNeeded), 'AR + retainage to collect');

    html += '</div></div>';

    // ==== TWO SIDE-BY-SIDE CARDS ====
    html += '<div class="grid grid-2" style="gap:16px;margin-bottom:16px">';

    // ---- Left: Active Projects Table ----
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Active Projects</span><span class="card-subtitle">' + kpi.activeProjects.length + ' in progress</span></div>';
    html += '<div class="table-wrap">';
    html += '<table><thead><tr>';
    html += '<th>Project #</th><th>Name</th><th>GC</th><th>Value</th><th>% Complete</th><th>Status</th>';
    html += '</tr></thead><tbody>';

    if (kpi.activeProjects.length === 0) {
      html += '<tr><td colspan="6" style="text-align:center;opacity:0.5">No active projects</td></tr>';
    } else {
      kpi.activeProjects.forEach(function (p) {
        var pct = Math.round((p.work_pct_complete || 0) * 100);
        var pctColor = pct >= 80 ? 'green' : pct >= 40 ? 'amber' : '';
        html += '<tr>';
        html += '<td>' + (p.project_number || '--') + '</td>';
        html += '<td>' + (p.name || '--') + '</td>';
        html += '<td>' + truncate(p.gc_name, 20) + '</td>';
        html += '<td>' + fmtCurrency(p.subcontract_value) + '</td>';
        html += '<td>';
        html += '<div class="progress-bar" style="height:6px;margin-bottom:2px"><div class="progress-fill ' + pctColor + '" style="width:' + pct + '%"></div></div>';
        html += '<span style="font-size:11px">' + pct + '%</span>';
        html += '</td>';
        html += '<td><span class="badge-status ' + contractStatusBadge(p.contract_status) + '">' + (p.contract_status || '--') + '</span></td>';
        html += '</tr>';
      });
    }

    html += '</tbody></table></div></div>';

    // ---- Right: Recent Bid Activity ----
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Recent Bid Activity</span><span class="card-subtitle">Last 8 bids by invite date</span></div>';
    html += '<div class="table-wrap">';
    html += '<table><thead><tr>';
    html += '<th>Project</th><th>GC</th><th>Status</th><th>Value</th>';
    html += '</tr></thead><tbody>';

    if (kpi.recentBids.length === 0) {
      html += '<tr><td colspan="4" style="text-align:center;opacity:0.5">No bid data</td></tr>';
    } else {
      kpi.recentBids.forEach(function (b) {
        html += '<tr>';
        html += '<td>' + truncate(b.name, 28) + '</td>';
        html += '<td>' + truncate(b.gc_name, 18) + '</td>';
        html += '<td><span class="badge-status ' + statusBadgeClass(b.bid_status) + '">' + (b.bid_status || '--') + '</span></td>';
        html += '<td>' + fmtShort(b.bid_value) + '</td>';
        html += '</tr>';
      });
    }

    html += '</tbody></table></div></div>';

    html += '</div>'; // end grid-2

    // ==== ALERTS ====
    html += '<div class="card">';
    html += '<div class="card-header"><span class="card-title">Quick Alerts</span><span class="card-subtitle">' + kpi.alerts.length + ' items flagged</span></div>';

    if (kpi.alerts.length === 0) {
      html += '<div style="padding:16px;opacity:0.5;text-align:center">No alerts -- all clear</div>';
    } else {
      html += '<div style="padding:8px 12px">';
      kpi.alerts.forEach(function (a) {
        html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06)">';
        html += '<span class="badge-status ' + a.type + '" style="flex-shrink:0">' + alertLabel(a.type) + '</span>';
        html += '<span>' + a.text + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';

    html += '</div>'; // end #ceodash-app

    root.innerHTML = html;
  }

  // ---- MINOR HELPERS ----
  function pipelineBidsCount() {
    var pipelineStatuses = [
      'Will Bid', 'Submitted', 'Budget Pricing',
      'Submitted - Edging', 'New Lead', 'NEED FOLLOW UP'
    ];
    return bids.filter(function (b) {
      return pipelineStatuses.indexOf(b.bid_status) !== -1;
    }).length;
  }

  function truncate(str, max) {
    if (!str) return '--';
    return str.length > max ? str.substring(0, max - 1) + '\u2026' : str;
  }

  function contractStatusBadge(status) {
    if (!status) return 'pending';
    if (status.indexOf('FE') !== -1) return 'bid';
    if (status.indexOf('Pending') !== -1) return 'review';
    return 'active';
  }

  function alertLabel(type) {
    switch (type) {
      case 'review': return 'CLOSEOUT';
      case 'pending': return 'ACTION';
      case 'active': return 'CASH';
      default: return 'INFO';
    }
  }

  // ---- INIT ----
  render();

})();
