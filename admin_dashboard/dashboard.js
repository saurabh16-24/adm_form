/* ═══════════════════════════════════════════════════════════════════════
   SVCE Admin Dashboard — Client-side JS
   ═══════════════════════════════════════════════════════════════════════ */

const API = window.location.origin; // same origin
let allEnquiries  = [];
let allAdmissions = [];
let allManagement = [];
let allRawEnquiries = [];
let lastGraphs     = null;
let lastStats      = null;
let pincodeChartInstance = null;
let genderChartInstance = null;
let ratioChartInstance   = null;
let timelineChartInstance = null;
let sourceChartInstance = null;
let stateChartInstance = null;
let courseChartInstance = null;
let qualityChartInstance = null;
let conversionChartInstance = null;

// ═══════════════ LOGIN ═══════════════
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  errEl.textContent = '';
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();
    if (data.success) {
      sessionStorage.setItem('admin_token', data.token);
      sessionStorage.setItem('admin_name', data.username || 'Admin');
      sessionStorage.setItem('admin_role', data.role || 'admin');
      showDashboard();
    } else {
      errEl.textContent = data.message || 'Invalid credentials';
    }
  } catch (err) {
    errEl.textContent = 'Server connection failed';
  } finally {
    btn.innerHTML = '<span>Sign In</span><span class="material-icons-round">arrow_forward</span>';
    btn.disabled = false;
  }
});

function togglePass() {
  const inp = document.getElementById('login-pass');
  const icon = document.querySelector('.toggle-pass .material-icons-round');
  if (inp.type === 'password') { inp.type = 'text'; icon.textContent = 'visibility_off'; }
  else { inp.type = 'password'; icon.textContent = 'visibility'; }
}

function logout() {
  sessionStorage.removeItem('admin_token');
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

// ═══════════════ DASHBOARD INIT ═══════════════
function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  const role = sessionStorage.getItem('admin_role');
  const navMgmt = document.getElementById('nav-management');
  const navOverview = document.getElementById('nav-overview');
  const panelTitle = document.getElementById('panel-title-role');
  
  if (role === 'counsellor') {
    if (navMgmt) navMgmt.style.display = 'none';
    if (navOverview) navOverview.style.display = 'none';
    if (panelTitle) panelTitle.textContent = 'Counsellor Panel';
    switchTab('enquiries');
  } else {
    if (navMgmt) navMgmt.style.display = 'flex';
    if (navOverview) navOverview.style.display = 'flex';
    if (panelTitle) panelTitle.textContent = 'Admin Panel';
    switchTab('overview');
  }

  updateClock();
  setInterval(updateClock, 1000);
  updateLastRefreshInfo();
}

// Auto-login if token exists
if (sessionStorage.getItem('admin_token')) showDashboard();

function updateClock() {
  const el = document.getElementById('topbar-time');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function updateLastRefreshInfo() {
  const nameEl = document.getElementById('updater-name');
  const dateEl = document.getElementById('update-date');
  const timeEl = document.getElementById('update-time');
  
  if (!nameEl || !dateEl || !timeEl) return;
  
  const now = new Date();
  const savedName = sessionStorage.getItem('admin_name') || 'Admin';
  
  nameEl.textContent = savedName;
  dateEl.textContent = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  timeEl.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}


// ═══════════════ SIDEBAR / TABS ═══════════════
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  if (window.innerWidth <= 768) sb.classList.toggle('mobile-open');
  else sb.classList.toggle('collapsed');
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const tab = item.dataset.tab;
    switchTab(tab);
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('mobile-open');
  });
});

function switchTab(tab) {
  const role = sessionStorage.getItem('admin_role');
  // Restriction: Counsellors cannot access Overview
  if (role === 'counsellor' && tab === 'overview') {
    switchTab('enquiries');
    return;
  }

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const activeNav = document.querySelector(`[data-tab="${tab}"]`);
  if (activeNav) activeNav.classList.add('active');
  
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const activeTab = document.getElementById(`tab-${tab}`);
  if (activeTab) activeTab.classList.add('active');

  const titles = {
    overview:   ['Overview', 'Dashboard analytics and insights'],
    enquiries:  ['Enquiries', 'Manage student enquiry records'],
    'raw-enquiries': ['Raw Enquiry', 'Manage informal student leads and walk-ins'],
    admissions: ['Applications', 'Manage admission applications'],
    management: ['Admissions', 'Generated Management Admission Forms']
  };
  document.getElementById('page-title').textContent = titles[tab][0];
  document.getElementById('page-subtitle').textContent = titles[tab][1];

  if (tab === 'overview')   loadOverview();
  if (tab === 'enquiries')  loadEnquiries();
  if (tab === 'raw-enquiries') loadRawEnquiries();
  if (tab === 'admissions') loadAdmissions();
  if (tab === 'management') loadManagementStatus();
}

// ═══════════════ API HELPERS ═══════════════
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
  };
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options.headers }
  });
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Server error'); }
  return res.json();
}

// ═══════════════ OVERVIEW ═══════════════

async function loadOverview() {
  try {
    const sessionSelect = document.getElementById('global-academic-year');
    if (sessionSelect && sessionSelect.options.length === 0) {
      initGlobalYearDropdown();
    }
    const selectedYear = sessionSelect ? sessionSelect.value : '';
    const selectedCourse = document.getElementById('quality-course-filter')?.value || '';

    let url = `/api/admin/stats?`;
    if (selectedYear) url += `year=${selectedYear}&`;
    if (selectedCourse) url += `course=${encodeURIComponent(selectedCourse)}&`;

    const stats = await apiFetch(url);
    console.log('Overview Stats:', stats);
    
    document.getElementById('stat-enquiries').textContent   = stats.total_enquiries   || 0;
    document.getElementById('stat-admissions').textContent   = stats.total_admissions   || 0;
    
    if (document.getElementById('stat-management')) {
      document.getElementById('stat-management').textContent = stats.total_management || 0;
    }
    document.getElementById('stat-today-enq').textContent    = stats.today_enquiries    || 0;
    document.getElementById('stat-today-adm').textContent    = stats.today_admissions   || 0;

    if (document.getElementById('stat-raw-conv') && stats.graphs.raw_conversion) {
      const { total_raw, converted } = stats.graphs.raw_conversion;
      const rate = total_raw > 0 ? ((converted / total_raw) * 100).toFixed(1) : 0;
      document.getElementById('stat-raw-conv').textContent = `${rate}%`;
    }

    if (stats.quality) {
      if (document.getElementById('stat-avg-pcm')) document.getElementById('stat-avg-pcm').textContent = (stats.quality.avg_pcm || 0) + '%';
      if (document.getElementById('stat-avg-overall')) document.getElementById('stat-avg-overall').textContent = (stats.quality.avg_overall || 0) + '%';
    }

    if (stats.graphs) {
      lastGraphs = stats.graphs;
      lastStats = stats;
      renderCharts(stats.graphs, stats);
    }

    // Recent tables
    renderRecentTable('recent-enquiries-body', stats.recent_enquiries || [], 'enquiry');
    renderRecentTable('recent-admissions-body', stats.recent_admissions || [], 'admission');
    
    // Admitted Stats
    renderAdmittedStats();
    
    updateLastRefreshInfo();
  } catch (err) { console.error('Overview load error:', err); }
}

function initGlobalYearDropdown() {
  const select = document.getElementById('global-academic-year');
  if (!select) return;
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = -1; i <= 3; i++) {
    const y = 2026 + i;
    years.push(`${y}-${(y + 1).toString().slice(-2)}`);
  }
  select.innerHTML = years.map(y => `<option value="${y}" ${y === '2026-27' ? 'selected' : ''}>${y}</option>`).join('');
}




// ═══════════════ ADMITTED STATS LOGIC ═══════════════
const ADMITTED_COURSES = [
  { id: 'ECE', name: 'ECE', cet_int: 54, comed_int: 36, mgt_int: 30, branch: 'BE Electronics and Communication Engineering' },
  { id: 'CSE', name: 'CSE', cet_int: 108, comed_int: 72, mgt_int: 60, branch: 'BE Computer Science and Engineering' },
  { id: 'ISE', name: 'IS&E', cet_int: 27, comed_int: 18, mgt_int: 15, branch: 'BE Information Science and Engineering' },
  { id: 'ME', name: 'ME', cet_int: 13, comed_int: 9, mgt_int: 8, branch: 'BE Mechanical Engineering' },
  { id: 'CE', name: 'CE', cet_int: 13, comed_int: 9, mgt_int: 8, branch: 'BE Civil Engineering' },
  { id: 'CSCA', name: 'CS-CA', cet_int: 54, comed_int: 36, mgt_int: 30, branch: 'BE Computer Science and Engineering (Artificial Intelligence)' },
  { id: 'CSCY', name: 'CS-CY', cet_int: 27, comed_int: 18, mgt_int: 15, branch: 'BE Computer Science and Engineering (Cyber Security)' },
  { id: 'CSDS', name: 'CS-DS', cet_int: 54, comed_int: 36, mgt_int: 30, branch: 'BE Computer Science and Engineering (Data Science)' }
];

async function renderAdmittedStats() {
  const yearSelect = document.getElementById('global-academic-year');
  const selectedYear = yearSelect ? yearSelect.value : '2026-27';

  const tbody = document.getElementById('admitted-stats-body');
  const tfoot = document.getElementById('admitted-stats-footer');
  if (!tbody) return;

  // Fetch management counts
  let mgtData = [];
  try {
    const res = await apiFetch('/api/admin/management-forms');
    mgtData = res.rows || [];
    // Filter by academic year (check both full and short formats)
    const shortYear = selectedYear.split('-')[0].slice(-2) + '-' + selectedYear.split('-')[1];
    mgtData = mgtData.filter(m => m.academic_year === selectedYear || m.academic_year === shortYear);
  } catch (e) { console.error('Failed to fetch management forms for stats', e); }

  const mgtCounts = {};
  mgtData.forEach(m => {
    const b = m.branch;
    mgtCounts[b] = (mgtCounts[b] || 0) + 1;
  });

  // Load saved manual data from backend
  let savedData = {};
  try {
    savedData = await apiFetch(`/api/admin/stats/manual?year=${selectedYear}`);
  } catch(e) { console.error('Failed to fetch manual stats', e); }

  let totals = {
    cet_int: 0, cet_fill: 0, cet_snq: 0, cet_tot: 0,
    comed_int: 0, comed_fill: 0,
    mgt_int: 0, mgt_fill: 0,
    act_int: 0, act_fill: 0, act_vac: 0,
    tot_snq: 0, aicte: 0, overall: 0
  };

  tbody.innerHTML = ADMITTED_COURSES.map((c, i) => {
    const manual = savedData[c.id] || { cet_fill: 0, cet_snq: 0, comed_fill: 0, aicte: 0 };
    
    const mgt_fill = mgtCounts[c.branch] || 0;
    const cet_fill_val = parseInt(manual.cet_fill) || 0;
    const cet_snq_val = parseInt(manual.cet_snq) || 0;
    const comed_fill_val = parseInt(manual.comed_fill) || 0;
    const aicte_val = parseInt(manual.aicte) || 0;

    const cet_tot = cet_fill_val + cet_snq_val;
    const act_int = c.cet_int + c.comed_int + c.mgt_int;
    const act_fill = cet_fill_val + comed_fill_val + mgt_fill;
    const act_vac = act_int - act_fill;
    const tot_snq = act_fill + cet_snq_val;
    const overall = tot_snq + aicte_val;
    const actual_pct = act_int > 0 ? ((overall / act_int) * 100).toFixed(2) : '0.00';

    // Update totals
    totals.cet_int += c.cet_int;
    totals.cet_fill += cet_fill_val;
    totals.cet_snq += cet_snq_val;
    totals.cet_tot += cet_tot;
    totals.comed_int += c.comed_int;
    totals.comed_fill += comed_fill_val;
    totals.mgt_int += c.mgt_int;
    totals.mgt_fill += mgt_fill;
    totals.act_int += act_int;
    totals.act_fill += act_fill;
    totals.act_vac += act_vac;
    totals.tot_snq += tot_snq;
    totals.aicte += aicte_val;
    totals.overall += overall;

    return `
      <tr data-id="${c.id}">
        <td>${i + 1}</td>
        <td class="course-name">${c.name}</td>
        <td class="auto-cell">${c.cet_int}</td>
        <td class="editable-cell"><input type="number" min="0" class="stats-input" oninput="updateStatsRow(this)" data-field="cet_fill" value="${cet_fill_val}"></td>
        <td class="editable-cell"><input type="number" min="0" class="stats-input" oninput="updateStatsRow(this)" data-field="cet_snq" value="${cet_snq_val}"></td>
        <td class="auto-cell" data-calc="cet_tot">${cet_tot}</td>
        <td class="auto-cell">${c.comed_int}</td>
        <td class="editable-cell"><input type="number" min="0" class="stats-input" oninput="updateStatsRow(this)" data-field="comed_fill" value="${comed_fill_val}"></td>
        <td class="auto-cell">${c.mgt_int}</td>
        <td class="auto-cell" data-calc="mgt_fill">${mgt_fill}</td>
        <td class="auto-cell" data-calc="act_int">${act_int}</td>
        <td class="auto-cell" data-calc="act_fill">${act_fill}</td>
        <td class="auto-cell" data-calc="act_vac">${act_vac}</td>
        <td class="auto-cell" data-calc="tot_snq">${tot_snq}</td>
        <td class="editable-cell"><input type="number" min="0" class="stats-input" oninput="updateStatsRow(this)" data-field="aicte" value="${aicte_val}"></td>
        <td class="auto-cell" data-calc="overall">${overall}</td>
        <td class="auto-cell" data-calc="actual_pct">${actual_pct}%</td>
      </tr>
    `;
  }).join('');

  const final_pct = totals.act_int > 0 ? ((totals.overall / totals.act_int) * 100).toFixed(2) : '0.00';
  tfoot.innerHTML = `
    <tr>
      <td colspan="2">TOTAL</td>
      <td>${totals.cet_int}</td>
      <td id="tot-cet-fill">${totals.cet_fill}</td>
      <td id="tot-cet-snq">${totals.cet_snq}</td>
      <td id="tot-cet-tot">${totals.cet_tot}</td>
      <td>${totals.comed_int}</td>
      <td id="tot-comed-fill">${totals.comed_fill}</td>
      <td>${totals.mgt_int}</td>
      <td id="tot-mgt-fill">${totals.mgt_fill}</td>
      <td id="tot-act-int">${totals.act_int}</td>
      <td id="tot-act-fill">${totals.act_fill}</td>
      <td id="tot-act-vac">${totals.act_vac}</td>
      <td id="tot-tot-snq">${totals.tot_snq}</td>
      <td id="tot-aicte">${totals.aicte}</td>
      <td id="tot-overall">${totals.overall}</td>
      <td id="tot-actual-pct">${final_pct}%</td>
    </tr>
  `;
}

function updateStatsRow(el) {
  const row = el.closest('tr');
  const courseId = row.dataset.id;
  const config = ADMITTED_COURSES.find(c => c.id === courseId);
  
  const getVal = (field) => parseInt(row.querySelector(`[data-field="${field}"]`).value) || 0;
  
  const cet_fill = getVal('cet_fill');
  const cet_snq = getVal('cet_snq');
  const comed_fill = getVal('comed_fill');
  const aicte = getVal('aicte');
  const mgt_fill = parseInt(row.querySelector('[data-calc="mgt_fill"]').textContent) || 0;
  
  const cet_tot = cet_fill + cet_snq;
  const act_int = config.cet_int + config.comed_int + config.mgt_int;
  const act_fill = cet_fill + comed_fill + mgt_fill;
  const act_vac = act_int - act_fill;
  const tot_snq = act_fill + cet_snq;
  const overall = tot_snq + aicte;
  const actual_pct = act_int > 0 ? ((overall / act_int) * 100).toFixed(2) : '0.00';

  row.querySelector('[data-calc="cet_tot"]').textContent = cet_tot;
  row.querySelector('[data-calc="act_fill"]').textContent = act_fill;
  row.querySelector('[data-calc="act_vac"]').textContent = act_vac;
  row.querySelector('[data-calc="tot_snq"]').textContent = tot_snq;
  row.querySelector('[data-calc="overall"]').textContent = overall;
  row.querySelector('[data-calc="actual_pct"]').textContent = actual_pct + '%';
  
  updateStatsTotals();
}

function updateStatsTotals() {
  let totals = {
    cet_fill: 0, cet_snq: 0, cet_tot: 0,
    comed_fill: 0, mgt_fill: 0,
    act_int: 0, act_fill: 0, act_vac: 0,
    tot_snq: 0, aicte: 0, overall: 0
  };

  document.querySelectorAll('#admitted-stats-body tr').forEach(row => {
    const getVal = (f) => parseInt(row.querySelector(`[data-field="${f}"]`)?.value || row.querySelector(`[data-calc="${f}"]`)?.textContent) || 0;
    
    totals.cet_fill += getVal('cet_fill');
    totals.cet_snq += getVal('cet_snq');
    totals.cet_tot += getVal('cet_tot');
    totals.comed_fill += getVal('comed_fill');
    totals.mgt_fill += getVal('mgt_fill');
    totals.act_int += getVal('act_int');
    totals.act_fill += getVal('act_fill');
    totals.act_vac += getVal('act_vac');
    totals.tot_snq += getVal('tot_snq');
    totals.aicte += getVal('aicte');
    totals.overall += getVal('overall');
  });

  const final_pct = totals.act_int > 0 ? ((totals.overall / totals.act_int) * 100).toFixed(2) : '0.00';

  document.getElementById('tot-cet-fill').textContent = totals.cet_fill;
  document.getElementById('tot-cet-snq').textContent = totals.cet_snq;
  document.getElementById('tot-cet-tot').textContent = totals.cet_tot;
  document.getElementById('tot-comed-fill').textContent = totals.comed_fill;
  document.getElementById('tot-mgt-fill').textContent = totals.mgt_fill;
  document.getElementById('tot-act-int').textContent = totals.act_int;
  document.getElementById('tot-act-fill').textContent = totals.act_fill;
  document.getElementById('tot-act-vac').textContent = totals.act_vac;
  document.getElementById('tot-tot-snq').textContent = totals.tot_snq;
  document.getElementById('tot-aicte').textContent = totals.aicte;
  document.getElementById('tot-overall').textContent = totals.overall;
  document.getElementById('tot-actual-pct').textContent = final_pct + '%';
}

async function saveAdmittedStats() {
  const yearSelect = document.getElementById('global-academic-year');
  const selectedYear = yearSelect ? yearSelect.value : '2026-27';

  const data = {};
  document.querySelectorAll('#admitted-stats-body tr').forEach(row => {
    const id = row.dataset.id;
    data[id] = {
      cet_fill: parseInt(row.querySelector('[data-field="cet_fill"]').value) || 0,
      cet_snq: parseInt(row.querySelector('[data-field="cet_snq"]').value) || 0,
      comed_fill: parseInt(row.querySelector('[data-field="comed_fill"]').value) || 0,
      aicte: parseInt(row.querySelector('[data-field="aicte"]').value) || 0
    };
  });
  
  try {
    await apiFetch('/api/admin/stats/manual', {
      method: 'POST',
      body: JSON.stringify({ year: selectedYear, data })
    });
    showToast(`Statistics for ${selectedYear} saved successfully`);
  } catch (e) {
    console.error('Failed to save manual stats', e);
    alert('Failed to save statistics');
  }
}


