// ============================================================
// Estimating Module — Pier Foundations Operations Platform
// Renders into #mod-estimating > #estimating-app
// ============================================================

(function () {
  'use strict';

  // ---- RATE STRUCTURE (from POET Turnover Budget, $343,037 contract) ----

  var DEFAULTS = {
    // Key formulas
    lfPerDay: 1000,           // Working days = Total LF / 1,000
    tonsPerLF: 0.209,         // Stone consumption rate
    tonsPerCY: 1.805,         // Stone CY = tons / 1.805

    // Professional Services (5050-5053)
    garbinBaseFee: 28000,     // Garbin Engineering Base Fee (1 LS)
    garbinBidFee: 5040,       // Garbin Bidding Fee (1 LS)
    surveyPerColumn: 8.50,    // Surveying & Staking (MLS, $8-9/col avg)

    // Materials (5110)
    stonePerTon: 18.19,       // Stone $/ton
    truckingPerTon: 5.885,    // Trucking $/ton

    // Testing (5190)
    modulusTestQty: 3,        // Number of modulus tests
    modulusTestRate: 1500,    // $/test

    // Labor (5220)
    operatorLeadRate: 1000,   // Operator #1 Lead $/day
    operator2Rate: 650,       // Operator #2 $/day
    operator3Rate: 650,       // Operator #3 $/day
    tripsHomePer6Days: 1,     // 1 trip home per 6 working days
    travelTripCost: 2300,     // $/trip
    laborBurdenPct: 0.18,     // 18% burden
    hotelPerNight: 165,        // $/night
    mealsPerDay: 50,          // $/day
    crewSize: 3,              // 3 crew members for hotel/meals
    mileageDistance: 750,     // miles round trip
    mileageRate: 0.70,        // $/mile

    // Equipment (5400-5430)
    mobVSCPerTrip: 2310,      // Mob VSC Rig $/trip
    mobPredrillPerTrip: 1685, // Mob Predrill $/trip
    mobFallOffPerTrip: 1225,  // Mob Fall Off $/trip
    mobTrips: 6,              // Number of mob trips
    mobMiscQty: 3,            // Misc mob items
    mobMiscRate: 1500,        // $/ea
    vscRigDaily: 500,         // VSC Rig $/day
    cat308Daily: 250,         // CAT 308 $/day
    trailerToolingDaily: 68,  // Trailer & Tooling $/day
    loaderWeeklyRate: 1423,   // Rental 299 loader $/week each
    loaderCount: 2,           // Number of loaders
    maintenanceHrsPerDay: 1,  // Maintenance hours per working day
    maintenanceRate: 100,     // $/hr
    fuelVSCDaily: 275,        // Fuel VSC $/day
    fuelCAT308Daily: 275,     // Fuel CAT 308 $/day
    fuelLoaderDaily: 80,      // Fuel Loader $/day

    // Markups
    overheadPct: 0.0542,      // OH (GC+GR): 5.42%
    insuranceFlat: 7200,      // Insurance flat fee
    commissionPct: 0.0265,    // Commissions: 2.65%
    contingencyPct: 0.0201,   // Contingency: 2.01%
    profitPct: 0.04           // Profit: 4.00%
  };

  // POET reference budget vs actual data
  var POET_BUDGET = {
    projectName: 'POET Shelbyville',
    contractValue: 343037,
    categories: [
      { code: '5010-5030', name: 'Gen Conditions', budget: 23937, actual: 2609 },
      { code: '5050-5053', name: 'Prof Services', budget: 49825, actual: 38534 },
      { code: '5110-5190', name: 'Materials & Testing', budget: 90463, actual: 24406 },
      { code: '5220',      name: 'Labor', budget: 70187, actual: 15769 },
      { code: '5400-5430', name: 'Equipment', budget: 77068, actual: 24177 },
      { code: '5500',      name: 'Incentives', budget: 17823, actual: 0 },
      { code: '5900',      name: 'Profit', budget: 13735, actual: 0 }
    ]
  };

  // ---- STATE ----
  var activeTab = 'builder';
  var estimate = null; // Will hold computed estimate

  // ---- HELPERS ----
  function fmt(n) {
    if (n === undefined || n === null || isNaN(n)) return '$0.00';
    return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function fmtK(n) {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    return fmt(n);
  }

  function fmtInt(n) {
    return n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function pct(n) {
    return (n * 100).toFixed(2) + '%';
  }

  function formGroup(label, input) {
    return '<div class="form-group">' +
      '<label class="form-label">' + label + '</label>' +
      input +
    '</div>';
  }

  function statCard(label, value, note) {
    return '<div class="stat-card">' +
      '<div class="stat-label">' + label + '</div>' +
      '<div class="stat-value" style="font-size:1.25rem">' + value + '</div>' +
      (note ? '<div class="stat-change" style="color:var(--text-3)">' + note + '</div>' : '') +
    '</div>';
  }

  // ---- COMPUTE ESTIMATE ----
  function computeEstimate(params) {
    var totalLF = params.totalLF || 0;
    var totalColumns = params.totalColumns || 0;
    var diameter = params.diameter || 24;

    // Derived quantities
    var workingDays = Math.ceil(totalLF / DEFAULTS.lfPerDay);
    var stoneTons = totalLF * DEFAULTS.tonsPerLF;
    var stoneCY = stoneTons / DEFAULTS.tonsPerCY;
    var travelTrips = Math.ceil(workingDays / 6) * DEFAULTS.tripsHomePer6Days;
    var hotelNights = workingDays * DEFAULTS.crewSize;
    var mealDays = workingDays * DEFAULTS.crewSize;
    var loaderWeeks = Math.ceil(workingDays / 5);

    // Use custom rates if provided, otherwise defaults
    var rates = Object.assign({}, DEFAULTS, params.rates || {});

    // ----- Professional Services (5050-5053) -----
    var profServices = {
      label: 'Professional Services',
      code: '5050-5053',
      items: [
        { desc: 'Garbin Engineering Base Fee', qty: 1, unit: 'LS', rate: rates.garbinBaseFee, total: rates.garbinBaseFee },
        { desc: 'Garbin Bidding Fee', qty: 1, unit: 'LS', rate: rates.garbinBidFee, total: rates.garbinBidFee },
        { desc: 'Surveying & Staking (MLS)', qty: totalColumns, unit: 'COL', rate: rates.surveyPerColumn, total: totalColumns * rates.surveyPerColumn }
      ]
    };
    profServices.subtotal = profServices.items.reduce(function (s, i) { return s + i.total; }, 0);

    // ----- Materials (5110) -----
    var materials = {
      label: 'Materials',
      code: '5110',
      items: [
        { desc: 'Stone (#57 washed)', qty: stoneTons, unit: 'TN', rate: rates.stonePerTon, total: stoneTons * rates.stonePerTon },
        { desc: 'Trucking', qty: stoneTons, unit: 'TN', rate: rates.truckingPerTon, total: stoneTons * rates.truckingPerTon }
      ]
    };
    materials.subtotal = materials.items.reduce(function (s, i) { return s + i.total; }, 0);

    // ----- Testing (5190) -----
    var testing = {
      label: 'Testing',
      code: '5190',
      items: [
        { desc: 'Modulus Test', qty: rates.modulusTestQty, unit: 'EA', rate: rates.modulusTestRate, total: rates.modulusTestQty * rates.modulusTestRate }
      ]
    };
    testing.subtotal = testing.items.reduce(function (s, i) { return s + i.total; }, 0);

    // ----- Labor (5220) -----
    var rawLaborCost = (rates.operatorLeadRate + rates.operator2Rate + rates.operator3Rate) * workingDays;
    var travelCost = travelTrips * rates.travelTripCost;
    var burdenCost = rawLaborCost * rates.laborBurdenPct;
    var hotelCost = hotelNights * rates.hotelPerNight;
    var mealCost = mealDays * rates.mealsPerDay;
    var mileageCost = rates.mileageDistance * rates.mileageRate;

    var labor = {
      label: 'Labor',
      code: '5220',
      items: [
        { desc: 'Operator #1 Lead', qty: workingDays, unit: 'DAY', rate: rates.operatorLeadRate, total: workingDays * rates.operatorLeadRate },
        { desc: 'Operator #2', qty: workingDays, unit: 'DAY', rate: rates.operator2Rate, total: workingDays * rates.operator2Rate },
        { desc: 'Operator #3', qty: workingDays, unit: 'DAY', rate: rates.operator3Rate, total: workingDays * rates.operator3Rate },
        { desc: 'Travel Days', qty: travelTrips, unit: 'TRIP', rate: rates.travelTripCost, total: travelCost },
        { desc: 'Labor Burden (18%)', qty: 1, unit: 'LS', rate: burdenCost, total: burdenCost },
        { desc: 'Hotel', qty: hotelNights, unit: 'NIGHT', rate: rates.hotelPerNight, total: hotelCost },
        { desc: 'Meals', qty: mealDays, unit: 'DAY', rate: rates.mealsPerDay, total: mealCost },
        { desc: 'Mileage', qty: rates.mileageDistance, unit: 'MI', rate: rates.mileageRate, total: mileageCost }
      ]
    };
    labor.subtotal = labor.items.reduce(function (s, i) { return s + i.total; }, 0);

    // ----- Equipment (5400-5430) -----
    var equipment = {
      label: 'Equipment',
      code: '5400-5430',
      items: [
        { desc: 'Mob VSC Rig', qty: rates.mobTrips, unit: 'TRIP', rate: rates.mobVSCPerTrip, total: rates.mobTrips * rates.mobVSCPerTrip },
        { desc: 'Mob Predrill', qty: rates.mobTrips, unit: 'TRIP', rate: rates.mobPredrillPerTrip, total: rates.mobTrips * rates.mobPredrillPerTrip },
        { desc: 'Mob Fall Off', qty: rates.mobTrips, unit: 'TRIP', rate: rates.mobFallOffPerTrip, total: rates.mobTrips * rates.mobFallOffPerTrip },
        { desc: 'Mob Misc', qty: rates.mobMiscQty, unit: 'EA', rate: rates.mobMiscRate, total: rates.mobMiscQty * rates.mobMiscRate },
        { desc: 'VSC Rig Daily', qty: workingDays, unit: 'DAY', rate: rates.vscRigDaily, total: workingDays * rates.vscRigDaily },
        { desc: 'CAT 308', qty: workingDays, unit: 'DAY', rate: rates.cat308Daily, total: workingDays * rates.cat308Daily },
        { desc: 'Trailer & Tooling', qty: workingDays, unit: 'DAY', rate: rates.trailerToolingDaily, total: workingDays * rates.trailerToolingDaily },
        { desc: 'Rental 299 Loaders (x' + rates.loaderCount + ')', qty: loaderWeeks, unit: 'WK', rate: rates.loaderWeeklyRate * rates.loaderCount, total: loaderWeeks * rates.loaderWeeklyRate * rates.loaderCount },
        { desc: 'Maintenance', qty: workingDays * rates.maintenanceHrsPerDay, unit: 'HR', rate: rates.maintenanceRate, total: workingDays * rates.maintenanceHrsPerDay * rates.maintenanceRate },
        { desc: 'Fuel VSC Rig', qty: workingDays, unit: 'DAY', rate: rates.fuelVSCDaily, total: workingDays * rates.fuelVSCDaily },
        { desc: 'Fuel CAT 308', qty: workingDays, unit: 'DAY', rate: rates.fuelCAT308Daily, total: workingDays * rates.fuelCAT308Daily },
        { desc: 'Fuel Loader', qty: workingDays, unit: 'DAY', rate: rates.fuelLoaderDaily, total: workingDays * rates.fuelLoaderDaily }
      ]
    };
    equipment.subtotal = equipment.items.reduce(function (s, i) { return s + i.total; }, 0);

    // ----- Construction Costs Subtotal -----
    var constructionCost = profServices.subtotal + materials.subtotal + testing.subtotal + labor.subtotal + equipment.subtotal;

    // ----- Markups -----
    var overhead = constructionCost * rates.overheadPct;
    var insurance = rates.insuranceFlat;
    var commissions = constructionCost * rates.commissionPct;
    var contingency = constructionCost * rates.contingencyPct;
    var profit = constructionCost * rates.profitPct;
    var totalMarkups = overhead + insurance + commissions + contingency + profit;
    var markupFactor = constructionCost > 0 ? (constructionCost + totalMarkups) / constructionCost : 0;

    var projectTotal = constructionCost + totalMarkups;

    // Key ratios
    var perLF = totalLF > 0 ? projectTotal / totalLF : 0;
    var perColumn = totalColumns > 0 ? projectTotal / totalColumns : 0;
    var perDay = workingDays > 0 ? projectTotal / workingDays : 0;

    return {
      params: params,
      workingDays: workingDays,
      stoneTons: stoneTons,
      stoneCY: stoneCY,
      travelTrips: travelTrips,
      categories: [profServices, materials, testing, labor, equipment],
      constructionCost: constructionCost,
      markups: {
        overhead: { label: 'OH (GC+GR)', pct: rates.overheadPct, amount: overhead },
        insurance: { label: 'Insurance', pct: null, amount: insurance },
        commissions: { label: 'Commissions', pct: rates.commissionPct, amount: commissions },
        contingency: { label: 'Contingency', pct: rates.contingencyPct, amount: contingency },
        profit: { label: 'Profit', pct: rates.profitPct, amount: profit }
      },
      totalMarkups: totalMarkups,
      markupFactor: markupFactor,
      projectTotal: projectTotal,
      ratios: {
        perLF: perLF,
        perColumn: perColumn,
        perDay: perDay
      }
    };
  }

  // ---- RENDER ----
  function render() {
    var app = document.getElementById('estimating-app');
    if (!app) return;

    var html = '';

    // Tabs
    html += '<div class="tabs">';
    html += '<div class="tab' + (activeTab === 'builder' ? ' active' : '') + '" data-est-tab="builder">Estimate Builder</div>';
    html += '<div class="tab' + (activeTab === 'tracker' ? ' active' : '') + '" data-est-tab="tracker">Budget vs Actual</div>';
    html += '<div class="tab' + (activeTab === 'template' ? ' active' : '') + '" data-est-tab="template">POET Template</div>';
    html += '</div>';

    if (activeTab === 'builder') {
      html += renderBuilder();
    } else if (activeTab === 'tracker') {
      html += renderTracker();
    } else if (activeTab === 'template') {
      html += renderTemplate();
    }

    app.innerHTML = html;
    attachEvents();
  }

  // ---- ESTIMATE BUILDER TAB ----
  function renderBuilder() {
    var html = '';

    // Input form
    html += '<div class="card">';
    html += '<div class="card-header">';
    html += '<span class="card-title">Project Parameters</span>';
    html += '<span class="card-subtitle">Enter project quantities to auto-calculate estimate</span>';
    html += '</div>';

    html += '<div class="grid grid-4">';
    html += formGroup('Total Linear Feet', '<input type="number" class="form-input" id="estLF" placeholder="e.g. 17,073" min="0" value="' + (estimate ? estimate.params.totalLF : '') + '">');
    html += formGroup('Total Columns', '<input type="number" class="form-input" id="estColumns" placeholder="e.g. 1,975" min="0" value="' + (estimate ? estimate.params.totalColumns : '') + '">');
    html += formGroup('Column Diameter', '<select class="form-select" id="estDiameter"><option value="24"' + (estimate && estimate.params.diameter === 24 ? ' selected' : '') + '>24"</option><option value="30"' + (estimate && estimate.params.diameter === 30 ? ' selected' : '') + '>30"</option></select>');
    html += formGroup('&nbsp;', '<button class="btn btn-primary" id="estCalcBtn" style="margin-top:2px;width:100%">Build Estimate</button>');
    html += '</div>';

    html += '</div>';

    // If estimate exists, show results
    if (estimate) {
      html += renderEstimateResults(estimate);
    }

    return html;
  }

  function renderEstimateResults(est) {
    var html = '';

    // Summary stat cards
    html += '<div class="grid grid-4" style="margin-top:4px">';
    html += statCard('Project Total', fmtK(est.projectTotal), 'Markup Factor: ' + est.markupFactor.toFixed(4) + 'x');
    html += statCard('Construction Costs', fmtK(est.constructionCost), 'Before markups');
    html += statCard('Working Days', fmtInt(est.workingDays), fmtInt(est.params.totalLF) + ' LF / 1,000 LF/day');
    html += statCard('Stone Required', fmtInt(est.stoneTons) + ' TN', fmtInt(est.stoneCY) + ' CY');
    html += '</div>';

    // Key ratios
    html += '<div class="grid grid-4" style="margin-top:4px;margin-bottom:16px">';
    html += statCard('$/LF', fmt(est.ratios.perLF), 'Per linear foot');
    html += statCard('$/Column', fmt(est.ratios.perColumn), 'Per column installed');
    html += statCard('$/Day', fmtK(est.ratios.perDay), 'Per working day');
    html += statCard('OH & Markups', fmtK(est.totalMarkups), pct(est.totalMarkups / est.constructionCost) + ' on construction');
    html += '</div>';

    // Cost breakdown by category
    est.categories.forEach(function (cat) {
      html += '<div class="card">';
      html += '<div class="card-header">';
      html += '<span class="card-title">' + cat.label + ' (' + cat.code + ')</span>';
      html += '<span class="card-subtitle" style="font-weight:600;color:var(--text-0)">' + fmt(cat.subtotal) + '</span>';
      html += '</div>';
      html += '<div class="table-wrap">';
      html += '<table>';
      html += '<thead><tr><th>Description</th><th style="text-align:right">Qty</th><th>Unit</th><th style="text-align:right">Rate</th><th style="text-align:right">Total</th></tr></thead>';
      html += '<tbody>';
      cat.items.forEach(function (item) {
        var qtyStr = typeof item.qty === 'number' ? (item.qty % 1 === 0 ? fmtInt(item.qty) : item.qty.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')) : item.qty;
        html += '<tr>';
        html += '<td>' + item.desc + '</td>';
        html += '<td style="text-align:right">' + qtyStr + '</td>';
        html += '<td>' + item.unit + '</td>';
        html += '<td style="text-align:right">' + fmt(item.rate) + '</td>';
        html += '<td style="text-align:right;font-weight:500">' + fmt(item.total) + '</td>';
        html += '</tr>';
      });
      html += '</tbody>';
      html += '</table>';
      html += '</div>';
      html += '</div>';
    });

    // Markups table
    html += '<div class="card">';
    html += '<div class="card-header">';
    html += '<span class="card-title">OH & Markups</span>';
    html += '<span class="card-subtitle" style="font-weight:600;color:var(--text-0)">' + fmt(est.totalMarkups) + '</span>';
    html += '</div>';
    html += '<div class="table-wrap">';
    html += '<table>';
    html += '<thead><tr><th>Markup</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>';
    html += '<tbody>';
    var markupKeys = ['overhead', 'insurance', 'commissions', 'contingency', 'profit'];
    markupKeys.forEach(function (key) {
      var m = est.markups[key];
      html += '<tr>';
      html += '<td>' + m.label + '</td>';
      html += '<td style="text-align:right">' + (m.pct !== null ? pct(m.pct) : 'Flat') + '</td>';
      html += '<td style="text-align:right;font-weight:500">' + fmt(m.amount) + '</td>';
      html += '</tr>';
    });
    html += '<tr style="font-weight:700;border-top:2px solid var(--border)">';
    html += '<td>Construction Costs</td>';
    html += '<td></td>';
    html += '<td style="text-align:right">' + fmt(est.constructionCost) + '</td>';
    html += '</tr>';
    html += '<tr style="font-weight:700">';
    html += '<td>Markups Total</td>';
    html += '<td style="text-align:right">Factor: ' + est.markupFactor.toFixed(4) + 'x</td>';
    html += '<td style="text-align:right">' + fmt(est.totalMarkups) + '</td>';
    html += '</tr>';
    html += '<tr style="font-weight:700;color:var(--accent);font-size:1rem">';
    html += '<td>Project Total</td>';
    html += '<td></td>';
    html += '<td style="text-align:right">' + fmt(est.projectTotal) + '</td>';
    html += '</tr>';
    html += '</tbody>';
    html += '</table>';
    html += '</div>';
    html += '</div>';

    return html;
  }

  // ---- BUDGET VS ACTUAL TRACKER TAB ----
  function renderTracker() {
    var html = '';
    var poet = POET_BUDGET;
    var totalBudget = poet.categories.reduce(function (s, c) { return s + c.budget; }, 0);
    var totalActual = poet.categories.reduce(function (s, c) { return s + c.actual; }, 0);
    var totalRemaining = totalBudget - totalActual;
    var burnPct = totalBudget > 0 ? totalActual / totalBudget : 0;

    // Summary cards
    html += '<div class="grid grid-4" style="margin-bottom:16px">';
    html += statCard('Contract Value', fmtK(poet.contractValue), poet.projectName);
    html += statCard('Total Budget', fmtK(totalBudget), 'Sum of all cost codes');
    html += statCard('Actual to Date', fmtK(totalActual), pct(burnPct) + ' spent');
    html += statCard('Remaining', fmtK(totalRemaining), 'Available budget');
    html += '</div>';

    // Overall burn progress
    html += '<div class="card">';
    html += '<div class="card-header">';
    html += '<span class="card-title">Overall Budget Burn — ' + poet.projectName + '</span>';
    html += '<span class="card-subtitle">Budget: ' + fmt(totalBudget) + ' | Actual: ' + fmt(totalActual) + ' | Remaining: ' + fmt(totalRemaining) + '</span>';
    html += '</div>';

    html += '<div style="margin-bottom:20px">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">';
    html += '<span style="font-size:0.78rem;font-weight:500;color:var(--text-1)">Overall Progress</span>';
    html += '<span style="font-size:0.78rem;font-weight:600;color:var(--text-0)">' + (burnPct * 100).toFixed(1) + '%</span>';
    html += '</div>';
    var burnColor = burnPct > 0.9 ? 'red' : burnPct > 0.7 ? 'amber' : 'green';
    html += '<div class="progress-bar" style="height:10px">';
    html += '<div class="progress-fill ' + burnColor + '" style="width:' + (burnPct * 100).toFixed(1) + '%"></div>';
    html += '</div>';
    html += '</div>';

    // Category breakdown table
    html += '<div class="table-wrap">';
    html += '<table>';
    html += '<thead><tr><th>Cost Code</th><th>Category</th><th style="text-align:right">Budget</th><th style="text-align:right">Actual</th><th style="text-align:right">Variance</th><th style="text-align:right">% Spent</th><th style="width:140px">Progress</th></tr></thead>';
    html += '<tbody>';

    poet.categories.forEach(function (cat) {
      var variance = cat.budget - cat.actual;
      var spent = cat.budget > 0 ? cat.actual / cat.budget : 0;
      var varClass = variance >= 0 ? 'color:var(--green)' : 'color:var(--red)';
      var barColor = spent > 0.9 ? 'red' : spent > 0.7 ? 'amber' : 'green';

      html += '<tr>';
      html += '<td style="font-family:monospace;font-size:0.78rem;color:var(--text-3)">' + cat.code + '</td>';
      html += '<td style="font-weight:500">' + cat.name + '</td>';
      html += '<td style="text-align:right">' + fmt(cat.budget) + '</td>';
      html += '<td style="text-align:right">' + fmt(cat.actual) + '</td>';
      html += '<td style="text-align:right;' + varClass + ';font-weight:500">' + (variance >= 0 ? '+' : '') + fmt(variance) + '</td>';
      html += '<td style="text-align:right;font-weight:600">' + (spent * 100).toFixed(1) + '%</td>';
      html += '<td>';
      html += '<div class="progress-bar">';
      html += '<div class="progress-fill ' + barColor + '" style="width:' + Math.min(spent * 100, 100).toFixed(1) + '%"></div>';
      html += '</div>';
      html += '</td>';
      html += '</tr>';
    });

    // Totals row
    html += '<tr style="font-weight:700;border-top:2px solid var(--border)">';
    html += '<td></td>';
    html += '<td>Total</td>';
    html += '<td style="text-align:right">' + fmt(totalBudget) + '</td>';
    html += '<td style="text-align:right">' + fmt(totalActual) + '</td>';
    html += '<td style="text-align:right;color:var(--green)">' + fmt(totalRemaining) + '</td>';
    html += '<td style="text-align:right">' + (burnPct * 100).toFixed(1) + '%</td>';
    html += '<td></td>';
    html += '</tr>';

    html += '</tbody>';
    html += '</table>';
    html += '</div>';
    html += '</div>';

    return html;
  }

  // ---- POET TEMPLATE TAB ----
  function renderTemplate() {
    var html = '';

    // Pre-compute POET reference
    var poetEst = computeEstimate({ totalLF: 17073, totalColumns: 1975, diameter: 24 });

    html += '<div class="card">';
    html += '<div class="card-header">';
    html += '<span class="card-title">POET Reference Estimate</span>';
    html += '<span class="card-subtitle">17,073 LF | 1,975 Columns | 24" Diameter | Contract: $343,037</span>';
    html += '</div>';

    html += '<p style="font-size:0.82rem;color:var(--text-2);margin-bottom:16px">This is the reference template based on the POET Turnover Budget. Adjust the parameters below to create a new estimate using the same rate structure.</p>';

    // Quick-adjust form
    html += '<div style="background:var(--bg-1);border-radius:var(--radius);padding:16px;margin-bottom:16px">';
    html += '<div style="font-size:0.78rem;font-weight:600;color:var(--text-0);margin-bottom:12px">Quick Adjust — Create New Estimate from Template</div>';
    html += '<div class="grid grid-4">';
    html += formGroup('Total LF', '<input type="number" class="form-input" id="tmplLF" placeholder="17,073" min="0">');
    html += formGroup('Total Columns', '<input type="number" class="form-input" id="tmplColumns" placeholder="1,975" min="0">');
    html += formGroup('Stone $/TN', '<input type="number" class="form-input" id="tmplStone" placeholder="18.19" min="0" step="0.01" value="18.19">');
    html += formGroup('&nbsp;', '<button class="btn btn-primary" id="tmplCalcBtn" style="margin-top:2px;width:100%">Generate Estimate</button>');
    html += '</div>';
    html += '<div class="grid grid-3" style="margin-top:4px">';
    html += formGroup('Trucking $/TN', '<input type="number" class="form-input" id="tmplTrucking" placeholder="5.885" min="0" step="0.001" value="5.885">');
    html += formGroup('Hotel $/Night', '<input type="number" class="form-input" id="tmplHotel" placeholder="165" min="0" step="1" value="165">');
    html += formGroup('Profit %', '<input type="number" class="form-input" id="tmplProfit" placeholder="4.00" min="0" step="0.01" value="4.00">');
    html += '</div>';
    html += '</div>';

    // Template results target
    html += '<div id="tmplResult"></div>';

    html += '</div>';

    // Show POET estimate breakdown
    html += '<div style="margin-top:4px">';
    html += renderEstimateResults(poetEst);
    html += '</div>';

    return html;
  }

  // ---- EVENTS ----
  function attachEvents() {
    var app = document.getElementById('estimating-app');
    if (!app) return;

    // Tab switching
    app.querySelectorAll('[data-est-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        activeTab = this.getAttribute('data-est-tab');
        render();
      });
    });

    // Estimate Builder button
    var calcBtn = document.getElementById('estCalcBtn');
    if (calcBtn) {
      calcBtn.addEventListener('click', function () {
        var lf = parseFloat(document.getElementById('estLF').value);
        var cols = parseFloat(document.getElementById('estColumns').value);
        var diam = parseInt(document.getElementById('estDiameter').value, 10);
        if (lf > 0 && cols > 0) {
          estimate = computeEstimate({ totalLF: lf, totalColumns: cols, diameter: diam });
          render();
        }
      });
    }

    // Template quick-adjust button
    var tmplBtn = document.getElementById('tmplCalcBtn');
    if (tmplBtn) {
      tmplBtn.addEventListener('click', function () {
        var lf = parseFloat(document.getElementById('tmplLF').value);
        var cols = parseFloat(document.getElementById('tmplColumns').value);
        var stoneRate = parseFloat(document.getElementById('tmplStone').value);
        var truckRate = parseFloat(document.getElementById('tmplTrucking').value);
        var hotelRate = parseFloat(document.getElementById('tmplHotel').value);
        var profitRate = parseFloat(document.getElementById('tmplProfit').value);

        if (lf > 0 && cols > 0) {
          var customRates = {};
          if (!isNaN(stoneRate)) customRates.stonePerTon = stoneRate;
          if (!isNaN(truckRate)) customRates.truckingPerTon = truckRate;
          if (!isNaN(hotelRate)) customRates.hotelPerNight = hotelRate;
          if (!isNaN(profitRate)) customRates.profitPct = profitRate / 100;

          var tmplEst = computeEstimate({ totalLF: lf, totalColumns: cols, diameter: 24, rates: customRates });

          var result = document.getElementById('tmplResult');
          if (result) {
            // Show comparison summary
            var poetTotal = 343037;
            var diff = tmplEst.projectTotal - poetTotal;
            var diffPct = diff / poetTotal;

            var compHtml = '<div class="grid grid-3" style="margin-bottom:8px">';
            compHtml += statCard('New Estimate', fmtK(tmplEst.projectTotal), fmtInt(lf) + ' LF | ' + fmtInt(cols) + ' columns');
            compHtml += statCard('POET Reference', fmtK(poetTotal), '17,073 LF | 1,975 columns');
            compHtml += statCard('Difference', (diff >= 0 ? '+' : '') + fmtK(diff), (diffPct >= 0 ? '+' : '') + (diffPct * 100).toFixed(1) + '% vs POET');
            compHtml += '</div>';

            compHtml += renderEstimateResults(tmplEst);
            result.innerHTML = compHtml;
          }
        }
      });
    }

    // Enter key support
    ['estLF', 'estColumns', 'tmplLF', 'tmplColumns', 'tmplStone', 'tmplTrucking', 'tmplHotel', 'tmplProfit'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            // Find the nearest calc button
            var btn = this.closest('.card, [style*="background"]').querySelector('.btn-primary');
            if (btn) btn.click();
          }
        });
      }
    });
  }

  // ---- INIT ----
  function init() {
    var container = document.getElementById('estimating-app');
    if (!container) return;
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
