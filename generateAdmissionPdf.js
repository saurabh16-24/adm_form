/**
 * generateAdmissionPdf.js
 * Generates the Official SVCE Admission Application Form (One-page layout).
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Colours
const NAVY    = '#1e3a8a';
const BORDER  = '#111111';
const GRAY    = '#475569';
const BLACK   = '#000000';
const WHITE   = '#ffffff';
const SECTION_BG = '#bae6fd';
const LABEL_BG   = '#f8fafc';

const LOGO_PATH = path.join(__dirname, 'svce-logo.png');

/**
 * Helper to get image buffer from path
 */
function getImageBuffer(p) {
  if (!p) return null;
  // Handle /uploads/... by removing leading slash
  const cleanPath = p.startsWith('/') ? p.substring(1) : p;
  const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.join(__dirname, cleanPath);
  if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath);
  return null;
}

function generateAdmissionPdf(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    // Tighter margins to fit on one page
    const doc = new PDFDocument({ size: 'A4', margin: 25 });

    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const M = 25;
    const CW = W - M * 2;

    const formatDate = (dateString) => {
      if (!dateString) return '—';
      const d = new Date(dateString);
      return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB'); 
    };

    // ── 1. Header ──────────────────────────────────────────────
    // Enlarge logo and keep address/header centered
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, (W - 280) / 2, 20, { width: 280 });
    }
    
    doc.moveTo(M, 70).lineTo(W - M, 70).lineWidth(1.2).stroke(NAVY);
    
    let y = 80;

    // Student Photo (Top Right)
    const photoBuffer = getImageBuffer(data.passport_photo_path);
    doc.save();
    doc.rect(W - M - 70, y + 5, 70, 85).stroke(BORDER);
    if (photoBuffer) {
      doc.image(photoBuffer, W - M - 69, y + 6, { width: 68, height: 83, fit: [68, 83], align: 'center', valign: 'center' });
    } else {
      doc.fillColor('#999').fontSize(7).text('AFFIX\nSTUDENT\nPHOTO', W - M - 70, y + 36, { width: 70, align: 'center' });
    }
    doc.restore();

    // App Meta
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9)
       .text(`APPLICATION FORM (ACADEMIC YEAR ${new Date().getFullYear()}-${new Date().getFullYear() + 1})`, M, y + 15, { width: CW - 80, align: 'center' });
    
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11)
       .text('Application Form No: ' + (data.application_number || '—'), M, y + 32, { width: CW - 80, align: 'center' });

    y = 175;

    // ── Table Helpers (Compact) ───────────────────────────────
    function sectionHeader(title) {
      doc.rect(M, y, CW, 15).fill(SECTION_BG);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8.5)
         .text(title.toUpperCase(), M + 8, y + 4);
      y += 15;
    }

    function row2(l1, v1, l2, v2, w1=16, w2=34) {
      const h = 13.5;
      const u1 = (CW * w1) / 100;
      const u2 = (CW * w2) / 100;

      doc.rect(M, y, u1, h).fill(LABEL_BG).stroke(BORDER);
      doc.rect(M + u1, y, u2, h).stroke(BORDER);
      doc.rect(M + u1 + u2, y, u1, h).fill(LABEL_BG).stroke(BORDER);
      doc.rect(M + u1*2 + u2, y, u2, h).stroke(BORDER);

      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7.5).text(l1, M + 4, y + 3.5);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8).text(String(v1 || '—'), M + u1 + 4, y + 3.2, { width: u2 - 6 });
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7.5).text(l2, M + u1 + u2 + 4, y + 3.5);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8).text(String(v2 || '—'), M + u1*2 + u2 + 4, y + 3.2, { width: u2 - 6 });
      y += h;
    }

    // ── 2. Personal Details ────────────────────────────────────
    sectionHeader('Personal Details');
    row2('Name', (data.title ? data.title + ' ' : '') + (data.student_name || ''), 'Father\'s Name', data.father_name);
    row2('Mobile No.', data.mobile_no, 'Father\'s Mobile', data.father_mobile);
    row2('Email Address', data.email, 'Mother\'s Name', data.mother_name);
    row2('Date of Birth', formatDate(data.date_of_birth), 'Mother\'s Mobile', data.mother_mobile);
    row2('Gender', data.gender, 'Father\'s Occupation', data.father_occupation);
    row2('Aadhaar No.', data.aadhaar_no, 'Mother\'s Occupation', data.mother_occupation);

    y += 4;

    // ── 3. Course Preferences ──────────────────────────────────
    sectionHeader('Course Preference Details');
    const prefs = data._top_prefs || [];
    const colW = CW / 3;
    doc.rect(M, y, CW, 18).stroke(BORDER);
    
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(7.5);
    doc.text('1. ' + (typeof prefs[0] === 'object' ? prefs[0].course : (prefs[0] || '—')), M + 5, y + 6, { width: colW - 10 });
    doc.text('2. ' + (typeof prefs[1] === 'object' ? prefs[1].course : (prefs[1] || '—')), M + colW + 5, y + 6, { width: colW - 10 });
    doc.text('3. ' + (typeof prefs[2] === 'object' ? prefs[2].course : (prefs[2] || '—')), M + colW*2 + 5, y + 6, { width: colW - 10 });
    y += 18;

    y += 4;

    // ── 4. Address Details ─────────────────────────────────────
    sectionHeader('Address Details');
    doc.rect(M, y, CW, 12).fill(LABEL_BG).stroke(BORDER);
    doc.fillColor(BLACK).font('Helvetica').fontSize(7.5).text('Permanent Address Same as Communication Address: ', M + 6, y + 3);
    doc.font('Helvetica-Bold').fillColor(NAVY).text(data.same_as_comm ? 'Yes' : 'No', M + 200, y + 3);
    y += 12;

    function addrRow(field, comm, perm) {
      const h = 13;
      const w1 = CW * 0.16;
      const w2 = CW * 0.42;
      doc.rect(M, y, w1, h).fill(LABEL_BG).stroke(BORDER);
      doc.rect(M + w1, y, w2, h).stroke(BORDER);
      doc.rect(M + w1 + w2, y, w2, h).stroke(BORDER);
      
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7).text(field, M + 4, y + 3.5);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(7.5).text(comm || '—', M + w1 + 4, y + 3, { width: w2 - 6 });
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(7.5).text(perm || comm || '—', M + w1 + w2 + 4, y + 3, { width: w2 - 6 });
      y += h;
    }
    addrRow('Address 1', data.comm_address_line1, data.perm_address_line1);
    addrRow('Address 2', data.comm_address_line2, data.perm_address_line2);
    addrRow('City/Dist', (data.comm_city || '') + ' / ' + (data.comm_district || ''), (data.perm_city || '') + ' / ' + (data.perm_district || ''));
    addrRow('State/ZP', (data.comm_state || '') + ' - ' + (data.comm_pincode || ''), (data.perm_state || '') + ' - ' + (data.perm_pincode || ''));

    y += 4;

    // ── 5. Educational Details ─────────────────────────────────
    sectionHeader('Educational Details');
    function eduRow(label, val) {
      const h = 13.5;
      doc.rect(M, y, CW * 0.35, h).fill(LABEL_BG).stroke(BORDER);
      doc.rect(M + CW * 0.35, y, CW * 0.65, h).stroke(BORDER);
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7.5).text(label, M + 8, y + 4);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8).text(val || '—', M + CW * 0.35 + 8, y + 3.5);
      y += h;
    }
    eduRow('Board / University', data.twelfth_board);
    eduRow('Year / Result Status', (data.twelfth_year_passing || '') + ' / ' + (data.twelfth_result_status || '—'));
    eduRow('Percentage / CGPA', (data.twelfth_percentage || '—') + '%');
    eduRow('Entrance Exams', data.entrance_exams);

    y += 10;

    // ── 6. Declaration ─────────────────────────────────────────
    sectionHeader('Declaration');
    doc.rect(M, y, CW, 70).stroke(BORDER);
    doc.fillColor('#222').font('Helvetica').fontSize(7.8);
    const declLines = [
      "• I hereby declare that all information provided is true and correct.",
      "• I agree to abide by all rules of SVCE as applicable from time to time.",
      "• I authorize SVCE to process my data for admissions and academic records.",
      "• Submission doesn't guarantee admission; seats are subject to availability and eligibility.",
      "• Admission is subject to approval from DTE/VTU/Regulatory bodies.",
    ];
    doc.text(declLines.join('\n'), M + 8, y + 8, { width: CW - 16, lineGap: 1.5 });
    y += 75;

    // ── 7. Footer & Signatures ─────────────────────────────────
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text((data.student_name || '').toUpperCase(), M, y);
    doc.fillColor(GRAY).font('Helvetica').fontSize(7).text('Generated On: ' + new Date().toLocaleString('en-IN'), M, y+14);
    doc.text('Submission ID: ' + (data.id || '—'), M, y+22);

    y += 35;
    const signAreaW = 110;
    const gap = (CW - (signAreaW * 3)) / 2;

    function signBox(label, x, imgPath) {
      doc.rect(x, y, signAreaW, 35).stroke(BORDER);
      const signBuf = getImageBuffer(imgPath);
      if (signBuf) {
        doc.image(signBuf, x + 2, y + 2, { width: signAreaW - 4, height: 31, fit: [signAreaW - 4, 31], align: 'center', valign: 'center' });
      }
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(7).text(label, x, y + 38, { width: signAreaW, align: 'center' });
    }

    signBox('ONLINE SIGNATURE', M, data.signature_path);
    signBox('OFFLINE SIGNATURE', M + signAreaW + gap, null);
    signBox('PARENT SIGNATURE', M + (signAreaW + gap) * 2, null);

    // Page Border
    doc.rect(12, 12, W - 24, doc.page.height - 24).lineWidth(0.5).stroke('#cbd5e1');

    doc.end();
  });
}

module.exports = generateAdmissionPdf;