function renderCharts(graphs, stats) {
  if (!graphs) return;
  Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";
  Chart.defaults.color = '#64748b';

  // 1. Ratio Chart (Conversion) - Modern Area Chart
  const ratioCtx = document.getElementById('ratioChart');
  if (ratioCtx && stats) {
    if (ratioChartInstance) ratioChartInstance.destroy();
    
    const enqCount = stats.total_enquiries || 0;
    const admCount = stats.total_admissions || 0;
    const mgtCount = stats.total_management || 0;
    
    // Percentage stats
    const convRate = enqCount > 0 ? ((admCount / enqCount) * 100).toFixed(1) : 0;
    const mgtRate = admCount > 0 ? ((mgtCount / admCount) * 100).toFixed(1) : 0;
    
    const statsEl = document.getElementById('conversion-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <span style="color:#3b82f6">Enq → App: <b>${convRate}%</b></span>
        <span style="margin:0 10px; color:#e2e8f0">|</span>
        <span style="color:#10b981">App → Mgt: <b>${mgtRate}%</b></span>
      `;
    }

    ratioChartInstance = new Chart(ratioCtx, {
      type: 'line',
      data: {
        labels: ['Phase 1: Enquiries', 'Phase 2: Applications', 'Phase 3: Provisional Admissions'],
        datasets: [{
          label: 'Student Count',
          data: [enqCount, admCount, mgtCount],
          borderColor: '#3b82f6',
          borderWidth: 4,
          backgroundColor: createChartGradient(ratioCtx, 'rgba(59, 130, 246, 0.4)', 'rgba(59, 130, 246, 0)'),
          fill: true,
          tension: 0.4, // Smooth curve
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#3b82f6',
          pointBorderWidth: 3,
          pointRadius: 6,
          pointHoverRadius: 9,
          pointHoverBorderWidth: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b',
            padding: 15,
            cornerRadius: 12,
            titleFont: { size: 14, weight: 'bold' },
            bodyFont: { size: 14 },
            displayColors: false,
            callbacks: {
              label: (ctx) => ` Total Count: ${ctx.parsed.y}`
            }
          }
        },
        scales: {
          y: { 
            beginAtZero: true, 
            grid: { display: true, color: '#f1f5f9', drawBorder: false },
            ticks: { stepSize: 5 }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // 2. Pincode Chart (Individual Filter)
  const pinCtx = document.getElementById('pincodeChart');
  const pinType = document.getElementById('pincode-data-type')?.value || 'enquiry';
  let pinDataRaw = [];
  
  if (pinType === 'enquiry') pinDataRaw = graphs.enquiry_pincodes || [];
  else if (pinType === 'application') pinDataRaw = graphs.application_pincodes || [];
  else pinDataRaw = graphs.admission_pincodes || [];
  
  if (pinCtx && pinDataRaw) {
    if (pincodeChartInstance) pincodeChartInstance.destroy();
    
    // Dynamic Grouping Logic: Keep top 12, group rest into "Others"
    const MAX_SLICES = 12;
    let finalLabels = [];
    let finalData = [];
    
    let othersDataGroup = [];
    if (pinDataRaw.length > MAX_SLICES) {
      const top = pinDataRaw.slice(0, MAX_SLICES - 1);
      othersDataGroup = pinDataRaw.slice(MAX_SLICES - 1);
      const othersCount = othersDataGroup.reduce((sum, p) => sum + parseInt(p.count), 0);
      
      finalLabels = top.map(p => p.pincode || 'Unspecified');
      finalData = top.map(p => p.count);
      finalLabels.push(`Others (${othersDataGroup.length} regions)`);
      finalData.push(othersCount);
    } else {
      finalLabels = pinDataRaw.map(p => p.pincode || 'Unspecified');
      finalData = pinDataRaw.map(p => p.count);
    }

    pincodeChartInstance = new Chart(pinCtx, {
      type: 'doughnut',
      data: {
        labels: finalLabels,
        datasets: [{
          data: finalData,
          backgroundColor: [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
            '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#94a3b8',
            '#0ea5e9', '#84cc16', '#a855f7', '#fb7185', '#2dd4bf'
          ],
          borderWidth: 4,
          borderColor: '#ffffff',
          hoverOffset: 15,
          spacing: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const label = finalLabels[index];
            if (label.includes('Others')) {
              showOthersRegionsModal(othersDataGroup, pinType);
            }
          }
        },
        onHover: (event, chartElement) => {
          event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
        },
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 8, usePointStyle: true, padding: 15, font: { size: 11, weight: '600' } } },
          tooltip: {
            backgroundColor: '#1e293b',
            padding: 12,
            cornerRadius: 10,
          }
        }
      }
    });
  }

  // 3. Gender Chart (Individual Filter)
  const genCtx = document.getElementById('genderChart');
  const genType = document.getElementById('gender-data-type')?.value || 'application';
  
  if (genCtx) {
    if (genderChartInstance) genderChartInstance.destroy();
    let genData = [];
    if (genType === 'enquiry') genData = graphs.enquiry_gender || [];
    else if (genType === 'application') genData = graphs.application_gender || [];
    else if (genType === 'admission') genData = graphs.admission_gender || [];
    
    if (genData.length === 0) {
      // Show empty state
      const labelMsg = genType === 'enquiry' ? 'No Gender Data for Enquiries' : `No Gender Data for ${genType}s`;
      genderChartInstance = new Chart(genCtx, {
        type: 'doughnut',
        data: { labels: [labelMsg], datasets: [{ data: [1], backgroundColor: ['#f1f5f9'] }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
      });
    } else {
      const labels = genData.map(g => g.gender || 'Not Specified');
      const data = genData.map(g => g.count);
      genderChartInstance = new Chart(genCtx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#94a3b8'],
            borderWidth: 4,
            borderColor: '#ffffff',
            hoverOffset: 15,
            spacing: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { position: 'right', labels: { boxWidth: 8, usePointStyle: true, padding: 15, font: { size: 11, weight: '600' } } },
            tooltip: { backgroundColor: '#1e293b', padding: 12, cornerRadius: 10 }
          }
        }
      });
    }
  }

  // 4. Timeline Chart (Line Chart)
  const timeCtx = document.getElementById('timelineChart');
  if (timeCtx) {
    if (timelineChartInstance) timelineChartInstance.destroy();
    
    // Merge dates
    const dateMap = {};
    (graphs.enquiry_timeline || []).forEach(t => { 
      dateMap[t.date] = { enq: parseInt(t.count) || 0, app: 0, adm: 0 }; 
    });
    (graphs.admission_timeline || []).forEach(t => { 
      if (!dateMap[t.date]) dateMap[t.date] = { enq: 0, app: 0, adm: 0 };
      dateMap[t.date].app = parseInt(t.count) || 0;
    });
    (graphs.management_timeline || []).forEach(t => { 
      if (!dateMap[t.date]) dateMap[t.date] = { enq: 0, app: 0, adm: 0 };
      dateMap[t.date].adm = parseInt(t.count) || 0;
    });

    const sortedDates = Object.keys(dateMap).sort();
    const enqData = sortedDates.map(d => dateMap[d].enq);
    const appData = sortedDates.map(d => dateMap[d].app);
    const mgtData = sortedDates.map(d => dateMap[d].adm);

    // Dynamic width for scrollability
    const container = document.getElementById('timelineContainer');
    if (container) {
      const minW = Math.max(container.parentElement.clientWidth, sortedDates.length * 50);
      container.style.width = minW + 'px';
    }

    timelineChartInstance = new Chart(timeCtx, {
      type: 'line',
      data: {
        labels: sortedDates,
        datasets: [
          { label: 'Enquiries', data: enqData, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.4, borderWidth: 3, pointBackgroundColor: '#f59e0b' },
          { label: 'Applications', data: appData, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.4, borderWidth: 3, pointBackgroundColor: '#3b82f6' },
          { label: 'Admissions', data: mgtData, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4, borderWidth: 3, pointBackgroundColor: '#10b981' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { weight: '600' } } } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.5)', borderDash: [5, 5] }, ticks: { precision: 0 } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // 5. Source of Lead Chart (Doughnut)
  const srcCtx = document.getElementById('sourceChart');
  if (srcCtx) {
    if (sourceChartInstance) sourceChartInstance.destroy();
    
    const rawSrcData = graphs.lead_sources || [];
    const normalizedMap = {};
    
    rawSrcData.forEach(s => {
      let ref = (s.reference || '').toLowerCase().trim();
      let target = s.reference; // fallback
      
      // Grouping logic
      if (ref.includes('family') || ref.includes('relative') || ref.includes('friend') || ref.includes('yuvaraj') || ref.includes('crpf')) {
        target = 'Family & Friends';
      } else if (ref === 'direct') {
        target = 'Direct';
      } else if (ref.includes('student') || ref.includes('passed') || ref.includes(' reddy') || ref.includes('divaya') || ref.includes('varshini')) {
        target = 'Student Referral';
      } else if (ref.includes('staff') || ref.includes('murthy') || ref.includes('chairman') || ref.includes('driver')) {
        target = 'Staff';
      } else if (ref === 'online' || ref === 'website') {
        target = 'Online';
      } else if (ref.length > 0) {
        target = s.reference.charAt(0).toUpperCase() + s.reference.slice(1);
      } else {
        target = 'Unknown';
      }
      
      normalizedMap[target] = (normalizedMap[target] || 0) + parseInt(s.count || 0);
    });

    const srcLabels = Object.keys(normalizedMap);
    const srcCounts = Object.values(normalizedMap);

    sourceChartInstance = new Chart(srcCtx, {
      type: 'doughnut',
      data: {
        labels: srcLabels,
        datasets: [{
          data: srcCounts,
          backgroundColor: ['#ec4899', '#8b5cf6', '#14b8a6', '#f59e0b', '#3b82f6', '#10b981', '#6366f1'],
          borderWidth: 3, borderColor: '#ffffff', hoverOffset: 10
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 8, usePointStyle: true, font: { size: 10 } } } }
      }
    });
  }

  // 6. Geographic Distribution Chart (Horizontal Bar)
  const stateCtx = document.getElementById('stateChart');
  if (stateCtx) {
    if (stateChartInstance) stateChartInstance.destroy();
    const stateData = graphs.application_states || [];
    stateChartInstance = new Chart(stateCtx, {
      type: 'bar',
      data: {
        labels: stateData.map(s => s.state),
        datasets: [{
          label: 'Applications',
          data: stateData.map(s => s.count),
          backgroundColor: 'rgba(139, 92, 246, 0.8)',
          borderRadius: 6,
          barPercentage: 0.6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.5)', borderDash: [5, 5] }, ticks: { precision: 0 } },
          y: { grid: { display: false }, ticks: { font: { weight: '600' } } }
        }
      }
    });
  }

  // 7. Course Demand Chart (Horizontal Bar - Modern 3D Style)
  const courseCtx = document.getElementById('courseChart');
  if (courseCtx) {
    if (courseChartInstance) courseChartInstance.destroy();
    const courseType = document.getElementById('course-data-type')?.value || 'application';
    let cData = [];
    if (courseType === 'enquiry') cData = graphs.enquiry_courses;
    else if (courseType === 'application') cData = graphs.application_courses;
    else cData = graphs.admission_courses;
    cData = cData || [];

    courseChartInstance = new Chart(courseCtx, {
      type: 'bar',
      data: {
        labels: cData.map(c => c.course),
        datasets: [{
          label: courseType === 'enquiry' ? 'Enquiry Score' : (courseType === 'application' ? 'Weighted Demand' : 'Confirmed Admissions'),
          data: cData.map(c => c.count),
          backgroundColor: createChartGradient(courseCtx, 
            courseType === 'enquiry' ? 'rgba(245, 158, 11, 0.95)' : (courseType === 'application' ? 'rgba(14, 165, 233, 0.95)' : 'rgba(16, 185, 129, 0.95)'), 
            courseType === 'enquiry' ? 'rgba(245, 158, 11, 0.3)' : (courseType === 'application' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(52, 211, 153, 0.3)')
          ),
          borderColor: courseType === 'enquiry' ? '#f59e0b' : (courseType === 'application' ? '#0ea5e9' : '#10b981'),
          borderWidth: 1.5,
          borderRadius: { topRight: 12, bottomRight: 12, topLeft: 4, bottomLeft: 4 },
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }]
      },
      options: {
        indexAxis: 'y', // Horizontal bars for long labels
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 12,
            cornerRadius: 10,
            titleFont: { size: 12, weight: 'bold' },
            bodyFont: { size: 12 },
            displayColors: false,
            callbacks: {
              label: (ctx) => ` Total Score: ${ctx.parsed.x}`
            }
          }
        },
        scales: {
          x: { 
            beginAtZero: true, 
            grid: { color: 'rgba(226, 232, 240, 0.6)', borderDash: [5, 5], drawBorder: false },
            ticks: { font: { size: 10, weight: '600' }, color: '#64748b' }
          },
          y: { 
            grid: { display: false },
            ticks: { 
              font: { weight: '700', size: 11, family: "'Inter', sans-serif" },
              color: '#334155',
              padding: 10
            }
          }
        },
        animation: {
          duration: 2000,
          easing: 'easeOutQuart'
        }
      }
    });
  }

  // 8. Academic Quality Comparison Chart (Modern Bar Style)
  const qualityCtx = document.getElementById('qualityChart');
  if (qualityCtx) {
    if (qualityChartInstance) qualityChartInstance.destroy();
    
    // Use values directly from UI elements populated in loadOverview
    const pcmVal = parseFloat(document.getElementById('stat-avg-pcm').textContent) || 0;
    const overallVal = parseFloat(document.getElementById('stat-avg-overall').textContent) || 0;

    qualityChartInstance = new Chart(qualityCtx, {
      type: 'bar',
      data: {
        labels: ['Current Batch Quality'],
        datasets: [
          {
            label: 'Avg PCM %',
            data: [pcmVal],
            backgroundColor: createChartGradient(qualityCtx, '#10b981', 'rgba(16, 185, 129, 0.1)'),
            borderColor: '#10b981',
            borderWidth: 1.5,
            borderRadius: { topRight: 15, bottomRight: 15, topLeft: 8, bottomLeft: 8 },
            barPercentage: 0.5,
            categoryPercentage: 0.6
          },
          {
            label: 'Avg Overall %',
            data: [overallVal],
            backgroundColor: createChartGradient(qualityCtx, '#6366f1', 'rgba(99, 102, 241, 0.1)'),
            borderColor: '#6366f1',
            borderWidth: 1.5,
            borderRadius: { topRight: 15, bottomRight: 15, topLeft: 8, bottomLeft: 8 },
            barPercentage: 0.5,
            categoryPercentage: 0.6
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'bottom', 
            labels: { 
              usePointStyle: true, 
              boxWidth: 8, 
              padding: 20,
              font: { size: 11, weight: '700' } 
            } 
          },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.x}%`
            }
          }
        },
        scales: {
          x: { 
            max: 100, 
            beginAtZero: true, 
            grid: { color: 'rgba(226, 232, 240, 0.5)', borderDash: [5, 5] },
            ticks: { 
              font: { size: 10, weight: '600' },
              callback: v => v + '%' 
            }
          },
          y: { 
            display: false,
            grid: { display: false } 
          }
        },
        animation: {
          duration: 1800,
          easing: 'easeOutBounce'
        }
      }
    });
  }

  // 9. Raw Conversion Chart
  if (stats.graphs && stats.graphs.raw_conversion) {
    renderConversionChart(stats.graphs.raw_conversion);
  }
}


// Helper for 3D-like gradients
function createChartGradient(canvas, color1, color2) {
  if (!canvas) return color1;
  const chartCtx = canvas.getContext('2d');
  const gradient = chartCtx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}


function renderRecentTable(tbodyId, rows, type) {
  const tbody = document.getElementById(tbodyId);
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><span class="material-icons-round">inbox</span><p>No records yet</p></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((r, i) => {
    let highlightClass = "";
    if (type === "enquiry") {
      if (r.has_management) highlightClass = 'style="background:rgba(56, 189, 248, 0.35)"';
      else if (r.has_application) highlightClass = 'style="background:rgba(245, 158, 11, 0.3)"';

      return `<tr ${highlightClass}>
        <td>${i + 1}</td>
        <td>${r.token_number || '—'}</td>
        <td>${r.student_name || '—'}</td>
        <td>${r.student_email || '—'}</td>
        <td>${r.student_mobile || '—'}</td>
        <td>${formatDate(r.enquiry_date)}</td>
        <td>${r.reference || '—'}</td>
      </tr>`;
    } else {
      if (r.has_management) highlightClass = 'style="background:rgba(56, 189, 248, 0.35)"';

      return `<tr ${highlightClass}>
        <td>${i + 1}</td>
        <td>${r.application_number || '—'}</td>
        <td>${r.student_name || '—'}</td>
        <td>${r.email || '—'}</td>
        <td>${r.mobile_no || '—'}</td>
        <td>${formatDate(r.application_date)}</td>
        <td>${r.course_preference || '—'}</td>
      </tr>`;
    }
  }).join('');
}

// ═══════════════ ENQUIRIES ═══════════════
async function loadEnquiries() {
  try {
    const data = await apiFetch('/api/admin/enquiries');
    allEnquiries = data.rows || [];
    renderEnquiries(allEnquiries);
    updateLastRefreshInfo();
  } catch (err) { console.error('Enquiries load error:', err); }
}

let lastFilteredEnquiries = [];

