/**
 * generateAdmissionPdf.js
 * Generates the Official SVCE Admission Application Form (Fixed Spacing & No Overlap).
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
  const cleanPath = p.startsWith('/') ? p.substring(1) : p;
  const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.join(__dirname, cleanPath);
  if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath);
  return null;
}

function generateAdmissionPdf(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
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
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, (W - 240) / 2, 20, { width: 240 });
    }
    
    doc.moveTo(M, 65).lineTo(W - M, 65).lineWidth(1.2).stroke(NAVY);
    
    let y = 75;

    // Student Photo (Top Right)
    const photoBuffer = getImageBuffer(data.passport_photo_path);
    doc.save();
    doc.rect(W - M - 65, y, 65, 80).stroke(BORDER);
    if (photoBuffer) {
      doc.image(photoBuffer, W - M - 64, y + 1, { width: 63, height: 78, fit: [63, 78], align: 'center', valign: 'center' });
    } else {
      doc.fillColor('#999').fontSize(7).text('AFFIX\nSTUDENT\nPHOTO', W - M - 65, y + 30, { width: 65, align: 'center' });
    }
    doc.restore();

    // App Meta
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9)
       .text(`APPLICATION FORM (ACADEMIC YEAR ${new Date().getFullYear()}-${new Date().getFullYear() + 1})`, M, y + 10, { width: CW - 70, align: 'center' });
    
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11)
       .text('Application Form No: ' + (data.application_number || '—'), M, y + 25, { width: CW - 70, align: 'center' });

    y = 160;

    // ── Table Logic (Dynamic Height) ───────────────────────────
    function sectionHeader(title) {
      doc.rect(M, y, CW, 15).fill(SECTION_BG);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8.5)
         .text(title.toUpperCase(), M + 8, y + 4);
      y += 15;
    }

    function row2(l1, v1, l2, v2) {
      const u1 = CW * 0.18; // Label width
      const u2 = CW * 0.32; // Value width
      
      const v1Txt = String(v1 || '—');
      const v2Txt = String(v2 || '—');

      // Calculate height needed
      doc.font('Helvetica-Bold').fontSize(8);
      const h1 = doc.heightOfString(v1Txt, { width: u2 - 8 });
      const h2 = doc.heightOfString(v2Txt, { width: u2 - 8 });
      const h = Math.max(14, h1 + 6, h2 + 6);

      // Draw
      doc.rect(M, y, u1, h).fill(LABEL_BG).stroke(BORDER);
      doc.rect(M + u1, y, u2, h).stroke(BORDER);
      doc.rect(M + u1 + u2, y, u1, h).fill(LABEL_BG).stroke(BORDER);
      doc.rect(M + u1*2 + u2, y, u2, h).stroke(BORDER);

      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7.5).text(l1, M + 4, y + 4);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8).text(v1Txt, M + u1 + 4, y + 4, { width: u2 - 8 });
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7.5).text(l2, M + u1 + u2 + 4, y + 4);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8).text(v2Txt, M + u1*2 + u2 + 4, y + 4, { width: u2 - 8 });
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

    y += 5;

    // ── 3. Course Preferences ──────────────────────────────────
    sectionHeader('Course Preference Details');
    const prefs = data._top_prefs || [];
    const colW = CW / 3;
    doc.rect(M, y, CW, 18).stroke(BORDER);
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(7.5);
    doc.text('1. ' + (typeof prefs[0] === 'object' ? prefs[0].course : (prefs[0] || '—')), M + 5, y + 6, { width: colW - 8, height: 12, ellipsis: true });
    doc.text('2. ' + (typeof prefs[1] === 'object' ? prefs[1].course : (prefs[1] || '—')), M + colW + 5, y + 6, { width: colW - 8, height: 12, ellipsis: true });
    doc.text('3. ' + (typeof prefs[2] === 'object' ? prefs[2].course : (prefs[2] || '—')), M + colW*2 + 5, y + 6, { width: colW - 8, height: 12, ellipsis: true });
    y += 18;

    y += 5;

    // ── 4. Address Details ─────────────────────────────────────
    sectionHeader('Address Details');
    doc.rect(M, y, CW, 14).fill(LABEL_BG).stroke(BORDER);
    doc.fillColor(BLACK).font('Helvetica').fontSize(7.5).text('Permanent Address Same as Communication Address: ', M + 6, y + 4);
    doc.font('Helvetica-Bold').fillColor(NAVY).text(data.same_as_comm ? 'Yes' : 'No', M + 200, y + 4);
    y += 14;

    function addrRow(field, comm, perm) {
      const w1 = CW * 0.18;
      const w2 = CW * 0.41;
      const cTxt = String(comm || '—');
      const pTxt = String(perm || comm || '—');

      doc.font('Helvetica-Bold').fontSize(7.5);
      const hC = doc.heightOfString(cTxt, { width: w2 - 8 });
      const hP = doc.heightOfString(pTxt, { width: w2 - 8 });
      const h = Math.max(16, hC + 6, hP + 6);

      doc.rect(M, y, w1, h).fill(LABEL_BG).stroke(BORDER);
      doc.rect(M + w1, y, w2, h).stroke(BORDER);
      doc.rect(M + w1 + w2, y, w2, h).stroke(BORDER);
      
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7.5).text(field, M + 4, y + 5);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(7.5).text(cTxt, M + w1 + 4, y + 5, { width: w2 - 8 });
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(7.5).text(pTxt, M + w1 + w2 + 4, y + 5, { width: w2 - 8 });
      y += h;
    }
    addrRow('Address 1', data.comm_address_line1, data.perm_address_line1);
    addrRow('Address 2', data.comm_address_line2, data.perm_address_line2);
    addrRow('City/Dist', (data.comm_city || '') + ' / ' + (data.comm_district || ''), (data.perm_city || '') + ' / ' + (data.perm_district || ''));
    addrRow('State/ZP', (data.comm_state || '') + ' - ' + (data.comm_pincode || ''), (data.perm_state || '') + ' - ' + (data.perm_pincode || ''));

    y += 5;

    // ── 5. Educational Details ─────────────────────────────────
    sectionHeader('Educational Details');
    function eduRow(label, val) {
      const w1 = CW * 0.35;
      const w2 = CW * 0.65;
      const vTxt = String(val || '—');
      doc.font('Helvetica-Bold').fontSize(8);
      const h = Math.max(15, doc.heightOfString(vTxt, { width: w2 - 10 }) + 6);

      doc.rect(M, y, w1, h).fill(LABEL_BG).stroke(BORDER);
      doc.rect(M + w1, y, w2, h).stroke(BORDER);
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8).text(label, M + 8, y + 5);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8.5).text(vTxt, M + w1 + 8, y + 5, { width: w2 - 10 });
      y += h;
    }
    eduRow('Board / University', data.twelfth_board);
    eduRow('Year / Result Status', (data.twelfth_year_passing || '') + ' / ' + (data.twelfth_result_status || '—'));
    eduRow('Percentage / CGPA', (data.twelfth_percentage || '—') + '%');
    eduRow('Entrance Exams', data.entrance_exams);

    y += 8;

    // ── 6. Declaration ─────────────────────────────────────────
    sectionHeader('Declaration');
    doc.rect(M, y, CW, 60).stroke(BORDER);
    doc.fillColor('#222').font('Helvetica').fontSize(7.8);
    const declText = "• I hereby declare that all information provided is true and correct. I understand that false info leads to rejection.\n" +
      "• I agree to abide by all rules of SVCE as applicable from time to time. I authorize SVCE to process my data.\n" +
      "• Submission doesn't guarantee admission; seats are subject to availability and eligibility.\n" +
      "• Admission is subject to regulatory approval (DTE/VTU).";
    doc.text(declText, M + 10, y + 8, { width: CW - 20, lineGap: 2 });
    y += 65;

    // ── 7. Footer & Signatures ─────────────────────────────────
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text((data.student_name || '').toUpperCase(), M, y);
    doc.fillColor(GRAY).font('Helvetica').fontSize(7).text('Generated On: ' + new Date().toLocaleString('en-IN'), M, y+13);
    doc.text('Submission ID: ' + (data.id || '—'), M, y+21);

    y += 30;
    const signBoxH = 35;
    const signBoxW = 110;
    const signGap = (CW - (signBoxW * 3)) / 2;

    function signBox(label, x, imgPath) {
      doc.rect(x, y, signBoxW, signBoxH).stroke(BORDER);
      const signBuf = getImageBuffer(imgPath);
      if (signBuf) {
        doc.image(signBuf, x + 2, y + 2, { width: signBoxW - 4, height: signBoxH - 4, fit: [signBoxW - 4, signBoxH - 4], align: 'center', valign: 'center' });
      }
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(7.5).text(label, x, y + signBoxH + 4, { width: signBoxW, align: 'center' });
    }

    signBox('ONLINE SIGNATURE', M, data.signature_path);
    signBox('OFFLINE SIGNATURE', M + signBoxW + signGap, null);
    signBox('PARENT SIGNATURE', M + (signBoxW + signGap) * 2, null);

    // Page Border
    doc.rect(12, 12, W - 24, doc.page.height - 24).lineWidth(0.5).stroke('#cbd5e1');

    doc.end();
  });
}

module.exports = generateAdmissionPdf;
