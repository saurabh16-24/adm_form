require('dotenv').config();
const crypto = require('crypto');
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

// ── Email Transporter Shared Configuration ─────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  pool: true,            // Use pooled connections 
  maxConnections: 1,     // Limit connections to bypass Gmail ratelimiting/timeouts
  auth: {
    user: process.env.EMAIL_USER || 'enquiry.svce@gmail.com',
    pass: process.env.EMAIL_PASS || 'your_app_password'
  }
});
// ─────────────────────────────────────────────────────────────────────────────

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

// ── Admission Form (QR / direct link) ────────────────────────────────────────
// Serve the admission-form subfolder so /admission-form/ and /admission-form/?enquiry_id=X both work
app.use('/admission-form', express.static(path.join(__dirname, 'admission-form')));
app.get('/admission-form', (req, res) => {
  res.sendFile(path.join(__dirname, 'admission-form', 'index.html'));
});

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
  { name: 'twelfth_marksheet', maxCount: 1 },
  { name: 'payment_receipt', maxCount: 1 },
  { name: 'signature_image', maxCount: 1 }
]);

// PostgreSQL Connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'svce_admissions',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Database Initialization & Migrations
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS enquiries (
        id SERIAL PRIMARY KEY,
        token_number VARCHAR(100),
        sequence_number INTEGER,
        enquiry_date DATE,
        student_name VARCHAR(100),
        father_name VARCHAR(100),
        mother_name VARCHAR(100),
        student_email VARCHAR(100),
        student_mobile VARCHAR(50),
        father_mobile VARCHAR(50),
        mother_mobile VARCHAR(50),
        address TEXT,
        address_line1 VARCHAR(255),
        address_line2 VARCHAR(255),
        address_city VARCHAR(100),
        address_district VARCHAR(100),
        address_state VARCHAR(100),
        address_country VARCHAR(100),
        address_pincode VARCHAR(20),
        result_status VARCHAR(50),
        expected_percentage NUMERIC(5,2),
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
        physics_11 NUMERIC(5,2),
        chemistry_11 NUMERIC(5,2),
        math_11a NUMERIC(5,2),
        math_11b NUMERIC(5,2),
        english_11 NUMERIC(5,2),
        language_11 NUMERIC(5,2),
        physics_12_prac NUMERIC(5,2),
        chemistry_12_prac NUMERIC(5,2),
        math_12a NUMERIC(5,2),
        math_12b NUMERIC(5,2),
        kannada_12 NUMERIC(5,2),
        english_12 NUMERIC(5,2),
        other_12 NUMERIC(5,2),
        follow_up_date DATE,
        admin_remarks VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure all new columns exist (Migration)
    const columns = [
      ['physics_11', 'NUMERIC(5,2)'], ['chemistry_11', 'NUMERIC(5,2)'], ['math_11a', 'NUMERIC(5,2)'],
      ['math_11b', 'NUMERIC(5,2)'], ['english_11', 'NUMERIC(5,2)'], ['language_11', 'NUMERIC(5,2)'],
      ['physics_12_prac', 'NUMERIC(5,2)'], ['chemistry_12_prac', 'NUMERIC(5,2)'], ['math_12a', 'NUMERIC(5,2)'],
      ['math_12b', 'NUMERIC(5,2)'], ['kannada_12', 'NUMERIC(5,2)'], ['english_12', 'NUMERIC(5,2)'],
      ['other_12', 'NUMERIC(5,2)'], ['address_line1', 'VARCHAR(255)'], ['address_line2', 'VARCHAR(255)'],
      ['address_city', 'VARCHAR(100)'], ['address_district', 'VARCHAR(100)'],
      ['address_state', 'VARCHAR(100)'], ['address_country', 'VARCHAR(100)'],
      ['address_pincode', 'VARCHAR(20)'], ['result_status', 'VARCHAR(50)'], ['expected_percentage', 'NUMERIC(5,2)'],
      ['follow_up_date', 'DATE'], ['admin_remarks', 'VARCHAR(100)'],
      ['hostel_required', 'BOOLEAN DEFAULT FALSE'], ['transport_required', 'BOOLEAN DEFAULT FALSE'],
      ['pref_fees', 'JSONB'],
      ['hostel_type', 'TEXT'], ['hostel_fee', 'NUMERIC'],
      ['transport_route', 'TEXT'], ['transport_fee', 'NUMERIC'],
      ['institution_name', 'VARCHAR(255)'], ['year_of_passing', 'VARCHAR(10)']
    ];

    for (const [col, type] of columns) {
      await client.query(`ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    }
    
    console.log("Database schema is up to date.");
  } catch (err) {
    console.error("DB Init Error:", err.message);
  } finally {
    client.release();
  }
}
initDB();

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
        course_preferences, diploma_percentage, dcet_rank,
        physics_11, chemistry_11, math_11a, math_11b, english_11, language_11,
        physics_12_prac, chemistry_12_prac, math_12a, math_12b,
        kannada_12, english_12, other_12,
        hostel_required, transport_required,
        hostel_type, hostel_fee,
        transport_route, transport_fee,
        institution_name, year_of_passing
      )
      VALUES (
        $1,  $2,  $3,  $4,  $5,  $6,  $7,  $8,  $9,  $10,
        $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20,
        $21, $22, $23,
        $24, $25, $26, $27, $28, $29,
        $30, $31,
        $32, $33, $34,
        $35, $36, $37,
        $38, $39, $40, $41, $42, $43,
        $44, $45, $46, $47,
        $48, $49, $50,
        $51, $52,
        $53, $54, $55, $56,
        $57, $58
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
      /* $37 */ d.dcet_rank || null,
      /* $38 */ d.physics_11 || null,
      /* $39 */ d.chemistry_11 || null,
      /* $40 */ d.math_11a || null,
      /* $41 */ d.math_11b || null,
      /* $42 */ d.english_11 || null,
      /* $43 */ d.language_11 || null,
      /* $44 */ d.physics_12_prac || null,
      /* $45 */ d.chemistry_12_prac || null,
      /* $46 */ d.math_12a || null,
      /* $47 */ d.math_12b || null,
      /* $48 */ d.kannada_12 || null,
      /* $49 */ d.english_12 || null,
      /* $50 */ d.other_12 || null,
      /* $51 */ d.hostel_required || false,
      /* $52 */ d.transport_required || false,
      /* $53 */ d.hostel_type || null,
      /* $54 */ d.hostel_fee || null,
      /* $55 */ d.transport_route || null,
      /* $56 */ d.transport_fee || null,
      /* $57 */ d.institution_name || null,
      /* $58 */ d.year_of_passing || null
    ];

    const result = await client.query(query, values);
    await client.query('COMMIT');

    // --- Respond Early to satisfy the frontend and avoid timeouts ---
    res.status(201).json({ success: true, message: 'Enquiry submitted successfully', id: result.rows[0].id, token_number: d.token_number });

    // --- Background supplemental tasks (Email + branded QR) ---
    (async () => {
      try {
        const origin = process.env.PUBLIC_URL || req.headers.origin || ('http://' + req.headers.host);
        const autofillUrl = `${origin}/admission-form/?enquiry_id=${result.rows[0].id}`;
        console.log(`[Enquiry-BG] Preparing email to ${d.student_email}...`);

        const qrPngBuffer = await generateBrandedQR(autofillUrl, 300);
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
</div>`,
          attachments: [
            { filename: 'qrcode.png', content: qrPngBuffer, cid: 'qrcode' },
            { filename: 'svce-promo.gif', path: path.join(__dirname, 'svce-promo.gif'), cid: 'svce_promo' }
          ]
        };

        await transporter.sendMail(mailOptions);
        console.log('[Enquiry-BG] Email sent successfully to', d.student_email);
      } catch (err) {
        console.error('[Enquiry-BG] Background task error:', err.message);
      }
    })();

  } catch (error) {
    if (!res.headersSent) {
      await client.query('ROLLBACK');
      console.error('Error submitting enquiry:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
    } else {
      console.error('Captured error after response headers sent:', error.message);
    }
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
        physics_11 NUMERIC(5,2),
        chemistry_11 NUMERIC(5,2),
        math_11a NUMERIC(5,2),
        math_11b NUMERIC(5,2),
        english_11 NUMERIC(5,2),
        language_11 NUMERIC(5,2),
        physics_12_prac NUMERIC(5,2),
        chemistry_12_prac NUMERIC(5,2),
        math_12a NUMERIC(5,2),
        math_12b NUMERIC(5,2),
        kannada_12 NUMERIC(5,2),
        english_12 NUMERIC(5,2),
        other_12 NUMERIC(5,2),
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
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS twelfth_marksheet_path VARCHAR(500)",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS aadhaar_no VARCHAR(20)",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS payment_receipt_path VARCHAR(500)",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS payment_utr_no VARCHAR(50)",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS sequence_number INTEGER",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS signature_path VARCHAR(500)"
    ];
    for (const sql of alterCols) await pool.query(sql);

    // Create management_forms table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS management_forms (
        id SERIAL PRIMARY KEY,
        admission_id INTEGER REFERENCES admissions(id) ON DELETE CASCADE,
        app_no VARCHAR(50),
        academic_year VARCHAR(50),
        form_date VARCHAR(50),
        student_name VARCHAR(150),
        mobile_no VARCHAR(20),
        parent_name VARCHAR(150),
        parent_mobile VARCHAR(20),
        branch VARCHAR(150),
        state VARCHAR(100),
        email VARCHAR(150),
        actual_fee NUMERIC(15,2),
        scholarship NUMERIC(15,2),
        booking_fee VARCHAR(50),
        net_payable NUMERIC(15,2),
        reference_name VARCHAR(200),
        pcm_percentage VARCHAR(20),
        overall_percentage VARCHAR(20),
        cet_rank VARCHAR(50),
        comedk_rank VARCHAR(50),
        jee_rank VARCHAR(50),
        cet_no VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(100)
      );
    `);



    // Alter management_forms to add audit columns if missing
    const mgtAlter = [
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS admission_id INTEGER REFERENCES admissions(id) ON DELETE CASCADE",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS app_no VARCHAR(50)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS academic_year VARCHAR(50)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS form_date VARCHAR(50)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS student_name VARCHAR(150)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS mobile_no VARCHAR(20)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS parent_name VARCHAR(150)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS parent_mobile VARCHAR(20)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS branch VARCHAR(150)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS state VARCHAR(100)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS email VARCHAR(150)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS actual_fee NUMERIC(15,2)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS scholarship NUMERIC(15,2)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS booking_fee VARCHAR(50)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS net_payable NUMERIC(15,2)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS reference_name VARCHAR(200)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS pcm_percentage VARCHAR(20)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS overall_percentage VARCHAR(20)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS cet_rank VARCHAR(50)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS comedk_rank VARCHAR(50)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS jee_rank VARCHAR(50)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS cet_no VARCHAR(50)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100)"
    ];
    for (const sql of mgtAlter) await pool.query(sql);


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
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS expected_percentage NUMERIC(5,2)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS physics_11 NUMERIC(5,2)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS chemistry_11 NUMERIC(5,2)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS math_11a NUMERIC(5,2)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS math_11b NUMERIC(5,2)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS english_11 NUMERIC(5,2)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS language_11 NUMERIC(5,2)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS physics_12_prac NUMERIC(5,2)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS chemistry_12_prac NUMERIC(5,2)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS math_12a NUMERIC(5,2)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS math_12b NUMERIC(5,2)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS kannada_12 NUMERIC(5,2)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS english_12 NUMERIC(5,2)",
      "ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS other_12 NUMERIC(5,2)"
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
    res.json({ success: true, token: `BE/ADM/${dd}${mm}${yyyy}/${seq}`, sequence: seq });
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
        v.application_number = `BE/ADM/${ddd}${mmm}${yyy}/${adm_seq}`;
        // make adm_seq available for INSERT below
        v._adm_seq = adm_seq;
      } catch(e) { adm_client.release(); throw e; }


      // File paths (relative, served via /uploads/...)
      const photoPath    = req.files?.passport_photo?.[0]  ? `/uploads/admissions/${req.files.passport_photo[0].filename}`   : null;
      const twelfth_path = req.files?.twelfth_marksheet?.[0] ? `/uploads/admissions/${req.files.twelfth_marksheet[0].filename}` : null;
      const receipt_path = req.files?.payment_receipt?.[0] ? `/uploads/admissions/${req.files.payment_receipt[0].filename}` : null;
      const signature_path = req.files?.signature_image?.[0] ? `/uploads/admissions/${req.files.signature_image[0].filename}` : null;

      const query = `
        INSERT INTO admissions (
          enquiry_id, application_number, sequence_number, application_date,
          title, student_name, mobile_no, email, date_of_birth, gender, aadhaar_no,
          comm_address_line1, comm_address_line2, comm_city, comm_district, comm_state, comm_country, comm_pincode,
          same_as_comm, perm_address_line1, perm_address_line2, perm_city, perm_district, perm_state, perm_country, perm_pincode,
          father_name, father_mobile, father_occupation, mother_name, mother_mobile, mother_occupation,
          candidate_name_marksheet,
          twelfth_institution, twelfth_board, twelfth_stream, twelfth_year_passing, twelfth_result_status, twelfth_marking_scheme, twelfth_percentage,
          ug_institution, ug_board, ug_stream, ug_year_passing, ug_result_status, ug_marking_scheme, ug_percentage,
          entrance_exams, declaration_accepted, student_signature,
          passport_photo_path, twelfth_marksheet_path,
          payment_receipt_path, payment_utr_no, signature_path
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
          $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,
          $44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55
        ) RETURNING id;
      `;
      const values = [
        v.enquiry_id ? parseInt(v.enquiry_id) : null, v.application_number, v._adm_seq, today,
        v.title, v.student_name, v.mobile_no, v.email, v.date_of_birth || null, v.gender, v.aadhaar_no || null,
        v.comm_address_line1, v.comm_address_line2, v.comm_city, v.comm_district, v.comm_state, v.comm_country, v.comm_pincode,
        v.same_as_comm === 'true' || v.same_as_comm === true,
        v.perm_address_line1, v.perm_address_line2, v.perm_city, v.perm_district, v.perm_state, v.perm_country, v.perm_pincode,
        v.father_name, v.father_mobile, v.father_occupation, v.mother_name, v.mother_mobile, v.mother_occupation,
        v.candidate_name_marksheet,
        v.twelfth_institution, v.twelfth_board, v.twelfth_stream, v.twelfth_year_passing, v.twelfth_result_status, v.twelfth_marking_scheme, v.twelfth_percentage,
        null, null, null, null, null, null, null, // UG not applicable
        v.entrance_exams, v.declaration_accepted === 'true' || v.declaration_accepted === true, v.student_signature || null,
        photoPath, twelfth_path,
        receipt_path, v.payment_utr_no || null, signature_path
      ];
      const result = await pool.query(query, values);

      // ── Send confirmation email with PDF (async – don't block response) ──
      setImmediate(async () => {
        try {
          // Fetch enquiry preferences for the PDF
          let prefs = [];
          let remarks = '';
          if (v.enquiry_id) {
            const enqRes = await pool.query('SELECT course_preferences, admin_remarks FROM enquiries WHERE id = $1', [v.enquiry_id]);
            if (enqRes.rows.length) {
              try {
                prefs = JSON.parse(enqRes.rows[0].course_preferences || '[]');
              } catch { prefs = []; }
              remarks = enqRes.rows[0].admin_remarks || '';
            }
          }
          const emailData = { ...v, application_number: v.application_number, _top_prefs: prefs.slice(0, 4), _admin_remarks: remarks };
          const pdfBuffer = await generateAdmissionPdf(emailData);

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
    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">Svce, Vidyanagara Cross, Kenpegowda International Airport Road, Bengaluru-562157 &nbsp;|&nbsp; enquiry.svce@gmail.com</p>
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

// ── Admin Dashboard ─────────────────────────────────────────────────────────
app.use('/admin_dashboard', express.static(path.join(__dirname, 'admin_dashboard')));

const ADMIN_USER  = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS  = process.env.ADMIN_PASS || 'admin123';
const ADMIN_SECRET = crypto.randomBytes(32).toString('hex');

function generateToken() {
  const payload = { user: ADMIN_USER, iat: Date.now() };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64');
  const sig  = crypto.createHmac('sha256', ADMIN_SECRET).update(data).digest('hex');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token) return false;
  const [data, sig] = token.split('.');
  if (!data || !sig) return false;
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(data).digest('hex');
  return sig === expected;
}

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!verifyToken(token)) return res.status(401).json({ success: false, message: 'Unauthorized' });
  next();
}

// Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ success: true, token: generateToken(), username: ADMIN_USER });
  }
  res.status(401).json({ success: false, message: 'Invalid username or password' });
});

// Stats
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const totalEnq  = await pool.query('SELECT COUNT(*) AS c FROM enquiries');
    const totalAdm  = await pool.query('SELECT COUNT(*) AS c FROM admissions');
    const totalMgt  = await pool.query('SELECT COUNT(*) AS c FROM management_forms');
    const todayEnq  = await pool.query('SELECT COUNT(*) AS c FROM enquiries  WHERE enquiry_date = $1', [today]);
    const todayAdm  = await pool.query('SELECT COUNT(*) AS c FROM admissions WHERE application_date = $1', [today]);
    const recentEnq = await pool.query('SELECT * FROM enquiries  ORDER BY id DESC LIMIT 5');
    const recentAdm = await pool.query('SELECT * FROM admissions ORDER BY id DESC LIMIT 5');
    res.json({
      total_enquiries:   parseInt(totalEnq.rows[0].c),
      total_admissions:  parseInt(totalAdm.rows[0].c),
      total_management:  parseInt(totalMgt.rows[0].c),
      today_enquiries:   parseInt(todayEnq.rows[0].c),
      today_admissions:  parseInt(todayAdm.rows[0].c),
      recent_enquiries:  recentEnq.rows,
      recent_admissions: recentAdm.rows
    });

  } catch (err) { res.status(500).json({ error: err.message }); }
});

// All enquiries
app.get('/api/admin/enquiries', adminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM enquiries ORDER BY id DESC');
    res.json({ rows: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update enquiry remarks/follow-up date
app.put('/api/admin/enquiry/:id/remarks', adminAuth, async (req, res) => {
  try {
    const { follow_up_date, admin_remarks } = req.body;
    await pool.query(
      'UPDATE enquiries SET follow_up_date = $1, admin_remarks = $2 WHERE id = $3',
      [follow_up_date || null, admin_remarks || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Single enquiry
app.get('/api/admin/enquiry/:id', adminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM enquiries WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ row: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete enquiry
app.delete('/api/admin/enquiry/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM enquiries WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// All admissions
app.get('/api/admin/admissions', adminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM admissions ORDER BY id DESC');
    res.json({ rows: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Single admission
app.get('/api/admin/admission/:id', adminAuth, async (req, res) => {
  try {
    const query = `
      SELECT a.*, e.*, a.id as id
      FROM admissions a
      LEFT JOIN enquiries e ON a.enquiry_id = e.id
      WHERE a.id = $1
    `;
    const result = await pool.query(query, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ row: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete admission
app.delete('/api/admin/admission/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM admissions WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Management Forms
app.post('/api/admin/management-form', adminAuth, async (req, res) => {
  try {
    const v = req.body;
    const updater = v.updated_by || 'Admin';
    
    // Check if exists
    const existing = await pool.query('SELECT id FROM management_forms WHERE admission_id = $1', [v.admission_id]);
    
    if (existing.rows.length > 0) {
      // Update
      const query = `
        UPDATE management_forms SET
          app_no = $1, academic_year = $2, form_date = $3, student_name = $4, mobile_no = $5,
          parent_name = $6, parent_mobile = $7, branch = $8, state = $9, email = $10,
          actual_fee = $11, scholarship = $12, booking_fee = $13, net_payable = $14, reference_name = $15,
          pcm_percentage = $16, overall_percentage = $17, cet_rank = $18, comedk_rank = $19, jee_rank = $20, cet_no = $21,
          updated_at = CURRENT_TIMESTAMP, updated_by = $22
        WHERE admission_id = $23
        RETURNING id
      `;
      const result = await pool.query(query, [
        v.app_no, v.academic_year, v.form_date, v.student_name, v.mobile_no,
        v.parent_name, v.parent_mobile, v.branch, v.state, v.email,
        v.actual_fee, v.scholarship, v.booking_fee, v.net_payable, v.reference_name,
        v.pcm_percentage, v.overall_percentage, v.cet_rank, v.comedk_rank, v.jee_rank, v.cet_no,
        updater, v.admission_id
      ]);
      res.json({ success: true, id: result.rows[0].id, type: 'update' });
    } else {
      // Insert
      const query = `
        INSERT INTO management_forms (
          admission_id, app_no, academic_year, form_date, student_name, mobile_no,
          parent_name, parent_mobile, branch, state, email,
          actual_fee, scholarship, booking_fee, net_payable, reference_name,
          pcm_percentage, overall_percentage, cet_rank, comedk_rank, jee_rank, cet_no,
          updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        RETURNING id
      `;
      const result = await pool.query(query, [
        v.admission_id, v.app_no, v.academic_year, v.form_date, v.student_name, v.mobile_no,
        v.parent_name, v.parent_mobile, v.branch, v.state, v.email,
        v.actual_fee, v.scholarship, v.booking_fee, v.net_payable, v.reference_name,
        v.pcm_percentage, v.overall_percentage, v.cet_rank, v.comedk_rank, v.jee_rank, v.cet_no,
        updater
      ]);
      res.json({ success: true, id: result.rows[0].id, type: 'insert' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});


app.get('/api/admin/management-forms', adminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM management_forms ORDER BY id DESC');
    res.json({ rows: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/management-form/:id', adminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM management_forms WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ row: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/management-form/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM management_forms WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── Print Endpoints (token via query param for window.open compatibility) ──

// Auth helper for query-param token
function adminAuthQuery(req, res, next) {
  const token = req.query.token;
  if (!verifyToken(token)) return res.status(401).send('<h2>Unauthorized. Please log in to the admin dashboard.</h2>');
  next();
}

// GET /api/admin/enquiry/:id/print  — returns a printable HTML page
app.get('/api/admin/enquiry/:id/print', adminAuthQuery, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM enquiries WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).send('Enquiry not found');
    const r = result.rows[0];

    let prefsArray = [];
    try {
      prefsArray = typeof r.course_preferences === 'string'
        ? JSON.parse(r.course_preferences || '[]')
        : (r.course_preferences || []);
      if (!Array.isArray(prefsArray)) prefsArray = [];
    } catch { prefsArray = []; }

    const val = (v) => (v === null || v === undefined || v === '') ? 'N/A' : v;
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ' - ') : 'N/A';
    const fmtTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';
    const origin = process.env.PUBLIC_URL || req.headers.origin || (`${req.protocol}://${req.get('host')}`);
    const formUrl = origin + '/admission-form/?enquiry_id=' + r.id;
    const qrDataUrl = await QRCode.toDataURL(formUrl, {
      width: 200,
      margin: 1,
      color: { dark: '#1e3a5f', light: '#ffffff' }
    });

    const hostelText = r.hostel_required
      ? ((r.hostel_type || '').replace('(Only Accomm)', '').replace('(With Food)', '').trim() + ' (₹' + (r.hostel_fee || 0) + ')')
      : 'NO';
    const transportText = r.transport_required
      ? ((r.transport_route || '') + ' (₹' + (r.transport_fee || 0) + ')')
      : 'NO';

    // Server-side course fee lookup (matches enquiry form fee schedule)
    const COURSE_FEES = {
      'BE Computer Science and Engineering': 375000,
      'BE Computer Science and Engineering (Artificial Intelligence)': 375000,
      'BE Computer Science and Engineering (Data Science)': 350000,
      'BE Computer Science and Engineering (Cyber Security)': 325000,
      'BE Information Science and Engineering': 325000,
      'BE Electronics and Communication Engineering': 275000,
      'BE Civil Engineering': 125000,
      'BE Mechanical Engineering': 125000
    };
    const HOSTEL_FEES = {
      'Hostel with shared washroom (With Food)': 110000,
      'Hostel with attached washroom (Boys only, With Food)': 130000,
      'Hostel with shared washroom (Only Accomm)': 50000,
      'Hostel with attached washroom (Boys only, Only Accomm)': 75000
    };
    const TRANSPORT_FEES = {
      'Chintamani Route': 45000,
      'Other Routes': 40000,
      'Others': 40000
    };

    const prefsRows = prefsArray.map((p, i) => {
      const courseName = typeof p === 'object' ? p.course : p;
      const fee = (typeof p === 'object' && p.fee) ? p.fee : (COURSE_FEES[courseName] || null);
      return `
      <tr>
        <td class="pref-num">${i + 1}.</td>
        <td style="white-space:normal">${courseName}</td>
        <td style="text-align:center">${fee ? '₹' + Number(fee).toLocaleString('en-IN') : '—'}</td>
        ${i === 0 ? `<td rowspan="${prefsArray.length}" style="background:#fff"></td>` : ''}
      </tr>`;
    }).join('') || '<tr><td colspan="4">No preferences selected</td></tr>';

    const html = `      <!DOCTYPE html>
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
            <img src="${qrDataUrl}" alt="Admission QR" style="width:80px;height:80px;">
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
            <th colspan="6">11th Standard Details</th>
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
            <th colspan="6">12th Standard Details</th>
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
            <td style="padding: 4px; border-left: none; border-right: none;">${(() => {
              if (!r.hostel_required) return 'NO';
              const label = (r.hostel_type || '').replace('(Only Accomm)', '').replace('(With Food)', '').trim();
              const fee = r.hostel_fee || HOSTEL_FEES[r.hostel_type] || null;
              return label + (fee ? ' (₹' + Number(fee).toLocaleString('en-IN') + ')' : '');
            })()}</td>
            <td colspan="2" style="padding: 4px; border-left: none;"><span style="font-weight:700">Transport:</span> ${(() => {
              if (!r.transport_required) return 'NO';
              const route = r.transport_route || '';
              const fee = r.transport_fee || TRANSPORT_FEES[r.transport_route] || null;
              return route + (fee ? ' (₹' + Number(fee).toLocaleString('en-IN') + ')' : '');
            })()}</td>
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
      </html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Enquiry print error:', err);
    res.status(500).send('Error generating print view: ' + err.message);
  }
});

// GET /api/admin/admission/:id/print-pdf  — streams a PDF for inline viewing
app.get('/api/admin/admission/:id/print-pdf', adminAuthQuery, async (req, res) => {
  try {
    const query = `
      SELECT a.*, e.course_preferences, e.admin_remarks, a.id as id
      FROM admissions a
      LEFT JOIN enquiries e ON a.enquiry_id = e.id
      WHERE a.id = $1
    `;
    const result = await pool.query(query, [req.params.id]);
    if (!result.rows.length) return res.status(404).send('Admission not found');
    const r = result.rows[0];

    let prefs = [];
    try {
      prefs = typeof r.course_preferences === 'string'
        ? JSON.parse(r.course_preferences || '[]')
        : (r.course_preferences || []);
      if (!Array.isArray(prefs)) prefs = [];
    } catch { prefs = []; }

    const pdfData = { ...r, _top_prefs: prefs.slice(0, 4), _admin_remarks: r.admin_remarks || '' };
    const pdfBuffer = await generateAdmissionPdf(pdfData);

    const safeName = (r.application_number || 'admission').replace(/\//g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="SVCE_${safeName}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Admission PDF print error:', err);
    res.status(500).send('Error generating PDF: ' + err.message);
  }
});


// GET /api/admin/admission/:id/print  — returns a printable HTML application form
app.get('/api/admin/admission/:id/print', adminAuthQuery, async (req, res) => {
  try {
    const query = `
      SELECT a.*, e.course_preferences, e.admin_remarks
      FROM admissions a
      LEFT JOIN enquiries e ON a.enquiry_id = e.id
      WHERE a.id = $1
    `;
    const result = await pool.query(query, [req.params.id]);
    if (!result.rows.length) return res.status(404).send('Admission not found');
    const r = result.rows[0];

    // Helper functions
    const formatDate = (dateString) => {
      if (!dateString) return '—';
      const d = new Date(dateString);
      return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB'); 
    };

    const logoUrl = '/image copy.png';
    const photoUrl = r.passport_photo_path ? r.passport_photo_path : '';
    const signUrl = r.signature_path ? r.signature_path : '';

    let prefsArray = [];
    if (typeof r.course_preferences === 'string') {
        try { prefsArray = JSON.parse(r.course_preferences || '[]'); } catch { prefsArray = []; }
    } else {
        prefsArray = r.course_preferences || [];
    }
    prefsArray = Array.isArray(prefsArray) ? prefsArray.slice(0, 4) : [];
    while(prefsArray.length < 4) prefsArray.push('');

    // Inject print script automatically
    const printHint = "<div style='text-align:center; padding:10px; background:#eff6ff; margin-bottom:10px; font-weight:bold; color:#1d4ed8;' class='no-print'>📄 Press Ctrl+P (or Cmd+P) to print this form.</div>";

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
            <div style="display:flex; gap: 40px;">
              <div class="sign-area">
                <div class="sign-placeholder">
                  ${signUrl ? `<img src="${signUrl}" class="signature-img" alt="Candidate Signature">` : r.student_name}
                </div>
                <span class="sign-label">Candidate Signature</span>
              </div>
              <div class="sign-area">
                <div class="sign-placeholder"></div>
                <span class="sign-label">Parent/Guardian Signature</span>
              </div>
            </div>
          </div>

        </div>

      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(printHint + html);
  } catch(err) {
    console.error('Admission HTML print error:', err);
    res.status(500).send('Error generating print view: ' + err.message);
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Open http://localhost:${port} to see the form.`);
  console.log(`Admin dashboard: http://localhost:${port}/admin_dashboard/`);
});