function renderEnquiries(rows) {
  lastFilteredEnquiries = rows;
  const tbody = document.getElementById('enquiries-body');
  document.getElementById('enq-count').textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><span class="material-icons-round">inbox</span><p>No enquiries found</p></td></tr>`;
    return;
  }
  
  const role = sessionStorage.getItem('admin_role');
  
  tbody.innerHTML = rows.map((r, i) => {
    const remark = r.admin_remarks || '— Select Action —';
    const followUpText = r.follow_up_date ? formatDate(r.follow_up_date) : 'No Date';
    
    let highlightClass = "";
    if (r.follow_up_status === 'Stopped') highlightClass = 'class="row-stopped"';
    else if (r.has_management) highlightClass = 'style="background:rgba(56, 189, 248, 0.35)"';
    else if (r.has_application) highlightClass = 'style="background:rgba(245, 158, 11, 0.3)"';

    return `<tr ${highlightClass}>
    <td>${i + 1}</td>
    <td>${r.id}</td>
    <td>${r.token_number || '—'}</td>
    <td>${r.student_name || '—'}</td>
    <td>${r.student_mobile || '—'}</td>
    <td>${r.reference || '—'}</td>
    <td class="remarks-cell">
      <div class="remarks-group-unified">
        <div class="remarks-pill-main" onclick="openActionMenu(${r.id}, this)">
          <div class="pill-remark">${remark}</div>
          <div class="pill-date"><span class="material-icons-round">event</span> ${followUpText}</div>
        </div>
        <div class="remarks-menu-popover" id="menu-${r.id}">
          <div class="menu-option action-opt" onclick="updateRemarks(${r.id}, 'admin_remarks', 'Booking Done')">Booking Done</div>
          <div class="menu-option action-opt" onclick="updateRemarks(${r.id}, 'admin_remarks', 'After CET')">After CET</div>
          <div class="menu-option action-opt" onclick="updateRemarks(${r.id}, 'admin_remarks', 'After COMEDK')">After COMEDK</div>
          <div class="menu-option action-opt" style="color: #6366f1; font-weight: 700;" onclick="promptOtherRemark(${r.id})">
            <span class="material-icons-round" style="font-size: 16px; vertical-align: middle;">add</span> Other...
          </div>
          <div class="menu-divider"></div>
          <div class="menu-option date-opt" onclick="this.nextElementSibling.showPicker()">Set/Change Follow-up Date</div>
          <input type="date" value="${r.follow_up_date ? new Date(r.follow_up_date).toISOString().split('T')[0] : ''}" 
                 onchange="updateRemarks(${r.id}, 'follow_up_date', this.value)" 
                 style="position:absolute;visibility:hidden;width:0;height:0;">
        </div>
      </div>
    </td>
    <td>${formatDate(r.enquiry_date)}</td>
    <td class="action-btns">
      <button class="btn btn-view" onclick="viewEnquiry(${r.id})" title="View Details"><span class="material-icons-round" style="font-size:16px">visibility</span></button>
      <button class="btn btn-print" onclick="printEnquiry(${r.id})" title="Print Enquiry"><span class="material-icons-round" style="font-size:16px">print</span></button>
      ${r.follow_up_status === 'Stopped' 
        ? `<button class="btn btn-start" onclick="resumeFollowUp(${r.id})" title="Enable Follow-up" style="background:#10b981; color:white; border:none;"><span class="material-icons-round" style="font-size:16px">play_arrow</span></button>`
        : `<button class="btn btn-stop" onclick="stopFollowUp(${r.id})" title="Stop Follow-up"><span class="material-icons-round" style="font-size:16px">block</span></button>`
      }
      ${role !== 'counsellor' ? `<button class="btn btn-delete" onclick="deleteEnquiry(${r.id})" title="Delete Record"><span class="material-icons-round" style="font-size:16px">delete</span></button>` : ''}
    </td>
  </tr>`}).join('');
}

async function stopFollowUp(id) {
  if (!confirm('Are you sure you want to STOP follow-up for this student? This will clear the follow-up date and mark the row as stopped.')) return;
  
  try {
    const result = await apiFetch(`/api/admin/enquiry/${id}/stop-follow-up`, { method: 'PUT' });
    if (result.success) {
      showToast('Follow-up stopped');
      loadEnquiries(); // Refresh table
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    showToast('Failed to stop follow-up: ' + err.message, 'error');
  }
}

async function resumeFollowUp(id) {
  if (!confirm('Resume follow-up for this student?')) return;
  try {
    const res = await apiFetch(`/api/admin/enquiry/${id}/resume-follow-up`, { method: 'PUT' });
    if (res.success) {
      showToast('Follow-up resumed');
      loadEnquiries();
    }
  } catch (err) { 
    showToast('Failed to resume follow-up: ' + err.message, 'error');
  }
}



function exportEnquiriesCSV() {
  if (!lastFilteredEnquiries.length) return showToast('No records to export', 'error');
  
  const headers = ['ID', 'Token', 'Name', 'Email', 'Mobile', 'Reference', 'Qualification', 'Board', 'PCM %', 'Total %', 'Status', 'Follow-up', 'Follow-up Status', 'Hostel', 'Transport', 'Course Prefs', 'Enquiry Date'];
  const rows = lastFilteredEnquiries.map(r => {
    let prefs = '';
    try {
      const pArr = JSON.parse(r.course_preferences || '[]');
      prefs = Array.isArray(pArr) ? pArr.map(p => typeof p === 'object' ? `${p.course} (₹${p.fee || 0})` : p).join(' | ') : (r.course_preferences || '');
    } catch { prefs = r.course_preferences || ''; }
    
    return [
      r.id,
      r.token_number || '',
      r.student_name || '',
      r.student_email || '',
      r.student_mobile || '',
      r.reference || '',
      r.education_qualification || '',
      r.education_board || '',
      r.pcm_percentage || '',
      r.total_percentage || '',
      r.admin_remarks || '',
      r.follow_up_date ? formatDate(r.follow_up_date) : '',
      r.follow_up_status || 'Active',
      r.hostel_required ? 'YES' : 'NO',
      r.transport_required ? 'YES' : 'NO',
      prefs,
      formatDate(r.enquiry_date)
    ];
  });
  
  downloadCSV('Enquiries_Export.csv', headers, rows);
}

function downloadCSV(filename, headers, rows) {
  const content = [
    headers.join(','),
    ...rows.map(r => r.map(val => `"${(val || '').toString().replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function openActionMenu(id, pillElement) {
  // Close all other menus first
  document.querySelectorAll('.remarks-menu-popover.active').forEach(m => m.classList.remove('active'));
  const menu = document.getElementById(`menu-${id}`);
  menu.classList.toggle('active');
  
  // Close menu if clicked outside
  const closeMenu = (e) => {
    if (!pillElement.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('active');
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

async function updateRemarks(id, field, value) {
  try {
    // Find the local record and update it immediately for a fast UI
    const rowIdx = allEnquiries.findIndex(enq => enq.id === id);
    if (rowIdx !== -1) {
      allEnquiries[rowIdx][field] = value;
      
      // Close all menus
      document.querySelectorAll('.remarks-menu-popover.active').forEach(m => m.classList.remove('active'));

      // Re-render UI immediately to show changes
      renderEnquiries(allEnquiries);

      // Persist to database
      await apiFetch(`/api/admin/enquiry/${id}/remarks`, {
        method: 'PUT',
        body: JSON.stringify({
          follow_up_date: allEnquiries[rowIdx].follow_up_date,
          admin_remarks: allEnquiries[rowIdx].admin_remarks
        })
      });
      showToast('Changes saved');
    }
  } catch (err) {
    console.error('Update remarks error:', err);
    showToast('Failed to save changes', 'error');
  }
}

function filterEnquiries() {
  const search = document.getElementById('enq-search').value.toLowerCase();
  const dateFilter = document.getElementById('enq-filter-date').value;
  
  const followupDropdown = document.getElementById('enq-filter-followup');
  const followupCustom = document.getElementById('enq-filter-followup-custom');
  let followupFilter = followupDropdown ? followupDropdown.value : null;

  if (followupDropdown && followupCustom) {
    if (followupFilter === 'custom') {
      followupCustom.style.display = 'inline-block';
      followupFilter = followupCustom.value; 
    } else {
      followupCustom.style.display = 'none';
      followupCustom.value = '';
    }
  }

  const actionFilter = document.getElementById('enq-filter-action').value;
  const courseFilter = document.getElementById('enq-filter-course').value;
  const statusFilter = document.getElementById('enq-filter-status').value;
  let filtered = allEnquiries;

  if (search) {
    filtered = filtered.filter(r => {
      const prefs = (typeof r.course_preferences === 'string' ? r.course_preferences : JSON.stringify(r.course_preferences || [])).toLowerCase();
      return (r.student_name || '').toLowerCase().includes(search) ||
             (r.student_email || '').toLowerCase().includes(search) ||
             (r.token_number || '').toLowerCase().includes(search) ||
             (r.student_mobile || '').includes(search) ||
             (r.reference || '').toLowerCase().includes(search) ||
             prefs.includes(search);
    });
  }

  if (dateFilter) filtered = filterByDate(filtered, 'enquiry_date', dateFilter);
  if (followupFilter) filtered = filterByDate(filtered, 'follow_up_date', followupFilter);
  if (actionFilter) filtered = filtered.filter(r => (r.admin_remarks || '') === actionFilter);

  if (statusFilter) {
    if (statusFilter === 'applied') filtered = filtered.filter(r => r.has_application);
    if (statusFilter === 'management') filtered = filtered.filter(r => r.has_management);
    if (statusFilter === 'none') filtered = filtered.filter(r => !r.has_application && !r.has_management);
    if (statusFilter === 'stopped') filtered = filtered.filter(r => r.follow_up_status === 'Stopped');
  }

  if (courseFilter) {
    filtered = filtered.filter(r => {
      let firstPref = '';
      try {
        const prefsArray = typeof r.course_preferences === 'string' 
          ? JSON.parse(r.course_preferences || '[]') 
          : (r.course_preferences || []);
        const first = Array.isArray(prefsArray) ? prefsArray[0] : null;
        firstPref = (typeof first === 'object' ? first.course : (first || '')).toLowerCase();
      } catch (e) {
        firstPref = '';
      }
      
      if (courseFilter === 'CSE_ANY') {
        return firstPref.includes('computer science');
      }
      return firstPref === courseFilter.toLowerCase();
    });
  }

  renderEnquiries(filtered);
}

async function viewEnquiry(id) {
  try {
    const data = await apiFetch(`/api/admin/enquiry/${id}`);
    const r = data.row;
    let prefsHtml = '';
    try { 
        let prefsArray = [];
        if (typeof r.course_preferences === 'string') {
            prefsArray = JSON.parse(r.course_preferences || '[]');
        } else {
            prefsArray = r.course_preferences || [];
        }
        
        let seenPrefs = new Set();
        prefsArray = (Array.isArray(prefsArray) ? prefsArray : []).filter(p => {
            let c = typeof p === 'object' ? p.course : p;
            if (!c) return false;
            c = String(c).trim();
            if (seenPrefs.has(c)) return false;
            seenPrefs.add(c);
            return true;
        });
        
        if (prefsArray.length > 0) {
            prefsHtml = `<table style="width:100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 5px;">
                <tr style="background: #f1f5f9; text-align: left;">
                    <th style="padding: 5px; border: 1px solid #e2e8f0;">#</th>
                    <th style="padding: 5px; border: 1px solid #e2e8f0;">Course</th>
                    <th style="padding: 5px; border: 1px solid #e2e8f0;">Fee</th>
                </tr>
                ${prefsArray.map((p, i) => `
                    <tr>
                        <td style="padding: 5px; border: 1px solid #e2e8f0;">${i+1}</td>
                        <td style="padding: 5px; border: 1px solid #e2e8f0;">${typeof p === 'object' ? p.course : p}</td>
                        <td style="padding: 5px; border: 1px solid #e2e8f0;">${typeof p === 'object' && p.fee ? '₹' + p.fee : '—'}</td>
                    </tr>
                `).join('')}
            </table>`;
        } else {
            prefsHtml = '—';
        }
    } catch { 
        prefsHtml = r.course_preferences || '—'; 
    }

    const role = sessionStorage.getItem('admin_role');

    document.getElementById('modal-title').textContent = `Enquiry #${r.id} — ${r.student_name}`;
    document.getElementById('modal-body').innerHTML = `
      <div class="detail-grid">
        ${detailItem('Token Number', r.token_number, false, 'token_number', true)}
        ${detailItem('Date', formatDate(r.enquiry_date), false)}
        ${detailItem('Student Name', r.student_name, false, 'student_name', true)}
        ${detailItem('Gender', r.gender, false, 'gender', true)}
        ${detailItem('Email', r.student_email, false, 'student_email', true)}
        ${detailItem('Mobile', r.student_mobile, false, 'student_mobile', true)}
        ${detailItem('Father', r.father_name, false, 'father_name', true)}
        ${detailItem('Father Mobile', r.father_mobile, false, 'father_mobile', true)}
        ${detailItem('Mother', r.mother_name, false, 'mother_name', true)}
        ${detailItem('Mother Mobile', r.mother_mobile, false, 'mother_mobile', true)}
        ${detailItem('Address', r.address || [r.address_line1, r.address_line2, r.address_city, r.address_district, r.address_state, r.address_pincode].filter(Boolean).join(', '), true, 'address', true)}
        ${detailItem('Qualification', r.education_qualification, false, 'education_qualification', true)}
        ${detailItem('Board', r.education_board, false, 'education_board', true)}
        ${detailItem('Expected %', r.expected_percentage != null ? r.expected_percentage + '%' : '—', false, 'expected_percentage', true)}
        ${detailItem('Result Status', r.result_status, false, 'result_status', true)}
        ${detailItem('Hostel Req.', r.hostel_required ? 'YES' : 'NO', false, 'hostel_required', false)}
        ${r.hostel_required ? detailItem('Hostel Details', `${r.hostel_type} (₹${r.hostel_fee})`, true) : ''}
        ${detailItem('Transport Req.', r.transport_required ? 'YES' : 'NO', false, 'transport_required', false)}
        ${r.transport_required ? detailItem('Transport Details', `${r.transport_route} (₹${r.transport_fee})`, true) : ''}
        
        ${detailHeader('11th Marks (AP/TS Students)')}
        ${detailItem('Physics', r.physics_11, false, 'physics_11', true)}
        ${detailItem('Chemistry', r.chemistry_11, false, 'chemistry_11', true)}
        ${detailItem('Math A', r.math_11a, false, 'math_11a', true)}
        ${detailItem('Math B', r.math_11b, false, 'math_11b', true)}
        ${detailItem('English', r.english_11, false, 'english_11', true)}
        ${detailItem('Language', r.language_11, false, 'language_11', true)}
        
        ${detailHeader('12th Marks')}
        ${detailItem('Physics 12 Th.', r.physics_marks, false, 'physics_marks', true)}
        ${detailItem('Physics 12 Pr.', r.physics_12_prac, false, 'physics_12_prac', true)}
        ${detailItem('Chem 12 Th.', r.chemistry_marks, false, 'chemistry_marks', true)}
        ${detailItem('Chem 12 Pr.', r.chemistry_12_prac, false, 'chemistry_12_prac', true)}
        ${detailItem('Math 12 A', r.math_12a, false, 'math_12a', true)}
        ${detailItem('Math 12 B', r.math_12b, false, 'math_12b', true)}
        ${detailItem('Math Standard', r.mathematics_marks, false, 'mathematics_marks', true)}
        ${detailItem('English 12th', r.english_12, false, 'english_12', true)}
        ${detailItem('Kannada/Sanskrit/Hindi', r.kannada_12, false, 'kannada_12', true)}
        ${detailItem('Other Subjects', r.other_12, false, 'other_12', true)}
        
        ${detailHeader('Entrance Exams')}
        ${detailItem('JEE Rank', r.jee_rank, false, 'jee_rank', true)}
        ${detailItem('COMEDK Rank', r.comedk_rank, false, 'comedk_rank', true)}
        ${detailItem('CET Rank', r.cet_rank, false, 'cet_rank', true)}
        
        ${detailHeader('Percentages & Prefs')}
        ${detailItem('Total %', r.total_percentage != null ? r.total_percentage + '%' : '—', false, 'total_percentage', true)}
        ${detailItem('PCM %', r.pcm_percentage != null ? r.pcm_percentage + '%' : '—', false, 'pcm_percentage', true)}
        ${detailItem('Course Preferences & Fees', prefsHtml, true)}
        ${detailItem('Reference', r.reference, false, 'reference', true)}
      </div>
      <div style="margin-top: 24px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 20px; gap: 12px;">
        ${role === 'admin' ? `
        <button class="btn btn-save" style="padding: 10px 24px; font-size: 0.9rem; background: #10b981; color: white; border: none; display: flex; align-items: center; gap: 8px;" onclick="saveEnquiryChanges(${r.id})">
          <span class="material-icons-round" style="font-size:20px">save</span> Save Changes
        </button>
        ` : '<div></div>'}
        <button class="btn btn-print" style="padding: 10px 24px; font-size: 0.9rem;" onclick="printEnquiry(${r.id})">
          <span class="material-icons-round" style="font-size:20px">print</span> Print Enquiry Form
        </button>
      </div>`;
    document.getElementById('detail-modal').classList.add('open');
  } catch (err) { alert('Failed to load enquiry details'); }
}

async function saveEnquiryChanges(id) {
  const modal = document.getElementById('detail-modal');
  const inputs = modal.querySelectorAll('.detail-input');
  const payload = {};
  inputs.forEach(inp => {
    const key = inp.dataset.key;
    let val = inp.value.trim();
    
    // Clean up percentage signs if user added them
    if (['expected_percentage', 'total_percentage', 'pcm_percentage'].includes(key)) {
        val = val.replace('%', '');
        val = val === '' ? null : parseFloat(val);
    } else if (val === '') {
        val = null;
    }
    
    payload[key] = val;
  });

  try {
    const btn = modal.querySelector('.btn-save');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Saving...';
    btn.disabled = true;

    const res = await apiFetch(`/api/admin/enquiry/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    if (res.success) {
      showToast('Enquiry updated successfully');
      loadEnquiries(); // Refresh the table
      closeModal();
    }
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  } finally {
    const btn = modal.querySelector('.btn-save');
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }
}


function performHiddenPrint(htmlContent) {
  // Use window.open() instead of a hidden iframe.
  // Iframes are blocked by browsers on deployed servers due to X-Frame-Options
  // and Content-Security-Policy headers set by Nginx, causing "Print Failed".
  const printWin = window.open('', '_blank', 'width=900,height=700');
  if (!printWin) {
    alert('Print popup was blocked. Please allow popups for this site and try again.');
    return;
  }

  printWin.document.open();
  printWin.document.write(htmlContent);
  printWin.document.close();

  // Wait for all images and styles to load before printing
  printWin.onload = function () {
    setTimeout(() => {
      printWin.focus();
      printWin.print();
      // Auto-close the print window after the dialog is dismissed
      printWin.onafterprint = function () { printWin.close(); };
    }, 500);
  };

  // Fallback: if onload doesn't fire (e.g. some browsers), trigger after 1.5s
  setTimeout(() => {
    if (!printWin.closed) {
      printWin.focus();
      try { printWin.print(); } catch(e) { console.error('Print error:', e); }
    }
  }, 1500);
}

async function printEnquiry(id) {
  const token = sessionStorage.getItem('admin_token');
  window.open(`${API}/api/admin/enquiry/${id}/print?token=${encodeURIComponent(token)}`, '_blank');
}

async function _old_printEnquiry_unused(id) {
  try {
    const data = await apiFetch(`/api/admin/enquiry/${id}`);
    const r = data.row;

    const logoUrl = window.location.origin + '/image copy.png';
    let prefsArray = [];
    if (typeof r.course_preferences === 'string') {
        try { prefsArray = JSON.parse(r.course_preferences || '[]'); } catch { prefsArray = []; }
    } else {
        prefsArray = r.course_preferences || [];
    }
    prefsArray = Array.isArray(prefsArray) ? prefsArray : [];
    
    // Formatting helper
    const val = (v) => (v === null || v === undefined || v === '') ? 'N/A' : v;
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ' - ') : 'N/A';
    const fmtTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Enquiry Form - ${r.student_name}</title>
        <style>
          @page { size: A4; margin: 4mm 8mm; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #333; font-size: 9.8px; line-height: 1.22; }
          
          .top-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3px; }
          .qr-box { text-align: center; }
          .qr-box img { width: 80px; height: 80px; }
          .qr-box p { margin: 1px 0 0; font-size: 6.5px; color: #555; font-weight: 600; }
          .meta-right-block { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; padding-top: 5px; }
          .token-val { font-weight: 700; font-size: 12px; border-bottom: 1px solid #000; padding-bottom: 1px; }
          .date-box { border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 8px; font-weight: 600; font-size: 11px; }
          .created-at { font-size: 7.5px; color: #888; margin-top: 1px; }
          .logo-banner { height: 45px; margin-bottom: 2px; }

          table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
          th, td { border: 1px solid #64748b; padding: 3px 5px; text-align: left; }
          .section-header { background: #f8fafc; color: #1e40af; font-weight: 700; font-size: 10.5px; }
          .label { font-weight: 500; width: 18%; background: #f8fafc; }
          .value { font-weight: 500; width: 32%; }
          .sub-section-header { background: #f8fafc; color: #1e40af; font-weight: 700; font-size: 10px; }
          
          .pref-table td { border-top: none; border-bottom: 1px solid #64748b; }
          .pref-num { width: 25px; text-align: center; }

          .office-section { margin-top: 5px; }
          .office-title { background: #f8fafc; color: #1e40af; font-weight: 700; font-size: 10px; padding: 4px 8px; border: 1px solid #64748b; border-bottom: none; }
          .office-box { border: 1px solid #64748b; min-height: 210px; }

          @media print {
            .no-print { display: none; }
            body { -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>

        <div class="top-bar">
          <div class="qr-box">
            <a href="${window.location.origin + '/admission-form/?enquiry_id=' + r.id}" target="_blank" style="text-decoration:none;">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=1e3a5f&data=${encodeURIComponent(window.location.origin + '/admission-form/?enquiry_id=' + r.id)}" alt="Admission QR">
            </a>
            <p>Click or Scan for Application Form</p>
          </div>
          <div class="meta-right-block">
            <div>Token No.: <span class="token-val">${val(r.token_number)}</span></div>
            <div>Date: <span class="date-box">${fmtDate(r.enquiry_date)}</span></div>
            <div class="created-at">Created At: ${fmtTime(r.created_at)}</div>
          </div>
        </div>

        <div style="text-align: center; margin: -5px 0 8px; border-bottom: 2px solid #1e3a5f; padding-bottom: 5px;">
           <div style="font-weight: 800; font-size: 13.5px; color: #1e3a5f; letter-spacing: 0.5px;">ADMISSION ENQUIRY FORM</div>
           <div style="font-size: 11px; font-weight: 700; color: #3b82f6;">Academic Year: ${new Date().getFullYear()}-${new Date().getFullYear() + 1}</div>
        </div>

        <table>
          <tr class="section-header">
            <th colspan="2">Personal Details</th>
            <th colspan="2">Contact Details</th>
          </tr>
          <tr>
            <td class="label">Full Name:</td><td class="value">${val(r.student_name)}</td>
            <td class="label">Student Email:</td><td class="value">${val(r.student_email)}</td>
          </tr>
          <tr>
            <td class="label">Father's Name:</td><td class="value">${val(r.father_name)}</td>
            <td class="label">Student Mobile:</td><td class="value">${val(r.student_mobile)}</td>
          </tr>
          <tr>
            <td class="label">Mother's Name:</td><td class="value">${val(r.mother_name)}</td>
            <td class="label">Education Qualification:</td><td class="value">${val(r.education_qualification)}</td>
          </tr>
          <tr>
            <td class="label" rowspan="3">Address:</td><td class="value" rowspan="3">${val(r.address || [r.address_line1, r.address_line2, r.address_city, r.address_district, r.address_state, r.address_pincode].filter(Boolean).join(', '))}</td>
            <td class="label">Father's Mobile:</td><td class="value">${val(r.father_mobile)}</td>
          </tr>
          <tr>
            <td class="label">Mother's Mobile:</td><td class="value">${val(r.mother_mobile)}</td>
          </tr>
          <tr>
            <td class="label">Reference:</td><td class="value">${val(r.reference)}</td>
          </tr>
        </table>

        <table>
          <tr class="sub-section-header">
            <th colspan="6">11th Standard Details (For AP/Telangana students only)</th>
          </tr>
          <tr style="background: #f8fafc; font-weight: 600;">
            <th>Physics (Theory)</th><th>Chemistry (Theory)</th><th>Mathematics (A)</th><th>Mathematics (B)</th><th>English</th><th>Language</th>
          </tr>
          <tr>
            <td>${val(r.physics_11)}</td><td>${val(r.chemistry_11)}</td><td>${val(r.math_11a)}</td><td>${val(r.math_11b)}</td><td>${val(r.english_11)}</td><td>${val(r.language_11)}</td>
          </tr>
        </table>

        <table>
          <tr class="sub-section-header">
            <th colspan="6">12th Standard Details (For AP/Telangana students only)</th>
          </tr>
          <tr style="background: #f8fafc; font-weight: 600;">
            <th>Physics (Theory)</th><th>Physics (Practical)</th><th>Chemistry (Theory)</th><th>Chemistry (Practical)</th><th>Mathematics (A)</th><th>Mathematics (B)</th>
          </tr>
          <tr>
            <td>${val(r.physics_marks)}</td><td>${val(r.physics_12_prac)}</td><td>${val(r.chemistry_marks)}</td><td>${val(r.chemistry_12_prac)}</td><td>${val(r.math_12a)}</td><td>${val(r.math_12b)}</td>
          </tr>
        </table>

        <table>
          <tr class="sub-section-header">
            <th colspan="3">Kannada, English, Other Subjects (Optional)</th>
          </tr>
          <tr style="background: #f8fafc; font-weight: 600;">
            <th>Kannada/Telugu/Sanskrit</th><th>English</th><th>Other Subject Marks</th>
          </tr>
          <tr>
            <td>${val(r.kannada_12)}</td><td>${val(r.english_12)}</td><td>${val(r.other_12)}</td>
          </tr>
        </table>

        <table>
          <tr class="sub-section-header">
            <th colspan="2">Percentage Details</th>
          </tr>
          <tr style="background: #f8fafc; font-weight: 600;">
            <th>Total Percentage</th><th>PCM Percentage</th>
          </tr>
          <tr>
            <td>${val(r.total_percentage)}${r.total_percentage ? '%' : ''}</td><td>${val(r.pcm_percentage)}${r.pcm_percentage ? '%' : ''}</td>
          </tr>
        </table>

        <table>
          <tr class="sub-section-header">
            <th colspan="3">Entrance Exam Detail</th>
          </tr>
          <tr style="background: #f8fafc; font-weight: 600;">
            <th>JEE Rank</th><th>COMEDK Rank</th><th>CET Rank</th>
          </tr>
          <tr>
            <td>${val(r.jee_rank)}</td><td>${val(r.comedk_rank)}</td><td>${val(r.cet_rank)}</td>
          </tr>
        </table>

        <table class="pref-table">
          <tr class="sub-section-header">
            <th colspan="4">Course Preference Order & Fees</th>
          </tr>
          <tr style="background: #f8fafc; font-weight: 600;">
            <th style="width: 25px; text-align: center;">#</th>
            <th>Course Name</th>
            <th style="width: 80px;">Fee (Agreed)</th>
            <th style="width: 150px;">Remarks</th>
          </tr>
          ${prefsArray.map((p, i) => `
            <tr>
              <td class="pref-num">${i + 1}.</td>
              <td style="white-space: normal;">${typeof p === 'object' ? p.course : p}</td>
              <td style="text-align: center;">${typeof p === 'object' && p.fee ? '₹' + p.fee : '—'}</td>
              ${i === 0 ? `<td rowspan="${prefsArray.length}" style="background: #fff;"></td>` : ''}
            </tr>
          `).join('') || '<tr><td colspan="4">No preferences selected</td></tr>'}
          <tr style="background: #f8fafc; font-weight: 700; font-size: 10px;">
            <td style="text-align: right; padding: 4px; border-right: none;">Hostel:</td>
            <td style="padding: 4px; border-left: none; border-right: none;">${r.hostel_required ? (r.hostel_type.replace('(Only Accomm)', '').replace('(With Food)', '').trim() + ' (₹' + r.hostel_fee + ')') : 'NO'}</td>
            <td colspan="2" style="padding: 4px; border-left: none;"><span style="font-weight:700">Transport:</span> ${r.transport_required ? (r.transport_route + ' (₹' + r.transport_fee + ')') : 'NO'}</td>
          </tr>
        </table>

        <div class="office-section">
          <div class="office-title">For Office Work</div>
          <div class="office-box"></div>
        </div>

        <div style="display:flex; justify-content:space-between; margin-top:40px; font-weight:700; font-size:10px;">
          <div style="text-align:center; width:30%; border-top:1px solid #000; padding-top:5px;">Student Signature</div>
          <div style="text-align:center; width:30%; border-top:1px solid #000; padding-top:5px;">Parent/Guardian Signature</div>
          <div style="text-align:center; width:30%; border-top:1px solid #000; padding-top:5px;">Office Signature</div>
        </div>


      </body>
      </html>
    `;
    
    performHiddenPrint(html);

  } catch (err) { alert('Failed to generate print view'); console.error(err); }
}
// END old printEnquiry

async function deleteEnquiry(id) {
  if (!confirm(`Delete enquiry #${id}? This cannot be undone.`)) return;
  try {
    await fetch(`${API}/api/admin/enquiry/${id}`, { method: 'DELETE', headers: authHeaders() });
    loadEnquiries();
  } catch (err) { alert('Delete failed'); }
}

// ═══════════════ ADMISSIONS ═══════════════
async function loadAdmissions() {
  try {
    const data = await apiFetch('/api/admin/admissions');
    allAdmissions = data.rows || [];
    renderAdmissions(allAdmissions);
    updateLastRefreshInfo();
  } catch (err) { console.error('Admissions load error:', err); }
}

function renderAdmissions(rows) {
  const tbody = document.getElementById('admissions-body');
  document.getElementById('adm-count').textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty-state"><span class="material-icons-round">inbox</span><p>No admissions found</p></td></tr>`;
    return;
  }

  const role = sessionStorage.getItem('admin_role');

  tbody.innerHTML = rows.map((r, i) => {
    let highlightClass = "";
    if (r.has_management) highlightClass = 'style="background:rgba(56, 189, 248, 0.35)"';

    return `<tr ${highlightClass}>
    <td>${i + 1}</td>
    <td>${r.id}</td>
    <td>${r.application_number || '—'}</td>
    <td>${r.student_name || '—'}</td>
    <td>${r.email || '—'}</td>
    <td>${r.mobile_no || '—'}</td>
    <td>${formatDate(r.date_of_birth)}</td>
    <td>${r.course_preference || '—'}</td>
    <td>${r.program_preference || '—'}</td>
    <td>${r.payment_utr_no || '—'}</td>
    <td>${formatDate(r.application_date)}</td>
    <td class="action-btns">
      <button class="btn btn-view" onclick="viewAdmission(${r.id})" title="View Details"><span class="material-icons-round" style="font-size:16px">visibility</span></button>
      <button class="btn btn-print" onclick="printAdmission(${r.id})" title="Print Confirmation"><span class="material-icons-round" style="font-size:16px">print</span></button>
      
      <!-- Edit Lifecycle Actions & Status -->
      <div class="edit-lifecycle-wrap" style="display:inline-flex; align-items:center; gap:6px; margin:0 4px; vertical-align:middle;">
        ${r.edit_requested && !r.edit_enabled && !r.is_resubmitted ? `
          <button class="btn btn-approve-edit" onclick="enableAdmissionEdit(${r.id})" title="Approve Edit Request">
            <span class="material-icons-round">rule</span>
            <span>Approve</span>
          </button>
          <button class="btn btn-reject-edit" style="background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; padding: 4px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600;" onclick="rejectAdmissionEdit(${r.id})" title="Reject/Clear Request">
            <span class="material-icons-round" style="font-size:14px">close</span>
            <span>Reject</span>
          </button>
          <span class="status-badge tag-request" style="cursor:pointer;" onclick="openAuditLog(${r.id})" title="View Audit Log">
            <span class="dot pulse"></span> Edit Requested
          </span>
        ` : ''}
        
        ${r.edit_enabled ? `
          <span class="status-badge tag-enabled" style="cursor:pointer;" onclick="openAuditLog(${r.id})" title="View Audit Log">
            <span class="material-icons-round" style="font-size:14px">check_circle</span> Edit Enabled
          </span>
        ` : ''}

        ${r.is_resubmitted && !r.edit_enabled ? `
          <span class="status-badge tag-resubmitted" style="cursor:pointer;" onclick="openAuditLog(${r.id})" title="View Audit Log">
            <span class="material-icons-round" style="font-size:14px">update</span> RS
          </span>
        ` : ''}
      </div>

      ${role !== 'counsellor' ? `<button class="btn btn-print" style="background: var(--accent-purple-glow); color: var(--accent-purple);" onclick="openManagementFormEditor(${r.id})" title="Generate Management Form"><span class="material-icons-round" style="font-size:16px">description</span></button>` : ''}
      ${role !== 'counsellor' ? `<button class="btn btn-delete" onclick="deleteAdmission(${r.id})" title="Delete Record"><span class="material-icons-round" style="font-size:16px">delete</span></button>` : ''}
    </td>
  </tr>`}).join('');
}

async function enableAdmissionEdit(id) {
  if (!confirm('Are you sure you want to unlock this application to allow the candidate to resubmit?')) return;
  try {
    await apiFetch(`/api/admin/admissions/${id}/enable-edit`, { method: 'POST' });
    showToast('Candidate can now edit and resubmit their application.');
    loadAdmissions();
    // Auto-open audit log after enabling
    openAuditLog(id, 'admission');
  } catch (err) {
    alert('Failed to enable: ' + err.message);
  }
}

async function rejectAdmissionEdit(id) {
  if (!confirm('Are you sure you want to clear this edit request? The candidate will no longer be able to edit unless requested again.')) return;
  try {
    await apiFetch(`/api/admin/admissions/${id}/reject-edit`, { method: 'POST' });
    showToast('Edit request cleared');
    loadAdmissions();
  } catch (err) {
    alert('Failed to reject: ' + err.message);
  }
}

function filterAdmissions() {
  const search = document.getElementById('adm-search').value.toLowerCase();
  const dateFilter = document.getElementById('adm-filter-date').value;
  const courseFilter = document.getElementById('adm-filter-course').value;
  let filtered = allAdmissions;

  if (search) {
    filtered = filtered.filter(r =>
      (r.student_name || '').toLowerCase().includes(search) ||
      (r.email || '').toLowerCase().includes(search) ||
      (r.application_number || '').toLowerCase().includes(search) ||
      (r.mobile_no || '').includes(search)
    );
  }

  if (dateFilter) filtered = filterByDate(filtered, 'application_date', dateFilter);

  if (courseFilter) {
    if (courseFilter === 'CSE_ANY') {
      filtered = filtered.filter(r => (r.course_preference || '').toLowerCase().includes('computer science'));
    } else {
      filtered = filtered.filter(r => (r.course_preference || '').toLowerCase() === courseFilter.toLowerCase());
    }
  }

  renderAdmissions(filtered);
}

async function viewAdmission(id) {
  try {
    const data = await apiFetch(`/api/admin/admission/${id}`);
    const r = data.row;
    const role = sessionStorage.getItem('admin_role');
    document.getElementById('modal-title').innerHTML = `
      <div style="display:flex; align-items:center; gap:12px; width:100%;">
        <span class="material-icons-round" style="color:var(--accent);">assignment</span>
        <span>Admission #${r.id} — ${r.student_name}</span>
        <div style="margin-left:auto; display:flex; gap:8px;">
          <button class="btn btn-print" style="padding:6px 12px; font-size:13px; display:flex; align-items:center; gap:6px;" onclick="printAdmission(${r.id})">
            <span class="material-icons-round" style="font-size:16px;">print</span> Print Confirmation
          </button>
          ${role !== 'counsellor' ? `
          <button class="btn btn-print" style="padding:6px 12px; font-size:13px; display:flex; align-items:center; gap:6px; background: var(--accent-purple-glow); color: var(--accent-purple);" onclick="openManagementFormEditor(${r.id})">
            <span class="material-icons-round" style="font-size:16px;">description</span> Management Form
          </button>
          ` : ''}
        </div>
      </div>`;
    document.getElementById('modal-body').innerHTML = `
      <div class="detail-grid">
        ${detailHeader('Personal Information')}
        ${detailItem('Application No.', r.application_number)}
        ${detailItem('Date', formatDate(r.application_date))}
        ${detailItem('Title', r.title)}
        ${detailItem('Student Name', r.student_name)}
        ${detailItem('Email', r.email)}
        ${detailItem('Mobile', r.mobile_no)}
        ${detailItem('DOB', formatDate(r.date_of_birth))}
        ${detailItem('Gender', r.gender)}
        ${detailItem('Aadhaar No.', r.aadhaar_no || '—')}

        ${detailHeader('Course Selection')}
        ${detailItem('Institute', r.selected_institute || 'Engineering - SVCE')}
        ${(() => {
          let firstPref = '—';
          try {
            const ps = typeof r.course_preferences === 'string' ? JSON.parse(r.course_preferences) : (r.course_preferences || []);
            if (ps && ps[0]) firstPref = typeof ps[0] === 'object' ? ps[0].course : ps[0];
          } catch(e) {}
          return detailItem('Primary Course', r.course_preference || firstPref);
        })()}
        ${detailItem('Programme', r.program_preference || '—')}

        ${detailHeader('Course Preferences & Fees')}
        <div class="detail-item" style="grid-column: 1/-1; margin-top: 5px;">
          ${(() => {
            let prefsArray = [];
            try {
              prefsArray = typeof r.course_preferences === 'string' ? JSON.parse(r.course_preferences || '[]') : (r.course_preferences || []);
            } catch(e) { prefsArray = []; }
            
            if (!Array.isArray(prefsArray) || prefsArray.length === 0) {
              return '<div style="color:#64748b; font-style:italic;">No preferences selected</div>';
            }

            return `
              <table style="width:100%; border-collapse: collapse; font-size: 0.85rem; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
                <thead>
                  <tr style="background: #f8fafc; text-align: left;">
                    <th style="padding: 8px 12px; border: 1px solid #e2e8f0; width: 40px;">#</th>
                    <th style="padding: 8px 12px; border: 1px solid #e2e8f0;">Course</th>
                    <th style="padding: 8px 12px; border: 1px solid #e2e8f0; width: 100px;">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  ${prefsArray.map((p, i) => `
                    <tr>
                      <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">${i+1}</td>
                      <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #1e293b;">${typeof p === 'object' ? p.course : p}</td>
                      <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">${typeof p === 'object' && p.fee ? '₹' + p.fee : '—'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `;
          })()}
        </div>

        ${detailHeader('Address Details')}
        ${detailItem('Comm. Address', [r.comm_address_line1, r.comm_address_line2, r.comm_city, r.comm_district, r.comm_state, r.comm_country, r.comm_pincode].filter(Boolean).join(', '), true)}
        ${detailItem('Perm. Address Same?', r.same_as_comm ? 'Yes' : 'No')}
        ${r.same_as_comm ? '' : detailItem('Perm. Address', [r.perm_address_line1, r.perm_address_line2, r.perm_city, r.perm_district, r.perm_state, r.perm_country, r.perm_pincode].filter(Boolean).join(', '), true)}
        
        ${detailHeader('Parent Details')}
        ${detailItem('Father', r.father_name)}
        ${detailItem('Father Mobile', r.father_mobile)}
        ${detailItem('Father Occupation', r.father_occupation)}
        ${detailItem('Mother', r.mother_name)}
        ${detailItem('Mother Mobile', r.mother_mobile)}
        ${detailItem('Mother Occupation', r.mother_occupation)}

        ${detailHeader('Educational & Entrance Stats')}
        ${detailItem('Marksheet Name', r.candidate_name_marksheet)}
        ${detailItem('12th Institution', r.twelfth_institution)}
        ${detailItem('12th Board', r.twelfth_board)}
        ${detailItem('12th Stream', r.twelfth_stream || '—')}
        ${detailItem('12th Year Passing', r.twelfth_year_passing || '—')}
        ${detailItem('12th Marking Scheme', r.twelfth_marking_scheme || '—')}
        ${detailItem('12th Result', r.twelfth_result_status || '—')}
        ${detailItem('12th % / CGPA', (r.twelfth_percentage || '—') + '%')}
        ${detailItem('Entrance Exams', r.entrance_exams || 'None', true)}

        ${detailHeader('Payment & Documents')}
        ${detailItem('Payment UTR', r.payment_utr_no || '—')}
        ${detailItem('Declaration Accepted', r.declaration_accepted ? 'Yes' : 'No')}
        ${r.passport_photo_path ? detailItem('Passport Photo', `<a href="${r.passport_photo_path}" target="_blank" style="color:var(--accent); text-decoration:underline;">View Photo ↗</a>`) : ''}
        ${r.signature_path ? detailItem('Signature', `<a href="${r.signature_path}" target="_blank" style="color:var(--accent); text-decoration:underline;">View Signature ↗</a>`) : ''}
        ${r.twelfth_marksheet_path ? detailItem('12th Marksheet', `<a href="${r.twelfth_marksheet_path}" target="_blank" style="color:var(--accent); text-decoration:underline;">View Marksheet ↗</a>`) : ''}
        ${r.payment_receipt_path ? detailItem('Payment Receipt', `<a href="${r.payment_receipt_path}" target="_blank" style="color:var(--accent); text-decoration:underline;">View Receipt ↗</a>`) : ''}
      </div>`;
    document.getElementById('detail-modal').classList.add('open');
  } catch (err) { alert('Failed to load admission details'); }
}

async function printAdmission(id) {
  const token = sessionStorage.getItem('admin_token');
  window.open(`${API}/api/admin/admission/${id}/print?token=${encodeURIComponent(token)}`, '_blank');
}

async function openManagementFormEditor(id) {
  try {
    const data = await apiFetch(`/api/admin/admission/${id}`);
    const r = data.row;

    // Helper to format values
    const val = (v) => (v === null || v === undefined || v === '') ? '' : v;
    
    // Calculate default annual fee based on preferred course
    let defaultFee = 0;
    const initialFeeMap = {
      "BE Computer Science and Engineering": 375000,
      "BE Computer Science and Engineering (Artificial Intelligence)": 375000,
      "BE Computer Science and Engineering (Data Science)": 350000,
      "BE Computer Science and Engineering (Cyber Security)": 350000,
      "BE Information Science and Engineering": 350000,
      "BE Electronics and Communication Engineering": 300000,
      "BE Mechanical Engineering": 125000,
      "BE Civil Engineering": 125000
    };
    if (r.course_preference && initialFeeMap[r.course_preference]) {
      defaultFee = initialFeeMap[r.course_preference];
    }

    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/');
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const yearBoxes = (currentYear.toString().slice(-2) + nextYear.toString().slice(-2)).split('');

    document.getElementById('modal-title').textContent = 'Full Management Form Editor';
    document.getElementById('modal-body').innerHTML = `
      <style>
        .editor-form { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #000; padding: 10px; max-height: 75vh; overflow-y: auto; }
        .editor-form table { width: 100%; border-collapse: collapse; margin-bottom: 10px; border: 1.5px solid #000; }
        .editor-form td { border: 1px solid #000; padding: 4px 8px; vertical-align: middle; }
        .editor-form .label { background: #f1f5f9; font-weight: 700; width: 25%; font-size: 11px; }
        .editor-form input { width: 100%; border: none; padding: 4px; font-weight: 700; font-size: 11.5px; background: transparent; outline: none; }
        .editor-form input:focus { background: #eef2ff; }
        .editor-form .section-header { text-align: center; border: 2px solid #000; padding: 4px; font-weight: 800; margin-bottom: 10px; background: #e2e8f0; text-transform: uppercase; }
        .editor-form .meta-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 700; font-size: 11px; }
        .editor-form .meta-input { border: 1.5px solid #000; padding: 2px 8px; min-width: 60px; font-weight: 800; }
        .entrance-table th { background: #f1f5f9; font-size: 10px; border: 1px solid #000; padding: 4px; }
        .action-footer { display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 15px; }
        .btn-save-print { background: #6366f1; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 700; display: flex; align-items: center; gap: 8px; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        .btn-save-print:hover { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
        .btn-cancel { background: #f1f5f9; color: #475569; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 700; }
      </style>

      <div class="editor-form">
        <div class="section-header">ENGINEERING MANAGEMENT PROVISIONAL ADMISSION FORM</div>

        
        <div class="meta-row">
          <div>App No: <input type="text" id="ed-app-no" value="${r.application_number}" class="meta-input" style="width:140px; display:inline-block;"></div>
          <div>Contineo ID: <input type="text" id="ed-contineo-id" value="" class="meta-input" style="width:110px; display:inline-block;"></div>
          <div>Academic Year: 20<input type="text" id="ed-y1" value="${yearBoxes[0]}${yearBoxes[1]}" class="meta-input" style="width:30px; display:inline-block;">-20<input type="text" id="ed-y2" value="${yearBoxes[2]}${yearBoxes[3]}" class="meta-input" style="width:30px; display:inline-block;"></div>
          <div>Date: <input type="text" id="ed-date" value="${today}" class="meta-input" style="width:80px; display:inline-block;"></div>
        </div>

        <table>
          <tr>
            <td class="label">Student Name</td><td><input type="text" id="ed-student-name" value="${r.student_name}"></td>
            <td class="label">Phone No.</td><td><input type="text" id="ed-mobile" value="${r.student_mobile || r.mobile_no}"></td>
          </tr>
          <tr>
            <td class="label">Father/Mother Name</td><td><input type="text" id="ed-parent-name" value="${r.father_name || r.mother_name}"></td>
            <td class="label">Parent Mobile</td><td><input type="text" id="ed-parent-mobile" value="${r.father_mobile || r.mother_mobile}"></td>
          </tr>
          <tr>
            <td class="label">Branch Selected</td><td>
              <select id="ed-branch" style="width:100%; border:none; padding:4px; font-weight:700; font-size:11px; background:transparent; outline:none; text-overflow: ellipsis;" onchange="updateActualFeeByBranch()">
                <option value="">-- Select Branch --</option>
                ${[
                  "BE Computer Science and Engineering",
                  "BE Computer Science and Engineering (Artificial Intelligence)",
                  "BE Computer Science and Engineering (Data Science)",
                  "BE Computer Science and Engineering (Cyber Security)",
                  "BE Information Science and Engineering",
                  "BE Electronics and Communication Engineering",
                  "BE Mechanical Engineering",
                  "BE Civil Engineering"
                ].map(c => `<option value="${c}" ${r.course_preference === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </td>
            <td class="label">State</td><td><input type="text" id="ed-state" value="${r.perm_state || 'Karnataka'}"></td>
          </tr>
          <tr>
            <td class="label">Email</td><td><input type="text" id="ed-email" value="${r.student_email || r.email}"></td>
            <td class="label">Actual Fee (₹)</td><td><input type="number" id="ed-actual-fee" value="${defaultFee}" oninput="updateEdNet()"></td>
          </tr>
          <tr>
            <td class="label">PUC/+2 Board</td><td><input type="text" id="ed-board" value="${r.education_board || r.twelfth_board}"></td>
            <td class="label">Scholarship (₹)</td><td><input type="number" id="ed-scholarship" value="0" oninput="updateEdNet()"></td>
          </tr>
          <tr>
            <td class="label">Booking Fee (₹)</td><td><input type="text" id="ed-booking-fee" value=""></td>
            <td class="label">Net Payable (₹)</td><td><input type="text" id="ed-net-payable" value="${defaultFee.toLocaleString()}" readonly style="color:#10b981;"></td>
          </tr>
        </table>

        <div style="font-weight: 700; font-size: 11px; margin-bottom: 5px;">Reference: <input type="text" id="ed-reference" value="${val(r.reference || r.admin_remarks || 'Direct')}" style="border-bottom: 1px solid #000; width: 300px; display:inline-block;"></div>
        
        <table class="entrance-table">
          <thead>
            <tr>
              <th>Physics + Math + ... %</th>
              <th>Overall %</th>
              <th>CET Rank</th>
              <th>COMEDK Rank</th>
              <th>JEE Rank</th>
              <th>CET No</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><input type="text" id="ed-pcm" value="${val(r.pcm_percentage || '')}"></td>
              <td><input type="text" id="ed-total" value="${val(r.twelfth_percentage || r.total_percentage || '')}"></td>
              <td><input type="text" id="ed-cet" value="${val(r.cet_rank || '')}"></td>
              <td><input type="text" id="ed-comedk" value="${val(r.comedk_rank || '')}"></td>
              <td><input type="text" id="ed-jee" value="${val(r.jee_rank || '')}"></td>
              <td><input type="text" id="ed-cet-no" value=""></td>
            </tr>
          </tbody>
        </table>

        <div style="border: 1px solid #000; padding: 5px; margin-bottom: 10px;">
          <div style="font-weight: 800; font-size: 10px;">Address:</div>
          <textarea id="ed-address" style="width:100%; border:none; font-weight:700; font-size:11px; outline:none; font-family:inherit; resize:none;" rows="2">${val([r.comm_address_line1, r.comm_address_line2, r.comm_city, r.comm_state, r.comm_pincode].filter(Boolean).join(', ')) || val([r.address_line1, r.address_line2, r.address_city, r.address_state, r.address_pincode].filter(Boolean).join(', '))}</textarea>
        </div>

        <div style="border: 1px solid #000; padding: 5px; margin-bottom: 5px;">
          <div style="font-weight: 800; font-size: 10px;">Remarks:</div>
          <input type="text" id="ed-remarks" value="${val(r.admin_remarks)}">
        </div>

        <div class="action-footer">
          <button class="btn-cancel" onclick="closeModal()">Cancel</button>
          <button class="btn-save-print" onclick="saveAndPrintManagementForm(${r.id})">
            <span class="material-icons-round">print</span>
            SAVE RECORD & GENERATE PRINT
          </button>
        </div>
      </div>
    `;


    
    window.updateEdNet = () => {
      const actual = parseFloat(document.getElementById('ed-actual-fee').value) || 0;
      const scholarship = parseFloat(document.getElementById('ed-scholarship').value) || 0;
      document.getElementById('ed-net-payable').value = (actual - scholarship).toLocaleString();
    };

    window.updateActualFeeByBranch = () => {
      const branchSel = document.getElementById('ed-branch');
      const bVal = branchSel.value;
      const feeMap = {
        "BE Computer Science and Engineering": 375000,
        "BE Computer Science and Engineering (Artificial Intelligence)": 375000,
        "BE Computer Science and Engineering (Data Science)": 350000,
        "BE Computer Science and Engineering (Cyber Security)": 350000,
        "BE Information Science and Engineering": 350000,
        "BE Electronics and Communication Engineering": 300000,
        "BE Mechanical Engineering": 125000,
        "BE Civil Engineering": 125000
      };
      if (feeMap[bVal] !== undefined) {
        document.getElementById('ed-actual-fee').value = feeMap[bVal];
        window.updateEdNet();
      }
    };

    document.getElementById('detail-modal').classList.add('open');
  } catch (err) { alert('Failed to open management editor'); console.error(err); }
}

async function finalPrintManagementForm() {
  try {
    const get = (id) => document.getElementById(id)?.value || '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Management Form - ${get('ed-student-name')}</title>
        <style>
          @page { size: A4; margin: 8mm 12mm; }
          * { box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; color: #000; font-size: 10.5px; line-height: 1.3; width: 100%; }
          
          /* ───── NEW OFFICIAL HEADER ───── */
          .official-header { display: flex; align-items: stretch; margin-bottom: 12px; border-bottom: 2px solid #000; width: 100%; border-top: 1px solid #000; }
          
          .header-left-wrap {
            background: #000;
            clip-path: polygon(0 0, 100% 0, 92% 100%, 0% 100%);
            flex: 1.4;
            padding-right: 3px; /* This creates the black slanted line */
          }
          
          .header-left { 
            background: #cbd5e1; 
            padding: 10px 30px 10px 15px; 
            display: flex; 
            align-items: center; 
            gap: 15px; 
            height: 100%;
            clip-path: polygon(0 0, 100% 0, 92% 100%, 0% 100%); 
          }
          .header-left img { height: 50px; width: auto; object-fit: contain; }
          .college-info { line-height: 1.15; padding: 4px 0; }
          .college-name { font-size: 24px; font-weight: 800; color: #1e293b; letter-spacing: -0.5px; }
          .college-name span { font-weight: 400; font-size: 14px; margin-left: 10px; border-left: 2px solid #94a3b8; padding-left: 10px; display: inline-block; vertical-align: middle; }
          .sub-name { font-size: 11px; font-weight: 800; color: #334155; display: block; margin-bottom: 4px; text-transform: uppercase; }
          .estd { font-size: 9px; font-weight: 700; color: #64748b; letter-spacing: 1.5px; margin-top: 5px; text-transform: uppercase; }

          .header-right { 
            flex: 1; 
            padding: 8px 0 8px 15px; 
            font-size: 9px; 
            font-weight: 600; 
            color: #334155; 
            display: flex; 
            flex-direction: column; 
            justify-content: center; 
          }
          .contact-table { width: 100% !important; border: none !important; margin: 0 !important; }
          .contact-table td { border: none !important; padding: 1px 0 !important; height: auto !important; font-size: 8.5px !important; }
          .contact-label { width: 45px; font-weight: 700; color: #64748b; }
          .contact-sep { width: 10px; text-align: center; }

          /* ─────────────────────────────── */

          .form-title { text-align: center; background: #fff; padding: 4px; font-size: 14px; font-weight: 810; border: 2px solid #000; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.8px; }
          
          .meta-info { display: flex; justify-content: space-between; margin-bottom: 12px; font-weight: 700; align-items: center; width: 100%; }
          .box-input { border: 1.5px solid #000; padding: 2px 8px; display: inline-block; min-width: 100px; background: #fff; }
          .year-boxes { display: inline-flex; align-items: center; gap: 2px; }
          .year-boxes span { border: 1.5px solid #000; padding: 0px 4px; font-family: monospace; font-size: 11px; font-weight: 800; min-width: 16px; text-align: center; }

          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border: 1.5px solid #000; table-layout: fixed; }
          th, td { border: 1.2px solid #000; padding: 4px 10px; height: 26px; vertical-align: middle; word-wrap: break-word; }
          .label { font-weight: 700; width: 28%; background: #f8fafc; font-size: 10px; }
          .value { width: 22%; font-weight: 800; font-size: 10.5px; }

          .entrance-table th { background: #f8fafc; font-size: 8.5px; padding: 3px; text-align: center; font-weight: 800; line-height: 1.1; height: 28px; }
          .entrance-table td { text-align: center; padding: 3px; height: 24px; font-weight: 800; }

          .section-table { margin-bottom: 12px; }
          .section-table td { vertical-align: top; padding: 12px 10px 6px; position: relative; }
          .section-label { position: absolute; top: 2px; left: 10px; font-weight: 800; font-size: 9px; text-transform: uppercase; }

          .guidelines { border: 1.5px solid #000; padding: 10px 12px; font-size: 11px; margin-bottom: 20px; line-height: 1.4; text-align: justify; }
          .guidelines h3 { font-size: 13px; margin-top: 0; margin-bottom: 6px; text-decoration: underline; font-weight: 800; }
          .guidelines ol { padding-left: 18px; margin: 0; }
          .guidelines li { margin-bottom: 3px; }

          .footer-signs { display: flex; justify-content: space-between; margin-top: 160px; font-weight: 800; font-size: 11px; width: 100%; }
          .sign-col { text-align: center; width: 30%; border-top: 2px solid #000; padding-top: 5px; }

          @media print {
            body { -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>

        <div class="official-header">
          <div class="header-left-wrap">
            <div class="header-left">
              <img src="${window.location.origin}/image copy 2.png" alt="SVCE Logo">
              <div class="college-info">
                <div style="display:flex; align-items:center; gap:12px;">
                  <div style="font-size: 38px; font-weight: 900; color: #0f172a; line-height: 1;">SVCE</div>
                  <div style="width:2.5px; height:35px; background:#475569;"></div>
                  <div style="line-height: 1.1;">
                    <div style="font-size: 13.5px; font-weight: 800; color: #1e293b; white-space: nowrap;">SRI VENKATESHWARA</div>
                    <div style="font-size: 13.5px; font-weight: 800; color: #1e293b; white-space: nowrap;">COLLEGE OF ENGINEERING</div>
                  </div>
                </div>
                <div class="estd" style="margin-top:8px; letter-spacing: 1.2px; font-size: 9.5px;">ESTD. 2001. AUTONOMOUS INSTITUTE</div>
              </div>
            </div>
          </div>
          <div class="header-right">
            <table class="contact-table">
              <tr><td class="contact-label">Phone</td><td class="contact-sep">:</td><td>+91 9916775988, +91 9740202345</td></tr>
              <tr><td class="contact-label">Website</td><td class="contact-sep">:</td><td>https://svcengg.edu.in/</td></tr>
              <tr><td class="contact-label">Email ID</td><td class="contact-sep">:</td><td>admissions@svceengg.edu.in</td></tr>
              <tr><td class="contact-label" style="vertical-align:top">Address</td><td class="contact-sep" style="vertical-align:top">:</td><td>Kempegowda International Airport Road,<br>Vidya Nagar, Bengaluru - 562 157<br>Karnataka State</td></tr>
            </table>
          </div>
        </div>

        <div class="form-title">ENGINEERING MANAGEMENT PROVISIONAL ADMISSION FORM</div>


        <div class="meta-info">
          <div style="flex: 1.2;">Application No.: <span class="box-input" style="min-width:130px">${get('ed-app-no')}</span></div>
          <div style="flex: 1;">Contineo ID: <span class="box-input" style="min-width:100px">${get('ed-contineo-id')}</span></div>
          <div style="flex: 1.1; text-align: center;">Academic Year: 20<span class="year-boxes"><span>${get('ed-y1')[0] || ''}</span><span>${get('ed-y1')[1] || ''}</span></span> 20<span class="year-boxes"><span>${get('ed-y2')[0] || ''}</span><span>${get('ed-y2')[1] || ''}</span></span></div>
          <div style="flex: 0.6; text-align: right;">Date: <span style="text-decoration: underline; font-weight:800">${get('ed-date')}</span></div>
        </div>

        <table>
          <tr>
            <td class="label">Student Name</td><td class="value">${get('ed-student-name')}</td>
            <td class="label">Student Phone No.</td><td class="value">${get('ed-mobile')}</td>
          </tr>
          <tr>
            <td class="label">Father/Mother/Guardian Name</td><td class="value">${get('ed-parent-name')}</td>
            <td class="label">Father /Mother/Guardian Mobile No.</td><td class="value">${get('ed-parent-mobile')}</td>
          </tr>
          <tr>
            <td class="label">Branch Selected</td><td class="value">${get('ed-branch')}</td>
            <td class="label">State</td><td class="value">${get('ed-state')}</td>
          </tr>
          <tr>
            <td class="label">Email</td><td class="value">${get('ed-email')}</td>
            <td class="label">Actual Annual Fee</td><td class="value">₹ ${parseFloat(get('ed-actual-fee')).toLocaleString()}</td>
          </tr>
          <tr>
            <td class="label">PUC/+2 Exam Board</td><td class="value">${get('ed-board')}</td>
            <td class="label">Scholarship Attained</td><td class="value">₹ ${parseFloat(get('ed-scholarship')).toLocaleString()}</td>
          </tr>
          <tr>
            <td class="label">Seat Booking Fee</td><td class="value">₹ ${parseFloat(get('ed-booking-fee') || 0).toLocaleString()}</td>
            <td class="label">Net Payable Fee</td><td class="value" style="background: #f8fafc;">₹ ${get('ed-net-payable')}</td>
          </tr>
        </table>

        <div style="font-weight: 800; margin-bottom: 6px; font-size:11px;">Reference Name: <span style="text-decoration: underline;">${get('ed-reference')}</span></div>

        <table class="entrance-table">
          <thead>
            <tr>
              <th style="width:20%">Physics + Math +<br>Chem/CS/ECE %</th>
              <th style="width:20%">Overall PUC/+2<br>/Inter %</th>
              <th style="width:15%">CET Rank</th>
              <th style="width:15%">COMEDK Rank</th>
              <th style="width:15%">JEE Rank</th>
              <th style="width:15%">CET No</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${get('ed-pcm')}${get('ed-pcm') ? '%' : ''}</td>
              <td>${get('ed-total') || '—'}${get('ed-total') ? '%' : ''}</td>
              <td>${get('ed-cet') || '—'}</td>
              <td>${get('ed-comedk') || '—'}</td>
              <td>${get('ed-jee') || '—'}</td>
              <td>${get('ed-cet-no') || '—'}</td>
            </tr>
          </tbody>
        </table>

        <table class="section-table">
          <tr>
            <td>
              <span class="section-label">Student Address:</span>
              <div style="font-weight: 800; line-height: 1.4; font-size:10px; padding-top:4px;">
                ${get('ed-address').replace(/\n/g, '<br>')}
              </div>
            </td>
          </tr>
        </table>

        <table class="section-table" style="height: 135px;">
          <tr>
            <td>
              <span class="section-label">Remarks:</span>
              <div style="font-style: italic; color: #333; font-weight: 800; padding-top:4px;">${get('ed-remarks')}</div>
            </td>
          </tr>
        </table>

        <div class="guidelines" style="margin-bottom:15px;">
          <h3>Admissions Guidelines:</h3>
          <ol>
            <li>Hostel, transportation, skill development, exam and uniform fees are not included in net fees.</li>
            <li>Blocked seat amount is non-refundable in case of cancellation for any reason.</li>
            <li>Final admission confirmed upon submission of original documents and university approval.</li>
            <li>Entrance exam appearance (KCET/COMEDK/JEE) is mandatory for eligibility else approval fees are applicable.</li>
          </ol>
        </div>


        <div class="footer-signs">
          <div class="sign-col">Student Signature</div>
          <div class="sign-col">Parents/Guardian Signature</div>
          <div class="sign-col">Admission Head Signature</div>
        </div>

      </body>
      </html>
    `;
    
    performHiddenPrint(html);

  } catch (err) { alert('Failed to generate management form'); console.error(err); }
}
async function deleteAdmission(id) {
  if (!confirm(`Delete admission #${id}? This cannot be undone.`)) return;
  try {
    await fetch(`${API}/api/admin/admission/${id}`, { method: 'DELETE', headers: authHeaders() });
    loadAdmissions();
  } catch (err) { alert('Delete failed'); }
}

// ═══════════════ EXPORT CSV ═══════════════
function exportEnquiriesCSV() {
  const headers = ['ID','Token','Name','Email','Mobile','Father','Qualification','Board','Total %','Date'];
  const rows = allEnquiries.map(r => [
    r.id, r.token_number, r.student_name, r.student_email, r.student_mobile,
    r.father_name, r.education_qualification, r.education_board, r.total_percentage,
    formatDate(r.enquiry_date)
  ]);
  downloadCSV('enquiries_export.csv', headers, rows);
}

function exportAdmissionsCSV() {
  const headers = ['ID','App No.','Name','Email','Mobile','DOB','Course','Programme','UTR','Date'];
  const rows = allAdmissions.map(r => [
    r.id, r.application_number, r.student_name, r.email, r.mobile_no,
    formatDate(r.date_of_birth), r.course_preference, r.program_preference,
    r.payment_utr_no, formatDate(r.application_date)
  ]);
  downloadCSV('admissions_export.csv', headers, rows);
}

function downloadCSV(filename, headers, rows) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════ HELPERS ═══════════════
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function truncate(str, len) {
  if (!str) return '—';
  return str.length > len ? str.substring(0, len) + '…' : str;
}

function detailItem(label, value, fullWidth, key, editable = false) {
  const role = sessionStorage.getItem('admin_role');
  const isCounsellor = (role === 'counsellor');
  
  if (editable && !isCounsellor) {
      if (key && (key.includes('address') || key === 'reference')) {
          return `<div class="detail-item${fullWidth ? ' full-width' : ''}">
            <span class="detail-label">${label}</span>
            <textarea class="detail-input" data-key="${key}" style="width:100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.9rem; font-family: inherit; background: var(--bg-card); color: var(--text-primary); resize: vertical;" rows="2">${value ?? ''}</textarea>
          </div>`;
      }
      return `<div class="detail-item${fullWidth ? ' full-width' : ''}">
        <span class="detail-label">${label}</span>
        <input type="text" class="detail-input" data-key="${key}" value="${value ?? ''}" style="width:100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.9rem; background: var(--bg-card); color: var(--text-primary);">
      </div>`;
  }

  return `<div class="detail-item${fullWidth ? ' full-width' : ''}">
    <span class="detail-label">${label}</span>
    <span class="detail-value">${value ?? '—'}</span>
  </div>`;
}

function detailHeader(title) {
  return `<div class="detail-item full-width" style="margin-top: 10px; margin-bottom: 2px;">
    <span style="font-weight: 700; color: var(--accent-blue); font-size: 0.75rem; text-transform: uppercase;">${title}</span>
  </div>`;
}

function filterByDate(rows, field, filter) {
  const getLocalYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const now = new Date();
  const todayStr = getLocalYMD(now);
  
  if (filter === 'today') return rows.filter(r => r[field] && r[field].substring(0, 10) === todayStr);

  if (filter === 'tomorrow') {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    const tmrwStr = getLocalYMD(tmrw);
    return rows.filter(r => r[field] && r[field].substring(0, 10) === tmrwStr);
  }

  if (filter === 'past') {
    return rows.filter(r => r[field] && r[field].substring(0, 10) < todayStr);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(filter)) {
    return rows.filter(r => r[field] && r[field].substring(0, 10) === filter);
  }

  if (filter === 'week') {
    const weekAgo = new Date(now - 7 * 86400000);
    return rows.filter(r => r[field] && new Date(r[field]) >= weekAgo);
  }
  if (filter === 'month') {
    return rows.filter(r => {
      if (!r[field]) return false;
      const d = new Date(r[field]);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }
  return rows;
}

function closeModal() {
  document.getElementById('detail-modal').classList.remove('open');
}

// Close modal on backdrop click
document.getElementById('detail-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// Close modal on Esc
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="material-icons-round">${type === 'success' ? 'check_circle' : 'error'}</span>
    <span>${msg}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ═══════════════ MANAGEMENT FUNCTIONS ═══════════════


async function loadManagementStatus() {
  try {
    const data = await apiFetch('/api/admin/management-forms');
    allManagement = data.rows || [];
    renderManagement(allManagement);
    updateLastRefreshInfo();
  } catch (err) { console.error('Management load error:', err); }
}

function renderManagement(rows) {
  const tbody = document.getElementById('management-body');
  document.getElementById('mgt-count').textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><span class="material-icons-round">description</span><p>No management forms saved</p></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((r, i) => `<tr>
    <td>${i + 1}</td>
    <td>${r.id}</td>
    <td>${r.app_no || '—'}</td>
    <td>${r.student_name || '—'}</td>
    <td>${r.branch || '—'}</td>
    <td>${r.academic_year || '—'}</td>
    <td>₹${parseFloat(r.net_payable).toLocaleString()}</td>
    <td style="cursor:pointer;" onclick="openAuditLog(${r.id}, 'management')" title="View History">
      <div style="font-size:0.8rem; font-weight:600; color:var(--text-secondary);">${formatDate(r.updated_at)}</div>
      <div style="font-size:0.7rem; color:var(--text-muted);">by ${r.updated_by || 'Admin'}</div>
    </td>
    <td class="action-btns">
      <button class="btn btn-view" onclick="viewManagementForm(${r.id})" title="View Details"><span class="material-icons-round" style="font-size:16px">visibility</span></button>
      <button class="btn btn-print" onclick="printManagementFromRecord(${r.id})" title="Print Form"><span class="material-icons-round" style="font-size:16px">print</span></button>
      ${sessionStorage.getItem('admin_role') !== 'counsellor' ? `
        <button class="btn btn-delete" onclick="deleteManagement(${r.id})" title="Delete Record"><span class="material-icons-round" style="font-size:16px">delete</span></button>
      ` : ''}
    </td>
  </tr>`).join('');
}

async function saveAndPrintManagementForm(admissionId) {
  const get = (id) => document.getElementById(id).value;
  try {
    const payload = {
      admission_id: admissionId,
      app_no: get('ed-app-no'),
      contineo_id: get('ed-contineo-id'),
      academic_year: get('ed-y1') + '-' + get('ed-y2'),
      form_date: get('ed-date'),
      student_name: get('ed-student-name'),
      mobile_no: get('ed-mobile'),
      parent_name: get('ed-parent-name'),
      parent_mobile: get('ed-parent-mobile'),
      branch: get('ed-branch'),
      state: get('ed-state'),
      email: get('ed-email'),
      actual_fee: parseFloat(get('ed-actual-fee')) || 0,
      scholarship: parseFloat(get('ed-scholarship')) || 0,
      booking_fee: get('ed-booking-fee'),
      net_payable: parseFloat(get('ed-net-payable').replace(/,/g, '')) || 0,
      reference_name: get('ed-reference'),
      pcm_percentage: get('ed-pcm'),
      overall_percentage: get('ed-total'),
      cet_rank: get('ed-cet'),
      comedk_rank: get('ed-comedk'),
      jee_rank: get('ed-jee'),
      cet_no: get('ed-cet-no'),
      remarks: get('ed-remarks'),
      updated_by: sessionStorage.getItem('admin_name') || 'Admin'
    };

    const res = await apiFetch('/api/admin/management-form', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res.success) {
      showToast('Record saved to Dashboard');
      // Now print
      finalPrintManagementForm();
      closeModal();
      if (allManagement.length > 0) loadManagementStatus(); // refresh if tab active
    }
  } catch (err) {
    alert('Failed to save record: ' + err.message);
  }
}

async function viewManagementForm(id) {
    try {
        const data = await apiFetch(`/api/admin/management-form/${id}`);
        const r = data.row;
        document.getElementById('modal-title').textContent = `Management Form #${r.id} — ${r.student_name}`;
        document.getElementById('modal-body').innerHTML = `
          <div class="detail-grid">
            ${detailItem('App No.', r.app_no)}
            ${detailItem('Academic Year', r.academic_year)}
            ${detailItem('Form Date', r.form_date)}
            ${detailItem('Student Name', r.student_name)}
            ${detailItem('Branch', r.branch)}
            ${detailItem('Actual Fee', '₹' + parseFloat(r.actual_fee).toLocaleString())}
            ${detailItem('Scholarship', '₹' + parseFloat(r.scholarship).toLocaleString())}
            ${detailItem('Net Payable', '₹' + parseFloat(r.net_payable).toLocaleString())}
            ${detailItem('Booking Fee', r.booking_fee)}
            ${detailItem('Reference', r.reference_name)}
            ${detailItem('PCM %', r.pcm_percentage)}
            ${detailItem('Overall %', r.overall_percentage)}
            ${detailItem('CET Rank', r.cet_rank)}
            ${detailItem('COMEDK Rank', r.comedk_rank)}
            ${detailItem('JEE Rank', r.jee_rank)}
            ${detailItem('CET No', r.cet_no)}
            ${detailHeader('Audit Log')}
            ${detailItem('Created At', formatDate(r.created_at))}
            ${detailItem('Last Updated', `${formatDate(r.updated_at)} by ${r.updated_by || 'Admin'}`, true)}
          </div>`;
        document.getElementById('detail-modal').classList.add('open');
    } catch (err) { alert('Failed to load management details'); }
}

async function printManagementFromRecord(id) {
    try {
        const mData = await apiFetch(`/api/admin/management-form/${id}`);
        const m = mData.row;
        // We need original admission for secondary info if not in mgt_form
        const admData = await apiFetch(`/api/admin/admission/${m.admission_id}`);
        const r = admData.row;
        
        const yr = (m.academic_year || '24-25').split('-');
        const y1 = yr[0] || '';
        const y2 = yr[1] || '';

        const val = (v) => v || '—';

        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Management Form - ${m.student_name}</title>
            <style>
              @page { size: A4; margin: 8mm 14mm 8mm 8mm; }
              * { box-sizing: border-box; }
              body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; color: #000; font-size: 10.5px; line-height: 1.3; width: 100%; }
              
              .official-header { display: flex; align-items: stretch; margin-bottom: 12px; border-bottom: 2px solid #000; width: 100%; border-top: 1px solid #000; }
              .header-left-wrap { background: #000; clip-path: polygon(0 0, 100% 0, 93% 100%, 0% 100%); flex: 1.4; padding-right: 3px; }
              .header-left { background: #cbd5e1; padding: 10px 30px 10px 15px; display: flex; align-items: center; gap: 15px; height: 100%; clip-path: polygon(0 0, 100% 0, 93% 100%, 0% 100%); }
              .header-left img { height: 65px; width: auto; }
              .college-info { line-height: 1.1; }
              .estd { font-size: 9px; font-weight: 700; color: #64748b; letter-spacing: 1.5px; margin-top: 5px; text-transform: uppercase; }
              .header-right { flex: 1; padding: 8px 0 8px 15px; font-size: 9px; font-weight: 600; color: #334155; display: flex; flex-direction: column; justify-content: center; }
              .contact-table { width: 100% !important; border: none !important; margin: 0 !important; }
              .contact-table td { border: none !important; padding: 1px 0 !important; height: auto !important; font-size: 8.5px !important; }
              .contact-label { width: 45px; font-weight: 700; color: #64748b; }
              .contact-sep { width: 10px; text-align: center; }

              .form-title { text-align: center; background: #fff; padding: 4px; font-size: 14px; font-weight: 810; border: 2px solid #000; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.8px; }
              .meta-info { display: flex; justify-content: space-between; margin-bottom: 12px; font-weight: 700; align-items: center; width: 100%; }
              .box-input { border: 1.5px solid #000; padding: 2px 8px; display: inline-block; min-width: 100px; background: #fff; }
              .year-boxes { display: inline-flex; align-items: center; gap: 2px; }
              .year-boxes span { border: 1.5px solid #000; padding: 0px 4px; font-family: monospace; font-size: 11px; font-weight: 800; min-width: 16px; text-align: center; }

              table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border: 1.5px solid #000; table-layout: fixed; }
              th, td { border: 1.5px solid #000 !important; padding: 4px 10px; height: 26px; vertical-align: middle; word-wrap: break-word; }
              .label { font-weight: 700; width: 28%; background: #f8fafc; font-size: 10px; }
              .value, .val { width: 22%; font-weight: 800; font-size: 10.5px; }

              .entrance-table th { background: #f8fafc; font-size: 8.5px; padding: 3px; text-align: center; font-weight: 800; line-height: 1.1; height: 28px; }
              .entrance-table td { text-align: center; padding: 3px; height: 24px; font-weight: 800; }
              
              .section-table { margin-bottom: 12px; width: 100%; border-collapse: collapse; table-layout: fixed; border: 1.5px solid #000; }
              .section-table td { vertical-align: top; padding: 12px 10px 6px; position: relative; border: 1.5px solid #000 !important; }
              .section-label { position: absolute; top: 2px; left: 10px; font-weight: 800; font-size: 9px; text-transform: uppercase; }

              .guidelines { border-collapse: collapse; margin-bottom: 20px; table-layout: fixed; width: 100%; border: 1.5px solid #000 !important; }
              .guidelines-content { padding: 10px 12px; font-size: 11px; line-height: 1.4; text-align: justify; border: 1.5px solid #000 !important; }
              .guidelines h3 { font-size: 13px; margin-top: 0; margin-bottom: 6px; text-decoration: underline; font-weight: 800; }
              .guidelines ol { padding-left: 18px; margin: 0; }
              .guidelines li { margin-bottom: 3px; }

              .footer-signs { display: flex; justify-content: space-between; margin-top: 160px; font-weight: 800; font-size: 11px; width: 100%; }
              .sign-col { text-align: center; width: 30%; border-top: 2px solid #000; padding-top: 5px; }

              @media print { body { -webkit-print-color-adjust: exact; } }
            </style>
          </head>
          <body>
            <div class="official-header">
              <div class="header-left-wrap"><div class="header-left">
                <img src="${window.location.origin}/image copy 2.png" alt="SVCE Logo">
                <div class="college-info">
                  <div style="display:flex; align-items:center; gap:12px;">
                    <div style="font-size: 38px; font-weight: 900; color: #0f172a; line-height: 1;">SVCE</div>
                    <div style="width:2.5px; height:35px; background:#475569;"></div>
                    <div style="line-height: 1.1;">
                      <div style="font-size: 13.5px; font-weight: 800; color: #1e293b; white-space: nowrap;">SRI VENKATESHWARA</div>
                      <div style="font-size: 13.5px; font-weight: 800; color: #1e293b; white-space: nowrap;">COLLEGE OF ENGINEERING</div>
                    </div>
                  </div>
                  <div class="estd">ESTD. 2001. AUTONOMOUS INSTITUTE</div>
                </div>
              </div></div>
              <div class="header-right">
                <table class="contact-table">
                  <tr><td class="contact-label">Phone</td><td class="contact-sep">:</td><td>+91 9916775988, +91 9740202345</td></tr>
                  <tr><td class="contact-label">Website</td><td class="contact-sep">:</td><td>https://svcengg.edu.in/</td></tr>
                  <tr><td class="contact-label">Email ID</td><td class="contact-sep">:</td><td>admissions@svceengg.edu.in</td></tr>
                  <tr><td class="contact-label" style="vertical-align:top">Address</td><td class="contact-sep" style="vertical-align:top">:</td><td>Kempegowda Int. Airport Road, Vidya Nagar, B'luru - 562157</td></tr>
                </table>
              </div>
            </div>

            <div class="form-title">ENGINEERING MANAGEMENT PROVISIONAL ADMISSION FORM</div>


            <div class="meta-info">
              <div style="flex: 1.2;">Application No.: <span class="box-input" style="min-width:130px">${val(m.app_no)}</span></div>
              <div style="flex: 1;">Contineo ID: <span class="box-input" style="min-width:100px">${val(m.contineo_id)}</span></div>
              <div style="flex: 1.1; text-align: center;">Academic Year: 20<span class="year-boxes"><span>${(y1[0]||'')}</span><span>${(y1[1]||'')}</span></span> 20<span class="year-boxes"><span>${(y2[0]||'')}</span><span>${(y2[1]||'')}</span></span></div>
              <div style="flex: 0.6; text-align: right;">Date: <span style="text-decoration: underline; font-weight:800">${val(m.form_date)}</span></div>
            </div>

            <table>
              <tr><td class="label">Student Name</td><td class="value">${val(m.student_name)}</td><td class="label">Phone No.</td><td class="value">${val(m.mobile_no)}</td></tr>
              <tr><td class="label">Parent/Guardian</td><td class="value">${val(m.parent_name)}</td><td class="label">Parent Mobile</td><td class="value">${val(m.parent_mobile)}</td></tr>
              <tr><td class="label">Branch Selected</td><td class="val">${val(m.branch)}</td><td class="label">State</td><td class="val">${val(m.state)}</td></tr>
              <tr><td class="label">Email</td><td class="val">${val(m.email)}</td><td class="label">Actual Annual Fee</td><td class="val">₹ ${parseFloat(m.actual_fee || 0).toLocaleString()}</td></tr>
              <tr><td class="label">PUC/+2 Board</td><td class="val">${val(r.education_board || r.twelfth_board)}</td><td class="label">Scholarship</td><td class="val">₹ ${parseFloat(m.scholarship || 0).toLocaleString()}</td></tr>
              <tr><td class="label">Booking Fee</td><td class="val">₹ ${parseFloat(m.booking_fee || 0).toLocaleString()}</td><td class="label">Net Payable</td><td class="val" style="background:#f8fafc">₹ ${parseFloat(m.net_payable || 0).toLocaleString()}</td></tr>
            </table>

            <div style="font-weight: 800; margin-bottom: 6px; font-size:11px;">Reference Name: <span style="text-decoration: underline;">${val(m.reference_name)}</span></div>

            <table class="entrance-table">
              <thead><tr><th>Physics + Math +<br>Chem/CS/ECE %</th><th>Overall %</th><th>CET Rank</th><th>COMEDK Rank</th><th>JEE Rank</th><th>CET No</th></tr></thead>
              <tbody><tr>
                <td>${val(m.pcm_percentage)}${m.pcm_percentage?'%':''}</td>
                <td>${val(m.overall_percentage)}${m.overall_percentage?'%':''}</td>
                <td>${val(m.cet_rank)}</td><td>${val(m.comedk_rank)}</td><td>${val(m.jee_rank)}</td><td>${val(m.cet_no)}</td>
              </tr></tbody>
            </table>

            <table class="section-table"><tr><td><span class="section-label">Student Address:</span><div style="font-weight: 800; line-height: 1.4; font-size:10px; padding-top:4px;">
              ${val([r.comm_address_line1, r.comm_address_line2, r.comm_city, r.comm_state, r.comm_pincode].filter(Boolean).join(', ')) || val([r.address_line1, r.address_line2, r.address_city, r.address_state, r.address_pincode].filter(Boolean).join(', '))}
            </div></td></tr></table>

            <table class="section-table" style="height: 120px;"><tr><td><span class="section-label">Remarks:</span><div style="font-style:italic; font-weight:800; padding-top:4px;">${val(m.remarks || r.admin_remarks)}</div></td></tr></table>

            <table class="guidelines">
              <tr><td class="guidelines-content">
                <h3>Admissions Guidelines:</h3>
                <ol>
                  <li>Hostel, transportation, skill development, exam and uniform fees are not included in net fees.</li>
                  <li>Blocked seat amount is non-refundable in case of cancellation for any reason.</li>
                  <li>Final admission confirmed upon submission of original documents and university approval.</li>
                  <li>Entrance exam appearance (KCET/COMEDK/JEE) is mandatory for eligibility else approval fees are applicable.</li>
                </ol>
              </td></tr>
            </table>


            <div class="footer-signs">
              <div class="sign-col">Student Signature</div>
              <div class="sign-col">Parents/Guardian Signature</div>
              <div class="sign-col">Admission Head Signature</div>
            </div>
            <div style="margin-top:15px; font-size:8px; color:#94a3b8; text-align:center;">* Re-printed from Dashboard record #${m.id} on ${new Date().toLocaleString()}</div>
          </body>
          </html>
        `;
        performHiddenPrint(html);
    } catch (err) { alert('Print failed: ' + err.message); console.error(err); }
}


async function deleteManagement(id) {
  if (!confirm(`Delete management record #${id}?`)) return;
  try {
    await apiFetch(`/api/admin/management-form/${id}`, { method: 'DELETE' });
    loadManagementStatus();
  } catch (err) { alert('Delete failed'); }
}

function filterManagement() {
  const search = document.getElementById('mgt-search').value.toLowerCase();
  const dateFilter = document.getElementById('mgt-filter-date').value;
  const branchFilter = document.getElementById('mgt-filter-branch').value;
  let filtered = allManagement;

  if (search) {
    filtered = filtered.filter(r => 
      (r.student_name || '').toLowerCase().includes(search) ||
      (r.app_no || '').toLowerCase().includes(search) ||
      (r.branch || '').toLowerCase().includes(search)
    );
  }

  if (dateFilter) {
    filtered = filterByDate(filtered, 'created_at', dateFilter);
  }

  if (branchFilter) {
    if (branchFilter === 'CSE_ANY') {
      filtered = filtered.filter(r => (r.branch || '').toLowerCase().includes('computer science'));
    } else {
      filtered = filtered.filter(r => r.branch === branchFilter);
    }
  }

  renderManagement(filtered);
}

function exportManagementCSV() {
  const headers = ['ID','App No','Name','Branch','Ac. Year','Actual Fee','Scholarship','Net Payable','Date'];
  const rows = allManagement.map(r => [
    r.id, r.app_no, r.student_name, r.branch, r.academic_year,
    r.actual_fee, r.scholarship, r.net_payable, formatDate(r.created_at)
  ]);
  downloadCSV('management_export.csv', headers, rows);
}

// ═══════════════ BULK MAIL ═══════════════
let currentBulkEmails = [];

function openBulkMailModal() {
  if (!lastFilteredEnquiries || lastFilteredEnquiries.length === 0) {
    return showToast('No records visible to send email to', 'error');
  }

  // Filter out invalid emails
  currentBulkEmails = lastFilteredEnquiries
    .map(r => r.student_email)
    .filter(e => e && e.trim() !== '' && e.indexOf('@') !== -1);

  if (currentBulkEmails.length === 0) {
    return showToast('No valid email addresses found in the current filter', 'error');
  }

  document.getElementById('bulk-mail-count').textContent = `${currentBulkEmails.length} recipient(s) selected`;
  document.getElementById('bulk-mail-recipients').textContent = currentBulkEmails.join(', ');
  document.getElementById('bulk-mail-subject').value = '';
  document.getElementById('bulk-mail-message').value = '';
  document.getElementById('bulk-mail-modal').classList.add('open');
}

function closeBulkMailModal() {
  document.getElementById('bulk-mail-modal').classList.remove('open');
}

async function sendBulkMail() {
  const subject = document.getElementById('bulk-mail-subject').value.trim();
  const message = document.getElementById('bulk-mail-message').value.trim();
  const fileInput = document.getElementById('bulk-mail-attachments');

  if (!subject || !message) {
    return showToast('Please enter both subject and message', 'error');
  }

  const btn = document.getElementById('send-bulk-mail-btn');
  const ogHtml = btn.innerHTML;
  btn.innerHTML = '<span class="spinner" style="margin-right: 8px;"></span> Sending...';
  btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('subject', subject);
    formData.append('message', message);
    formData.append('emails', JSON.stringify(currentBulkEmails));
    
    if (fileInput && fileInput.files.length > 0) {
      for (let i = 0; i < fileInput.files.length; i++) {
        formData.append('attachments', fileInput.files[i]);
      }
    }

    const res = await fetch(`${API}/api/admin/enquiries/bulk-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
      },
      body: formData
    });

    if (res.status === 401) { logout(); throw new Error('Session expired'); }
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Server error'); }
    const data = await res.json();
    
    if (data.success) {
      showToast(`Successfully sent mail to ${data.count} recipient(s)`);
      closeBulkMailModal();
    } else {
      showToast(data.error || 'Failed to send mail', 'error');
    }
  } catch (err) {
    showToast('Failed to send mail. Server error.', 'error');
    console.error('Send bulk mail error:', err);
  } finally {
    btn.innerHTML = ogHtml;
    btn.disabled = false;
  }
}

// ═══════════════ AUDIT LOGS ═══════════════
async function openAuditLog(id, type = 'admission') {
  const modal = document.getElementById('log-modal');
  const body = document.getElementById('log-modal-body');
  const subtitle = document.getElementById('log-modal-subtitle');
  
  if (subtitle) subtitle.textContent = `Detailed history for ${type === 'management' ? 'Management Form' : 'Admission Application'} #${id}`;
  body.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div><p style="margin-top:10px; color:#64748b;">Fetching history...</p></div>';
  modal.classList.add('open');

  try {
    const data = await apiFetch(`/api/admin/admissions/audit-log/${id}?type=${type}`);
    const logs = data.audit_log || [];

    if (!logs.length) {
      body.innerHTML = `
        <div style="text-align:center; padding:30px; color:#64748b;">
          <span class="material-icons-round" style="font-size:48px; opacity:0.2; margin-bottom:12px;">history</span>
          <p>No audit history found for this record.</p>
        </div>
      `;
      return;
    }

    let html = `<div style="display:flex; flex-direction:column; gap:20px; position:relative; padding-left:12px;">`;
    // Vertical timeline line
    html += `<div style="position:absolute; left:4px; top:10px; bottom:10px; width:2px; background:#e2e8f0; border-radius:1px;"></div>`;

    logs.forEach((log, idx) => {
      let icon = 'history';
      let color = '#64748b';
      let label = log.action || 'ACTION';

      if (log.action === 'REQUEST') { icon = 'edit_note'; color = '#f59e0b'; label = 'Edit Requested'; }
      if (log.action === 'ENABLE') { icon = 'check_circle'; color = '#10b981'; label = 'Edit Approved'; }
      if (log.action === 'RESUBMIT') { icon = 'update'; color = '#3b82f6'; label = 'Resubmitted'; }
      if (log.action === 'CREATE') { icon = 'add_circle'; color = '#10b981'; label = 'Created'; }
      if (log.action === 'UPDATE') { icon = 'edit'; color = '#3b82f6'; label = 'Updated'; }

      html += `
        <div style="position:relative; padding-left:24px;">
          <div style="position:absolute; left:-12px; top:2px; width:18px; height:18px; border-radius:50%; background:#fff; border:3px solid ${color}; display:flex; align-items:center; justify-content:center; z-index:1;"></div>
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
              <p style="font-weight:700; font-size:0.9rem; color:#1e293b;">${label}</p>
              <p style="font-size:0.75rem; color:#94a3b8; white-space:nowrap;">${new Date(log.at).toLocaleString('en-IN')}</p>
            </div>
            <p style="font-size:0.8rem; color:#64748b; line-height:1.4;">${log.summary || 'Action performed on record'}</p>
            <div style="margin-top:6px; display:flex; align-items:center; gap:6px; font-size:0.7rem; color:#94a3b8;">
              <span class="material-icons-round" style="font-size:12px;">person</span>
              <span>by ${log.by}</span>
              ${log.client_ip ? `<span style="margin-left:8px; background:#f1f5f9; padding:2px 6px; border-radius:4px;">IP: ${log.client_ip}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = `<p style="color:red; text-align:center;">Failed to load logs: ${err.message}</p>`;
  }
}

function closeLogModal() {
  document.getElementById('log-modal').classList.remove('open');
}

// ═══════════════ GLOBAL ACTIVITY LOG ═══════════════
async function openActivityLog() {
  const modal = document.getElementById('log-modal');
  const body = document.getElementById('log-modal-body');
  const subtitle = document.getElementById('log-modal-subtitle');
  
  subtitle.textContent = `Global Admin Activity History`;
  body.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div><p style="margin-top:10px; color:#64748b;">Fetching history...</p></div>';
  modal.classList.add('open');

  try {
    const data = await apiFetch(`/api/admin/activity-log?limit=50`);
    const logs = data.rows || [];

    if (!logs.length) {
      body.innerHTML = `
        <div style="text-align:center; padding:30px; color:#64748b;">
          <span class="material-icons-round" style="font-size:48px; opacity:0.2; margin-bottom:12px;">history</span>
          <p>No activity history found.</p>
        </div>
      `;
      return;
    }

    let html = `<div style="display:flex; flex-direction:column; gap:20px; position:relative; padding-left:12px;">`;
    // Vertical timeline line
    html += `<div style="position:absolute; left:4px; top:10px; bottom:10px; width:2px; background:#e2e8f0; border-radius:1px;"></div>`;

    logs.forEach((log) => {
      let icon = 'manage_accounts';
      let color = '#3b82f6';
      
      if (log.action.includes('Delete')) { icon = 'delete'; color = '#ef4444'; }
      else if (log.action.includes('Create')) { icon = 'add_circle'; color = '#10b981'; }
      else if (log.action.includes('Reject') || log.action.includes('Clear')) { icon = 'cancel'; color = '#f59e0b'; }

      html += `
        <div style="position:relative; padding-left:24px;">
          <div style="position:absolute; left:-12px; top:2px; width:18px; height:18px; border-radius:50%; background:#fff; border:3px solid ${color}; display:flex; align-items:center; justify-content:center; z-index:1;"></div>
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
              <p style="font-weight:700; font-size:0.9rem; color:#1e293b;">${log.action}</p>
              <p style="font-size:0.75rem; color:#94a3b8; white-space:nowrap;">${new Date(log.created_at).toLocaleString('en-IN')}</p>
            </div>
            <p style="font-size:0.8rem; color:#64748b; line-height:1.4;">
              <strong>${log.target_name || 'Record'}</strong> (ID: ${log.target_id || '-'})<br>
              ${log.details || ''}
            </p>
            <div style="margin-top:6px; display:flex; align-items:center; gap:6px; font-size:0.7rem; color:#94a3b8;">
              <span class="material-icons-round" style="font-size:12px;">person</span>
              <span>by ${log.admin_name}</span>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = `<p style="color:red; text-align:center;">Failed to load logs: ${err.message}</p>`;
  }
}

// Ensure the button is added even if index.html is cached
(function injectActivityButton() {
  const checkAndInject = () => {
    const footerInfo = document.querySelector('.dashboard-footer .footer-info');
    if (footerInfo && !footerInfo.querySelector('button')) {
      footerInfo.style.display = 'flex';
      footerInfo.style.alignItems = 'center';
      footerInfo.style.justifyContent = 'space-between';
      footerInfo.style.width = '100%';
      
      // Wrap existing content
      const existingContent = document.createElement('div');
      existingContent.style.display = 'flex';
      existingContent.style.alignItems = 'center';
      existingContent.style.gap = '8px';
      while(footerInfo.firstChild) {
        existingContent.appendChild(footerInfo.firstChild);
      }
      footerInfo.appendChild(existingContent);

      // Add button
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.onclick = openActivityLog;
      btn.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 0.85rem; border-radius: 6px; background-color: #3b82f6; color: white; border: none; cursor: pointer; transition: background-color 0.2s;';
      btn.onmouseover = () => btn.style.backgroundColor = '#2563eb';
      btn.onmouseout = () => btn.style.backgroundColor = '#3b82f6';
      btn.innerHTML = '<span class="material-icons-round" style="font-size: 16px;">history</span> View Activity Logs';
      footerInfo.appendChild(btn);
      
      // Fix footer alignment
      const footer = document.querySelector('.dashboard-footer');
      if (footer) {
        footer.style.justifyContent = 'stretch';
      }
    }
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndInject);
  } else {
    checkAndInject();
  }
})();

// Ensure the button is added even if index.html is cached
document.addEventListener('DOMContentLoaded', () => {
  const footerInfo = document.querySelector('.dashboard-footer .footer-info');
  if (footerInfo && !footerInfo.querySelector('button')) {
    footerInfo.style.display = 'flex';
    footerInfo.style.alignItems = 'center';
    footerInfo.style.justifyContent = 'space-between';
    footerInfo.style.width = '100%';
    
    // Wrap existing content
    const existingContent = document.createElement('div');
    existingContent.style.display = 'flex';
    existingContent.style.alignItems = 'center';
    existingContent.style.gap = '8px';
    while(footerInfo.firstChild) {
      existingContent.appendChild(footerInfo.firstChild);
    }
    footerInfo.appendChild(existingContent);

    // Add button
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.onclick = openActivityLog;
    btn.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 0.85rem; border-radius: 6px; background-color: #3b82f6; color: white; border: none; cursor: pointer; transition: background-color 0.2s;';
    btn.onmouseover = () => btn.style.backgroundColor = '#2563eb';
    btn.onmouseout = () => btn.style.backgroundColor = '#3b82f6';
    btn.innerHTML = '<span class="material-icons-round" style="font-size: 16px;">history</span> View Activity Logs';
    footerInfo.appendChild(btn);
    
    // Fix footer alignment
    const footer = document.querySelector('.dashboard-footer');
    if (footer) {
      footer.style.justifyContent = 'stretch';
    }
  }
});

/**
 * Shows a detailed breakdown of all geographic regions grouped under "Others"
 */
window.showOthersRegionsModal = function(data, type) {
  const modal = document.getElementById('detail-modal');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  
  if (!modal || !title || !body) return;
  
  const categoryName = type.charAt(0).toUpperCase() + type.slice(1);
  title.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px;">
      <span class="material-icons-round" style="color:#3b82f6;">location_on</span>
      <span>Geographic Breakdown: ${categoryName}</span>
    </div>
  `;
  
  let html = `
    <div style="padding: 10px;">
      <div style="background:#f0f9ff; border: 1px solid #bae6fd; color:#0369a1; padding: 12px 16px; border-radius: 10px; margin-bottom: 20px; font-size: 0.88rem; display:flex; align-items:center; gap:8px;">
        <span class="material-icons-round" style="font-size:18px;">info</span>
        <span>Listing all <strong>${data.length}</strong> additional regions consolidated in the "Others" category.</span>
      </div>
      
      <div class="table-wrap" style="max-height: 400px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 12px;">
        <table class="data-table" style="margin: 0; width: 100%;">
          <thead style="position: sticky; top: 0; z-index: 10;">
            <tr>
              <th style="background: #f8fafc;">Pincode / Area</th>
              <th style="background: #f8fafc; text-align: center; width: 120px;">Count</th>
            </tr>
          </thead>
          <tbody>
  `;
  
  data.forEach((item, idx) => {
    html += `
      <tr style="${idx % 2 === 0 ? '' : 'background: #fcfdfe;'}">
        <td style="font-weight: 600; color: #1e293b; padding: 12px 15px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="width:24px; height:24px; border-radius:50%; background:#f1f5f9; display:flex; align-items:center; justify-content:center; font-size:10px; color:#64748b;">${idx+1}</span>
            ${item.pincode || 'Unspecified'}
          </div>
        </td>
        <td style="font-weight: 800; color: #3b82f6; text-align: center; padding: 12px 15px;">${item.count}</td>
      </tr>
    `;
  });
  
  html += `
          </tbody>
        </table>
      </div>
      
      <div style="margin-top: 15px; text-align: right; color: #94a3b8; font-size: 0.75rem; font-weight: 500;">
        Total "Others" Volume: ${data.reduce((sum, p) => sum + parseInt(p.count), 0)}
      </div>
    </div>
  `;
  
  body.innerHTML = html;
  modal.classList.add('open');
};

/**
 * Prompts the user for a custom remark and updates the database
 */
window.promptOtherRemark = function(id) {
  const custom = prompt("Enter custom remark/action status:");
  if (custom !== null && custom.trim() !== "") {
    updateRemarks(id, 'admin_remarks', custom.trim());
  }
};

// ═══════════════ RAW ENQUIRIES ═══════════════

async function loadRawEnquiries() {
  try {
    const data = await apiFetch('/api/admin/raw-enquiries');
    allRawEnquiries = data.rows || [];
    renderRawEnquiries(allRawEnquiries);
  } catch (err) { console.error('Raw enquiries load error:', err); }
}

function renderRawEnquiries(data) {
  const tbody = document.getElementById('raw-enquiry-body');
  if (!tbody) return;
  
  const countEl = document.getElementById('raw-count');
  if (countEl) countEl.textContent = `${data.length} records`;
  
  console.log('Rendering Raw Enquiries:', data);
  
  tbody.innerHTML = data.map(r => `
    <tr class="${r.is_converted ? 'row-converted' : ''}">
      <td><span class="token-badge">${r.serial_no}</span></td>
      <td><strong>${r.student_name}</strong></td>
      <td>${r.phone_number}</td>
      <td>${r.email_id || '—'}</td>
      <td>${r.course}</td>
      <td>${r.place}</td>
      <td><span class="status-badge ${r.mode === 'Telephonic' ? 'tag-applied' : 'tag-management'}">${r.mode}</span></td>
      <td>${new Date(r.created_at).toLocaleDateString()}</td>
      <td style="display:flex; gap:8px; align-items:center;">
        ${!r.is_converted ? `
          <button class="btn btn-secondary" style="padding: 6px; border-radius: 8px;" onclick="openQRModal(${r.id})" title="Generate QR"><span class="material-icons-round" style="font-size:18px">qr_code_2</span></button>
        ` : `
          <span class="converted-badge"><i class="fas fa-check-circle"></i> Converted</span>
        `}
        ${sessionStorage.getItem('admin_role') !== 'counsellor' ? `
          <button class="btn btn-delete" style="padding: 6px; border-radius: 8px;" onclick="deleteRawEnquiry(${r.id})" title="Delete"><span class="material-icons-round" style="font-size:18px">delete</span></button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

function openRawEnquiryModal() {
  document.getElementById('raw-enquiry-modal').classList.add('open');
  // Reset form
  ['raw-name', 'raw-phone', 'raw-email', 'raw-course', 'raw-place'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
  });
  const modeEl = document.getElementById('raw-mode');
  if (modeEl) modeEl.value = 'Telephonic';
}

function closeRawEnquiryModal() {
  document.getElementById('raw-enquiry-modal').classList.remove('open');
}

async function saveRawEnquiry() {
  const nameVal = document.getElementById('raw-name').value.trim();
  const phoneVal = document.getElementById('raw-phone').value.trim();
  
  if (!nameVal || !phoneVal) {
    alert('Name and Phone Number are mandatory');
    return;
  }

  const payload = {
    student_name: nameVal,
    phone_number: phoneVal,
    email_id: document.getElementById('raw-email').value.trim(),
    course: document.getElementById('raw-course').value.trim(),
    place: document.getElementById('raw-place').value.trim(),
    mode: document.getElementById('raw-mode').value
  };

  try {
    const res = await apiFetch('/api/admin/raw-enquiry', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.success) {
      showToast('Raw enquiry saved successfully');
      closeRawEnquiryModal();
      loadRawEnquiries();
    }
  } catch (err) {
    alert('Failed to save: ' + err.message);
  }
}

async function deleteRawEnquiry(id) {
  if (!confirm('Are you sure you want to delete this raw record?')) return;
  try {
    await apiFetch(`/api/admin/raw-enquiry/${id}`, { method: 'DELETE' });
    showToast('Record deleted');
    loadRawEnquiries();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

function filterRawEnquiries() {
  const search = document.getElementById('raw-enq-search').value.toLowerCase();
  const filtered = allRawEnquiries.filter(r => 
    (r.student_name || '').toLowerCase().includes(search) ||
    (r.phone_number || '').toLowerCase().includes(search) ||
    (r.email_id || '').toLowerCase().includes(search) ||
    (r.course || '').toLowerCase().includes(search) ||
    (r.place || '').toLowerCase().includes(search)
  );
  renderRawEnquiries(filtered);
}

function exportRawEnquiries() {
  if (allRawEnquiries.length === 0) return alert('No data to export');
  const headers = ['Serial No', 'Student Name', 'Phone', 'Email', 'Course', 'Place', 'Mode', 'Date', 'Created By'];
  const rows = allRawEnquiries.map(r => [
    r.serial_no, r.student_name, r.phone_number, r.email_id, r.course, r.place, r.mode, 
    new Date(r.created_at).toLocaleString(), r.created_by
  ]);
  
  let csv = headers.join(',') + '\n';
  rows.forEach(row => {
    csv += row.map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', `Raw_Enquiries_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ═══════════════ CONVERSION TRACKING & QR ═══════════════

function renderConversionChart(convData) {
  const ctx = document.getElementById('conversionChart');
  if (!ctx || !convData) return;
  if (conversionChartInstance) conversionChartInstance.destroy();

  const total = parseInt(convData.total_raw) || 0;
  const converted = parseInt(convData.converted) || 0;
  const pending = Math.max(0, total - converted);

  conversionChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Converted', 'Pending Leads'],
      datasets: [{
        data: [converted, pending],
        backgroundColor: ['#06b6d4', '#e2e8f0'],
        borderWidth: 0,
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '75%',
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { weight: '600' } } },
        tooltip: {
          backgroundColor: '#1e293b',
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: (info) => ` ${info.label}: ${info.raw} students`
          }
        }
      }
    }
  });
}

let activeQRLink = "";
function openQRModal(rawId) {
  const modal = document.getElementById('qr-modal');
  const container = document.getElementById('qr-container');
  const linkText = document.getElementById('qr-link-text');
  
  container.innerHTML = "";
  const origin = window.location.origin;
  activeQRLink = `${origin}/index.html?raw_id=${rawId}`;
  console.log('Generated QR Link:', activeQRLink);
  linkText.textContent = activeQRLink;
  
  new QRCode(container, {
    text: activeQRLink,
    width: 160,
    height: 160,
    colorDark : "#1e293b",
    colorLight : "#ffffff",
    correctLevel : QRCode.CorrectLevel.H
  });
  
  modal.classList.add('open');
}

function closeQRModal() {
  document.getElementById('qr-modal').classList.remove('open');
}

function copyQRLink() {
  navigator.clipboard.writeText(activeQRLink).then(() => {
    showToast('Link copied to clipboard!');
  }).catch(err => {
    alert('Failed to copy link: ' + err);
  });
}

// ═══════════════ OVERVIEW EXPORT (CSV & PDF) ═══════════════

async function exportOverviewCSV() {
  try {
    const academicYear = document.getElementById('global-academic-year')?.value || '2026-27';
    const selectedCourse = document.getElementById('filter-course')?.value || 'All';
    
    // Header Info
    let csvContent = `SVCE ADMIN PANEL - COMPREHENSIVE OVERVIEW REPORT\n`;
    csvContent += `Generated On: ${new Date().toLocaleString()}\n`;
    csvContent += `Academic Year: ${academicYear}\n`;
    csvContent += `Course Filter: ${selectedCourse}\n\n`;

    // Section 1: Top Metrics
    csvContent += `DASHBOARD METRICS\n`;
    csvContent += `Metric,Value\n`;
    csvContent += `Total Enquiries,${document.getElementById('stat-enquiries').textContent}\n`;
    csvContent += `Total Applications,${document.getElementById('stat-admissions').textContent}\n`;
    csvContent += `Management Forms,${document.getElementById('stat-management').textContent}\n`;
    csvContent += `Today's Enquiries,${document.getElementById('stat-today-enq').textContent}\n`;
    csvContent += `Today's Applications,${document.getElementById('stat-today-adm').textContent}\n`;
    csvContent += `Raw Conversion Rate,${document.getElementById('stat-raw-conv').textContent}\n\n`;

    // Section 2: Admitted Students Statistics Table
    csvContent += `ADMITTED STUDENTS STATISTICS (${academicYear})\n`;
    const table = document.getElementById('admitted-stats-table');
    if (table) {
      csvContent += `Sl.No,Course,CET Int,CET Fill,CET SNQ,CET Tot,ComedK Int,ComedK Fill,Mgt Int,Mgt Fill,Actual Int,Actual Fill,Actual Vac,Total SNQ,AICTE,Overall,Actual %\n`;
      const rows = document.querySelectorAll('#admitted-stats-body tr');
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td')).map(td => {
          const input = td.querySelector('input');
          return input ? input.value : td.textContent.trim().replace(/%/g, '');
        });
        csvContent += cells.join(',') + '\n';
      });
      const foot = document.querySelector('#admitted-stats-footer tr');
      if (foot) {
        const footCells = Array.from(foot.querySelectorAll('td')).map(td => td.textContent.trim().replace(/%/g, ''));
        csvContent += `TOTALS,` + footCells.slice(1).join(',') + '\n';
      }
    }
    csvContent += `\n`;

    // Section 3: Distribution Data (from charts)
    const addDistSection = (title, chartInstance) => {
      if (!chartInstance) return;
      csvContent += `${title.toUpperCase()} DISTRIBUTION\n`;
      csvContent += `Label,Count\n`;
      const labels = chartInstance.data.labels;
      const values = chartInstance.data.datasets[0].data;
      labels.forEach((l, i) => {
        csvContent += `"${l}",${values[i]}\n`;
      });
      csvContent += `\n`;
    };

    addDistSection('Gender', genderChartInstance);
    addDistSection('Source of Lead', sourceChartInstance);
    addDistSection('State', stateChartInstance);
    addDistSection('Course Preferences', courseChartInstance);
    addDistSection('Lead Quality', qualityChartInstance);
    addDistSection('Pincode/Area', pincodeChartInstance);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SVCE_Full_Report_${academicYear}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast('Full CSV Report exported');
  } catch (err) {
    console.error('Export CSV Error:', err);
    showToast('Export failed', 'error');
  }
}

async function exportOverviewPDF() {
  try {
    const academicYear = document.getElementById('global-academic-year')?.value || '2026-27';
    const logoUrl = window.location.origin + '/admin_dashboard/image_copy.png';
    
    showToast('Generating detailed report with data tables...', 'info');

    // Save current dropdown values
    const currentPin = document.getElementById('pincode-data-type')?.value;
    const currentGen = document.getElementById('gender-data-type')?.value;
    const currentCourse = document.getElementById('course-data-type')?.value;

    const captureStates = ['enquiry', 'application', 'admission'];
    const snapshots = {};

    for (const type of captureStates) {
      if (document.getElementById('pincode-data-type')) document.getElementById('pincode-data-type').value = type;
      if (document.getElementById('gender-data-type')) document.getElementById('gender-data-type').value = type;
      if (document.getElementById('course-data-type')) document.getElementById('course-data-type').value = type;
      
      renderCharts(lastGraphs, lastStats);
      await new Promise(r => setTimeout(r, 400)); // Longer wait for full animation
      
      snapshots[type] = {
        pin: document.getElementById('pincodeChart')?.toDataURL(),
        gen: document.getElementById('genderChart')?.toDataURL(),
        course: document.getElementById('courseChart')?.toDataURL()
      };
    }

    // Capture fixed charts
    const ratioImg = document.getElementById('ratioChart')?.toDataURL();
    const timelineImg = document.getElementById('timelineChart')?.toDataURL();
    const sourceImg = document.getElementById('sourceChart')?.toDataURL();
    const stateImg = document.getElementById('stateChart')?.toDataURL();

    // Restore UI
    if (document.getElementById('pincode-data-type')) document.getElementById('pincode-data-type').value = currentPin;
    if (document.getElementById('gender-data-type')) document.getElementById('gender-data-type').value = currentGen;
    if (document.getElementById('course-data-type')) document.getElementById('course-data-type').value = currentCourse;
    renderCharts(lastGraphs, lastStats);

    const metrics = {
      enq: parseInt(document.getElementById('stat-enquiries').textContent) || 0,
      adm: parseInt(document.getElementById('stat-admissions').textContent) || 0,
      mgt: parseInt(document.getElementById('stat-management').textContent) || 0,
      conv: document.getElementById('stat-raw-conv').textContent
    };

    // Calculate detailed conversion rates
    const enqToApp = metrics.enq > 0 ? ((metrics.adm / metrics.enq) * 100).toFixed(1) : 0;
    const appToAdm = metrics.adm > 0 ? ((metrics.mgt / metrics.adm) * 100).toFixed(1) : 0;
    const enqToAdm = metrics.enq > 0 ? ((metrics.mgt / metrics.enq) * 100).toFixed(1) : 0;

    const tableHtml = document.getElementById('admitted-stats-table').outerHTML;
    let cleanTableHtml = tableHtml.replace(/<input[^>]*value="([^"]*)"[^>]*>/g, '$1');

    // Data Table Helper (Expanded to show ALL data)
    const generateDataHtml = (title, dataArray, labelKey, valueKey) => {
      if (!dataArray || dataArray.length === 0) return `<p style="color:#94a3b8; font-style:italic; font-size:9px;">No data available for ${title}</p>`;
      const total = dataArray.reduce((sum, item) => sum + parseInt(item[valueKey] || 0), 0);
      
      return `
        <div class="data-section" style="margin-top: 10px;">
          <table class="report-data-table">
            <thead>
              <tr>
                <th style="text-align:left; background: #1e40af; color: white;">${title}</th>
                <th style="width: 50px; background: #1e40af; color: white;">Count</th>
                <th style="width: 40px; background: #1e40af; color: white;">%</th>
              </tr>
            </thead>
            <tbody>
              ${dataArray.map((item, idx) => {
                const val = parseInt(item[valueKey] || 0);
                const pct = total > 0 ? ((val/total)*100).toFixed(1) : 0;
                const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
                return `<tr style="background: ${rowBg};"><td style="text-align:left; font-weight:600; color:#334155;">${item[labelKey] || 'Other'}</td><td style="font-weight:700; color:#1e293b;">${val}</td><td style="color:#64748b;">${pct}%</td></tr>`;
              }).join('')}
            </tbody>
            <tfoot style="background: #f1f5f9; font-weight: 800;">
              <tr><td style="text-align:left;">TOTAL</td><td>${total}</td><td>100%</td></tr>
            </tfoot>
          </table>
        </div>
      `;
    };

    // Automated Insight Helpers
    const getInsight = (title, dataArray, labelKey, valueKey) => {
      if (!dataArray || dataArray.length === 0) return `No significant trends observed in ${title}.`;
      const sorted = [...dataArray].sort((a,b) => b[valueKey] - a[valueKey]);
      const top = sorted[0];
      const total = dataArray.reduce((sum, item) => sum + parseInt(item[valueKey] || 0), 0);
      const pct = total > 0 ? ((top[valueKey]/total)*100).toFixed(1) : 0;
      return `<strong>${top[labelKey]}</strong> is the leading category in ${title}, accounting for <strong>${pct}%</strong> of the total (Count: ${top[valueKey]}).`;
    };

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>SVCE Full Analytics Report - ${academicYear}</title>
        <style>
          @page { size: A4 portrait; margin: 8mm; }
          body { font-family: 'Inter', system-ui, sans-serif; color: #1e293b; margin: 0; padding: 0; line-height: 1.3; font-size: 11px; background: #fff; }
          
          /* Header & Metrics */
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; margin-bottom: 12px; }
          .logo { height: 55px; }
          .title-area h1 { margin: 0; color: #1e40af; font-size: 18px; font-weight: 800; }
          .title-area p { margin: 0; color: #64748b; font-size: 10px; font-weight: 600; }
          
          .metrics-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px; }
          .metric-card { background: #f1f5f9; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; text-align: center; }
          .metric-label { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; }
          .metric-value { font-size: 18px; font-weight: 800; color: #1e40af; }

          /* Sections */
          .section-title { page-break-before: always; font-size: 12px; font-weight: 800; margin: 0 0 12px; color: #fff; background: #1e40af; padding: 8px 15px; border-radius: 4px; text-transform: uppercase; letter-spacing: 1px; display: block; }
          .section-title:first-of-type { page-break-before: avoid; margin-top: 0; }
          .sub-section-title { font-size: 11px; font-weight: 700; color: #1e40af; margin: 15px 0 8px; border-bottom: 2px solid #bfdbfe; padding-bottom: 3px; text-transform: uppercase; }
          
          .insight-box { background: #eff6ff; border-left: 5px solid #3b82f6; padding: 8px 12px; font-size: 10px; margin-bottom: 15px; color: #1e40af; line-height: 1.4; }

          /* Layout Grids */
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
          .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px; }
          
          /* Table Styles */
          .report-data-table { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 8px; table-layout: fixed; }
          .report-data-table th, .report-data-table td { border: 1px solid #e2e8f0; padding: 5px 4px; text-align: center; word-wrap: break-word; }
          .report-data-table th { background: #f8fafc; color: #475569; font-weight: 700; font-size: 8.5px; }
          .report-data-table td { font-size: 9px; line-height: 1.2; }
          
          /* Charts */
          .chart-container { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; background: #fff; text-align: center; margin-bottom: 8px; }
          .chart-container h4 { margin: 0 0 6px; font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; }
          .chart-img { width: 100%; height: auto; max-height: 130px; object-fit: contain; }
          .chart-img.large { max-height: 220px; }

          .footer { position: fixed; bottom: 8mm; left: 8mm; right: 8mm; border-top: 1px solid #e2e8f0; padding-top: 5px; font-size: 7px; color: #94a3b8; display: flex; justify-content: space-between; }
          .no-break { page-break-inside: avoid; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title-area">
            <h1>Admission Intelligence Report</h1>
            <p>AY ${academicYear} | Generated: ${new Date().toLocaleString()}</p>
          </div>
          <img src="${logoUrl}" class="logo">
        </div>

        <div class="metrics-row">
          <div class="metric-card"><span class="metric-label">Enquiries</span><div class="metric-value">${metrics.enq}</div></div>
          <div class="metric-card"><span class="metric-label">Applications</span><div class="metric-value">${metrics.adm}</div></div>
          <div class="metric-card"><span class="metric-label">Admissions</span><div class="metric-value">${metrics.mgt}</div></div>
          <div class="metric-card"><span class="metric-label">Conversion</span><div class="metric-value">${metrics.conv}</div></div>
        </div>

        <div class="section-title">Admission Funnel & Growth Trends</div>
        <div class="insight-box" style="margin-bottom: 20px;">
          <strong>Overall Pipeline Performance:</strong> Your conversion funnel currently shows an Enquiry-to-Application rate of <b>${enqToApp}%</b>, an Application-to-Admission rate of <b>${appToAdm}%</b>, and an overall institutional conversion of <b>${enqToAdm}%</b>.
        </div>
        
        <div class="no-break" style="margin-bottom: 15px;">
          <div class="chart-container">
            <h4>Funnel Lifecycle Analysis</h4>
            <img src="${ratioImg}" class="chart-img large" style="max-height: 250px;">
            <p style="font-size: 9px; color: #475569; margin: 10px 15px; text-align: justify; line-height: 1.4;">
              <b>Visualization Explanation:</b> This lifecycle chart represents the progressive conversion of potential leads through the admission stages. The steepness of the curve indicates where the highest drop-off occurs. A balanced funnel should show a gradual transition, ensuring that a healthy volume of initial interest (Enquiries) successfully matures into confirmed enrollments (Admissions).
            </p>
          </div>
        </div>

        <div class="no-break" style="margin-bottom: 15px;">
          <div class="chart-container">
            <h4>Daily Submission Velocity (30 Day Trend)</h4>
            <img src="${timelineImg}" class="chart-img large" style="max-height: 250px;">
            <p style="font-size: 9px; color: #475569; margin: 10px 15px; text-align: justify; line-height: 1.4;">
              <b>Visualization Explanation:</b> The velocity chart tracks the real-time pulse of your admission department. It highlights daily submission peaks for enquiries, applications, and admissions over the last 30 days. This allows you to identify high-engagement periods, measure the impact of marketing campaigns, and allocate counseling staff effectively during surge days.
            </p>
          </div>
        </div>

        <div class="section-title">Demographic Distribution Analysis</div>
        <div class="sub-section-title">Gender Analysis</div>
        <div class="grid-3">
          <div class="no-break"><div class="chart-container"><h4>Enquiry</h4><img src="${snapshots.enquiry.gen}" class="chart-img"></div></div>
          <div class="no-break"><div class="chart-container"><h4>Application</h4><img src="${snapshots.application.gen}" class="chart-img"></div></div>
          <div class="no-break"><div class="chart-container"><h4>Admission</h4><img src="${snapshots.admission.gen}" class="chart-img"></div></div>
        </div>
        <div class="grid-3">
          <div class="no-break">${generateDataHtml('Enq Gender', lastGraphs.enquiry_gender, 'gender', 'count')}</div>
          <div class="no-break">${generateDataHtml('App Gender', lastGraphs.application_gender, 'gender', 'count')}</div>
          <div class="no-break">${generateDataHtml('Adm Gender', lastGraphs.admission_gender, 'gender', 'count')}</div>
        </div>

        <div class="section-title">Geographic / Area Reach Analysis</div>
        <div class="grid-3">
          <div class="no-break"><div class="chart-container"><h4>Enquiry Map</h4><img src="${snapshots.enquiry.pin}" class="chart-img"></div></div>
          <div class="no-break"><div class="chart-container"><h4>Application Map</h4><img src="${snapshots.application.pin}" class="chart-img"></div></div>
          <div class="no-break"><div class="chart-container"><h4>Admission Map</h4><img src="${snapshots.admission.pin}" class="chart-img"></div></div>
        </div>
        <div class="grid-3">
          <div class="no-break">${generateDataHtml('Enq Region', lastGraphs.enquiry_pincodes, 'pincode', 'count')}</div>
          <div class="no-break">${generateDataHtml('App Region', lastGraphs.application_pincodes, 'pincode', 'count')}</div>
          <div class="no-break">${generateDataHtml('Adm Region', lastGraphs.admission_pincodes, 'pincode', 'count')}</div>
        </div>

        <div class="section-title">Course Preference & Demand Analysis</div>
            ${generateDataHtml('App Preference', lastGraphs.application_courses, 'course', 'count')}
            ${generateDataHtml('Adm Course', lastGraphs.admission_courses, 'course', 'count')}
          </div>
        </div>

        <div class="section-title">Lead Source & Marketing Insights</div>
        <div class="no-break">
          <div class="grid-2">
            <div>
              <div class="chart-container"><h4>Lead Channels</h4><img src="${sourceImg}" class="chart-img large"></div>
              ${generateDataHtml('Source Breakdown', lastGraphs.lead_sources, 'reference', 'count')}
            </div>
            <div>
              <div class="chart-container"><h4>State Distribution</h4><img src="${stateImg}" class="chart-img large"></div>
              ${generateDataHtml('State Analysis', lastGraphs.application_states, 'state', 'count')}
            </div>
          </div>
        </div>

        <div class="section-title">Seat Intake & Filling Distribution Details</div>
        <div style="margin-top: 10px; overflow-x: visible;">
          <style>
            .stats-table { width: 100%; border-collapse: collapse; font-size: 7px; table-layout: auto; }
            .stats-table th, .stats-table td { border: 1px solid #94a3b8; padding: 3px 2px; text-align: center; }
            .stats-table thead th { background: #f1f5f9; font-weight: 800; color: #334155; text-transform: uppercase; }
            .stats-table th[colspan] { background: #e2e8f0; color: #1e40af; border-bottom: 2px solid #1e40af; }
            .stats-table .course-name { text-align: left; padding-left: 5px; font-weight: 700; background: #f8fafc; }
            .stats-table .total-row { background: #1e293b; color: white; font-weight: 800; }
            .stats-table .total-row td { border-color: #334155; }
            .stats-table .actual-pct { font-weight: 800; color: #1e40af; background: #eff6ff; }
          </style>
          ${cleanTableHtml}
        </div>

        <div class="footer">
          <div>SVCE Intelligence Dashboard</div>
          <div>Report generated for ${academicYear}</div>
          <div>Confidential Administrative Use</div>
        </div>
      </body>
      </html>
    `;

    performHiddenPrint(html);
  } catch (err) {
    console.error('Export PDF Error:', err);
    showToast('Full PDF Export failed', 'error');
  }
}
