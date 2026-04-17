/* ═══════════════════════════════════════════════════════════════════════
   SVCE Admin Dashboard — Client-side JS
   ═══════════════════════════════════════════════════════════════════════ */

const API = window.location.origin; // same origin
let allEnquiries  = [];
let allAdmissions = [];
let allManagement = [];

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
  loadOverview();
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
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');

  const titles = {
    overview:   ['Overview', 'Dashboard analytics and insights'],
    enquiries:  ['Enquiries', 'Manage student enquiry records'],
    admissions: ['Admissions', 'Manage admission applications'],
    management: ['Management', 'Generated Management Admission Forms']
  };
  document.getElementById('page-title').textContent = titles[tab][0];
  document.getElementById('page-subtitle').textContent = titles[tab][1];

  if (tab === 'overview')   loadOverview();
  if (tab === 'enquiries')  loadEnquiries();
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
    const stats = await apiFetch('/api/admin/stats');
    document.getElementById('stat-enquiries').textContent   = stats.total_enquiries   || 0;
    document.getElementById('stat-admissions').textContent   = stats.total_admissions   || 0;
    // Update a placeholder if it exists or just keep code clean
    if (document.getElementById('stat-management')) {
      document.getElementById('stat-management').textContent = stats.total_management || 0;
    }
    document.getElementById('stat-today-enq').textContent    = stats.today_enquiries    || 0;

    document.getElementById('stat-today-adm').textContent    = stats.today_admissions   || 0;

    // Recent tables
    renderRecentTable('recent-enquiries-body', stats.recent_enquiries || [], 'enquiry');
    renderRecentTable('recent-admissions-body', stats.recent_admissions || [], 'admission');
    updateLastRefreshInfo();
  } catch (err) { console.error('Overview load error:', err); }
}

