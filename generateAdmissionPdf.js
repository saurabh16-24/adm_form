/**
 * generateAdmissionPdf.js
 * Generates the Official SVCE Admission Application Form (matching Admin Print layout).
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
 * Helper to download/convert image path to buffer
 */
function getImageBuffer(p) {
  if (!p) return null;
  const fullPath = path.isAbsolute(p) ? p : path.join(__dirname, p);
  if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath);
  return null;
}

/**
 * @param {object} data  – admission data
 * @returns {Buffer}     – PDF buffer
 */
function generateAdmissionPdf(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    // 6mm 10mm margins = approx 17pt, 28pt
    const doc = new PDFDocument({ size: 'A4', margin: 30 });

    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const M = 30;
    const CW = W - M * 2;

    const formatDate = (dateString) => {
      if (!dateString) return '—';
      const d = new Date(dateString);
      return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB'); 
    };

    // ── 1. Header ──────────────────────────────────────────────
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, (W - 220) / 2, 35, { width: 220 });
    }
    
    doc.moveTo(M, 85).lineTo(W - M, 85).lineWidth(1.5).stroke(NAVY);
    
    let y = 100;

    // Student Photo (Top Right)
    const photoBuffer = getImageBuffer(data.passport_photo_path);
    doc.save();
    doc.rect(W - M - 75, y, 75, 95).stroke(BORDER);
    if (photoBuffer) {
      doc.image(photoBuffer, W - M - 74, y + 1, { width: 73, height: 93, fit: [73, 93], align: 'center', valign: 'center' });
    } else {
      doc.fillColor('#999').fontSize(8).text('AFFIX\nSTUDENT\nPHOTO', W - M - 75, y + 35, { width: 75, align: 'center' });
    }
    doc.restore();

    // App Meta
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10)
       .text(`APPLICATION FORM (ACADEMIC YEAR ${new Date().getFullYear()}-${new Date().getFullYear() + 1})`, M, y + 15, { width: CW - 85, align: 'center' });
    
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(12)
       .text('Application Form No: ' + (data.application_number || '—'), M, y + 35, { width: CW - 85, align: 'center' });

    y = 205;

    // ── Table Helpers ──────────────────────────────────────────
    function sectionHeader(title) {
      doc.rect(M, y, CW, 18).fill(SECTION_BG);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9)
         .text(title.toUpperCase(), M + 10, y + 5);
      y += 18;
    }

    function row2(l1, v1, l2, v2, w1=16, w2=34) {
      const h = 16;
      const u1 = (CW * w1) / 100;
      const u2 = (CW * w2) / 100;

      // Draw Cells
      doc.rect(M, y, u1, h).fill(LABEL_BG).stroke(BORDER);
      doc.rect(M + u1, y, u2, h).stroke(BORDER);
      doc.rect(M + u1 + u2, y, u1, h).fill(LABEL_BG).stroke(BORDER);
      doc.rect(M + u1*2 + u2, y, u2, h).stroke(BORDER);

      // Text
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8).text(l1, M + 5, y + 5);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8.5).text(String(v1 || '—'), M + u1 + 5, y + 4.5, { width: u2 - 8 });
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8).text(l2, M + u1 + u2 + 5, y + 5);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8.5).text(String(v2 || '—'), M + u1*2 + u2 + 5, y + 4.5, { width: u2 - 8 });
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

    y += 6;

    // ── 3. Course Preferences ──────────────────────────────────
    sectionHeader('Course Preference Details');
    const prefs = data._top_prefs || [];
    const colW = CW / 2;
    doc.rect(M, y, colW, 20).stroke(BORDER);
    doc.rect(M + colW, y, colW, 20).stroke(BORDER);
    
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8);
    // Row 1 & 2 side by side
    doc.text('1. ' + (typeof prefs[0] === 'object' ? prefs[0].course : (prefs[0] || '—')), M + 5, y + 6, { width: colW - 10 });
    doc.text('2. ' + (typeof prefs[1] === 'object' ? prefs[1].course : (prefs[1] || '—')), M + colW + 5, y + 6, { width: colW - 10 });
    y += 20;
    // Row 3 & 4 side by side
    doc.rect(M, y, colW, 20).stroke(BORDER);
    doc.rect(M + colW, y, colW, 20).stroke(BORDER);
    doc.text('3. ' + (typeof prefs[2] === 'object' ? prefs[2].course : (prefs[2] || '—')), M + 5, y + 6, { width: colW - 10 });
    doc.text('4. ' + (typeof prefs[3] === 'object' ? prefs[3].course : (prefs[3] || '—')), M + colW + 5, y + 6, { width: colW - 10 });
    y += 20;

    y += 6;

    // ── 4. Address Details ─────────────────────────────────────
    sectionHeader('Address Details');
    doc.rect(M, y, CW, 14).fill(LABEL_BG).stroke(BORDER);
    doc.fillColor(BLACK).font('Helvetica').fontSize(8).text('Permanent Address Same as Communication Address: ', M + 8, y + 3.5);
    doc.font('Helvetica-Bold').fillColor(NAVY).text(data.same_as_comm ? 'Yes' : 'No', M + 210, y + 3.5);
    y += 14;

    function addrRow(field, comm, perm) {
      const h = 15;
      const w1 = CW * 0.26;
      const w2 = CW * 0.37;
      doc.rect(M, y, w1, h).fill(LABEL_BG).stroke(BORDER);
      doc.rect(M + w1, y, w2, h).stroke(BORDER);
      doc.rect(M + w1 + w2, y, w2, h).stroke(BORDER);
      
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7.5).text(field, M + 5, y + 4.5);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8).text(comm || '—', M + w1 + 5, y + 4, { width: w2 - 8 });
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8).text(perm || comm || '—', M + w1 + w2 + 5, y + 4, { width: w2 - 8 });
      y += h;
    }
    doc.rect(M, y, CW * 0.26, 12).fill(LABEL_BG).stroke(BORDER);
    doc.rect(M + CW * 0.26, y, CW * 0.37, 12).fill(LABEL_BG).stroke(BORDER);
    doc.rect(M + CW * 0.63, y, CW * 0.37, 12).fill(LABEL_BG).stroke(BORDER);
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(7.5).text('Field', M + 5, y+3).text('Communication Address', M + CW*0.26 + 5, y+3).text('Permanent Address', M + CW*0.63 + 5, y+3);
    y += 12;

    addrRow('Address Line 1', data.comm_address_line1, data.perm_address_line1);
    addrRow('Address Line 2', data.comm_address_line2, data.perm_address_line2);
    addrRow('City / District', (data.comm_city || '') + ' / ' + (data.comm_district || ''), (data.perm_city || '') + ' / ' + (data.perm_district || ''));
    addrRow('State / Pincode', (data.comm_state || '') + ' - ' + (data.comm_pincode || ''), (data.perm_state || '') + ' - ' + (data.perm_pincode || ''));

    y += 6;

    // ── 5. Educational Details ─────────────────────────────────
    sectionHeader('Educational Details');
    doc.rect(M, y, CW, 14).fill(LABEL_BG).stroke(BORDER);
    doc.fillColor(BLACK).font('Helvetica').fontSize(8.5).text('Qualifying Marksheet Name: ', M + 10, y + 3.5);
    doc.font('Helvetica-Bold').text(data.candidate_name_marksheet || '—', M + 140, y + 3.5);
    y += 14;

    function eduRow(label, val) {
      const h = 15;
      doc.rect(M, y, CW * 0.35, h).fill(LABEL_BG).stroke(BORDER);
      doc.rect(M + CW * 0.35, y, CW * 0.65, h).stroke(BORDER);
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5).text(label, M + 10, y + 4);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9).text(val || '—', M + CW * 0.35 + 10, y + 3.5);
      y += h;
    }
    eduRow('Institution', data.twelfth_institution);
    eduRow('Board / University', data.twelfth_board);
    eduRow('Year / Result Status', (data.twelfth_year_passing || '') + ' / ' + (data.twelfth_result_status || '—'));
    eduRow('Percentage / CGPA', (data.twelfth_percentage || '—') + '%');
    eduRow('Entrance Exams', data.entrance_exams);

    y += 10;

    // ── 6. APPLICATION FEE RECEIPT (New Payment Section) ───────
    // Using the style from Screenshot 1
    doc.rect(M, y, CW, 18).fill('#1e3a5f');
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(10).text('APPLICATION FEE RECEIPT', M, y + 4.5, { align: 'center', characterSpacing: 1 });
    y += 18;

    const utrVal = data.payment_utr_no || '—';
    const isCash = utrVal.toLowerCase().includes('cash');
    const modeText = isCash ? 'Offline / Cash' : 'UPI / Online';

    doc.rect(M, y, CW, 50).stroke(BORDER);
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10);
    doc.text('AMOUNT PAID: ₹ 1,250.00', M + 15, y + 10);
    doc.font('Helvetica').fontSize(9);
    doc.text('Payment Mode: ' + modeText, M + 15, y + 26);
    doc.text('Transaction Ref / UTR: ' + utrVal, M + 15, y + 38);
    
    // Note for cash
    doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(8)
       .text('* In case of Cash payment, simply type \'Cash\' in the field above.', M + CW - 240, y + 38, { width: 230, align: 'right' });

    y += 58;

    // ── 7. Declaration ─────────────────────────────────────────
    sectionHeader('Declaration');
    doc.rect(M, y, CW, 85).stroke(BORDER);
    doc.fillColor('#222').font('Helvetica').fontSize(8.5);
    const declText = "• I hereby declare that all information provided is true and correct. I understand that false info leads to rejection. • I agree to abide by all rules of SVCE. • I authorize SVCE to process my data for admissions. • Submission doesn't guarantee admission; seats are subject to availability and eligibility. • This application is valid for a limited period. • Admissions are subject to approval from DTE/VTU.";
    doc.text(declText, M + 10, y + 8, { width: CW - 20, align: 'justify', lineGap: 2 });
    y += 90;

    // ── 8. Footer & Signatures ─────────────────────────────────
    const footerY = y;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text((data.student_name || '').toUpperCase(), M, y);
    doc.fillColor(GRAY).font('Helvetica').fontSize(8).text('Generated On: ' + new Date().toLocaleString('en-IN'), M, y+14);
    doc.text('Submission ID: ' + (data.id || '—') + ' | Timestamp: ' + (data.application_date ? new Date(data.application_date).toLocaleString('en-IN') : '—'), M, y+24);

    y += 40;
    const signAreaW = 120;
    const gap = (CW - (signAreaW * 3)) / 2;

    function signBox(label, x, imgPath) {
      doc.rect(x, y, signAreaW, 40).stroke(BORDER);
      const signBuf = getImageBuffer(imgPath);
      if (signBuf) {
        doc.image(signBuf, x + 2, y + 2, { width: signAreaW - 4, height: 36, fit: [signAreaW - 4, 36], align: 'center', valign: 'center' });
      }
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8).text(label, x, y + 45, { width: signAreaW, align: 'center' });
    }

    signBox('Online Signature', M, data.signature_path);
    signBox('Offline Signature', M + signAreaW + gap, null);
    signBox('Parent Signature', M + (signAreaW + gap) * 2, null);

    // Page Border
    doc.rect(15, 15, W - 30, doc.page.height - 30).lineWidth(0.5).stroke('#cbd5e1');

    doc.end();
  });
}

module.exports = generateAdmissionPdf;
