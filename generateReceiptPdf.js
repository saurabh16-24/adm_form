/**
 * generateReceiptPdf.js
 * Generates an official Application Fee Receipt for SVCE.
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Colours
const NAVY    = '#1e3a5f';
const DARK    = '#1e293b';
const GRAY    = '#64748b';
const BORDER  = '#e2e8f0';
const GREEN   = '#059669';
const LGREEN  = '#f0fdf4';

const LOGO_PATH = path.join(__dirname, 'svce-logo.png');

/**
 * @param {object} data  – admission data
 * @returns {Buffer}     – PDF buffer
 */
function generateReceiptPdf(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const M = 40;
    const CW = W - M * 2;

    // ── 1. Header ──────────────────────────────────────────────
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, (W - 280) / 2, 20, { width: 280 });
    }
    
    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
       .text('Vidyanagara Cross, Off International Airport Road, Bengaluru-562157', M, 75, { width: CW, align: 'center' })
       .text('Affiliated to VTU, Belagavi | Approved by AICTE, New Delhi', M, 86, { width: CW, align: 'center' })
       .text('Web: www.svcengg.edu.in | Email: enquiry.svce@gmail.com', M, 97, { width: CW, align: 'center' });

    doc.moveTo(M, 115).lineTo(W - M, 115).lineWidth(1).stroke(BORDER);

    // ── 2. Receipt Title ─────────────────────────────────────────
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12)
       .text('APPLICATION FEE RECEIPT', M, 130, { width: CW, align: 'center', characterSpacing: 1 });
    
    // Receipt Metadata (ID and Date)
    const receiptNo = 'R' + (data.id || 'TEMP') + '-' + Date.now().toString().slice(-6);
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
       .text('Receipt No: ' + receiptNo, M, 155)
       .text('Date: ' + today, M, 155, { width: CW, align: 'right' });

    doc.moveTo(M, 170).lineTo(W - M, 170).lineWidth(0.5).stroke(BORDER);

    // ── 3. Billing Details ───────────────────────────────────────
    let y = 190;
    
    function addRow(label, value, shade = false) {
      if (shade) doc.rect(M, y - 5, CW, 20).fill('#f8fafc');
      doc.fillColor(GRAY).font('Helvetica').fontSize(9.5).text(label, M + 10, y);
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9.5).text(value || 'N/A', M + 180, y);
      y += 22;
    }

    addRow('Candidate Name', (data.title ? data.title + ' ' : '') + (data.student_name || ''));
    addRow('Application Number', data.application_number || 'N/A', true);
    addRow('Mobile Number', data.mobile_no || 'N/A', false);
    addRow('Email Address', data.email || 'N/A', true);
    addRow('Father\'s Name', data.father_name || 'N/A', false);

    y += 20;

    // ── 4. Payment Table ─────────────────────────────────────────
    doc.rect(M, y, CW, 25).fill(NAVY);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(10);
    doc.text('DESCRIPTION', M + 15, y + 8);
    doc.text('AMOUNT (INR)', M, y + 8, { width: CW - 15, align: 'right' });
    
    y += 25;
    doc.rect(M, y, CW, 60).stroke(BORDER);
    
    doc.fillColor(DARK).font('Helvetica').fontSize(11);
    doc.text('Admission Registration & Application Fee', M + 15, y + 22);
    doc.font('Helvetica-Bold').text('₹ 1,250.00', M, y + 22, { width: CW - 15, align: 'right' });
    
    y += 60;

    // Total box
    doc.rect(M, y, CW, 30).fill(LGREEN).stroke(GREEN);
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(12);
    doc.text('TOTAL AMOUNT PAID', M + 15, y + 9);
    doc.text('₹ 1,250.00', M, y + 9, { width: CW - 15, align: 'right' });

    y += 45;

    // ── 5. Transaction Info ──────────────────────────────────────
    doc.fillColor(GRAY).font('Helvetica').fontSize(9).text('Payment Summary:', M);
    y += 15;
    doc.rect(M, y, CW, 55, 4).stroke(BORDER);
    
    const utrVal = data.payment_utr_no || '—';
    const isCash = utrVal.toLowerCase().includes('cash');
    const modeText = isCash ? 'Offline / Cash' : 'UPI / Online';

    doc.fillColor(DARK).font('Helvetica').fontSize(9);
    doc.text('Payment Mode:', M + 15, y + 12);
    doc.font('Helvetica-Bold').text(modeText, M + 130, y + 12);
    
    doc.font('Helvetica').text('Transaction Ref:', M + 15, y + 28);
    doc.font('Helvetica-Bold').text(utrVal, M + 130, y + 28);

    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(10);
    doc.text('✔ TRANSACTION SUCCESSFUL', M + 15, y + 43, { width: CW - 30, align: 'right' });

    y += 85;

    // ── 6. Footer ────────────────────────────────────────────────
    doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(8.5)
       .text('Notes:', M);
    doc.font('Helvetica').fontSize(8);
    doc.text('1. This fee is for the Admission Registration and is Non-Refundable.', M, y + 10);
    doc.text('2. This is a computer-generated receipt and does not require a physical signature.', M, y + 20);
    doc.text('3. Please keep this receipt for future reference during the admission process.', M, y + 30);

    // Box border
    doc.rect(20, 20, W - 40, doc.page.height - 40).lineWidth(0.5).stroke('#cbd5e1');

    doc.end();
  });
}

module.exports = generateReceiptPdf;