function renderRecentTable(tbodyId, rows, type) {
  const tbody = document.getElementById(tbodyId);
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><span class="material-icons-round">inbox</span><p>No records yet</p></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => {
    if (type === 'enquiry') {
      return `<tr>
        <td>${r.token_number || '—'}</td>
        <td>${r.student_name || '—'}</td>
        <td>${r.student_email || '—'}</td>
        <td>${r.student_mobile || '—'}</td>
        <td>${formatDate(r.enquiry_date)}</td>
        <td>${r.reference || '—'}</td>
      </tr>`;
    } else {
      return `<tr>
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
  tbody.innerHTML = rows.map(r => {
    const remark = r.admin_remarks || '— Select Action —';
    const followUpText = r.follow_up_date ? formatDate(r.follow_up_date) : 'No Date';
    
    return `<tr>
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
      <button class="btn btn-delete" onclick="deleteEnquiry(${r.id})" title="Delete Record"><span class="material-icons-round" style="font-size:16px">delete</span></button>
    </td>
  </tr>`}).join('');
}

function exportEnquiriesCSV() {
  if (!lastFilteredEnquiries.length) return showToast('No records to export', 'error');
  
  const headers = ['ID', 'Token', 'Name', 'Email', 'Mobile', 'Reference', 'Qualification', 'Board', 'PCM %', 'Total %', 'Status', 'Follow-up', 'Hostel', 'Transport', 'Course Prefs', 'Enquiry Date'];
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
  const actionFilter = document.getElementById('enq-filter-action').value;
  const courseFilter = document.getElementById('enq-filter-course').value;
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
  if (actionFilter) filtered = filtered.filter(r => (r.admin_remarks || '') === actionFilter);

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
        if (Array.isArray(prefsArray) && prefsArray.length > 0) {
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

    document.getElementById('modal-title').textContent = `Enquiry #${r.id} — ${r.student_name}`;
    document.getElementById('modal-body').innerHTML = `
      <div class="detail-grid">
        ${detailItem('Token Number', r.token_number)}
        ${detailItem('Date', formatDate(r.enquiry_date))}
        ${detailItem('Student Name', r.student_name)}
        ${detailItem('Email', r.student_email)}
        ${detailItem('Mobile', r.student_mobile)}
        ${detailItem('Father', r.father_name)}
        ${detailItem('Father Mobile', r.father_mobile)}
        ${detailItem('Mother', r.mother_name)}
        ${detailItem('Mother Mobile', r.mother_mobile)}
        ${detailItem('Address', r.address || [r.address_line1, r.address_line2, r.address_city, r.address_district, r.address_state, r.address_pincode].filter(Boolean).join(', '), true)}
        ${detailItem('Qualification', r.education_qualification)}
        ${detailItem('Board', r.education_board)}
        ${detailItem('Expected %', r.expected_percentage != null ? r.expected_percentage + '%' : '—')}
        ${detailItem('Result Status', r.result_status)}
        ${detailItem('Hostel Req.', r.hostel_required ? 'YES' : 'NO')}
        ${r.hostel_required ? detailItem('Hostel Details', `${r.hostel_type} (₹${r.hostel_fee})`, true) : ''}
        ${detailItem('Transport Req.', r.transport_required ? 'YES' : 'NO')}
        ${r.transport_required ? detailItem('Transport Details', `${r.transport_route} (₹${r.transport_fee})`, true) : ''}
        ${detailHeader('11th Marks (AP/TS Students)')}
        ${detailItem('Physics', r.physics_11)}
        ${detailItem('Chemistry', r.chemistry_11)}
        ${detailItem('Math A', r.math_11a)}
        ${detailItem('Math B', r.math_11b)}
        ${detailItem('English', r.english_11)}
        ${detailItem('Language', r.language_11)}
        ${detailHeader('12th Marks')}
        ${detailItem('Physics 12 Th.', r.physics_marks)}
        ${detailItem('Physics 12 Pr.', r.physics_12_prac)}
        ${detailItem('Chem 12 Th.', r.chemistry_marks)}
        ${detailItem('Chem 12 Pr.', r.chemistry_12_prac)}
        ${detailItem('Math 12 A', r.math_12a)}
        ${detailItem('Math 12 B', r.math_12b)}
        ${detailItem('Math Standard', r.mathematics_marks)}
        ${detailHeader('Entrance Exams')}
        ${detailItem('JEE Rank', r.jee_rank)}
        ${detailItem('COMEDK Rank', r.comedk_rank)}
        ${detailItem('CET Rank', r.cet_rank)}
        ${detailHeader('Percentages & Prefs')}
        ${detailItem('Total %', r.total_percentage != null ? r.total_percentage + '%' : '—')}
        ${detailItem('PCM %', r.pcm_percentage != null ? r.pcm_percentage + '%' : '—')}
        ${detailItem('Course Preferences & Fees', prefsHtml, true)}
        ${detailItem('Reference', r.reference)}
      </div>
      <div style="margin-top: 24px; text-align: right; border-top: 1px solid var(--border); padding-top: 20px;">
        <button class="btn btn-print" style="padding: 10px 24px; font-size: 0.9rem;" onclick="printEnquiry(${r.id})">
          <span class="material-icons-round" style="font-size:20px">print</span> Print Enquiry Form
        </button>
      </div>`;
    document.getElementById('detail-modal').classList.add('open');
  } catch (err) { alert('Failed to load enquiry details'); }
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
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=1e3a5f&data=${encodeURIComponent(window.location.origin + '/admission-form/?enquiry_id=' + r.id)}" alt="Admission QR">
            <p>Scan for Application Form</p>
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

  tbody.innerHTML = rows.map(r => `<tr>
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
      <button class="btn btn-print" style="background: var(--accent-purple-glow); color: var(--accent-purple);" onclick="openManagementFormEditor(${r.id})" title="Generate Management Form"><span class="material-icons-round" style="font-size:16px">description</span></button>
      <button class="btn btn-delete" onclick="deleteAdmission(${r.id})" title="Delete Record"><span class="material-icons-round" style="font-size:16px">delete</span></button>
    </td>
  </tr>`).join('');
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
    document.getElementById('modal-title').innerHTML = `
      <div style="display:flex; align-items:center; gap:12px; width:100%;">
        <span class="material-icons-round" style="color:var(--accent);">assignment</span>
        <span>Admission #${r.id} — ${r.student_name}</span>
        <div style="margin-left:auto; display:flex; gap:8px;">
          <button class="btn btn-print" style="padding:6px 12px; font-size:13px; display:flex; align-items:center; gap:6px;" onclick="printAdmission(${r.id})">
            <span class="material-icons-round" style="font-size:16px;">print</span> Print Confirmation
          </button>
          <button class="btn btn-print" style="padding:6px 12px; font-size:13px; display:flex; align-items:center; gap:6px; background: var(--accent-purple-glow); color: var(--accent-purple);" onclick="openManagementFormEditor(${r.id})">
            <span class="material-icons-round" style="font-size:16px;">description</span> Management Form
          </button>
        </div>
      </div>`;
    document.getElementById('modal-body').innerHTML = `
      <div class="detail-grid">
        ${detailItem('Application No.', r.application_number)}
        ${detailItem('Date', formatDate(r.application_date))}
        ${detailItem('Title', r.title)}
        ${detailItem('Student Name', r.student_name)}
        ${detailItem('Email', r.email)}
        ${detailItem('Mobile', r.mobile_no)}
        ${detailItem('DOB', formatDate(r.date_of_birth))}
        ${detailItem('Gender', r.gender)}
        ${detailItem('Aadhaar No.', r.aadhaar_no)}
        ${detailItem('Institute', r.selected_institute || 'Engineering - SVCE')}
        ${detailItem('Course', r.course_preference)}
        ${detailItem('Programme', r.program_preference)}
        ${detailItem('Comm. Address', [r.comm_address_line1, r.comm_address_line2, r.comm_city, r.comm_state, r.comm_pincode].filter(Boolean).join(', '), true)}
        ${detailItem('Father', r.father_name)}
        ${detailItem('Father Mobile', r.father_mobile)}
        ${detailItem('Father Occupation', r.father_occupation)}
        ${detailItem('Mother', r.mother_name)}
        ${detailItem('Mother Mobile', r.mother_mobile)}
        ${detailItem('Mother Occupation', r.mother_occupation)}
        ${detailItem('Marksheet Name', r.candidate_name_marksheet)}
        ${detailItem('12th Institution', r.twelfth_institution)}
        ${detailItem('12th Board', r.twelfth_board)}
        ${detailItem('12th %', r.twelfth_percentage + '%')}
        ${detailItem('Entrance Exams', r.entrance_exams || 'None')}
        ${detailItem('Payment UTR', r.payment_utr_no)}
      </div>`;
    document.getElementById('detail-modal').classList.add('open');
  } catch (err) { alert('Failed to load admission details'); }
}

