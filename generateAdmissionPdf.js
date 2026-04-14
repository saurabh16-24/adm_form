/**
 * generateAdmissionPdf.js
 * Generates a beautiful PDF for the SVCE Admission Application Confirmation.
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Colours
const BLUE   = '#1d4ed8';
const LBLUE  = '#dbeafe';
const GREEN  = '#059669';
const LGREEN = '#d1fae5';
const GRAY   = '#64748b';
const DARK   = '#1e293b';
const BLACK  = '#000000';
const WHITE  = '#ffffff';
const BORDER = '#e2e8f0';

const LOGO_PATH = path.join(__dirname, 'svce-logo.png');

/**
 * @param {object} data  – all submission fields
 * @returns {Buffer}     – PDF buffer
 */
function generateAdmissionPdf(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });

    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;   // 595
    const M = 40;               // side margin
    const CW = W - M * 2;      // content width 515

    // ── 1. Header band ──────────────────────────────────────────
    doc.rect(0, 0, W, 130).fill(BLUE);

    // Logo (white box so black logo shows on blue)
    if (fs.existsSync(LOGO_PATH)) {
      doc.save();
      const LX = M, LY = 18, LW = 200, LH = 55;
      doc.roundedRect(LX, LY, LW, LH, 6).fill(WHITE);
      doc.image(LOGO_PATH, LX + 4, LY + 4, { width: LW - 8, height: LH - 8, fit: [LW - 8, LH - 8], align: 'center', valign: 'center' });
      doc.restore();
    }

    // Right side – doc title
    const currentYear = new Date().getFullYear();
    const academicYear = `${currentYear}-${currentYear + 1}`;
    doc.fillColor(WHITE)
       .font('Helvetica-Bold').fontSize(17)
       .text('ADMISSION CONFIRMATION', M, 26, { width: CW, align: 'right' });
    doc.fillColor('#bfdbfe').font('Helvetica-Bold').fontSize(11)
       .text(`Academic Year: ${academicYear}`, M, 46, { width: CW, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor('#bfdbfe')
       .text('Sri Venkateshwara College of Engineering, Bengaluru', M, 62, { width: CW, align: 'right' })
       .text('Estd. 2001 · Autonomous Institute · AICTE Approved', M, 75, { width: CW, align: 'right' });

    // Application number pill
    const appNum = data.application_number || 'ADM/------';
    doc.save();
    doc.roundedRect(W - M - 200, 82, 200, 28, 6).fill(LGREEN);
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(10)
       .text('Application No: ' + appNum, W - M - 196, 90, { width: 192, align: 'center' });
    doc.restore();

    // Date pill
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.save();
    doc.roundedRect(W - M - 200, 115, 200, 20, 5).fill('rgba(255,255,255,0.15)');
    doc.fillColor(WHITE).font('Helvetica').fontSize(8.5)
       .text('Date: ' + dateStr, W - M - 200, 120, { width: 200, align: 'center' });
    doc.restore();

    let y = 148;

    // ── Helper: Section title ────────────────────────────────────
    function sectionTitle(title, icon = '') {
      doc.save();
      doc.rect(M, y, CW, 26).fill(BLUE);
      doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(10)
         .text((icon ? icon + '  ' : '') + title.toUpperCase(), M + 10, y + 8, { width: CW - 20 });
      doc.restore();
      y += 30;
    }

    // ── Helper: Two-column row ───────────────────────────────────
    function row(label, value, shade = false) {
      const rowH = 20;
      if (shade) doc.rect(M, y, CW, rowH).fill('#f8fafc');
      doc.rect(M, y, CW, rowH).stroke(BORDER);

      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
         .text(label, M + 8, y + 5, { width: 180 });
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8.5)
         .text(value || '—', M + 195, y + 5, { width: CW - 203 });
      y += rowH;
    }

    // ── Helper: Full-width row ───────────────────────────────────
    function fullRow(label, value, shade = false) {
      const rowH = 20;
      if (shade) doc.rect(M, y, CW, rowH).fill('#f8fafc');
      doc.rect(M, y, CW, rowH).stroke(BORDER);
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
         .text(label, M + 8, y + 5, { width: 140 });
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8.5)
         .text(value || '—', M + 155, y + 5, { width: CW - 163 });
      y += rowH;
    }

    // ── Helper: Two rows side by side ────────────────────────────
    function doubleRow(l1, v1, l2, v2, shade = false) {
      const rowH = 20; const half = CW / 2;
      if (shade) doc.rect(M, y, CW, rowH).fill('#f8fafc');
      doc.rect(M, y, half, rowH).stroke(BORDER);
      doc.rect(M + half, y, half, rowH).stroke(BORDER);
      // Left
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text(l1, M + 8, y + 5, { width: 85 });
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8.5).text(v1 || '—', M + 95, y + 5, { width: half - 103 });
      // Right
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text(l2, M + half + 8, y + 5, { width: 85 });
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8.5).text(v2 || '—', M + half + 95, y + 5, { width: half - 103 });
      y += rowH;
    }

    // ── Helper: Space gap ────────────────────────────────────────
    function gap(h = 10) { y += h; }

    // ── 2. Personal Details ──────────────────────────────────────
    sectionTitle('Personal Details', '👤');
    doubleRow('Full Name',      (data.title ? data.title + ' ' : '') + (data.student_name || ''),
              'Date of Birth',  data.date_of_birth || '', false);
    doubleRow('Mobile No.',     data.mobile_no || '',
              'Email',          data.email || '', true);
    doubleRow('Gender',         data.gender || '',
              'Aadhaar No.',    data.aadhaar_no || '', false);

    gap(8);

    // ── 3. Preference Details (Table) ────────────────────────────
    sectionTitle('Course Preference Details (First 4 from Enquiry)', '🎓');
    const thY = y;
    doc.fillColor('#f8fafc').rect(M, thY, CW, 15).fill();
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8.5);
    doc.text('#', M + 5, thY + 4);
    doc.text('Course Name', M + 30, thY + 4);
    y += 15;

    const top4 = data._top_prefs || [];
    const tableHeight = 60; // 4 rows x 15px

    for (let i = 0; i < 4; i++) {
        const p = top4[i] || '';
        const rowY = y;
        doc.fillColor(BLACK).font('Helvetica').fontSize(8.5);
        doc.text(String(i + 1), M + 5, rowY + 4);
        doc.text(typeof p === 'object' ? String(p.course) : (p || '—'), M + 30, rowY + 4);
        doc.rect(M, rowY, CW, 15).stroke();
        y += 15;
    }

    gap(8);

    // ── 4. Academic Details ──────────────────────────────────────
    sectionTitle('Academic Details', '📚');
    doubleRow('12th Institution',   data.twelfth_institution || '',
              '12th Board',         data.twelfth_board || '', false);
    doubleRow('12th Year',          data.twelfth_year_passing || '',
              '12th Percentage',    data.twelfth_percentage ? data.twelfth_percentage + '%' : '', true);

    gap(8);

    // ── 5. Payment Details ────────────────────────────────────────
    // Green-tinted section
    doc.save();
    doc.rect(M, y, CW, 26).fill(GREEN);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(10)
       .text('💳  PAYMENT CONFIRMATION', M + 10, y + 8, { width: CW - 20 });
    doc.restore();
    y += 30;

    // Payment box
    doc.save();
    doc.rect(M, y, CW, 82).fill(LGREEN).stroke(GREEN);
    doc.restore();

    // Amount
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(24)
       .text('₹ 1,250', M, y + 10, { width: CW, align: 'center' });
    doc.fillColor(GRAY).font('Helvetica').fontSize(8)
       .text('Application Fee Paid', M, y + 38, { width: CW, align: 'center' });

    // UTR + status
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
       .text('UTR / Transaction Ref: ' + (data.payment_utr_no || '—'),
              M + 10, y + 54, { width: CW - 20, align: 'center' });
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(9)
       .text('✔  PAYMENT SUCCESSFUL  |  Mode: UPI Online  |  Non-Refundable',
              M + 10, y + 68, { width: CW - 20, align: 'center' });

    y += 92;
    gap(8);

    // ── 6. Communication Address ─────────────────────────────────
    sectionTitle('Communication Address', '🏠');
    const addr = [
      data.comm_address_line1,
      data.comm_address_line2,
      data.comm_city,
      data.comm_district,
      data.comm_state,
      data.comm_pincode
    ].filter(Boolean).join(', ');
    fullRow('Address', addr || '—', false);

    gap(8);

    // ── 7. Father / Mother ────────────────────────────────────────
    sectionTitle("Parent / Guardian Details", '👨‍👩‍👧');
    doubleRow("Father's Name",    data.father_name || '',
              "Father's Mobile",  data.father_mobile || '', false);
    doubleRow("Father's Occupation", data.father_occupation || '',
              "Mother's Name",    data.mother_name || '', true);
    doubleRow("Mother's Mobile",  data.mother_mobile || '',
              "Mother's Occupation", data.mother_occupation || '', false);

    gap(16);

    // ── 8. Footer ─────────────────────────────────────────────────
    // Divider
    doc.moveTo(M, y).lineTo(M + CW, y).stroke(BORDER);
    gap(8);

    // Note
    doc.save();
    doc.rect(M, y, CW, 48).roundedRect(M, y, CW, 48, 6).fill(LBLUE);
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8.5)
       .text('✔  I accept that fees paid are NON-REFUNDABLE.', M + 10, y + 8, { width: CW - 20, align: 'center' });
    doc.fillColor(GRAY).font('Helvetica').fontSize(7.5)
       .text('This is a system-generated document and does not require a physical signature.', M + 10, y + 22, { width: CW - 20, align: 'center' })
       .text('For queries: enquiry.svce@gmail.com  |  +91 99167 75988', M + 10, y + 34, { width: CW - 20, align: 'center' });
    doc.restore();
    y += 56;
    gap(6);

    // Page border
    doc.save();
    doc.rect(10, 10, W - 20, doc.page.height - 20).stroke(BLUE);
    doc.restore();

    doc.end();
  });
}

module.exports = generateAdmissionPdf;
