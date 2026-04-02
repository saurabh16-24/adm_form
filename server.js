require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const generateAdmissionPdf = require('./generateAdmissionPdf');
const Jimp = require('jimp');  // v0.22 — stable compositing API

// ── Branded QR generator (server-side logo compositing) ──────────────────────
const LOGO_PATH = path.join(__dirname, 'image copy 2.png');
async function generateBrandedQR(url, size = 300) {
  // 1. Generate QR PNG buffer with navy dots, error-correction H
  const qrBuffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'H',
    width: size,
    margin: 2,
    color: { dark: '#1e3a5f', light: '#ffffff' }
  });

  // 2. If logo missing, return plain QR
  if (!fs.existsSync(LOGO_PATH)) return qrBuffer;

  // 3. Load QR and logo into Jimp
  const qrImg  = await Jimp.read(qrBuffer);
  const logo   = await Jimp.read(LOGO_PATH);

  // 4. Resize logo to 28% of QR size
  const logoSize = Math.round(size * 0.28);
  logo.resize(logoSize, logoSize);

  // 5. White backing square (logo + padding on each side)
  const pad    = 8;
  const bgSize = logoSize + pad * 2;
  const bg     = new Jimp(bgSize, bgSize, 0xffffffff);
  qrImg.composite(bg,   Math.round((size - bgSize) / 2), Math.round((size - bgSize) / 2));

  // 6. Composite logo centred on QR
  qrImg.composite(logo, Math.round((size - logoSize) / 2), Math.round((size - logoSize) / 2));

  // 7. Return final PNG buffer
  return qrImg.getBufferAsync(Jimp.MIME_PNG);
}
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Serve uploaded files
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'admissions');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `${ts}_${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/jpg','image/png','image/webp','application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only images (JPG/PNG/WEBP) and PDF files are allowed'));
  }
});
const admissionUpload = upload.fields([
  { name: 'passport_photo', maxCount: 1 },
  { name: 'tenth_marksheet', maxCount: 1 },
  { name: 'twelfth_marksheet', maxCount: 1 },
  { name: 'payment_receipt', maxCount: 1 }
]);

// PostgreSQL Connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'svce_admissions',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Endpoint to Test Database Connection
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ connected: true, time: result.rows[0].now });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ connected: false, error: error.message });
  }
});

// Endpoint to get next token number for today (preview only – final is assigned at submit)
app.get('/api/next-token', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      "SELECT COALESCE(MAX(sequence_number), 0) AS max_seq FROM enquiries WHERE enquiry_date = $1",
      [today]
    );
    const nextSeq = parseInt(result.rows[0].max_seq, 10) + 1;

    const d = new Date();
    const day   = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year  = d.getFullYear();
    const token = `${day}/${month}/${year}/${nextSeq}`;

    res.json({ success: true, token, sequence: nextSeq });
  } catch (error) {
    console.error('Error fetching next token:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to Submit Form
app.post('/api/submit-enquiry', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const d = req.body;
    const today = new Date().toISOString().split('T')[0];

    // ── Atomically assign token number (advisory lock prevents duplicates) ──
    await client.query('SELECT pg_advisory_xact_lock(1001)'); // lock id 1001 = enquiry tokens
    const seqResult = await client.query(
      `SELECT COALESCE(MAX(sequence_number), 0) AS max_seq
       FROM enquiries WHERE enquiry_date = $1`,
      [today]
    );
    const seq = parseInt(seqResult.rows[0].max_seq, 10) + 1;
    const dt = new Date();
    const dd  = String(dt.getDate()).padStart(2, '0');
    const mm  = String(dt.getMonth() + 1).padStart(2, '0');
    const yy  = dt.getFullYear();
    const token_number = `${dd}/${mm}/${yy}/${seq}`;
    // Override whatever the frontend sent
    d.token_number = token_number;
    d.enquiry_date = today;

    // We store the array of preferences as a JSON string or let Postgres handle it if the column is an Array text[]
    const preferences_json = JSON.stringify(d.course_preferences);

    const query = `
      INSERT INTO enquiries (
        token_number, sequence_number, enquiry_date, student_name, father_name, mother_name,
        student_email, student_mobile, father_mobile, mother_mobile, address,
        address_line1, address_line2, address_city, address_district,
        address_state, address_country, address_pincode,
        result_status,
        expected_percentage,
        reference, education_qualification, education_board, physics_marks,
        chemistry_marks, mathematics_marks, cs_marks, bio_marks, ece_marks,
        total_percentage, pcm_percentage, jee_rank, comedk_rank, cet_rank,
        course_preferences, diploma_percentage, dcet_rank
      )
      VALUES (
        $1,  $2,  $3,  $4,  $5,  $6,  $7,  $8,  $9,  $10,
        $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20,
        $21, $22, $23,
        $24, $25, $26, $27, $28, $29,
        $30, $31,
        $32, $33, $34,
        $35, $36, $37
      ) RETURNING id;
    `;

    const values = [
      /* $1  */ d.token_number,
      /* $2  */ seq,
      /* $3  */ d.enquiry_date,
      /* $4  */ d.student_name,
      /* $5  */ d.father_name,
      /* $6  */ d.mother_name,
      /* $7  */ d.student_email,
      /* $8  */ d.student_mobile,
      /* $9  */ d.father_mobile,
      /* $10 */ d.mother_mobile,
      /* $11 */ d.address || null,
      /* $12 */ d.address_line1 || null,
      /* $13 */ d.address_line2 || null,
      /* $14 */ d.address_city || null,
      /* $15 */ d.address_district || null,
      /* $16 */ d.address_state || null,
      /* $17 */ d.address_country || null,
      /* $18 */ d.address_pincode || null,
      /* $19 */ d.result_status || null,
      /* $20 */ d.expected_percentage || null,
      /* $21 */ d.reference || null,
      /* $22 */ d.education_qualification || null,
      /* $23 */ d.education_board || null,
      /* $24 */ d.physics_marks || null,
      /* $25 */ d.chemistry_marks || null,
      /* $26 */ d.mathematics_marks || null,
      /* $27 */ d.cs_marks || null,
      /* $28 */ d.bio_marks || null,
      /* $29 */ d.ece_marks || null,
      /* $30 */ d.total_percentage || null,
      /* $31 */ d.pcm_percentage || null,
      /* $32 */ d.jee_rank || null,
      /* $33 */ d.comedk_rank || null,
      /* $34 */ d.cet_rank || null,
      /* $35 */ preferences_json,
      /* $36 */ d.diploma_percentage || null,
      /* $37 */ d.dcet_rank || null
    ];

    const result = await client.query(query, values);
    await client.query('COMMIT');
    // Return the server-assigned token so the frontend always shows the correct one
    const assignedToken = d.token_number;

    // Generate QR Code and send Email
    try {
      const autofillUrl = `${req.headers.origin || 'http://localhost:' + port}/admission-form/?enquiry_id=${result.rows[0].id}`;

      // Generate branded QR — SVCE logo composited in centre server-side
      const qrPngBuffer = await generateBrandedQR(autofillUrl, 300);

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER || 'enquiry.svce@gmail.com',
          pass: process.env.EMAIL_PASS || 'your_app_password'
        }
      });

      const mailOptions = {
        from: '"Admission Team" <enquiry.svce@gmail.com>',
        to: d.student_email,
        subject: 'SVCE Admission Enquiry Successful',
        html: `