async function printAdmission(id) {
  const token = sessionStorage.getItem('admin_token');
  window.open(`${API}/api/admin/admission/${id}/print-pdf?token=${encodeURIComponent(token)}`, '_blank');
}

async function openManagementFormEditor(id) {
  try {
    const data = await apiFetch(`/api/admin/admission/${id}`);
    const r = data.row;

    // Helper to format values
    const val = (v) => (v === null || v === undefined || v === '') ? '' : v;
    
    // Calculate default annual fee
    let defaultFee = 0;
    try {
      const prefs = typeof r.course_preferences === 'string' ? JSON.parse(r.course_preferences) : (r.course_preferences || []);
      const match = prefs.find(p => (typeof p === 'object' ? p.course : p) === r.course_preference);
      if (match && typeof match === 'object' && match.fee) {
        defaultFee = parseFloat(match.fee);
      }
    } catch(e) {}

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
          <div>Academic Year: 20<input type="text" id="ed-y1" value="${yearBoxes[0]}${yearBoxes[1]}" class="meta-input" style="width:40px; display:inline-block;">-20<input type="text" id="ed-y2" value="${yearBoxes[2]}${yearBoxes[3]}" class="meta-input" style="width:40px; display:inline-block;"></div>
          <div>Date: <input type="text" id="ed-date" value="${today}" class="meta-input" style="width:100px; display:inline-block;"></div>
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
            <td class="label">Branch Selected</td><td><input type="text" id="ed-branch" value="${r.course_preference}"></td>
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
            <td class="label">Booking Fee (₹)</td><td><input type="text" id="ed-booking-fee" value="${r.payment_utr_no ? '1250' : ''}"></td>
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
          <input type="text" id="ed-remarks" value="">
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
            clip-path: polygon(0 0, 100% 0, 93% 100%, 0% 100%);
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
            clip-path: polygon(0 0, 100% 0, 93% 100%, 0% 100%); 
          }
          .header-left img { height: 65px; width: auto; }
          .college-info { line-height: 1.1; }
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

          .guidelines { font-size: 8.5px; margin-bottom: 20px; line-height: 1.3; text-align: justify; }
          .guidelines h3 { font-size: 10px; margin-bottom: 4px; text-decoration: underline; font-weight: 800; }
          .guidelines ol { padding-left: 15px; margin: 0; }
          .guidelines li { margin-bottom: 2px; }

          .footer-signs { display: flex; justify-content: space-between; margin-top: 40px; font-weight: 800; font-size: 10.5px; width: 100%; }
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
                    <div style="font-size: 13.5px; font-weight: 800; color: #1e293b;">SRI VENKATESHWARA</div>
                    <div style="font-size: 13.5px; font-weight: 800; color: #1e293b;">COLLEGE OF ENGINEERING</div>
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
          <div style="flex: 1.2;">Application No.: <span class="box-input" style="min-width:170px">${get('ed-app-no')}</span></div>
          <div style="flex: 1; text-align: center;">Academic Year: 20<span class="year-boxes"><span>${get('ed-y1')[0] || ''}</span><span>${get('ed-y1')[1] || ''}</span></span> 20<span class="year-boxes"><span>${get('ed-y2')[0] || ''}</span><span>${get('ed-y2')[1] || ''}</span></span></div>
          <div style="flex: 0.8; text-align: right;">Date: <span style="text-decoration: underline; font-weight:800">${get('ed-date')}</span></div>
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
          <div class="sign-col">Admissions Team Signature</div>
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

function detailItem(label, value, fullWidth) {
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
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  if (filter === 'today') return rows.filter(r => r[field] && r[field].substring(0, 10) === todayStr);
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

  tbody.innerHTML = rows.map(r => `<tr>
    <td>${r.id}</td>
    <td>${r.app_no || '—'}</td>
    <td>${r.student_name || '—'}</td>
    <td>${r.branch || '—'}</td>
    <td>${r.academic_year || '—'}</td>
    <td>₹${parseFloat(r.net_payable).toLocaleString()}</td>
    <td>
      <div style="font-size:0.8rem; font-weight:600; color:var(--text-secondary);">${formatDate(r.updated_at)}</div>
      <div style="font-size:0.7rem; color:var(--text-muted);">by ${r.updated_by || 'Admin'}</div>
    </td>
    <td class="action-btns">
      <button class="btn btn-view" onclick="viewManagementForm(${r.id})" title="View Details"><span class="material-icons-round" style="font-size:16px">visibility</span></button>
      <button class="btn btn-print" onclick="printManagementFromRecord(${r.id})" title="Print Form"><span class="material-icons-round" style="font-size:16px">print</span></button>
      <button class="btn btn-delete" onclick="deleteManagement(${r.id})" title="Delete Record"><span class="material-icons-round" style="font-size:16px">delete</span></button>
    </td>
  </tr>`).join('');
}

async function saveAndPrintManagementForm(admissionId) {
  const get = (id) => document.getElementById(id).value;
  try {
    const payload = {
      admission_id: admissionId,
      app_no: get('ed-app-no'),
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
              @page { size: A4; margin: 8mm 12mm; }
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
              th, td { border: 1.2px solid #000; padding: 4px 10px; height: 26px; vertical-align: middle; word-wrap: break-word; }
              .label { font-weight: 700; width: 28%; background: #f8fafc; font-size: 10px; }
              .value { width: 22%; font-weight: 800; font-size: 10.5px; }

              .entrance-table th { background: #f8fafc; font-size: 8.5px; padding: 3px; text-align: center; font-weight: 800; line-height: 1.1; height: 28px; }
              .entrance-table td { text-align: center; padding: 3px; height: 24px; font-weight: 800; }
              
              .section-table { margin-bottom: 12px; }
              .section-table td { vertical-align: top; padding: 12px 10px 6px; position: relative; }
              .section-label { position: absolute; top: 2px; left: 10px; font-weight: 800; font-size: 9px; text-transform: uppercase; }

              .guidelines { font-size: 8.5px; margin-bottom: 20px; line-height: 1.3; text-align: justify; }
              .guidelines h3 { font-size: 10px; margin-bottom: 4px; text-decoration: underline; font-weight: 800; }
              .guidelines ol { padding-left: 15px; margin: 0; }
              .guidelines li { margin-bottom: 2px; }

              .footer-signs { display: flex; justify-content: space-between; margin-top: 40px; font-weight: 800; font-size: 10.5px; width: 100%; }
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
                      <div style="font-size: 13.5px; font-weight: 800; color: #1e293b;">SRI VENKATESHWARA</div>
                      <div style="font-size: 13.5px; font-weight: 800; color: #1e293b;">COLLEGE OF ENGINEERING</div>
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
              <div style="flex: 1.2;">Application No.: <span class="box-input" style="min-width:170px">${val(m.app_no)}</span></div>
              <div style="flex: 1; text-align: center;">Academic Year: 20<span class="year-boxes"><span>${(y1[0]||'')}</span><span>${(y1[1]||'')}</span></span> 20<span class="year-boxes"><span>${(y2[0]||'')}</span><span>${(y2[1]||'')}</span></span></div>
              <div style="flex: 0.8; text-align: right;">Date: <span style="text-decoration: underline; font-weight:800">${val(m.form_date)}</span></div>
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

            <table class="section-table" style="height: 120px;"><tr><td><span class="section-label">Remarks:</span><div style="font-style:italic; font-weight:800; padding-top:4px;">${val(r.admin_remarks)}</div></td></tr></table>

            <div class="guidelines">
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
              <div class="sign-col">Admissions Team Signature</div>
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
  let filtered = allManagement;
  if (search) {
    filtered = filtered.filter(r => 
      (r.student_name || '').toLowerCase().includes(search) ||
      (r.app_no || '').toLowerCase().includes(search) ||
      (r.branch || '').toLowerCase().includes(search)
    );
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

