// Proposals Module — PF Operations Platform
// Based on real submitted proposal: 26-0219_POET_Projects.pdf

(function() {
  const container = document.getElementById('proposals-app');
  if (!container) return;

  // Sample proposals based on real PF data
  const proposals = [
    {
      id: '26-0219',
      project: 'POET Bioprocessing - Shelbyville',
      gc: 'POET Design & Construction',
      location: 'Shelbyville, IN',
      date: '2026-02-19',
      value: 343037,
      status: 'Awarded',
      columns: 1865,
      lf: 17003,
      diameter: '30"',
      engineer: 'Garbin GeoStructural',
      scope: 'Aggregate Piers - Vibratory Stone Columns for grain bins, fermentation tanks, and beer well foundations'
    },
    {
      id: '25-024',
      project: 'The Granary',
      gc: 'Flaherty & Collins',
      location: 'Noblesville, IN',
      date: '2025-11-15',
      value: 326200,
      status: 'Awarded',
      columns: 1593,
      lf: 17656,
      diameter: '24"',
      engineer: 'Garbin GeoStructural',
      scope: 'Aggregate Piers - Vibratory Stone Columns for mixed-use development foundation support'
    },
    {
      id: '25-023',
      project: 'IU Launch Accelerator',
      gc: 'FA Wilhelm',
      location: 'Indianapolis, IN',
      date: '2025-10-20',
      value: 285200,
      status: 'Awarded',
      columns: null,
      lf: null,
      diameter: '24"',
      engineer: 'Garbin GeoStructural',
      scope: 'Aggregate Piers - Vibratory Stone Columns for university research facility'
    },
    {
      id: '26-007',
      project: 'Parkview Health Hospital',
      gc: 'FA Wilhelm',
      location: 'West Lafayette, IN',
      date: '2026-06-02',
      value: 175000,
      status: 'Draft',
      columns: 496,
      lf: 6194,
      diameter: '24"',
      engineer: 'Garbin GeoStructural',
      scope: 'Aggregate Piers - Vibratory Stone Columns for hospital expansion'
    },
    {
      id: '25-019',
      project: 'Airport Hangar',
      gc: 'Garmong Construction',
      location: 'Terre Haute, IN',
      date: '2025-09-10',
      value: 223897,
      status: 'Awarded',
      columns: null,
      lf: null,
      diameter: '24"',
      engineer: 'Garbin GeoStructural',
      scope: 'Aggregate Piers - Vibratory Stone Columns for aircraft hangar foundation'
    }
  ];

  // Standard proposal sections (based on real POET proposal structure)
  const proposalSections = [
    'Cover Letter',
    'Scope of Work',
    'Design Basis & Engineering',
    'Material Specifications',
    'Installation Methodology',
    'Quality Assurance / Quality Control',
    'Schedule & Mobilization',
    'Pricing & Payment Terms',
    'Qualifications & References',
    'Insurance & Bonding',
    'Terms & Conditions',
    'Appendix: Prelim Design Summary'
  ];

  function fmt(n) {
    return n ? '$' + n.toLocaleString() : '--';
  }

  function statusClass(s) {
    if (s === 'Awarded') return 'bid';
    if (s === 'Draft') return 'pending';
    if (s === 'Submitted') return 'review';
    return 'closed';
  }

  function render() {
    container.innerHTML = `
      <div class="grid grid-3" style="margin-bottom:16px">
        <div class="stat-card">
          <div class="stat-label">Total Proposals</div>
          <div class="stat-value">${proposals.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Awarded Value</div>
          <div class="stat-value">${fmt(proposals.filter(p=>p.status==='Awarded').reduce((s,p)=>s+p.value,0))}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Win Rate</div>
          <div class="stat-value">${Math.round(proposals.filter(p=>p.status==='Awarded').length/proposals.length*100)}%</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Proposal History</span>
          <button class="btn btn-primary" onclick="document.getElementById('newProposalForm').style.display = document.getElementById('newProposalForm').style.display === 'none' ? 'block' : 'none'">+ New Proposal</button>
        </div>

        <div id="newProposalForm" style="display:none;margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-1)">
          <div class="grid grid-3">
            <div class="form-group">
              <label class="form-label">Project Name</label>
              <input class="form-input" placeholder="Enter project name">
            </div>
            <div class="form-group">
              <label class="form-label">General Contractor</label>
              <input class="form-input" placeholder="GC name">
            </div>
            <div class="form-group">
              <label class="form-label">Location</label>
              <input class="form-input" placeholder="City, ST">
            </div>
            <div class="form-group">
              <label class="form-label">Proposal Value</label>
              <input class="form-input" type="number" placeholder="$0">
            </div>
            <div class="form-group">
              <label class="form-label">Column Count</label>
              <input class="form-input" type="number" placeholder="0">
            </div>
            <div class="form-group">
              <label class="form-label">Total LF</label>
              <input class="form-input" type="number" placeholder="0">
            </div>
          </div>
          <div style="margin-top:8px">
            <button class="btn btn-primary">Generate Proposal</button>
            <button class="btn btn-secondary" onclick="document.getElementById('newProposalForm').style.display='none'">Cancel</button>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Proposal #</th>
                <th>Project</th>
                <th>GC</th>
                <th>Location</th>
                <th>Date</th>
                <th>Value</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${proposals.map(p => `
                <tr>
                  <td style="font-weight:500">${p.id}</td>
                  <td>${p.project}</td>
                  <td>${p.gc}</td>
                  <td>${p.location}</td>
                  <td>${p.date}</td>
                  <td>${fmt(p.value)}</td>
                  <td><span class="badge-status ${statusClass(p.status)}">${p.status}</span></td>
                  <td>
                    <button class="btn btn-secondary" style="padding:4px 8px;font-size:0.72rem" onclick="viewProposal('${p.id}')">View</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div id="proposalDetail" style="display:none"></div>

      <div class="card" style="margin-top:16px">
        <div class="card-header">
          <span class="card-title">Proposal Template Sections</span>
          <span class="card-subtitle">Standard PF proposal structure</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Section</th><th>Template Status</th></tr></thead>
            <tbody>
              ${proposalSections.map((s, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${s}</td>
                  <td><span class="badge-status active">Template Ready</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // Expose viewProposal to global scope
  window.viewProposal = function(id) {
    const p = proposals.find(x => x.id === id);
    if (!p) return;
    const detail = document.getElementById('proposalDetail');
    detail.style.display = 'block';
    detail.innerHTML = `
      <div class="card" style="margin-top:16px">
        <div class="card-header">
          <span class="card-title">${p.project} — Proposal ${p.id}</span>
          <button class="btn btn-secondary" onclick="document.getElementById('proposalDetail').style.display='none'">Close</button>
        </div>
        <div class="grid grid-4" style="margin-bottom:16px">
          <div class="stat-card">
            <div class="stat-label">Contract Value</div>
            <div class="stat-value" style="font-size:1.2rem">${fmt(p.value)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Columns</div>
            <div class="stat-value" style="font-size:1.2rem">${p.columns || '--'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Linear Feet</div>
            <div class="stat-value" style="font-size:1.2rem">${p.lf ? p.lf.toLocaleString() : '--'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Column Diameter</div>
            <div class="stat-value" style="font-size:1.2rem">${p.diameter}</div>
          </div>
        </div>
        <div style="padding:8px 0">
          <strong>General Contractor:</strong> ${p.gc}<br>
          <strong>Location:</strong> ${p.location}<br>
          <strong>Engineer:</strong> ${p.engineer}<br>
          <strong>Scope:</strong> ${p.scope}
        </div>
        <div style="margin-top:16px">
          <div class="card-subtitle" style="margin-bottom:8px">Proposal Sections</div>
          ${proposalSections.map((s, i) => `
            <div style="padding:6px 0;border-bottom:1px solid var(--border-light);font-size:0.82rem;display:flex;justify-content:space-between;align-items:center">
              <span>${i + 1}. ${s}</span>
              <span class="badge-status active" style="font-size:0.65rem">Included</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    detail.scrollIntoView({ behavior: 'smooth' });
  };

  render();
})();
