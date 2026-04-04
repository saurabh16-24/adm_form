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
  const now = new Date();
  document.getElementById('topbar-time').textContent = now.toLocaleString('en-IN', {
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

async function apiFetch(path) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() });
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
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
      let prefs = '';
      try { prefs = JSON.parse(r.course_preferences || '[]').join(', '); } catch { prefs = r.course_preferences || ''; }
      return `<tr>
        <td>${r.token_number || '—'}</td>
        <td>${r.student_name || '—'}</td>
        <td>${r.student_email || '—'}</td>
        <td>${r.student_mobile || '—'}</td>
        <td>${formatDate(r.enquiry_date)}</td>
        <td title="${prefs}">${truncate(prefs, 30)}</td>
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

function renderEnquiries(rows) {
  const tbody = document.getElementById('enquiries-body');
  document.getElementById('enq-count').textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty-state"><span class="material-icons-round">inbox</span><p>No enquiries found</p></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `<tr>
    <td>${r.id}</td>
    <td>${r.token_number || '—'}</td>
    <td>${r.student_name || '—'}</td>
    <td>${r.student_email || '—'}</td>
    <td>${r.student_mobile || '—'}</td>
    <td>${r.father_name || '—'}</td>
    <td>${r.education_qualification || '—'}</td>
    <td>${r.education_board || '—'}</td>
    <td>${r.total_percentage != null ? r.total_percentage + '%' : '—'}</td>
    <td>${formatDate(r.enquiry_date)}</td>
    <td class="action-btns">
      <button class="btn btn-view" onclick="viewEnquiry(${r.id})"><span class="material-icons-round" style="font-size:16px">visibility</span></button>
      <button class="btn btn-delete" onclick="deleteEnquiry(${r.id})"><span class="material-icons-round" style="font-size:16px">delete</span></button>
    </td>
  </tr>`).join('');
}

function filterEnquiries() {
  const search = document.getElementById('enq-search').value.toLowerCase();
  const dateFilter = document.getElementById('enq-filter-date').value;
  let filtered = allEnquiries;

  if (search) {
    filtered = filtered.filter(r =>
      (r.student_name || '').toLowerCase().includes(search) ||
      (r.student_email || '').toLowerCase().includes(search) ||
      (r.token_number || '').toLowerCase().includes(search) ||
      (r.student_mobile || '').includes(search)
    );
  }

  if (dateFilter) filtered = filterByDate(filtered, 'enquiry_date', dateFilter);
  renderEnquiries(filtered);
}

async function viewEnquiry(id) {
  try {
    const data = await apiFetch(`/api/admin/enquiry/${id}`);
    const r = data.row;
    let prefs = '';
    try { prefs = JSON.parse(r.course_preferences || '[]').join(', '); } catch { prefs = r.course_preferences || ''; }

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
        ${detailItem('Address', r.address || [r.address_line1, r.address_line2, r.address_city, r.address_state, r.address_pincode].filter(Boolean).join(', '), true)}
        ${detailItem('Qualification', r.education_qualification)}
        ${detailItem('Board', r.education_board)}
        ${detailItem('Physics', r.physics_marks)}
        ${detailItem('Chemistry', r.chemistry_marks)}
        ${detailItem('Mathematics', r.mathematics_marks)}
        ${detailItem('CS', r.cs_marks)}
        ${detailItem('Bio', r.bio_marks)}
        ${detailItem('Total %', r.total_percentage)}
        ${detailItem('PCM %', r.pcm_percentage)}
        ${detailItem('JEE Rank', r.jee_rank)}
        ${detailItem('COMEDK Rank', r.comedk_rank)}
        ${detailItem('CET Rank', r.cet_rank)}
        ${detailItem('Course Preferences', prefs, true)}
        ${detailItem('Reference', r.reference)}
      </div>`;
    document.getElementById('detail-modal').classList.add('open');
  } catch (err) { alert('Failed to load enquiry details'); }
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
        ${detailItem('Religion', r.religion || '—')}
        ${detailItem('Caste/Category', r.caste_category || '—')}
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
        ${detailItem('10th Institution', r.tenth_institution)}
        ${detailItem('10th Board', r.tenth_board)}
        ${detailItem('10th %', r.tenth_percentage + '%')}
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

    const logoUrl = '../image copy.png';
    const photoUrl = r.passport_photo_path ? `..${r.passport_photo_path}` : '';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Application Print - ${r.student_name}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-print-color-adjust: exact; margin: 0; padding: 0; font-size: 11.5px; line-height: 1.4; color: #111; }
          
          .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; }
          .logo-img { height: 75px; width: auto; object-fit: contain; }
          
          .header-meta-area { position: relative; min-height: 130px; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
          .photo-box { position: absolute; right: 0; top: 0; width: 100px; height: 120px; border: 1px solid #111; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff; z-index: 10; }
          .photo-box img { width: 100%; height: 100%; object-fit: cover; }
          
          .app-meta { text-align: center; }
          .app-meta p { margin: 4px 0; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #555; }
          
          table { width: 100%; border-collapse: collapse; margin-bottom: 18px; border: 1px solid #111; table-layout: fixed; }
          th, td { border: 1px solid #111; padding: 7px 10px; text-align: left; word-wrap: break-word; }
          .section-header { background: #bae6fd !important; font-weight: 800; font-size: 11.5px; text-transform: uppercase; color: #000; letter-spacing: 0.5px; font-family: sans-serif; }
          .label { font-weight: 600; background: #f8fafc; color: #475569; font-size: 10.5px; width: 35%; }
          .value { font-weight: 700; color: #000; font-size: 11px; }
          
          .grid-head { background: #f8fafc; font-weight: 700; font-size: 10px; text-transform: uppercase; color: #64748b; }
          .declaration { font-size: 10.8px; text-align: justify; padding: 12px; line-height: 1.7; color: #222; }
          
          .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; }
          .sign-area { text-align: center; width: 220px; }
          .sign-placeholder { height: 45px; margin-bottom: 5px; font-style: italic; font-family: cursive; font-size: 26px; color: #000; display: flex; align-items: flex-end; justify-content: center; }
          .sign-label { font-weight: 800; font-size: 11px; border-top: 1.5px solid #000; padding-top: 6px; display: block; text-transform: uppercase; letter-spacing: 0.5px; }
          
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
            <p style="font-size:11px; color:#1e40af; border-bottom: 1.5px solid #bae6fd; padding-bottom: 5px; display:inline-block; margin-bottom:12px; font-weight:800;">APPLICATION FORM (ACADEMIC YEAR 2025-2026)</p>
            <div style="font-size:15px; font-weight:800; margin-bottom:15px;">Application Form No: SVCE/2025-2026/BE/<span style="color:#000;">${r.application_number}</span></div>
          </div>
        </div>

        <table>
          <tr class="section-header"><th colspan="2">Personal Details</th></tr>
          <tr><td class="label">Name</td><td class="value">${r.title || ''} ${r.student_name}</td></tr>
          <tr><td class="label">Mobile No.</td><td class="value">${r.mobile_no}</td></tr>
          <tr><td class="label">Email Address</td><td class="value">${r.email}</td></tr>
          <tr><td class="label">Date of Birth</td><td class="value">${formatDate(r.date_of_birth)}</td></tr>
          <tr><td class="label">Gender</td><td class="value">${r.gender}</td></tr>
          <tr><td class="label">Religion</td><td class="value">${r.religion || '—'}</td></tr>
          <tr><td class="label">Caste Category</td><td class="value">${r.caste_category || '—'}</td></tr>
          <tr><td class="label">Aadhaar Number</td><td class="value">${r.aadhaar_no || '—'}</td></tr>
        </table>



        <table>
          <tr class="section-header"><th colspan="3">Preference Details</th></tr>
          <tr class="grid-head"><th>Selected Institute</th><th>Course Preference</th><th>Program Preference</th></tr>
          <tr><td class="value">${r.selected_institute || 'Engineering - SVCE'}</td><td class="value">${r.course_preference}</td><td class="value">${r.program_preference}</td></tr>
        </table>

        <table>
          <tr class="section-header"><th colspan="3">Address Details</th></tr>
          <tr><td colspan="3" style="font-size:10.5px; font-weight:600; background:#f8fafc;">Permanent Address Same as Communication Address: <span style="font-weight:800; color:#1e40af;">${r.same_as_comm ? 'Yes' : 'No'}</span></td></tr>
          <tr class="grid-head"><th style="width:26%;">Field</th><th style="width:37%;">Communication Address</th><th style="width:37%;">Permanent Address</th></tr>
          <tr><td class="label">Address Line 1</td><td class="value">${r.comm_address_line1}</td><td class="value">${r.perm_address_line1 || r.comm_address_line1}</td></tr>
          <tr><td class="label">Address Line 2</td><td class="value">${r.comm_address_line2 || '—'}</td><td class="value">${r.perm_address_line2 || r.comm_address_line2 || '—'}</td></tr>
          <tr><td class="label">City</td><td class="value">${r.comm_city}</td><td class="value">${r.perm_city || r.comm_city}</td></tr>
          <tr><td class="label">District</td><td class="value">${r.comm_district || '—'}</td><td class="value">${r.perm_district || r.comm_district || '—'}</td></tr>
          <tr><td class="label">State</td><td class="value">${r.comm_state}</td><td class="value">${r.perm_state || r.comm_state}</td></tr>
          <tr><td class="label">Country</td><td class="value">${r.comm_country || 'India'}</td><td class="value">${r.perm_country || r.comm_country || 'India'}</td></tr>
          <tr><td class="label">Pincode</td><td class="value">${r.comm_pincode}</td><td class="value">${r.perm_pincode || r.comm_pincode}</td></tr>
        </table>

        <table>
          <tr class="section-header"><th colspan="2">Parent Details</th></tr>
          <tr><td class="label">Father Name</td><td class="value">${r.father_name}</td></tr>
          <tr><td class="label">Father's Mobile / Occupation</td><td class="value">${r.father_mobile || '—'} / ${r.father_occupation || '—'}</td></tr>
          <tr><td class="label">Mother Name</td><td class="value">${r.mother_name}</td></tr>
          <tr><td class="label">Mother's Mobile / Occupation</td><td class="value">${r.mother_mobile || '—'} / ${r.mother_occupation || '—'}</td></tr>
        </table>

        <table>
          <tr class="section-header"><th colspan="4">Educational Details</th></tr>
          <tr><td colspan="4" class="label" style="width:100%; background:#f8fafc; font-weight:700;">Qualifying Marksheet Name: <span style="font-weight:800; color:#000;">${r.candidate_name_marksheet}</span></td></tr>
          <tr class="grid-head"><th>Details</th><th>10th Standard</th><th>12th Standard</th><th>Entrance Exam</th></tr>
          <tr><td class="label">Institution</td><td>${r.tenth_institution}</td><td>${r.twelfth_institution}</td><td rowspan="4" class="value" style="vertical-align:middle; text-align:center; font-size:12px; color:#1e40af;">${r.entrance_exams || 'N/A'}</td></tr>
          <tr><td class="label">Board/Univ</td><td>${r.tenth_board}</td><td>${r.twelfth_board}</td></tr>
          <tr><td class="label">Year / Status</td><td>${r.tenth_year_passing} / ${r.tenth_result_status || '—'}</td><td>${r.twelfth_year_passing} / ${r.twelfth_result_status || '—'}</td></tr>
          <tr><td class="label">Percentage/CGPA</td><td class="value">${r.tenth_percentage || '—'}%</td><td class="value">${r.twelfth_percentage || '—'}%</td></tr>
        </table>

        <div style="page-break-inside: avoid;">
          <table>
            <tr class="section-header"><th>Declaration</th></tr>
            <tr>
              <td class="declaration">
                I hereby declare that all the information provided by me in this application form is true, complete, and correct to the best of my knowledge and belief. I understand that if any information furnished by me is found to be false, incorrect, incomplete, or misleading at any stage, my application is liable to be rejected or cancelled without prior notice.
                <br><br>
                I further confirm that I have carefully read and understood all the instructions, eligibility criteria, and details mentioned in the admission notification for the respective program. I agree to abide by all the rules and regulations of the College (SVCE), as applicable from time to time.
                <br><br>
                I hereby authorize the College (SVCE) to use, process, store, or share the information provided by me for application processing, academic records, and compliance with statutory or regulatory authorities.
                <br><br>
                I understand that submission of this application does not guarantee admission, and the allotment of the selected/preferred course is strictly subject to the availability of seats and fulfillment of eligibility criteria.
                <br><br>
                I understand that this application is valid only for a limited period and is subject to seat availability at the time of admission.
                <br><br>
                I also understand that in case I have not appeared for any entrance examination such as CET / COMEDK / JEE or equivalent, my admission (if selected) shall be subject to approval from the concerned authorities such as DTE / VTU or any other regulatory body, as applicable.
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
              <div class="sign-placeholder">${r.student_name}</div>
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