<div style="font-family: Arial, sans-serif; color: #333; font-size: 14px; line-height: 1.5;">
Enquiry Successful!<br>
Dear ${d.student_name} ,<br><br>
Thank you for enquiring for admission at SVCE,Bengaluru<br>
Your enquiry has been received and recorded.<br><br>
Your Token Number:<br>
<strong>${d.token_number}</strong><br>
Please keep this token number safe. You may be asked to present it during further admission processes.<br><br>
Our Admission team will be assisting you further.<br><br>
Thank You<br>
Have a great day!<br><br>
Regards<br>
Admission Team<br>
 SVCE, Bengaluru<br>
 9916775988<br><br>
<div style="text-align: center; margin: 20px 0;">
  <p style="font-size: 14px; color: #555; margin-bottom: 8px; font-weight: bold;">Scan QR Code to Access Your Details:</p>
  <div style="display:inline-block; padding:14px; background:#ffffff; border:2px solid #e2e8f0; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.08);">
    <img src="cid:qrcode" alt="QR Code" style="width:220px; height:220px; display:block;" />
  </div>
  <p style="font-size:11px; color:#9ca3af; margin-top:6px;">This QR code pre-fills your admission form automatically</p>
</div>
<br>
<div style="text-align: center; width: 100%; max-width: 600px; margin: 20px auto;">
  <img src="cid:svce_promo" alt="Experience SVCE" style="width: 100%; max-width: 600px; height: auto; display: block; border-radius: 8px; margin: 0 auto; box-shadow: 0px 4px 10px rgba(0,0,0,0.1);" />
