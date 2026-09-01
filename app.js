/* ---------------- CONFIG ---------------- */
  const SHEET_ID = "1nXmFzwLfVYcuZR5Icp_ULSJz9nn9FVWblzzvhQR9Gg8";
  const GID = "1081519070";
  const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

  // Paste the Web app URL from your Apps Script deployment here:
  const STATUS_UPDATE_URL = "https://script.google.com/macros/s/AKfycbxJTFEB9put0DdB7N51iu-z_JP4R0rUGz53pa8paKZrcQrBLZBWiHwdjttVgrOJbTiU/exec";

  const STATUS_OPTIONS = ["Pending", "PR Raised", "PR Approved", "Completed", "Rejected"];

  /* ---------------- FALLBACK MOCK DATA ---------------- */
  /* Used automatically if the live fetch fails (e.g. sheet not yet shared as "Anyone with link can view") */
  const MOCK_ROWS = [
    ["7/16/2026 20:29:35","","test1","S4","Maintenance","Block 6","Level 3","#03-17","Electrical","Lights not working","Operational Restraint (e.g., broken appliance/equipment needed for daily work, minor leak)","Nil","","","","","","","","","","","","","","","","","",""],
    ["7/16/2026 20:32:59","","test2","S1","Transport","","","","","","","","Rot 3B training","Bus for training purposes","NIL","40-Seater","7/24/2026 8:00:00","7/16/2026 18:30:00","3","MHC","Selarang Camp","Pick up at RSTA Coy","","","","","","","","",""],
    ["7/16/2026 20:34:14","","test3","S3","Finance","","","","","","","","","","","","","","","","","","Laptop","5","Admin use","7/24/2026","","","","Yes",""],
    ["7/16/2026 22:43:38","","test script","SSP","Transport","","","","","","","","Transport equipment","Box truck","","","7/24/2026 11:00:00","7/24/2026 16:00:00","2","MHC","Kranji Camp 3","Collect items","","","","","","","","",""],
    ["7/16/2026 22:47:21","","test script2","RSTA","Maintenance","Block 6","Level 4","#04-12","Structural","Cracks on pillar","Operational Restraint (e.g., broken appliance/equipment needed for daily work, minor leak)","","","","","","","","","","","","","","","","","","",""]
  ];
  const HEADERS = [
    "Timestamp","Email Address","Who is requesting?","What Coy/Branch are you from?","What type of request?",
    "Which Block?","Which Level?","Unit No./Damage Location","Defect Category","Description","Urgency",
    "Any other remarks?","Purpose of Indent","What do you need?","Service mode for bus (if any)","Size of bus (if any)",
    "Start Date & Time","End Date & Time","No. of vehicles","Reporting venue of vehicle","Destination venue(s) of vehicle",
    "Detailed description of indent","Item/Service required","Quantity","Why you need this item/service?",
    "When you need item/service by?","Start time (if any)","End time (if any)","Important remarks (if any)",
    "Is your item on the catalogue?","Upload quotation","Status"
  ];

  let RECORDS = rowsToRecords(HEADERS, MOCK_ROWS);

  /* ---------------- FILTERS ---------------- */
  let filterState = { branch: 'all', urgency: 'all', status: 'all' };

  function getFilteredRecords() {
    return RECORDS.filter(r => {
      if (filterState.branch !== 'all' && r['What Coy/Branch are you from?'] !== filterState.branch) return false;
      if (filterState.urgency === 'flagged' && !r['Urgency']) return false;
      if (filterState.status !== 'all' && (r['Status'] || 'Pending') !== filterState.status) return false;
      return true;
    });
  }

  function populateBranchFilter() {
    const select = document.getElementById('filter-branch');
    const current = filterState.branch;
    const branches = Array.from(new Set(RECORDS.map(r => r['What Coy/Branch are you from?']).filter(Boolean))).sort();
    select.innerHTML = '<option value="all">All</option>' + branches.map(b => `<option value="${b}">${b}</option>`).join('');
    select.value = branches.includes(current) ? current : 'all';
    filterState.branch = select.value;
  }

  function updateFilterCount(filtered) {
    document.getElementById('filter-count').textContent = `${filtered.length} of ${RECORDS.length} requests`;
  }

  document.getElementById('filter-branch').addEventListener('change', (e) => {
    filterState.branch = e.target.value;
    renderAll();
  });
  document.getElementById('filter-urgency').addEventListener('change', (e) => {
    filterState.urgency = e.target.value;
    renderAll();
  });
  document.getElementById('filter-status').addEventListener('change', (e) => {
    filterState.status = e.target.value;
    renderAll();
  });
  document.getElementById('filter-clear').addEventListener('click', () => {
    filterState = { branch: 'all', urgency: 'all', status: 'all' };
    document.getElementById('filter-branch').value = 'all';
    document.getElementById('filter-urgency').value = 'all';
    document.getElementById('filter-status').value = 'all';
    renderAll();
  });

  /* ---------------- CSV PARSING ---------------- */
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (inQuotes) {
        if (c === '"' && next === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
          if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
        } else { field += c; }
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(cell => cell.trim() !== ''));
  }

  function rowsToRecords(headers, rows) {
    // Sheet row 1 is the header, so the first data row is sheet row 2, etc.
    return rows.map((r, idx) => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = (r[i] || '').trim());
      obj._rowNum = idx + 2;
      return obj;
    });
  }

  /* ---------------- DATA LOADING ---------------- */
  async function loadData() {
    try {
      const res = await fetch(SHEET_CSV_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const csvText = await res.text();
      const allRows = parseCSV(csvText);
      const [header, ...body] = allRows;
      RECORDS = rowsToRecords(header, body);
      document.getElementById('last-updated').textContent = 'Live · ' + new Date().toLocaleTimeString();
    } catch (err) {
      console.warn('Live fetch failed, using fallback sample data:', err.message);
      RECORDS = rowsToRecords(HEADERS, MOCK_ROWS);
      document.getElementById('last-updated').textContent = 'Sample data (offline)';
    }
    populateBranchFilter();
    renderAll();
  }

  /* ---------------- RENDERING ---------------- */
  function badge(text, kind) {
    return `<span class="badge badge-${kind}">${text || '—'}</span>`;
  }

  function urgencyKind(u) {
    if (!u) return 'neutral';
    if (u.toLowerCase().includes('restraint')) return 'warn';
    return 'neutral';
  }

  function typeKind(t) {
    const map = { Maintenance: 'maint', Transport: 'transport', Finance: 'finance' };
    return map[t] || 'neutral';
  }

  function statusKind(s) {
    const map = {
      'Pending': 'status-pending',
      'PR Raised': 'status-progress',
      'PR Approved': 'status-approved',
      'Completed': 'status-completed',
      'Rejected': 'status-rejected',
    };
    return map[s] || 'status-pending';
  }

  const TABLE_ROWS = {};

  function makeTable(columns, rows, tableId) {
    if (!rows.length) {
      return `<div class="placeholder"><div class="placeholder-title">No records found</div></div>`;
    }
    if (tableId) TABLE_ROWS[tableId] = rows;
    const thead = columns.map(c => `<th>${c.label}</th>`).join('');
    const tbody = rows.map((r, i) => {
      const attrs = tableId ? ` class="clickable-row" data-table="${tableId}" data-idx="${i}"` : '';
      return `<tr${attrs}>${columns.map(c => `<td>${c.render ? c.render(r) : (r[c.key] || '—')}</td>`).join('')}</tr>`;
    }).join('');
    return `<table class="data-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
  }

  function renderSummaryCards() {
    const filtered = getFilteredRecords();
    const total = filtered.length;
    const counts = { Maintenance: 0, Transport: 0, Finance: 0 };
    filtered.forEach(r => { if (counts[r['What type of request?']] !== undefined) counts[r['What type of request?']]++; });

    const cards = [
      { label: 'Total Requests', value: total },
      { label: 'Infrastructure', value: counts.Maintenance },
      { label: 'Transport', value: counts.Transport },
      { label: 'Finance', value: counts.Finance },
    ];

    document.getElementById('summary-cards').innerHTML = cards.map(c => `
      <div class="stat-card">
        <div class="stat-value mono">${c.value}</div>
        <div class="stat-label">${c.label}</div>
      </div>`).join('');
  }

  function renderOverviewTable() {
    const columns = [
      { key: 'Timestamp', label: 'Timestamp' },
      { key: 'Who is requesting?', label: 'Requester' },
      { key: 'What Coy/Branch are you from?', label: 'Coy/Branch' },
      { key: 'What type of request?', label: 'Type', render: r => badge(r['What type of request?'], typeKind(r['What type of request?'])) },
      { key: 'Status', label: 'Status', render: r => badge(r['Status'] || 'Pending', statusKind(r['Status'] || 'Pending')) },
      { key: 'Urgency', label: 'Urgency', render: r => r['Urgency'] ? badge('Flagged', urgencyKind(r['Urgency'])) : '—' },
    ];
    document.getElementById('overview-table').innerHTML = makeTable(columns, getFilteredRecords(), 'overview');
  }

  /* ---------------- CHARTS ---------------- */
  let typeChart = null;
  let branchChart = null;
  let statusChart = null;

  const CHART_COLORS = ['#E8A33D', '#274456', '#2E8C5A', '#C1443F', '#7A5FB8', '#3D9AD1'];

  const STATUS_CHART_COLORS = {
    'Pending': '#97A3AC',
    'PR Raised': '#3D9AD1',
    'PR Approved': '#2E8C5A',
    'Completed': '#E8A33D',
    'Rejected': '#C1443F',
  };

  function countBy(records, field) {
    const counts = {};
    records.forEach(r => {
      const key = r[field] || 'Unspecified';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  function renderOverviewCharts() {
    const filtered = getFilteredRecords();
    const typeCounts = countBy(filtered, 'What type of request?');
    const branchCounts = countBy(filtered, 'What Coy/Branch are you from?');
    const statusCounts = countBy(
      filtered.map(r => ({ ...r, 'Status': r['Status'] || 'Pending' })),
      'Status'
    );

    const typeCtx = document.getElementById('chart-by-type');
    const branchCtx = document.getElementById('chart-by-branch');
    const statusCtx = document.getElementById('chart-by-status');

    if (typeChart) typeChart.destroy();
    if (branchChart) branchChart.destroy();
    if (statusChart) statusChart.destroy();

    typeChart = new Chart(typeCtx, {
      type: 'bar',
      data: {
        labels: Object.keys(typeCounts),
        datasets: [{
          data: Object.values(typeCounts),
          backgroundColor: CHART_COLORS,
          borderRadius: 6,
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#E2E5E8' } },
          x: { grid: { display: false } }
        }
      }
    });

    branchChart = new Chart(branchCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(branchCounts),
        datasets: [{
          data: Object.values(branchCounts),
          backgroundColor: CHART_COLORS,
          borderWidth: 0,
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            align: 'center',
            labels: { boxWidth: 10, font: { size: 11 } }
          }
        }
      }
    });

    // Order status labels consistently regardless of which statuses are present
    const orderedStatuses = STATUS_OPTIONS.filter(s => statusCounts[s] !== undefined);
    statusChart = new Chart(statusCtx, {
      type: 'bar',
      data: {
        labels: orderedStatuses,
        datasets: [{
          data: orderedStatuses.map(s => statusCounts[s]),
          backgroundColor: orderedStatuses.map(s => STATUS_CHART_COLORS[s] || '#97A3AC'),
          borderRadius: 6,
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#E2E5E8' } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  document.getElementById('overview-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    document.querySelectorAll('#overview-toggle .view-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const view = btn.dataset.view;
    document.getElementById('overview-table-view').style.display = view === 'table' ? 'block' : 'none';
    document.getElementById('overview-chart-view').style.display = view === 'charts' ? 'block' : 'none';

    if (view === 'charts') renderOverviewCharts();
  });

  function renderTransportTable() {
    const rows = getFilteredRecords().filter(r => r['What type of request?'] === 'Transport');
    const columns = [
      { key: 'Who is requesting?', label: 'Requester' },
      { key: 'What Coy/Branch are you from?', label: 'Coy/Branch' },
      { key: 'Start Date & Time', label: 'Start' },
      { key: 'End Date & Time', label: 'End' },
      { key: 'No. of vehicles', label: 'Vehicles' },
      { key: 'Reporting venue of vehicle', label: 'Reporting Venue' },
      { key: 'Destination venue(s) of vehicle', label: 'Destination' },
      { key: 'Status', label: 'Status', render: r => badge(r['Status'] || 'Pending', statusKind(r['Status'] || 'Pending')) },
    ];
    document.getElementById('transport-table').innerHTML = makeTable(columns, rows, 'transport');
  }

  function renderFinanceTable() {
    const rows = getFilteredRecords().filter(r => r['What type of request?'] === 'Finance');
    const columns = [
      { key: 'Who is requesting?', label: 'Requester' },
      { key: 'What Coy/Branch are you from?', label: 'Coy/Branch' },
      { key: 'Item/Service required', label: 'Item/Service' },
      { key: 'Quantity', label: 'Qty' },
      { key: 'Why you need this item/service?', label: 'Purpose' },
      { key: 'When you need item/service by?', label: 'Needed By' },
      { key: 'Status', label: 'Status', render: r => badge(r['Status'] || 'Pending', statusKind(r['Status'] || 'Pending')) },
    ];
    document.getElementById('finance-table').innerHTML = makeTable(columns, rows, 'finance');
  }

  function renderInfrastructureTable() {
    const rows = getFilteredRecords().filter(r => r['What type of request?'] === 'Maintenance');
    const columns = [
      { key: 'Who is requesting?', label: 'Requester' },
      { key: 'What Coy/Branch are you from?', label: 'Coy/Branch' },
      { key: 'Which Block?', label: 'Block' },
      { key: 'Which Level?', label: 'Level' },
      { key: 'Unit No./Damage Location', label: 'Location' },
      { key: 'Defect Category', label: 'Category' },
      { key: 'Description', label: 'Description' },
      { key: 'Urgency', label: 'Urgency', render: r => r['Urgency'] ? badge('Flagged', urgencyKind(r['Urgency'])) : '—' },
      { key: 'Status', label: 'Status', render: r => badge(r['Status'] || 'Pending', statusKind(r['Status'] || 'Pending')) },
    ];
    document.getElementById('infrastructure-table').innerHTML = makeTable(columns, rows, 'infrastructure');
  }

  function renderSearchTable(query) {
    const q = (query || '').toLowerCase().trim();
    const rows = !q ? [] : getFilteredRecords().filter(r =>
      Object.values(r).some(v => v.toLowerCase().includes(q))
    );
    const columns = [
      { key: 'Timestamp', label: 'Timestamp' },
      { key: 'Who is requesting?', label: 'Requester' },
      { key: 'What Coy/Branch are you from?', label: 'Coy/Branch' },
      { key: 'What type of request?', label: 'Type', render: r => badge(r['What type of request?'], typeKind(r['What type of request?'])) },
      { key: 'Description', label: 'Description' },
    ];
    document.getElementById('search-table').innerHTML = q
      ? makeTable(columns, rows, 'search')
      : '';
  }

  function renderAll() {
    renderSummaryCards();
    renderOverviewTable();
    renderTransportTable();
    renderFinanceTable();
    renderInfrastructureTable();
    renderSearchTable(document.getElementById('search-input').value);
    if (document.getElementById('overview-chart-view').style.display !== 'none') {
      renderOverviewCharts();
    }
    updateFilterCount(getFilteredRecords());
  }

  /* ---------------- REQUEST DETAIL MODAL ---------------- */
  const modalOverlay = document.getElementById('modal-overlay');
  const modalBody = document.getElementById('modal-body');
  const modalTitle = document.getElementById('modal-title');

  let currentModalRecord = null;

  function openModal(record) {
    currentModalRecord = record;

    modalTitle.textContent = record['Who is requesting?']
      ? `Request — ${record['Who is requesting?']}`
      : 'Request Details';

    const currentStatus = record['Status'] || 'Pending';
    const statusOptionsHtml = STATUS_OPTIONS
      .map(s => `<option value="${s}" ${s === currentStatus ? 'selected' : ''}>${s}</option>`)
      .join('');

    const statusControlHtml = `
      <div class="status-control">
        <div class="detail-label">Status</div>
        <div class="status-control-row">
          <select id="status-select" class="filter-select">${statusOptionsHtml}</select>
          <button id="status-save-btn" class="status-save-btn">Save</button>
          <span id="status-save-msg" class="status-save-msg"></span>
        </div>
      </div>`;

    const rowsHtml = HEADERS
      .filter(h => h !== 'Status' && (record[h] || '').trim() !== '')
      .map(h => `
        <div class="detail-row">
          <div class="detail-label">${h}</div>
          <div class="detail-value">${record[h]}</div>
        </div>`)
      .join('');

    modalBody.innerHTML = statusControlHtml + (rowsHtml || `<div class="placeholder"><div class="placeholder-title">No further details</div></div>`);

    document.getElementById('status-save-btn').addEventListener('click', saveStatus);

    modalOverlay.classList.add('open');
  }

  async function saveStatus() {
    const select = document.getElementById('status-select');
    const msg = document.getElementById('status-save-msg');
    const btn = document.getElementById('status-save-btn');
    const newStatus = select.value;

    if (STATUS_UPDATE_URL.includes('PASTE_YOUR')) {
      msg.textContent = 'Apps Script URL not configured yet';
      msg.className = 'status-save-msg status-error';
      return;
    }

    btn.disabled = true;
    msg.textContent = 'Saving…';
    msg.className = 'status-save-msg';

    try {
      const res = await fetch(STATUS_UPDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight against Apps Script
        body: JSON.stringify({ rowNum: currentModalRecord['_rowNum'], status: newStatus }),
      });
      const result = await res.json();

      if (result.success) {
        currentModalRecord['Status'] = newStatus;
        msg.textContent = 'Saved';
        msg.className = 'status-save-msg status-ok';
        renderAll();
      } else {
        throw new Error(result.error || 'Update failed');
      }
    } catch (err) {
      msg.textContent = 'Failed: ' + err.message;
      msg.className = 'status-save-msg status-error';
    } finally {
      btn.disabled = false;
    }
  }

  function closeModal() {
    modalOverlay.classList.remove('open');
  }

  document.getElementById('modal-close').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('open')) closeModal();
  });

  // Event delegation: catches clicks on any clickable row, in any table, even after re-renders
  document.addEventListener('click', (e) => {
    const row = e.target.closest('tr.clickable-row');
    if (!row) return;
    const tableId = row.dataset.table;
    const idx = Number(row.dataset.idx);
    const rows = TABLE_ROWS[tableId];
    if (rows && rows[idx]) openModal(rows[idx]);
  });

  /* ---------------- SIDEBAR COLLAPSE ---------------- */
  const sidebar = document.getElementById('sidebar');
  const collapseBtn = document.getElementById('collapse-btn');

  collapseBtn.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    collapseBtn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  });

  /* ---------------- NAV SWITCHING ---------------- */
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const target = item.dataset.section;
      document.querySelectorAll('.page-section').forEach(sec => sec.style.display = 'none');
      document.getElementById('section-' + target).style.display = 'block';
      document.getElementById('page-title').textContent = item.textContent.trim();
    });
  });

  document.getElementById('search-input').addEventListener('input', (e) => renderSearchTable(e.target.value));
  document.getElementById('refresh-btn').addEventListener('click', loadData);

  loadData();
