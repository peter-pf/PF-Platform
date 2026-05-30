// ---- MODULUS TESTING MODULE ----
// Renders into #mod-modulus > #modulus-app
(function() {
  'use strict';

  // ---- SAMPLE TEST DATA ----
  const TESTS = [
    {
      id: 'MT-001',
      job: 'POET',
      jobNumber: '26-002',
      location: 'Shelbyville, IN',
      pier: 'Tp01',
      date: '2026-05-07',
      testedBy: 'John Willis',
      apLength: 10,
      apDiameter: 2.5,
      diameterInches: 30,
      designModulus: 150,
      designLoad: 86,
      maxTestLoad: 129,
      jackType: 'small',
      jackCalFactor: 49.84,
      measuredModulus: 419.53,
      ratio: 2.80,
      pass: true,
      loading: [
        { pct: 5,   load: 4.3,   gagePressure: 214.3,  deflection: 0.000, stress: 6.08 },
        { pct: 10,  load: 8.6,   gagePressure: 428.6,  deflection: 0.010, stress: 12.17 },
        { pct: 25,  load: 21.5,  gagePressure: 1071.6, deflection: 0.062, stress: 30.42 },
        { pct: 50,  load: 43.0,  gagePressure: 2143.1, deflection: 0.120, stress: 60.83 },
        { pct: 75,  load: 64.5,  gagePressure: 3214.7, deflection: 0.207, stress: 91.25 },
        { pct: 100, load: 86.0,  gagePressure: 4286.2, deflection: 0.290, stress: 121.67 },
        { pct: 125, load: 107.5, gagePressure: 5357.8, deflection: 0.459, stress: 152.08 },
        { pct: 150, load: 129.0, gagePressure: 6429.4, deflection: 0.656, stress: 182.50 }
      ],
      unloading: [
        { pct: 125, load: 107.5, deflection: 0.591 },
        { pct: 100, load: 86.0,  deflection: 0.481 },
        { pct: 75,  load: 64.5,  deflection: 0.358 },
        { pct: 50,  load: 43.0,  deflection: 0.211 },
        { pct: 25,  load: 21.5,  deflection: 0.163 },
        { pct: 10,  load: 8.6,   deflection: 0.119 },
        { pct: 0,   load: 0.0,   deflection: 0.088 }
      ]
    },
    {
      id: 'MT-002',
      job: 'FedEx Hub',
      jobNumber: '26-005',
      location: 'Indianapolis, IN',
      pier: 'Tp03',
      date: '2026-05-12',
      testedBy: 'John Willis',
      apLength: 12,
      apDiameter: 2.0,
      diameterInches: 24,
      designModulus: 120,
      designLoad: 64,
      maxTestLoad: 96,
      jackType: 'small',
      jackCalFactor: 49.84,
      measuredModulus: 298.40,
      ratio: 2.49,
      pass: true,
      loading: [
        { pct: 5,   load: 3.2,  gagePressure: 159.5, deflection: 0.000, stress: 7.19 },
        { pct: 10,  load: 6.4,  gagePressure: 319.0, deflection: 0.008, stress: 14.38 },
        { pct: 25,  load: 16.0, gagePressure: 797.4, deflection: 0.048, stress: 35.95 },
        { pct: 50,  load: 32.0, gagePressure: 1594.9,deflection: 0.098, stress: 71.90 },
        { pct: 75,  load: 48.0, gagePressure: 2392.3,deflection: 0.165, stress: 107.86 },
        { pct: 100, load: 64.0, gagePressure: 3189.8,deflection: 0.230, stress: 143.81 },
        { pct: 125, load: 80.0, gagePressure: 3987.2,deflection: 0.365, stress: 179.76 },
        { pct: 150, load: 96.0, gagePressure: 4784.6,deflection: 0.520, stress: 215.71 }
      ],
      unloading: [
        { pct: 125, load: 80.0, deflection: 0.468 },
        { pct: 100, load: 64.0, deflection: 0.380 },
        { pct: 75,  load: 48.0, deflection: 0.282 },
        { pct: 50,  load: 32.0, deflection: 0.165 },
        { pct: 25,  load: 16.0, deflection: 0.125 },
        { pct: 10,  load: 6.4,  deflection: 0.092 },
        { pct: 0,   load: 0.0,  deflection: 0.070 }
      ]
    },
    {
      id: 'MT-003',
      job: 'Amazon Whitestown',
      jobNumber: '26-008',
      location: 'Whitestown, IN',
      pier: 'Tp02',
      date: '2026-05-18',
      testedBy: 'Derek Miller',
      apLength: 14,
      apDiameter: 2.5,
      diameterInches: 30,
      designModulus: 200,
      designLoad: 110,
      maxTestLoad: 165,
      jackType: 'small',
      jackCalFactor: 49.84,
      measuredModulus: 512.70,
      ratio: 2.56,
      pass: true,
      loading: [
        { pct: 5,   load: 5.5,   gagePressure: 274.1,  deflection: 0.000, stress: 7.78 },
        { pct: 10,  load: 11.0,  gagePressure: 548.2,  deflection: 0.012, stress: 15.56 },
        { pct: 25,  load: 27.5,  gagePressure: 1370.6, deflection: 0.058, stress: 38.90 },
        { pct: 50,  load: 55.0,  gagePressure: 2741.2, deflection: 0.108, stress: 77.80 },
        { pct: 75,  load: 82.5,  gagePressure: 4111.8, deflection: 0.185, stress: 116.70 },
        { pct: 100, load: 110.0, gagePressure: 5482.4, deflection: 0.258, stress: 155.60 },
        { pct: 125, load: 137.5, gagePressure: 6853.0, deflection: 0.405, stress: 194.50 },
        { pct: 150, load: 165.0, gagePressure: 8223.6, deflection: 0.580, stress: 233.40 }
      ],
      unloading: [
        { pct: 125, load: 137.5, deflection: 0.522 },
        { pct: 100, load: 110.0, deflection: 0.425 },
        { pct: 75,  load: 82.5,  deflection: 0.315 },
        { pct: 50,  load: 55.0,  deflection: 0.188 },
        { pct: 25,  load: 27.5,  deflection: 0.140 },
        { pct: 10,  load: 11.0,  deflection: 0.100 },
        { pct: 0,   load: 0.0,   deflection: 0.072 }
      ]
    },
    {
      id: 'MT-004',
      job: 'Google Fort Wayne',
      jobNumber: '26-010',
      location: 'Fort Wayne, IN',
      pier: 'Tp01',
      date: '2026-05-22',
      testedBy: 'John Willis',
      apLength: 16,
      apDiameter: 2.5,
      diameterInches: 30,
      designModulus: 180,
      designLoad: 95,
      maxTestLoad: 142.5,
      jackType: 'small',
      jackCalFactor: 49.84,
      measuredModulus: 152.10,
      ratio: 0.85,
      pass: false,
      loading: [
        { pct: 5,   load: 4.75,  gagePressure: 236.7,  deflection: 0.000, stress: 6.72 },
        { pct: 10,  load: 9.5,   gagePressure: 473.5,  deflection: 0.018, stress: 13.44 },
        { pct: 25,  load: 23.75, gagePressure: 1183.7, deflection: 0.085, stress: 33.60 },
        { pct: 50,  load: 47.5,  gagePressure: 2367.4, deflection: 0.192, stress: 67.20 },
        { pct: 75,  load: 71.25, gagePressure: 3551.1, deflection: 0.340, stress: 100.80 },
        { pct: 100, load: 95.0,  gagePressure: 4734.8, deflection: 0.510, stress: 134.40 },
        { pct: 125, load: 118.75,gagePressure: 5918.5, deflection: 0.745, stress: 168.00 },
        { pct: 150, load: 142.5, gagePressure: 7102.2, deflection: 1.020, stress: 201.60 }
      ],
      unloading: [
        { pct: 125, load: 118.75, deflection: 0.920 },
        { pct: 100, load: 95.0,   deflection: 0.785 },
        { pct: 75,  load: 71.25,  deflection: 0.620 },
        { pct: 50,  load: 47.5,   deflection: 0.440 },
        { pct: 25,  load: 23.75,  deflection: 0.330 },
        { pct: 10,  load: 9.5,    deflection: 0.270 },
        { pct: 0,   load: 0.0,    deflection: 0.225 }
      ]
    }
  ];

  // ---- JACK CALIBRATION FACTORS ----
  const JACK_CAL = {
    small: { label: 'Small (<175 kips)', factor: 49.84 },
    large: { label: 'Large (>175 kips)', factor: 32.88 }
  };

  // ---- STATE ----
  let currentView = 'history'; // history | detail | newtest
  let selectedTestId = null;

  // ---- RENDER ----
  function render() {
    const app = document.getElementById('modulus-app');
    if (!app) return;

    if (currentView === 'history') {
      app.innerHTML = renderHistory();
    } else if (currentView === 'detail') {
      app.innerHTML = renderDetail(selectedTestId);
    } else if (currentView === 'newtest') {
      app.innerHTML = renderNewTestForm();
    }

    bindEvents();
  }

  // ---- HISTORY VIEW ----
  function renderHistory() {
    const rows = TESTS.map(t => `
      <tr style="cursor:pointer" data-action="view-test" data-id="${t.id}">
        <td style="font-weight:500">${t.job}</td>
        <td>${t.pier}</td>
        <td>${formatDate(t.date)}</td>
        <td>${t.testedBy}</td>
        <td>${t.designModulus} pci</td>
        <td style="font-weight:600">${t.measuredModulus.toFixed(2)} pci</td>
        <td>${t.ratio.toFixed(2)}x</td>
        <td><span class="badge-status ${t.pass ? 'bid' : 'no-bid'}">${t.pass ? 'PASS' : 'FAIL'}</span></td>
      </tr>
    `).join('');

    const passCount = TESTS.filter(t => t.pass).length;
    const avgRatio = (TESTS.reduce((s, t) => s + t.ratio, 0) / TESTS.length).toFixed(2);
    const avgModulus = (TESTS.reduce((s, t) => s + t.measuredModulus, 0) / TESTS.length).toFixed(0);

    return `
      <div class="grid grid-4" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Total Tests</div>
          <div class="stat-value">${TESTS.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Pass Rate</div>
          <div class="stat-value">${Math.round(passCount / TESTS.length * 100)}%</div>
          <div class="stat-change ${passCount === TESTS.length ? 'up' : ''}">${passCount}/${TESTS.length} passed</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avg Measured Modulus</div>
          <div class="stat-value">${avgModulus} pci</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avg Ratio (Measured/Design)</div>
          <div class="stat-value">${avgRatio}x</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Modulus Test History</span>
          <button class="btn btn-primary" data-action="new-test">+ New Test</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Pier #</th>
                <th>Date</th>
                <th>Tested By</th>
                <th>Design Kp</th>
                <th>Measured Kp</th>
                <th>Ratio</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ---- DETAIL VIEW ----
  function renderDetail(testId) {
    const t = TESTS.find(x => x.id === testId);
    if (!t) return '<div class="card"><p>Test not found.</p></div>';

    const loadingRows = t.loading.map(r => `
      <tr>
        <td>${r.pct}%</td>
        <td>${r.load.toFixed(1)}</td>
        <td>${r.gagePressure.toFixed(1)}</td>
        <td>${r.deflection.toFixed(3)}</td>
        <td>${r.stress.toFixed(2)}</td>
      </tr>
    `).join('');

    const unloadingRows = t.unloading.map(r => `
      <tr>
        <td>${r.pct}%</td>
        <td>${r.load.toFixed(1)}</td>
        <td>${r.deflection.toFixed(3)}</td>
      </tr>
    `).join('');

    const residual = t.unloading[t.unloading.length - 1].deflection;
    const maxDefl = t.loading[t.loading.length - 1].deflection;
    const elasticRecovery = ((1 - residual / maxDefl) * 100).toFixed(0);

    return `
      <div style="margin-bottom:16px">
        <button class="btn btn-secondary" data-action="back-to-history">&larr; Back to History</button>
      </div>

      <!-- Result Banner -->
      <div class="card" style="display:flex;align-items:center;gap:24px;padding:24px">
        <div class="score-ring ${t.pass ? 'green' : 'red'}" style="min-width:80px">
          ${t.pass ? 'PASS' : 'FAIL'}
        </div>
        <div style="flex:1">
          <div style="font-size:1.1rem;font-weight:700;color:var(--text-0);margin-bottom:4px">
            ${t.job} &mdash; Pier ${t.pier}
          </div>
          <div style="font-size:0.85rem;color:var(--text-2)">
            Measured Modulus: <strong style="color:var(--text-0)">${t.measuredModulus.toFixed(2)} pci</strong>
            &nbsp;vs&nbsp; Design: <strong style="color:var(--text-0)">${t.designModulus} pci</strong>
            &nbsp;&mdash;&nbsp; <strong style="color:${t.pass ? 'var(--green)' : 'var(--red)'}">${t.ratio.toFixed(2)}x design</strong>
          </div>
          <div style="font-size:0.78rem;color:var(--text-3);margin-top:4px">
            Residual deflection: ${residual.toFixed(3)}" &mdash; ${elasticRecovery}% elastic recovery
          </div>
        </div>
      </div>

      <div class="grid grid-2">
        <!-- Test Parameters -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Test Parameters</span>
          </div>
          <table>
            <tbody>
              <tr><td style="font-weight:500;color:var(--text-2);width:45%">Job</td><td>${t.job}</td></tr>
              <tr><td style="font-weight:500;color:var(--text-2)">Job Number</td><td>${t.jobNumber}</td></tr>
              <tr><td style="font-weight:500;color:var(--text-2)">Location</td><td>${t.location}</td></tr>
              <tr><td style="font-weight:500;color:var(--text-2)">Pier Tested</td><td>${t.pier}</td></tr>
              <tr><td style="font-weight:500;color:var(--text-2)">Test Date</td><td>${formatDate(t.date)}</td></tr>
              <tr><td style="font-weight:500;color:var(--text-2)">Tested By</td><td>${t.testedBy}</td></tr>
              <tr><td style="font-weight:500;color:var(--text-2)">AP Installed Length</td><td>${t.apLength} ft</td></tr>
              <tr><td style="font-weight:500;color:var(--text-2)">AP Design Diameter</td><td>${t.apDiameter} ft (${t.diameterInches}")</td></tr>
              <tr><td style="font-weight:500;color:var(--text-2)">Design Modulus (Kp)</td><td>${t.designModulus} pci</td></tr>
              <tr><td style="font-weight:500;color:var(--text-2)">Design Load</td><td>${t.designLoad} kips</td></tr>
              <tr><td style="font-weight:500;color:var(--text-2)">Max Test Load (150%)</td><td>${t.maxTestLoad} kips</td></tr>
              <tr><td style="font-weight:500;color:var(--text-2)">Jack Type</td><td>${JACK_CAL[t.jackType].label}</td></tr>
              <tr><td style="font-weight:500;color:var(--text-2)">Jack Cal Factor</td><td>${t.jackCalFactor} psi/kip</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Load-Deflection Chart (SVG) -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Load vs Deflection</span>
          </div>
          ${renderChart(t)}
        </div>
      </div>

      <div class="grid grid-2" style="margin-top:0">
        <!-- Loading Data -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Loading Data</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>% Design</th><th>Load (kips)</th><th>Gage PSI</th><th>Defl (in)</th><th>Stress (psi)</th></tr>
              </thead>
              <tbody>${loadingRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Unloading Data -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Unloading Data</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>% Design</th><th>Load (kips)</th><th>Defl (in)</th></tr>
              </thead>
              <tbody>${unloadingRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ---- SVG CHART ----
  function renderChart(t) {
    const W = 460, H = 300;
    const pad = { top: 20, right: 20, bottom: 50, left: 60 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    // Axis ranges
    const maxDefl = Math.ceil(Math.max(...t.loading.map(r => r.deflection), ...t.unloading.map(r => r.deflection)) * 10) / 10 + 0.05;
    const maxLoad = Math.ceil(Math.max(...t.loading.map(r => r.load)) / 10) * 10 + 10;

    function x(defl) { return pad.left + (defl / maxDefl) * plotW; }
    function y(load) { return pad.top + plotH - (load / maxLoad) * plotH; }

    // Grid lines
    let gridLines = '';
    const yTicks = 7;
    for (let i = 0; i <= yTicks; i++) {
      const loadVal = (maxLoad / yTicks) * i;
      const yPos = y(loadVal);
      gridLines += `<line x1="${pad.left}" y1="${yPos}" x2="${W - pad.right}" y2="${yPos}" stroke="#e8ebef" stroke-width="1"/>`;
      gridLines += `<text x="${pad.left - 8}" y="${yPos + 4}" fill="#9ca3af" font-size="10" text-anchor="end">${Math.round(loadVal)}</text>`;
    }

    const xTicks = 7;
    for (let i = 0; i <= xTicks; i++) {
      const deflVal = (maxDefl / xTicks) * i;
      const xPos = x(deflVal);
      gridLines += `<line x1="${xPos}" y1="${pad.top}" x2="${xPos}" y2="${pad.top + plotH}" stroke="#e8ebef" stroke-width="1"/>`;
      gridLines += `<text x="${xPos}" y="${pad.top + plotH + 16}" fill="#9ca3af" font-size="10" text-anchor="middle">${deflVal.toFixed(2)}</text>`;
    }

    // Loading line (solid blue)
    const loadingPoints = t.loading.map(r => `${x(r.deflection)},${y(r.load)}`).join(' ');

    // Unloading line (dashed)
    const unloadingPoints = t.unloading.map(r => `${x(r.deflection)},${y(r.load)}`).join(' ');

    // Design load line
    const designY = y(t.designLoad);

    // Data point dots
    let dots = '';
    t.loading.forEach(r => {
      dots += `<circle cx="${x(r.deflection)}" cy="${y(r.load)}" r="3" fill="#2563eb"/>`;
    });
    t.unloading.forEach(r => {
      dots += `<circle cx="${x(r.deflection)}" cy="${y(r.load)}" r="3" fill="#9ca3af" stroke="#6b7280" stroke-width="1"/>`;
    });

    return `
      <svg width="100%" viewBox="0 0 ${W} ${H}" style="font-family:Inter,sans-serif;overflow:visible">
        <!-- Grid -->
        ${gridLines}

        <!-- Axes -->
        <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="#3d4248" stroke-width="1.5"/>
        <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${W - pad.right}" y2="${pad.top + plotH}" stroke="#3d4248" stroke-width="1.5"/>

        <!-- Axis labels -->
        <text x="${W / 2}" y="${H - 4}" fill="#6b7280" font-size="11" text-anchor="middle">Deflection (inches)</text>
        <text x="14" y="${H / 2}" fill="#6b7280" font-size="11" text-anchor="middle" transform="rotate(-90,14,${H / 2})">Load (kips)</text>

        <!-- Design load line -->
        <line x1="${pad.left}" y1="${designY}" x2="${W - pad.right}" y2="${designY}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="6,4"/>
        <text x="${W - pad.right - 2}" y="${designY - 6}" fill="#dc2626" font-size="10" text-anchor="end">Design Load (${t.designLoad} kips)</text>

        <!-- Loading curve -->
        <polyline points="${loadingPoints}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"/>

        <!-- Unloading curve -->
        <polyline points="${unloadingPoints}" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="5,3" stroke-linejoin="round"/>

        <!-- Dots -->
        ${dots}

        <!-- Legend -->
        <line x1="${pad.left + 8}" y1="${pad.top + 8}" x2="${pad.left + 28}" y2="${pad.top + 8}" stroke="#2563eb" stroke-width="2"/>
        <text x="${pad.left + 32}" y="${pad.top + 12}" fill="#3d4248" font-size="10">Loading</text>

        <line x1="${pad.left + 88}" y1="${pad.top + 8}" x2="${pad.left + 108}" y2="${pad.top + 8}" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="5,3"/>
        <text x="${pad.left + 112}" y="${pad.top + 12}" fill="#3d4248" font-size="10">Unloading</text>

        <line x1="${pad.left + 180}" y1="${pad.top + 8}" x2="${pad.left + 200}" y2="${pad.top + 8}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="6,4"/>
        <text x="${pad.left + 204}" y="${pad.top + 12}" fill="#3d4248" font-size="10">Design Load</text>
      </svg>
    `;
  }

  // ---- NEW TEST FORM ----
  function renderNewTestForm() {
    const loadingRowInputs = [5, 10, 25, 50, 75, 100, 125, 150].map(pct => `
      <tr>
        <td style="font-weight:500">${pct}%</td>
        <td><input type="number" class="form-input" data-field="dial1-${pct}" step="0.001" placeholder="0.000" style="width:100%"></td>
        <td><input type="number" class="form-input" data-field="dial2-${pct}" step="0.001" placeholder="0.000" style="width:100%"></td>
        <td class="calc-avg-defl" data-pct="${pct}">--</td>
        <td class="calc-stress" data-pct="${pct}">--</td>
      </tr>
    `).join('');

    return `
      <div style="margin-bottom:16px">
        <button class="btn btn-secondary" data-action="back-to-history">&larr; Back to History</button>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">New Modulus Test Entry</span>
        </div>

        <div class="grid grid-3" style="margin-bottom:20px">
          <div class="form-group">
            <label class="form-label">Project Name</label>
            <input type="text" class="form-input" id="nt-project" placeholder="e.g. POET Shelbyville">
          </div>
          <div class="form-group">
            <label class="form-label">Job Number</label>
            <input type="text" class="form-input" id="nt-jobnum" placeholder="e.g. 26-002">
          </div>
          <div class="form-group">
            <label class="form-label">Location</label>
            <input type="text" class="form-input" id="nt-location" placeholder="e.g. Shelbyville, IN">
          </div>
          <div class="form-group">
            <label class="form-label">Pier #</label>
            <input type="text" class="form-input" id="nt-pier" placeholder="e.g. Tp01">
          </div>
          <div class="form-group">
            <label class="form-label">Test Date</label>
            <input type="date" class="form-input" id="nt-date">
          </div>
          <div class="form-group">
            <label class="form-label">Tested By</label>
            <input type="text" class="form-input" id="nt-testedby" placeholder="e.g. John Willis">
          </div>
        </div>

        <div class="grid grid-4" style="margin-bottom:20px">
          <div class="form-group">
            <label class="form-label">AP Installed Length (ft)</label>
            <input type="number" class="form-input" id="nt-length" step="0.5" placeholder="10">
          </div>
          <div class="form-group">
            <label class="form-label">AP Diameter (ft)</label>
            <select class="form-select" id="nt-diameter">
              <option value="2.0">2.0 ft (24")</option>
              <option value="2.5" selected>2.5 ft (30")</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Design Modulus Kp (pci)</label>
            <input type="number" class="form-input" id="nt-designmod" step="1" placeholder="150">
          </div>
          <div class="form-group">
            <label class="form-label">Design Load (kips)</label>
            <input type="number" class="form-input" id="nt-designload" step="0.5" placeholder="86">
          </div>
        </div>

        <div class="grid grid-2" style="margin-bottom:24px">
          <div class="form-group">
            <label class="form-label">Jack Type</label>
            <select class="form-select" id="nt-jacktype" data-action="jack-change">
              <option value="small">Small (&lt;175 kips) &mdash; Cal Factor 49.84</option>
              <option value="large">Large (&gt;175 kips) &mdash; Cal Factor 32.88</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Jack Calibration Factor (psi/kip)</label>
            <input type="number" class="form-input" id="nt-calfactor" value="49.84" step="0.01" readonly style="background:var(--bg-1)">
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Loading Data</span>
          <span class="card-subtitle">Enter dial gage readings at each load increment</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>% Design</th>
                <th>Dial Gage 1 (in)</th>
                <th>Dial Gage 2 (in)</th>
                <th>Avg Deflection</th>
                <th>Stress (psi)</th>
              </tr>
            </thead>
            <tbody id="nt-loading-body">${loadingRowInputs}</tbody>
          </table>
        </div>
      </div>

      <div class="card" id="nt-result-card" style="display:none">
        <div class="card-header">
          <span class="card-title">Calculated Result</span>
        </div>
        <div style="display:flex;align-items:center;gap:24px">
          <div class="score-ring" id="nt-result-ring">--</div>
          <div>
            <div style="font-size:0.95rem;font-weight:600;color:var(--text-0)" id="nt-result-text">--</div>
            <div style="font-size:0.82rem;color:var(--text-2)" id="nt-result-detail">--</div>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:12px;margin-top:16px">
        <button class="btn btn-primary" data-action="calculate-test">Calculate Modulus</button>
        <button class="btn btn-secondary" data-action="back-to-history">Cancel</button>
      </div>
    `;
  }

  // ---- EVENT BINDING ----
  function bindEvents() {
    const app = document.getElementById('modulus-app');
    if (!app) return;

    app.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'new-test') {
        currentView = 'newtest';
        render();
      } else if (action === 'back-to-history') {
        currentView = 'history';
        selectedTestId = null;
        render();
      } else if (action === 'view-test') {
        selectedTestId = btn.dataset.id;
        currentView = 'detail';
        render();
      } else if (action === 'calculate-test') {
        calculateModulus();
      }
    });

    app.addEventListener('change', function(e) {
      const el = e.target;
      if (el.id === 'nt-jacktype') {
        const factor = JACK_CAL[el.value].factor;
        document.getElementById('nt-calfactor').value = factor;
      }
    });

    // Live calculation on dial gage input
    app.addEventListener('input', function(e) {
      const el = e.target;
      if (el.dataset.field && el.dataset.field.startsWith('dial')) {
        updateLiveCalcs();
      }
    });
  }

  // ---- LIVE CALCULATIONS ----
  function updateLiveCalcs() {
    const designLoad = parseFloat(document.getElementById('nt-designload')?.value) || 0;
    const diameter = parseFloat(document.getElementById('nt-diameter')?.value) || 2.5;
    const area = Math.PI * Math.pow(diameter / 2, 2); // sq ft
    const areaSqIn = area * 144;

    [5, 10, 25, 50, 75, 100, 125, 150].forEach(pct => {
      const d1 = parseFloat(document.querySelector(`[data-field="dial1-${pct}"]`)?.value) || 0;
      const d2 = parseFloat(document.querySelector(`[data-field="dial2-${pct}"]`)?.value) || 0;
      const avgDefl = (d1 + d2) / 2;
      const load = designLoad * (pct / 100);
      const stress = load / areaSqIn * 1000; // convert kips to lbs then to psi

      const deflCell = document.querySelector(`.calc-avg-defl[data-pct="${pct}"]`);
      const stressCell = document.querySelector(`.calc-stress[data-pct="${pct}"]`);

      if (deflCell) deflCell.textContent = (d1 || d2) ? avgDefl.toFixed(3) : '--';
      if (stressCell) stressCell.textContent = designLoad ? stress.toFixed(2) : '--';
    });
  }

  // ---- CALCULATE MODULUS ----
  function calculateModulus() {
    const designLoad = parseFloat(document.getElementById('nt-designload')?.value);
    const designMod = parseFloat(document.getElementById('nt-designmod')?.value);
    const diameter = parseFloat(document.getElementById('nt-diameter')?.value) || 2.5;
    const length = parseFloat(document.getElementById('nt-length')?.value) || 10;

    if (!designLoad || !designMod) {
      alert('Please fill in Design Load and Design Modulus before calculating.');
      return;
    }

    // Get the deflection at 100% design load
    const d1_100 = parseFloat(document.querySelector('[data-field="dial1-100"]')?.value) || 0;
    const d2_100 = parseFloat(document.querySelector('[data-field="dial2-100"]')?.value) || 0;
    const defl100 = (d1_100 + d2_100) / 2;

    if (defl100 <= 0) {
      alert('Please enter dial gage readings at 100% design load to calculate modulus.');
      return;
    }

    // Modulus = (stress at design load) / (deflection at design load / pier length)
    // Kp = (P / A) / (delta / L)
    // where P = design load in lbs, A = cross-section area in sq inches
    // delta = deflection in inches, L = pier length in inches
    const areaFt = Math.PI * Math.pow(diameter / 2, 2);
    const areaSqIn = areaFt * 144;
    const lengthIn = length * 12;
    const loadLbs = designLoad * 1000;

    const stress = loadLbs / areaSqIn; // psi
    const strain = defl100 / lengthIn; // in/in
    const measuredModulus = stress / strain; // psi per in/in = pci

    const ratio = measuredModulus / designMod;
    const pass = ratio >= 1.0;

    // Show result
    const resultCard = document.getElementById('nt-result-card');
    const ring = document.getElementById('nt-result-ring');
    const text = document.getElementById('nt-result-text');
    const detail = document.getElementById('nt-result-detail');

    if (resultCard) resultCard.style.display = 'block';

    ring.textContent = pass ? 'PASS' : 'FAIL';
    ring.className = 'score-ring ' + (pass ? 'green' : 'red');

    text.textContent = `Measured Modulus: ${measuredModulus.toFixed(2)} pci`;
    detail.textContent = `${ratio.toFixed(2)}x design requirement (${designMod} pci) | ${pass ? 'Meets' : 'Does NOT meet'} specification`;
  }

  // ---- UTILITY ----
  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ---- INIT ----
  // Render on load and when module becomes visible
  render();

  // Re-render when module is shown via nav
  const origShowModule = window.showModule;
  window.showModule = function(id) {
    origShowModule(id);
    if (id === 'modulus') render();
  };

})();