</div>
</div>
        `,
        attachments: [
          {
            filename: 'qrcode.png',
            content: qrPngBuffer,
            cid: 'qrcode'
          },
          {
            filename: 'svce-promo.gif',
            path: require('path').join(__dirname, 'svce-promo.gif'),
            cid: 'svce_promo'
          }
        ]
      };

      transporter.sendMail(mailOptions)
        .then(() => console.log('Email sent successfully to', d.student_email))
        .catch(emailError => console.error('Error sending email:', emailError));
      
    } catch (error) {
      console.error('Error preparing email:', error);
    }

    res.status(201).json({ success: true, message: 'Enquiry submitted successfully', id: result.rows[0].id });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error submitting enquiry:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Create tables endpoint
app.post('/api/init-db', async (req, res) => {
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS enquiries (
        id SERIAL PRIMARY KEY,
        token_number VARCHAR(50),
        enquiry_date DATE,
        student_name VARCHAR(100),
        father_name VARCHAR(100),
        mother_name VARCHAR(100),
        student_email VARCHAR(100),
        student_mobile VARCHAR(15),
        father_mobile VARCHAR(15),
        mother_mobile VARCHAR(15),
        address TEXT,
        reference VARCHAR(255),
        education_qualification VARCHAR(50),
        education_board VARCHAR(50),
        physics_marks NUMERIC(5,2),
        chemistry_marks NUMERIC(5,2),
        mathematics_marks NUMERIC(5,2),
        cs_marks NUMERIC(5,2),
        bio_marks NUMERIC(5,2),
        ece_marks NUMERIC(5,2),
        total_percentage NUMERIC(5,2),
        pcm_percentage NUMERIC(5,2),
        jee_rank VARCHAR(50),
        comedk_rank VARCHAR(50),
        cet_rank VARCHAR(50),
        course_preferences JSONB,
        diploma_percentage NUMERIC(5,2),
        dcet_rank VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await pool.query(createTableQuery);
    res.json({ success: true, message: "Database table ensured." });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to fetch enquiry by ID
app.get('/api/enquiry/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM enquiries WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Admissions ──────────────────────────────────────────────────────────────

// Auto-create admissions table on startup
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admissions (
        id SERIAL PRIMARY KEY,
        enquiry_id INTEGER,
        application_number VARCHAR(100),
        application_date DATE,
        title VARCHAR(10),
        student_name VARCHAR(100),
        mobile_no VARCHAR(20),
        email VARCHAR(100),
        date_of_birth DATE,
        gender VARCHAR(30),
        religion VARCHAR(60),
        caste_category VARCHAR(60),
        selected_institute VARCHAR(200),
        course_preference VARCHAR(200),
        program_preference VARCHAR(100),
        comm_address_line1 TEXT,
        comm_address_line2 TEXT,
        comm_city VARCHAR(100),
        comm_district VARCHAR(100),
        comm_state VARCHAR(100),
        comm_country VARCHAR(100),
        comm_pincode VARCHAR(20),
        same_as_comm BOOLEAN DEFAULT FALSE,
        perm_address_line1 TEXT,
        perm_address_line2 TEXT,
        perm_city VARCHAR(100),
        perm_district VARCHAR(100),
        perm_state VARCHAR(100),
        perm_country VARCHAR(100),
        perm_pincode VARCHAR(20),
        father_name VARCHAR(100),
        father_mobile VARCHAR(20),
        father_occupation VARCHAR(100),
        mother_name VARCHAR(100),
        mother_mobile VARCHAR(20),
        mother_occupation VARCHAR(100),
        candidate_name_marksheet VARCHAR(100),
        tenth_institution VARCHAR(150),
        tenth_board VARCHAR(150),
        tenth_stream VARCHAR(100),
        tenth_year_passing VARCHAR(10),
        tenth_result_status VARCHAR(50),
        tenth_marking_scheme VARCHAR(50),
        tenth_percentage VARCHAR(20),
        twelfth_institution VARCHAR(150),
        twelfth_board VARCHAR(150),
        twelfth_stream VARCHAR(100),
        twelfth_year_passing VARCHAR(10),
        twelfth_result_status VARCHAR(50),
        twelfth_marking_scheme VARCHAR(50),
        twelfth_percentage VARCHAR(20),
        ug_institution VARCHAR(150),
        ug_board VARCHAR(150),
        ug_stream VARCHAR(100),
        ug_year_passing VARCHAR(10),
        ug_result_status VARCHAR(50),
        ug_marking_scheme VARCHAR(50),
        ug_percentage VARCHAR(20),
        entrance_exams TEXT,
        declaration_accepted BOOLEAN DEFAULT FALSE,
        student_signature TEXT,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Add document columns if they don't exist (safe for existing tables)
    const alterCols = [
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS passport_photo_path VARCHAR(500)",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS tenth_marksheet_path VARCHAR(500)",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS twelfth_marksheet_path VARCHAR(500)",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS aadhaar_no VARCHAR(20)",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS payment_receipt_path VARCHAR(500)",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS payment_utr_no VARCHAR(50)",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS sequence_number INTEGER"
    ];
    for (const sql of alterCols) await pool.query(sql);

    // Also ensure enquiries has sequence_number + structured address columns
    const enquiryAlterCols = [
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS sequence_number INTEGER",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS address_line1 TEXT",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS address_line2 TEXT",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS address_city VARCHAR(100)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS address_district VARCHAR(100)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS address_state VARCHAR(100)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS address_country VARCHAR(100)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS address_pincode VARCHAR(20)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS result_status VARCHAR(50)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS expected_percentage NUMERIC(5,2)"
    ];
    for (const sql of enquiryAlterCols) await pool.query(sql);

    console.log('Admissions table ready.');
  } catch (err) {
    console.error('Admissions table init error:', err.message);
  }
})();

// GET next application number for today (preview)
app.get('/api/admissions/next-token', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      'SELECT COALESCE(MAX(sequence_number), 0) AS max_seq FROM admissions WHERE application_date = $1', [today]
    );
    const seq = parseInt(result.rows[0].max_seq, 10) + 1;
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    res.json({ success: true, token: `ADM/${dd}${mm}${yyyy}/${seq}`, sequence: seq });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST submit admission form (multipart/form-data with file uploads)
app.post('/api/admissions/submit', (req, res) => {
  admissionUpload(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ success: false, error: uploadErr.message });
    }
    try {
      const v = req.body;
      const today = new Date().toISOString().split('T')[0];

      // ── Atomically assign sequence number (advisory lock prevents duplicates) ──
      const adm_client = await pool.connect();
      try {
        await adm_client.query('BEGIN');
        await adm_client.query('SELECT pg_advisory_xact_lock(1002)'); // lock id 1002 = admission tokens
        const seqRes = await adm_client.query(
          `SELECT COALESCE(MAX(sequence_number), 0) AS max_seq
           FROM admissions WHERE application_date = $1`, [today]
        );
        const adm_seq = parseInt(seqRes.rows[0].max_seq, 10) + 1;
        await adm_client.query('COMMIT');
        adm_client.release();
        const dt = new Date();
        const ddd = String(dt.getDate()).padStart(2, '0');
        const mmm = String(dt.getMonth() + 1).padStart(2, '0');
        const yyy = dt.getFullYear();
        v.application_number = `ADM/${ddd}${mmm}${yyy}/${adm_seq}`;
        // make adm_seq available for INSERT below
        v._adm_seq = adm_seq;
      } catch(e) { adm_client.release(); throw e; }


      // File paths (relative, served via /uploads/...)
      const photoPath    = req.files?.passport_photo?.[0]  ? `/uploads/admissions/${req.files.passport_photo[0].filename}`   : null;
      const tenth_path   = req.files?.tenth_marksheet?.[0] ? `/uploads/admissions/${req.files.tenth_marksheet[0].filename}`  : null;
      const twelfth_path = req.files?.twelfth_marksheet?.[0] ? `/uploads/admissions/${req.files.twelfth_marksheet[0].filename}` : null;
      const receipt_path = req.files?.payment_receipt?.[0] ? `/uploads/admissions/${req.files.payment_receipt[0].filename}` : null;

      const query = `
        INSERT INTO admissions (
          enquiry_id, application_number, sequence_number, application_date,
          title, student_name, mobile_no, email, date_of_birth, gender, religion, caste_category, aadhaar_no,
          selected_institute, course_preference, program_preference,
          comm_address_line1, comm_address_line2, comm_city, comm_district, comm_state, comm_country, comm_pincode,
          same_as_comm, perm_address_line1, perm_address_line2, perm_city, perm_district, perm_state, perm_country, perm_pincode,
          father_name, father_mobile, father_occupation, mother_name, mother_mobile, mother_occupation,
          candidate_name_marksheet,
          tenth_institution, tenth_board, tenth_stream, tenth_year_passing, tenth_result_status, tenth_marking_scheme, tenth_percentage,
          twelfth_institution, twelfth_board, twelfth_stream, twelfth_year_passing, twelfth_result_status, twelfth_marking_scheme, twelfth_percentage,
          ug_institution, ug_board, ug_stream, ug_year_passing, ug_result_status, ug_marking_scheme, ug_percentage,
          entrance_exams, declaration_accepted, student_signature,
          passport_photo_path, tenth_marksheet_path, twelfth_marksheet_path,
          payment_receipt_path, payment_utr_no
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
          $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,
          $44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,$63,$64,$65,$66,$67
        ) RETURNING id;
      `;
      const values = [
        v.enquiry_id ? parseInt(v.enquiry_id) : null, v.application_number, v._adm_seq, today,
        v.title, v.student_name, v.mobile_no, v.email, v.date_of_birth || null, v.gender, v.religion, v.caste_category, v.aadhaar_no || null,
        v.selected_institute, v.course_preference, v.program_preference,
        v.comm_address_line1, v.comm_address_line2, v.comm_city, v.comm_district, v.comm_state, v.comm_country, v.comm_pincode,
        v.same_as_comm === 'true' || v.same_as_comm === true,
        v.perm_address_line1, v.perm_address_line2, v.perm_city, v.perm_district, v.perm_state, v.perm_country, v.perm_pincode,
        v.father_name, v.father_mobile, v.father_occupation, v.mother_name, v.mother_mobile, v.mother_occupation,
        v.candidate_name_marksheet,
        v.tenth_institution, v.tenth_board, v.tenth_stream, v.tenth_year_passing, v.tenth_result_status, v.tenth_marking_scheme, v.tenth_percentage,
        v.twelfth_institution, v.twelfth_board, v.twelfth_stream, v.twelfth_year_passing, v.twelfth_result_status, v.twelfth_marking_scheme, v.twelfth_percentage,
        null, null, null, null, null, null, null, // UG not applicable
        v.entrance_exams, v.declaration_accepted === 'true' || v.declaration_accepted === true, v.student_signature || null,
        photoPath, tenth_path, twelfth_path,
        receipt_path, v.payment_utr_no || null
      ];
      const result = await pool.query(query, values);

      // ── Send confirmation email with PDF (async – don't block response) ──
      const emailData = { ...v, application_number: v.application_number };
      setImmediate(async () => {
        try {
          const pdfBuffer = await generateAdmissionPdf(emailData);

          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: process.env.EMAIL_USER || 'enquiry.svce@gmail.com',
              pass: process.env.EMAIL_PASS || 'your_app_password'
            }
          });

          await transporter.sendMail({
            from: '"SVCE Admissions" <enquiry.svce@gmail.com>',
            to: v.email,
            subject: `✅ SVCE Admission Confirmed – ${v.application_number}`,
            html: `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
  <div style="background:#1d4ed8;padding:28px 32px;text-align:center;">
    <h2 style="color:#fff;margin:0;font-size:20px;letter-spacing:0.5px;">Application Submitted Successfully!</h2>
    <p style="color:#bfdbfe;margin:6px 0 0;font-size:13px;">Sri Venkateshwara College of Engineering, Bengaluru</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;">Dear <strong>${v.title || ''} ${v.student_name || ''}</strong>,</p>
    <p style="margin:0 0 16px;">Your admission application has been <strong style="color:#059669;">successfully received</strong>. Please find your application confirmation attached as a PDF.</p>
    <div style="background:#f0fdf4;border:1px solid #6ee7b7;border-radius:8px;padding:14px 20px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;"><strong>Application No:</strong> <span style="color:#059669;font-family:monospace;">${v.application_number}</span></p>
      <p style="margin:4px 0 0;font-size:14px;"><strong>Course:</strong> ${v.course_preference || ''} &ndash; ${v.program_preference || ''}</p>
      <p style="margin:4px 0 0;font-size:14px;"><strong>Amount Paid:</strong> ₹1,250 (UPI) &mdash; UTR: <code>${v.payment_utr_no || '—'}</code></p>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Our admissions team will review your application and contact you within 2&ndash;3 working days.</p>
    <p style="margin:0 0 24px;font-size:13px;color:#64748b;">For any queries, reply to this email or call <strong>+91 99167 75988</strong>.</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:20px;">
    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">SVCE, Mysore Road, Bengaluru &ndash; 562 157 &nbsp;|&nbsp; admissions@svce.ac.in</p>
  </div>
</div>`,
            attachments: [{
              filename: `SVCE_Admission_${v.application_number.replace(/\//g, '_')}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf'
            }]
          });
          console.log(`[Admission PDF] Email sent to ${v.email} (${v.application_number})`);
        } catch (mailErr) {
          console.error('[Admission PDF] Email error:', mailErr.message);
        }
      });

      res.status(201).json({ success: true, id: result.rows[0].id, application_number: v.application_number });
    } catch (error) {
      console.error('Admission submit error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Open http://localhost:${port} to see the form.`);
});
