/* ═══════════════════════════════════════════════════════════════════════
   SVCE Admin Dashboard — Client-side JS
   ═══════════════════════════════════════════════════════════════════════ */

const API = window.location.origin; // same origin
let allEnquiries  = [];
let allAdmissions = [];

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
    admissions: ['Admissions', 'Manage admission applications']
  };
  document.getElementById('page-title').textContent = titles[tab][0];
  document.getElementById('page-subtitle').textContent = titles[tab][1];

  if (tab === 'overview')   loadOverview();
  if (tab === 'enquiries')  loadEnquiries();
  if (tab === 'admissions') loadAdmissions();
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
    document.getElementById('stat-today-enq').textContent    = stats.today_enquiries    || 0;
    document.getElementById('stat-today-adm').textContent    = stats.today_admissions   || 0;

    // Recent tables
    renderRecentTable('recent-enquiries-body', stats.recent_enquiries || [], 'enquiry');
    renderRecentTable('recent-admissions-body', stats.recent_admissions || [], 'admission');
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

async function printEnquiry(id) {
  try {
    const data = await apiFetch(`/api/admin/enquiry/${id}`);
    const r = data.row;
    
    const printWin = window.open('', '_blank');
    if (!printWin) return alert('Pop-up blocked. Please allow pop-ups for this site.');

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

        <script>
          window.onload = function() {
            setTimeout(() => { window.print(); }, 500);
          };
        </script>
      </body>
      </html>
    `;
    
    printWin.document.write(html);
    printWin.document.close();

  } catch (err) { alert('Failed to generate print view'); console.error(err); }
}

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
      <button class="btn btn-print" onclick="printAdmission(${r.id})" title="Print Application"><span class="material-icons-round" style="font-size:16px">print</span></button>
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
        <button class="btn btn-print" style="margin-left:auto; padding:6px 12px; font-size:13px; display:flex; align-items:center; gap:6px;" onclick="printAdmission(${r.id})">
          <span class="material-icons-round" style="font-size:16px;">print</span> Print
        </button>
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
  try {
    const data = await apiFetch(`/api/admin/admission/${id}`);
    const r = data.row;
    
    // Create print window
    const printWin = window.open('', '_blank');
    if (!printWin) return alert('Pop-up blocked. Please allow pop-ups for this site.');

    const logoUrl = window.location.origin + '/image copy.png';
    const photoUrl = r.passport_photo_path ? window.location.origin + r.passport_photo_path : '';
    const signUrl = r.signature_path ? window.location.origin + r.signature_path : '';
    
    // Fetch enquiry preferences (from joined field)
    let prefsArray = [];
    if (typeof r.course_preferences === 'string') {
        try { prefsArray = JSON.parse(r.course_preferences || '[]'); } catch { prefsArray = []; }
    } else {
        prefsArray = r.course_preferences || [];
    }
    prefsArray = Array.isArray(prefsArray) ? prefsArray.slice(0, 4) : [];
    while(prefsArray.length < 4) prefsArray.push('');
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Application Print - ${r.student_name}</title>
        <style>
          @page { size: A4; margin: 10mm 15mm; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-print-color-adjust: exact; margin: 0; padding: 0; font-size: 10.5px; line-height: 1.35; color: #111; }
          
          .header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; }
          .logo-img { height: 60px; width: auto; object-fit: contain; }
          
          .header-meta-area { position: relative; min-height: 115px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
          .photo-box { position: absolute; right: 0; top: 0; width: 90px; height: 110px; border: 1.2px solid #111; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff; z-index: 10; }
          .photo-box img { width: 100%; height: 100%; object-fit: cover; }
          
          .app-meta { text-align: center; }
          .app-meta p { margin: 3px 0; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #555; }
          
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border: 1px solid #111; table-layout: fixed; }
          th, td { border: 1px solid #111; padding: 5px 8px; text-align: left; word-wrap: break-word; }
          .section-header { background: #bae6fd !important; font-weight: 800; font-size: 10.5px; text-transform: uppercase; color: #000; letter-spacing: 0.5px; font-family: sans-serif; }
          .label { font-weight: 600; background: #f8fafc; color: #475569; font-size: 9.5px; width: 35%; }
          .value { font-weight: 700; color: #000; font-size: 10px; }
          
          .grid-head { background: #f8fafc; font-weight: 700; font-size: 9.5px; text-transform: uppercase; color: #64748b; }
          .declaration { font-size: 9.5px; text-align: justify; padding: 8px 12px; line-height: 1.5; color: #222; }
          
          .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px; }
          .sign-area { text-align: center; width: 200px; }
          .sign-placeholder { height: 50px; margin-bottom: 4px; display: flex; align-items: flex-end; justify-content: center; }
          .signature-img { max-height: 48px; max-width: 180px; object-fit: contain; }
          .sign-label { font-weight: 810; font-size: 10px; border-top: 1.5px solid #000; padding-top: 4px; display: block; text-transform: uppercase; letter-spacing: 0.5px; }
          
          @media print { 
            .no-print { display: none; } 
            table, tr { page-break-inside: avoid; }
            body { print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="header" style="margin-bottom:15px;">
          <img src="${logoUrl}" class="logo-img">
        </div>

        <div class="header-meta-area">
          <div class="photo-box">
            ${photoUrl ? `<img src="${photoUrl}">` : '<div style="font-size:10px; color:#999; text-align:center;">AFFIX<br>STUDENT<br>PHOTO</div>'}
          </div>

          <div class="app-meta">
            <p style="font-size:11px; color:#1e40af; border-bottom: 1.5px solid #bae6fd; padding-bottom: 5px; display:inline-block; margin-bottom:12px; font-weight:800;">APPLICATION FORM (ACADEMIC YEAR ${new Date().getFullYear()}-${new Date().getFullYear() + 1})</p>
            <div style="font-size:15px; font-weight:800; margin-bottom:15px;">Application Form No: <span style="color:#000;">${r.application_number}</span></div>
          </div>
        </div>

        <table>
          <tr class="section-header"><th colspan="2">Personal Details</th></tr>
          <tr><td class="label">Name</td><td class="value">${r.title || ''} ${r.student_name}</td></tr>
          <tr><td class="label">Mobile No.</td><td class="value">${r.mobile_no}</td></tr>
          <tr><td class="label">Email Address</td><td class="value">${r.email}</td></tr>
          <tr><td class="label">Date of Birth</td><td class="value">${formatDate(r.date_of_birth)}</td></tr>
          <tr><td class="label">Gender</td><td class="value">${r.gender}</td></tr>
          <tr><td class="label">Aadhaar Number</td><td class="value">${r.aadhaar_no || '—'}</td></tr>
        </table>
        <table>
          <tr class="section-header"><th colspan="3">Preference Details (From Enquiry)</th></tr>
          <tr class="grid-head">
            <th style="width: 25px; text-align: center;">#</th>
            <th>Course Name</th>
            <th style="width: 150px;">Fee (Agreed)</th>
          </tr>
          ${prefsArray.map((p, i) => `
            <tr>
              <td style="text-align: center; font-weight: 700;">${i + 1}.</td>
              <td class="value">${typeof p === 'object' ? p.course : p}</td>
              <td class="value" style="text-align: center;">${typeof p === 'object' && p.fee ? '₹' + p.fee : '—'}</td>
            </tr>
          `).join('')}
        </table>
        <table>
          <tr class="section-header"><th colspan="3">Address Details</th></tr>
          <tr><td colspan="3" style="font-size: 10px; font-weight: 600; background: #f8fafc; padding: 4px 8px;">Permanent Address Same as Communication Address: <span style="font-weight: 800; color: #1e40af;">${r.same_as_comm ? 'Yes' : 'No'}</span></td></tr>
          <tr class="grid-head"><th style="width: 26%;">Field</th><th style="width: 37%;">Communication Address</th><th style="width: 37%;">Permanent Address</th></tr>
          <tr><td class="label">Address Line 1</td><td class="value">${r.comm_address_line1}</td><td class="value">${r.perm_address_line1 || r.comm_address_line1}</td></tr>
          <tr><td class="label">Address Line 2</td><td class="value">${r.comm_address_line2 || '—'}</td><td class="value">${r.perm_address_line2 || r.comm_address_line2 || '—'}</td></tr>
          <tr><td class="label">City</td><td class="value">${r.comm_city}</td><td class="value">${r.perm_city || r.comm_city}</td></tr>
          <tr><td class="label">District</td><td class="value">${r.comm_district || '—'}</td><td class="value">${r.perm_district || r.comm_district || '—'}</td></tr>
          <tr><td class="label">State</td><td class="value">${r.comm_state}</td><td class="value">${r.perm_state || r.comm_state}</td></tr>
          <tr><td class="label">Country</td><td class="value">${r.comm_country || 'India'}</td><td class="value">${r.perm_country || r.comm_country || 'India'}</td></tr>
          <tr><td class="label">Pincode</td><td class="value">${r.comm_pincode}</td><td class="value">${r.perm_pincode || r.comm_pincode}</td></tr>
        </table>
        <div style="page-break-after: always;"></div>
        <table>
          <tr class="section-header"><th colspan="2">Parent Details</th></tr>
          <tr><td class="label">Father Name</td><td class="value">${r.father_name}</td></tr>
          <tr><td class="label">Father's Mobile / Occupation</td><td class="value">${r.father_mobile || '—'} / ${r.father_occupation || '—'}</td></tr>
          <tr><td class="label">Mother Name</td><td class="value">${r.mother_name}</td></tr>
          <tr><td class="label">Mother's Mobile / Occupation</td><td class="value">${r.mother_mobile || '—'} / ${r.mother_occupation || '—'}</td></tr>
        </table>
        <table>
          <tr class="section-header"><th colspan="2">Educational Details</th></tr>
          <tr><td colspan="2" class="label" style="width:100%; background:#f8fafc; font-weight:700;">Qualifying Marksheet Name: <span style="font-weight:800; color:#000;">${r.candidate_name_marksheet}</span></td></tr>
          <tr class="grid-head"><th>Details</th><th>12th Standard</th></tr>
          <tr><td class="label">Institution</td><td class="value">${r.twelfth_institution}</td></tr>
          <tr><td class="label">Board / University</td><td class="value">${r.twelfth_board}</td></tr>
          <tr><td class="label">Year / Result Status</td><td class="value">${r.twelfth_year_passing} / ${r.twelfth_result_status || '—'}</td></tr>
          <tr><td class="label">Obtained Percentage / CGPA</td><td class="value">${r.twelfth_percentage || '—'}%</td></tr>
          <tr><td class="label">Entrance Examination(s)</td><td class="value">${r.entrance_exams || 'None / Not Applicable'}</td></tr>
        </table>

        <div style="page-break-inside: avoid;">
          <table>
            <tr class="section-header"><th>Declaration</th></tr>
            <tr>
              <td class="declaration">
                <ul style="margin: 0; padding-left: 1.2rem; line-height: 1.6;">
                  <li style="margin-bottom: 8px;">I hereby declare that all the information provided by me in this application form is true, complete, and correct to the best of my knowledge and belief. I understand that if any information furnished by me is found to be false, incorrect, incomplete, or misleading at any stage, my application is liable to be rejected or cancelled without prior notice.</li>
                  <li style="margin-bottom: 8px;">I further confirm that I have carefully read and understood all the instructions, eligibility criteria, and details mentioned in the admission notification for the respective program. I agree to abide by all the rules and regulations of the College (SVCE), as applicable from time to time.</li>
                  <li style="margin-bottom: 8px;">I hereby authorize the College (SVCE) to use, process, store, or share the information provided by me for application processing, academic records, and compliance with statutory or regulatory authorities.</li>
                  <li style="margin-bottom: 8px;">I understand that submission of this application does not guarantee admission, and the allotment of the selected/preferred course is strictly subject to the availability of seats and fulfillment of eligibility criteria.</li>
                  <li style="margin-bottom: 8px;">I understand that this application is valid only for a limited period and is subject to seat availability at the time of admission.</li>
                  <li>I also understand that in case I have not appeared for any entrance examination such as CET / COMEDK / JEE or equivalent, my admission (if selected) shall be subject to approval from the concerned authorities such as DTE / VTU or any other regulatory body, as applicable.</li>
                </ul>
              </td>
            </tr>
          </table>

          <div class="footer">
            <div class="footer-info">
              <p style="font-weight:900; font-size:13px; color:#1e3a8a;">${r.student_name.toUpperCase()}</p>
              <p style="color:#64748b;">Generated On: ${new Date().toLocaleString('en-IN')}</p>
              <p style="color:#64748b; font-size:10px;">Submission ID: ${r.id} | Timestamp: ${new Date(r.application_date).toLocaleString('en-IN')}</p>
            </div>
            <div class="sign-area">
              <div class="sign-placeholder">
                ${signUrl ? `<img src="${signUrl}" class="signature-img" alt="Candidate Signature">` : r.student_name}
              </div>
              <span class="sign-label">Candidate Signature</span>
            </div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { 
              window.print();
              // window.close(); 
            }, 800);
          };
        </script>
      </body>
      </html>
    `;
    
    printWin.document.write(html);
    printWin.document.close();

  } catch (err) { alert('Failed to generate print view'); console.error(err); }
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
