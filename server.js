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
const generateReceiptPdf = require('./generateReceiptPdf');
const Jimp = require('jimp');  // v0.22 — stable compositing API

// ── Timezone Helper (IST) ─────────────────────────────────────────────────────
function getISTDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 330);
  return d;
}

function getISTDateString() {
  return getISTDate().toISOString().split('T')[0];
}
// ─────────────────────────────────────────────────────────────────────────────

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

// ── Helper: Convert uploaded file path to base64 data URL for embedded printing ──
function fileToDataUrl(relativePath) {
  if (!relativePath) return '';
  try {
    const cleanPath = decodeURIComponent(relativePath).replace(/^[\\/]+/, '');
    const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.join(__dirname, cleanPath);
    if (fs.existsSync(fullPath)) {
      const buf = fs.readFileSync(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
      const mime = mimeMap[ext] || 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } else {
      console.error('[fileToDataUrl] File not found:', fullPath);
    }
  } catch (err) {
    console.error('[fileToDataUrl] Error:', err.message);
  }
  return '';
}
// ─────────────────────────────────────────────────────────────────────────────

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
    // Create raw_enquiries table first (required for foreign keys)
    await client.query(`
      CREATE TABLE IF NOT EXISTS raw_enquiries (
        id SERIAL PRIMARY KEY,
        serial_no VARCHAR(50),
        student_name VARCHAR(150),
        phone_number VARCHAR(50),
        email_id VARCHAR(150),
        course VARCHAR(150),
        place VARCHAR(150),
        mode VARCHAR(50), 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(100)
      );
    `);

    // Corrective reset for accidental edit requests (one-time logic)
    await client.query("UPDATE admissions SET edit_requested = FALSE, edit_enabled = FALSE WHERE id IN (24, 22)");
    console.log("Applied one-time corrective reset for IDs 24 and 22.");
    await client.query(`
      CREATE TABLE IF NOT EXISTS enquiries (
        id SERIAL PRIMARY KEY,
        token_number VARCHAR(100),
        sequence_number INTEGER,
        enquiry_date DATE,
        student_name VARCHAR(100),
        gender VARCHAR(50),
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
        follow_up_status VARCHAR(50) DEFAULT 'Active',
        admin_remarks VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure all new columns exist (Migration)
    const columns = [
      ['gender', 'VARCHAR(50)'],
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
      ['institution_name', 'VARCHAR(255)'], ['year_of_passing', 'VARCHAR(10)'],
      ['follow_up_status', "VARCHAR(50) DEFAULT 'Active'"],
      ['raw_id', 'INTEGER REFERENCES raw_enquiries(id) ON DELETE SET NULL']
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
    const today = getISTDateString();
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
    const today = getISTDateString();
    
    if (d.raw_id) console.log(`[Submission] Linked to Raw Lead ID: ${d.raw_id}`);

    // ── Atomically assign token number (advisory lock prevents duplicates) ──
    await client.query('SELECT pg_advisory_xact_lock(1001)'); // lock id 1001 = enquiry tokens
    const seqResult = await client.query(
      `SELECT COALESCE(MAX(sequence_number), 0) AS max_seq
       FROM enquiries WHERE enquiry_date = $1`,
      [today]
    );
    const seq = parseInt(seqResult.rows[0].max_seq, 10) + 1;
    const dt = getISTDate();
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
        token_number, sequence_number, enquiry_date, student_name, gender, father_name, mother_name,
        student_email, student_mobile, father_mobile, mother_mobile, address,
        address_line1, address_line2, address_city, address_district,
        address_state, address_country, address_pincode,
        result_status, expected_percentage,
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
        institution_name, year_of_passing, raw_id
      )
      VALUES (
        $1,  $2,  $3,  $4,  $5,  $6,  $7,  $8,  $9,  $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
        $41, $42, $43, $44, $45, $46, $47, $48, $49, $50,
        $51, $52, $53, $54, $55, $56, $57, $58, $59, $60
      ) RETURNING id;
    `;

    const values = [
      /* $1  */ d.token_number,
      /* $2  */ seq,
      /* $3  */ d.enquiry_date,
      /* $4  */ d.student_name,
      /* $5  */ d.gender || 'Other',
      /* $6  */ d.father_name,
      /* $7  */ d.mother_name,
      /* $8  */ d.student_email,
      /* $9  */ d.student_mobile,
      /* $10 */ d.father_mobile,
      /* $11 */ d.mother_mobile,
      /* $12 */ d.address || null,
      /* $13 */ d.address_line1 || null,
      /* $14 */ d.address_line2 || null,
      /* $15 */ d.address_city || null,
      /* $16 */ d.address_district || null,
      /* $17 */ d.address_state || null,
      /* $18 */ d.address_country || null,
      /* $19 */ d.address_pincode || null,
      /* $20 */ d.result_status || null,
      /* $21 */ d.expected_percentage || null,
      /* $22 */ d.reference || null,
      /* $23 */ d.education_qualification || null,
      /* $24 */ d.education_board || null,
      /* $25 */ d.physics_marks || null,
      /* $26 */ d.chemistry_marks || null,
      /* $27 */ d.mathematics_marks || null,
      /* $28 */ d.cs_marks || null,
      /* $29 */ d.bio_marks || null,
      /* $30 */ d.ece_marks || null,
      /* $31 */ d.total_percentage || null,
      /* $32 */ d.pcm_percentage || null,
      /* $33 */ d.jee_rank || null,
      /* $34 */ d.comedk_rank || null,
      /* $35 */ d.cet_rank || null,
      /* $36 */ preferences_json,
      /* $37 */ d.diploma_percentage || null,
      /* $38 */ d.dcet_rank || null,
      /* $39 */ d.physics_11 || null,
      /* $40 */ d.chemistry_11 || null,
      /* $41 */ d.math_11a || null,
      /* $42 */ d.math_11b || null,
      /* $43 */ d.english_11 || null,
      /* $44 */ d.language_11 || null,
      /* $45 */ d.physics_12_prac || null,
      /* $46 */ d.chemistry_12_prac || null,
      /* $47 */ d.math_12a || null,
      /* $48 */ d.math_12b || null,
      /* $49 */ d.kannada_12 || null,
      /* $50 */ d.english_12 || null,
      /* $51 */ d.other_12 || null,
      /* $52 */ d.hostel_required || false,
      /* $53 */ d.transport_required || false,
      /* $54 */ d.hostel_type || null,
      /* $55 */ d.hostel_fee || null,
      /* $56 */ d.transport_route || null,
      /* $57 */ d.transport_fee || null,
      /* $58 */ d.institution_name || null,
      /* $59 */ d.year_of_passing || null,
      /* $60 */ (d.raw_id ? parseInt(d.raw_id, 10) : null)
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
  <p style="font-size: 14px; color: #555; margin-bottom: 8px; font-weight: bold;">Scan or Click QR Code to Access Your Admission Form:</p>
  <a href="${autofillUrl}" target="_blank" style="display:inline-block; padding:14px; background:#ffffff; border:2px solid #e2e8f0; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.08); text-decoration:none;">
    <img src="cid:qrcode" alt="QR Code" style="width:220px; height:220px; display:block;" />
  </a>
  <p style="font-size:11px; color:#9ca3af; margin-top:6px;">Click the QR code or scan it to open your admission form</p>
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
        sequence_number INTEGER,
        enquiry_date DATE,
        student_name VARCHAR(100),
        gender VARCHAR(20),
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
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS signature_path VARCHAR(500)",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS edit_requested BOOLEAN DEFAULT FALSE",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS edit_enabled BOOLEAN DEFAULT FALSE",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS view_enabled BOOLEAN DEFAULT TRUE",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS course_preferences JSONB",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS edit_request_log JSONB",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS edit_enable_log JSONB",
      "ALTER TABLE admissions ADD COLUMN IF NOT EXISTS is_resubmitted BOOLEAN DEFAULT FALSE"
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
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS contineo_id VARCHAR(50)",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS remarks TEXT",
      "ALTER TABLE management_forms ADD COLUMN IF NOT EXISTS audit_log JSONB DEFAULT '[]'"
    ];
    for (const sql of mgtAlter) await pool.query(sql);

    // Create admin_activity_log table for tracking all admin actions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_activity_log (
        id SERIAL PRIMARY KEY,
        admin_name VARCHAR(100) NOT NULL,
        action VARCHAR(100) NOT NULL,
        target_type VARCHAR(50),
        target_id INTEGER,
        target_name VARCHAR(200),
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create table for Admitted Students Statistics manual entries
    await pool.query(`
      CREATE TABLE IF NOT EXISTS course_manual_stats (
        id SERIAL PRIMARY KEY,
        academic_year VARCHAR(20) NOT NULL,
        course_id VARCHAR(50) NOT NULL,
        cet_fill INTEGER DEFAULT 0,
        cet_snq INTEGER DEFAULT 0,
        comed_fill INTEGER DEFAULT 0,
        aicte INTEGER DEFAULT 0,
        UNIQUE(academic_year, course_id)
      );
    `);

    // raw_enquiries table created in main initDB()

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
    const today = getISTDateString();
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

// GET check if admission exists for an enquiry
app.get('/api/admissions/check/:enquiry_id', async (req, res) => {
  try {
    const query = 'SELECT * FROM admissions WHERE enquiry_id = $1 ORDER BY id DESC LIMIT 1';
    const result = await pool.query(query, [req.params.enquiry_id]);
    if (result.rows.length > 0) {
      res.json({ success: true, exists: true, data: result.rows[0] });
    } else {
      res.json({ success: true, exists: false });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST request edit for an admission
app.post('/api/admissions/:id/request-edit', async (req, res) => {
  try {
    const logEntry = {
      requested_at: new Date().toISOString(),
      client_ip: req.ip,
      user_agent: req.headers['user-agent']
    };
    await pool.query(`
      UPDATE admissions 
      SET edit_requested = TRUE, 
          edit_request_log = $1 
      WHERE id = $2
    `, [JSON.stringify(logEntry), req.params.id]);
    res.json({ success: true });
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
      const today = getISTDateString();

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
        const dt = getISTDate();
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

      let result;
      
      // Check if admission already exists for this enquiry_id
      let existingAdm = null;
      if (v.enquiry_id) {
        const existCheck = await pool.query('SELECT id, application_number, edit_enabled FROM admissions WHERE enquiry_id = $1 ORDER BY id DESC LIMIT 1', [v.enquiry_id]);
        if (existCheck.rows.length > 0) {
          existingAdm = existCheck.rows[0];
        }
      }

      if (existingAdm) {
        if (!existingAdm.edit_enabled) {
           return res.status(403).json({ success: false, error: 'Admission already submitted. Please request an edit if needed.' });
        }
        
        // Update existing admission
        const updateQuery = `
          UPDATE admissions SET
            title=$1, student_name=$2, mobile_no=$3, email=$4, date_of_birth=$5, gender=$6, aadhaar_no=$7,
            comm_address_line1=$8, comm_address_line2=$9, comm_city=$10, comm_district=$11, comm_state=$12, comm_country=$13, comm_pincode=$14,
            same_as_comm=$15, perm_address_line1=$16, perm_address_line2=$17, perm_city=$18, perm_district=$19, perm_state=$20, perm_country=$21, perm_pincode=$22,
            father_name=$23, father_mobile=$24, father_occupation=$25, mother_name=$26, mother_mobile=$27, mother_occupation=$28,
            candidate_name_marksheet=$29, twelfth_institution=$30, twelfth_board=$31, twelfth_stream=$32, twelfth_year_passing=$33, twelfth_result_status=$34, twelfth_marking_scheme=$35, twelfth_percentage=$36,
            entrance_exams=$37, student_signature=$38,
            passport_photo_path = COALESCE($39, passport_photo_path),
            twelfth_marksheet_path = COALESCE($40, twelfth_marksheet_path),
            payment_receipt_path = COALESCE($41, payment_receipt_path),
            payment_utr_no = COALESCE($42, payment_utr_no),
            signature_path = COALESCE($43, signature_path),
            course_preferences = $44,
            edit_enabled = FALSE, edit_requested = FALSE, is_resubmitted = TRUE
          WHERE id = $45
        `;
        const values = [
          v.title, v.student_name, v.mobile_no, v.email, v.date_of_birth || null, v.gender, v.aadhaar_no || null,
          v.comm_address_line1, v.comm_address_line2, v.comm_city, v.comm_district, v.comm_state, v.comm_country, v.comm_pincode,
          v.same_as_comm === 'true' || v.same_as_comm === true,
          v.perm_address_line1, v.perm_address_line2, v.perm_city, v.perm_district, v.perm_state, v.perm_country, v.perm_pincode,
          v.father_name, v.father_mobile, v.father_occupation, v.mother_name, v.mother_mobile, v.mother_occupation,
          v.candidate_name_marksheet, v.twelfth_institution, v.twelfth_board, v.twelfth_stream, v.twelfth_year_passing, v.twelfth_result_status, v.twelfth_marking_scheme, v.twelfth_percentage,
          v.entrance_exams, v.student_signature || null,
          photoPath, twelfth_path, receipt_path, v.payment_utr_no || null, signature_path,
          JSON.stringify(v.course_preferences ? (typeof v.course_preferences === 'string' ? JSON.parse(v.course_preferences) : v.course_preferences) : []),
          existingAdm.id
        ];
        await pool.query(updateQuery, values);
        result = { rows: [{ id: existingAdm.id }] };
        v.application_number = existingAdm.application_number;
      } else {
        // Insert new admission
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
            payment_receipt_path, payment_utr_no, signature_path,
            course_preferences
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
            $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,
            $44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55, $56
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
          receipt_path, v.payment_utr_no || null, signature_path,
          JSON.stringify(v.course_preferences ? (typeof v.course_preferences === 'string' ? JSON.parse(v.course_preferences) : v.course_preferences) : [])
        ];
        result = await pool.query(query, values);
      }

      // ── Send confirmation email with PDF (async – don't block response) ──
      setImmediate(async () => {
        try {
          // Fetch enquiry preferences for the PDF
          let prefs = [];
          let remarks = '';
          
          // Use preferences from request body if provided (reordered by student)
          if (v.course_preferences) {
            try {
              const bodyPrefs = typeof v.course_preferences === 'string' ? JSON.parse(v.course_preferences) : v.course_preferences;
              if (Array.isArray(bodyPrefs)) prefs = bodyPrefs;
            } catch (e) {
              console.error('Error parsing body course_preferences:', e);
            }
          }

          // Fallback to enquiry table if body prefs are empty
          if (prefs.length === 0 && v.enquiry_id) {
            const enqRes = await pool.query('SELECT course_preferences, admin_remarks FROM enquiries WHERE id = $1', [v.enquiry_id]);
            if (enqRes.rows.length) {
              try {
                prefs = JSON.parse(enqRes.rows[0].course_preferences || '[]');
              } catch { prefs = []; }
              remarks = enqRes.rows[0].admin_remarks || '';
            }
          }
          const emailData = { 
            ...v, 
            application_number: v.application_number, 
            passport_photo_path: photoPath, 
            signature_path: signature_path,
            _top_prefs: prefs.slice(0, 4), 
            _admin_remarks: remarks 
          };
          const pdfBuffer = await generateAdmissionPdf(emailData);
          const receiptPdfBuffer = await generateReceiptPdf(emailData);

          await transporter.sendMail({
            from: '"SVCE Admissions" <enquiry.svce@gmail.com>',
            to: v.email,
            subject: `✅ SVCE Admission Application Received – ${v.application_number}`,
            html: `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
  <div style="background:#1d4ed8;padding:28px 32px;text-align:center;">
    <h2 style="color:#fff;margin:0;font-size:20px;letter-spacing:0.5px;">Application Submitted Successfully!</h2>
    <p style="color:#bfdbfe;margin:6px 0 0;font-size:13px;">Sri Venkateshwara College of Engineering, Bengaluru</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;">Dear <strong>${v.title || ''} ${v.student_name || ''}</strong>,</p>
    <p style="margin:0 0 16px;">Your admission application has been <strong style="color:#059669;">successfully received</strong>. Please find your <strong>Official Application Form</strong> and <strong>Official Fee Receipt</strong> attached as separate PDFs.</p>
    <div style="background:#f0fdf4;border:1px solid #6ee7b7;border-radius:8px;padding:14px 20px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;"><strong>Application No:</strong> <span style="color:#059669;font-family:monospace;">${v.application_number}</span></p>
      <p style="margin:4px 0 0;font-size:14px;"><strong>Course:</strong> ${v.course_preference || ''} &ndash; ${v.program_preference || ''}</p>
      <p style="margin:4px 0 0;font-size:14px;"><strong>Payment Status:</strong> Received (₹1,250)</p>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Our admissions team will review your application and contact you within 2&ndash;3 working days.</p>
    <p style="margin:0 0 24px;font-size:13px;color:#64748b;">For any queries, reply to this email or call <strong>+91 99167 75988</strong>.</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:20px;">
    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">Svce, Vidyanagara Cross, Kenpegowda International Airport Road, Bengaluru-562157 &nbsp;|&nbsp; enquiry.svce@gmail.com</p>
  </div>
</div>`,
            attachments: [
              {
                filename: `SVCE_Application_${v.application_number.replace(/\//g, '_')}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
              },
              {
                filename: `SVCE_Payment_Receipt_${v.application_number.replace(/\//g, '_')}.pdf`,
                content: receiptPdfBuffer,
                contentType: 'application/pdf'
              }
            ]
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
// Serve admin dashboard with no caching so updates apply immediately
app.use('/admin_dashboard', express.static(path.join(__dirname, 'admin_dashboard'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

const ADMIN_USER  = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS  = process.env.ADMIN_PASS || 'admin123';
// Persistent secret for JWT-like tokens (prevents logouts on restart)
const ADMIN_SECRET = process.env.JWT_SECRET || crypto.createHash('sha256').update(process.env.ADMIN_PASS || 'svce_default_secret').digest('hex');

function generateToken(role = 'admin', userName = 'Admin') {
  const payload = { user: ADMIN_USER, role: role, userName: userName, iat: Date.now() };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64');
  const sig  = crypto.createHmac('sha256', ADMIN_SECRET).update(data).digest('hex');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(data).digest('hex');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64').toString('ascii'));
    return { role: payload.role || 'admin', userName: payload.userName || 'Admin' };
  } catch(e) { return null; }
}

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const authData = verifyToken(token);
  if (!authData) return res.status(401).json({ success: false, message: 'Unauthorized' });
  req.userRole = authData.role;
  req.userName = authData.userName;
  next();
}

// Helper: log admin activity to the database
async function logAdminActivity(adminName, action, targetType, targetId, targetName, details) {
  try {
    await pool.query(
      'INSERT INTO admin_activity_log (admin_name, action, target_type, target_id, target_name, details) VALUES ($1, $2, $3, $4, $5, $6)',
      [adminName, action, targetType || null, targetId || null, targetName || null, details || null]
    );
  } catch (err) {
    console.error('[ActivityLog] Failed to log:', err.message);
  }
}

// Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  // Define allowed admin accounts
  const admins = [
    { user: ADMIN_USER, pass: ADMIN_PASS, displayName: 'Admin' },
    { user: 'admissions@svcengg.edu.in', pass: 'svce@2001', displayName: 'Admissions' },
    { user: 'md@svcengg.edu.in', pass: 'svce@2001', displayName: 'MD' },
    { user: 'director@svcengg.edu.in', pass: 'svce@2001', displayName: 'Director' }
  ];

  const adminMatch = admins.find(a => a.user === username && a.pass === password);
  if (adminMatch) {
    return res.json({ 
      success: true, 
      token: generateToken('admin', adminMatch.displayName), 
      username: adminMatch.displayName, 
      role: 'admin' 
    });
  }

  // Counsellor check
  const counsellors = [
    { user: 'counsellor', pass: 'svce123', displayName: 'Counsellor' },
    { user: 'enquiry@svcengg.edu.in', pass: 'svceadm', displayName: 'Enquiry SVCE' },
    { user: 'enquiry.svce@gmail.com', pass: 'svceadm', displayName: 'Enquiry Gmail' }
  ];

  const counsellorMatch = counsellors.find(c => c.user === username && c.pass === password);
  if (counsellorMatch) {
    return res.json({ 
      success: true, 
      token: generateToken('counsellor', counsellorMatch.displayName), 
      username: counsellorMatch.displayName, 
      role: 'counsellor' 
    });
  }

  res.status(401).json({ success: false, message: 'Invalid username or password' });
});

// ══════════ ADMITTED STUDENTS MANUAL STATS ══════════
app.get('/api/admin/stats/manual', adminAuth, async (req, res) => {
  try {
    const year = req.query.year;
    if (!year) return res.json({});
    const { rows } = await pool.query('SELECT * FROM course_manual_stats WHERE academic_year = $1', [year]);
    const data = {};
    rows.forEach(r => {
      data[r.course_id] = { cet_fill: r.cet_fill, cet_snq: r.cet_snq, comed_fill: r.comed_fill, aicte: r.aicte };
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/stats/manual', adminAuth, async (req, res) => {
  try {
    const { year, data } = req.body;
    if (!year || !data) return res.status(400).json({ error: 'Missing year or data' });
    
    await pool.query('BEGIN');
    for (const [course_id, stats] of Object.entries(data)) {
      await pool.query(`
        INSERT INTO course_manual_stats (academic_year, course_id, cet_fill, cet_snq, comed_fill, aicte)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (academic_year, course_id) DO UPDATE SET
          cet_fill = EXCLUDED.cet_fill,
          cet_snq = EXCLUDED.cet_snq,
          comed_fill = EXCLUDED.comed_fill,
          aicte = EXCLUDED.aicte
      `, [year, course_id, stats.cet_fill, stats.cet_snq, stats.comed_fill, stats.aicte]);
    }
    
    // Log activity
    await pool.query(`
      INSERT INTO admin_activity_log (admin_name, action, target_type, target_name, details)
      VALUES ($1, $2, $3, $4, $5)
    `, [req.userName, 'update', 'admitted_stats', `Session ${year}`, 'Updated manual admission counts in statistics table']);
    
    await pool.query('COMMIT');
    res.json({ success: true });
  } catch (err) { 
    await pool.query('ROLLBACK');
    console.error('Stats update error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

// Stats
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const year = req.query.year; // e.g. "2026-27"
    
    // Build WHERE clauses and params for each table type
    let enqWhere = ' WHERE 1=1';
    let admWhere = ' WHERE 1=1';
    let mgtWhere = ' WHERE 1=1';
    const enqParams = [];
    const admParams = [];
    const mgtParams = [];

    if (year) {
      const startYear = year.split('-')[0];
      enqWhere += ` AND EXTRACT(YEAR FROM enquiry_date) = $${enqParams.length + 1}`;
      enqParams.push(parseInt(startYear));
      
      admWhere += ` AND EXTRACT(YEAR FROM application_date) = $${admParams.length + 1}`;
      admParams.push(parseInt(startYear));
      
      // Management forms store academic_year as "26-27" (short) or "2026-27" (full)
      const shortYear = startYear.slice(-2) + '-' + year.split('-')[1]; // "26-27"
      mgtWhere += ` AND (academic_year = $${mgtParams.length + 1} OR academic_year = $${mgtParams.length + 2})`;
      mgtParams.push(year, shortYear); // e.g. "2026-27" and "26-27"
    }

    const today = getISTDateString();
    

    // Counts
    const totalEnq = await pool.query(`SELECT COUNT(*) AS c FROM enquiries${enqWhere}`, enqParams);
    const totalAdm = await pool.query(`SELECT COUNT(*) AS c FROM admissions${admWhere}`, admParams);
    const totalMgt = await pool.query(`SELECT COUNT(*) AS c FROM management_forms${mgtWhere}`, mgtParams);
    
    const todayEnq = await pool.query('SELECT COUNT(*) AS c FROM enquiries WHERE enquiry_date = $1', [today]);
    const todayAdm = await pool.query('SELECT COUNT(*) AS c FROM admissions WHERE application_date = $1', [today]);
    
    // Recent records (always show latest, not filtered)
    const recentEnq = await pool.query(`
      SELECT e.*, 
        EXISTS(SELECT 1 FROM admissions a WHERE a.enquiry_id = e.id) as has_application,
        EXISTS(SELECT 1 FROM management_forms m LEFT JOIN admissions a ON m.admission_id = a.id WHERE a.enquiry_id = e.id) as has_management
      FROM enquiries e 
      ORDER BY e.id DESC LIMIT 5
    `);
    const recentAdm = await pool.query(`
      SELECT a.*, 
        EXISTS(SELECT 1 FROM management_forms m WHERE m.admission_id = a.id) as has_management
      FROM admissions a 
      ORDER BY a.id DESC LIMIT 5
    `);

    // Graph: Enquiry pincodes (Full Dynamic Data)
    const enqPincodes = await pool.query(
      `SELECT COALESCE(NULLIF(address_pincode, ''), 'Unspecified') as pincode, COUNT(*) as count FROM enquiries${enqWhere} GROUP BY pincode ORDER BY count DESC`,
      enqParams
    );
    
    // Graph: Application pincodes (Full Dynamic Data)
    const appPincodes = await pool.query(
      `SELECT COALESCE(NULLIF(comm_pincode, ''), 'Unspecified') as pincode, COUNT(*) as count FROM admissions${admWhere} GROUP BY pincode ORDER BY count DESC`,
      admParams
    );
    
    // Graph: Management pincodes (Full Dynamic Data)
    const mgtPincodes = await pool.query(
      `SELECT COALESCE(NULLIF(a.comm_pincode, ''), 'Unspecified') as pincode, COUNT(*) as count FROM management_forms m LEFT JOIN admissions a ON m.admission_id = a.id WHERE 1=1${year ? ' AND (m.academic_year = $1 OR m.academic_year = $2)' : ''} GROUP BY pincode ORDER BY count DESC`,
      mgtParams
    );
    
    // Graph: Gender distribution (Enquiries)
    const enqGender = await pool.query(
      `SELECT gender, COUNT(*) as count FROM enquiries${enqWhere} AND gender IS NOT NULL AND gender != '' GROUP BY gender ORDER BY count DESC`,
      enqParams
    );

    // Graph: Gender distribution (Applications)
    const appGender = await pool.query(
      `SELECT gender, COUNT(*) as count FROM admissions${admWhere} AND gender IS NOT NULL AND gender != '' GROUP BY gender ORDER BY count DESC`,
      admParams
    );

    // Graph: Gender distribution (Actual Admissions via Management Forms)
    const admGender = await pool.query(
      `SELECT a.gender, COUNT(*) as count FROM management_forms m LEFT JOIN admissions a ON m.admission_id = a.id WHERE 1=1${year ? ' AND (m.academic_year = $1 OR m.academic_year = $2)' : ''} AND a.gender IS NOT NULL AND a.gender != '' GROUP BY a.gender ORDER BY count DESC`,
      mgtParams
    );

    // Advanced Stats: Course Demand (Weighted Ranking based on Preference Order - Preferential Voting Logic)
    // 1st Preference = 8 points, 2nd = 7 points, ..., 8th = 1 point
    // Fallback: If no preference array exists (legacy data), use program_preference as 1st choice (8 points)
    // Advanced Stats: Course Demand (Weighted Ranking based on Preference Order)
    // 1st Preference = 8 points, 2nd = 7 points, ..., 8th = 1 point
    // Fallback: If no preference array exists, use program_preference or course_preference as 1st choice (8 points)
    // Advanced Stats: Course Demand (Weighted Preferential Ranking)
    // 1st Preference = 8 pts, 2nd = 7 pts, ..., 8th = 1 pt
    const appCourse = await pool.query(
      `SELECT course, SUM(score) as count FROM (
         -- 1. Preferences from JSON list (weighted 1-8)
         SELECT 
           TRIM(CASE 
             WHEN jsonb_typeof(p.pref) = 'object' THEN p.pref->>'course'
             ELSE p.pref#>>'{}'
           END) as course,
           (9 - p.ord) as score
         FROM admissions a
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE 
             WHEN jsonb_typeof(a.course_preferences) = 'array' AND jsonb_array_length(a.course_preferences) > 0 
             THEN a.course_preferences 
             ELSE '[]'::jsonb 
           END
         ) WITH ORDINALITY as p(pref, ord)
         ${admWhere}
         
         UNION ALL
         
         -- 2. Fallback for legacy records (8 pts)
         SELECT 
           TRIM(COALESCE(program_preference, course_preference)) as course,
           8 as score
         FROM admissions
         ${admWhere}
         AND (course_preferences IS NULL OR jsonb_typeof(course_preferences) != 'array' OR jsonb_array_length(course_preferences) = 0)
         AND (program_preference IS NOT NULL OR course_preference IS NOT NULL)
       ) as t
       WHERE course IS NOT NULL AND course != ''
       GROUP BY course
       ORDER BY count DESC`,
      admParams
    );
    
    const admCourse = await pool.query(
      `SELECT branch as course, COUNT(*) as count FROM management_forms m WHERE 1=1${year ? ' AND (m.academic_year = $1 OR m.academic_year = $2)' : ''} AND branch IS NOT NULL AND branch != '' GROUP BY branch ORDER BY count DESC`,
      mgtParams
    );

    // Advanced Stats: Lead Sources
    const references = await pool.query(
      `SELECT reference, COUNT(*) as count FROM enquiries${enqWhere} AND reference IS NOT NULL AND reference != '' GROUP BY reference ORDER BY count DESC`,
      enqParams
    );

    // Advanced Stats: State Geographic Distribution
    const appStates = await pool.query(
      `SELECT comm_state as state, COUNT(*) as count FROM admissions${admWhere} AND comm_state IS NOT NULL AND comm_state != '' GROUP BY comm_state ORDER BY count DESC LIMIT 10`,
      admParams
    );

    // Advanced Stats: Timeline Velocity (Last 30 Days)
    const enqTimeline = await pool.query(
      `SELECT TO_CHAR(enquiry_date, 'YYYY-MM-DD') as date, COUNT(*) as count FROM enquiries${enqWhere} AND enquiry_date >= CURRENT_DATE - INTERVAL '30 days' GROUP BY TO_CHAR(enquiry_date, 'YYYY-MM-DD') ORDER BY date ASC`,
      enqParams
    );
    const admTimeline = await pool.query(
      `SELECT TO_CHAR(application_date, 'YYYY-MM-DD') as date, COUNT(*) as count FROM admissions${admWhere} AND application_date >= CURRENT_DATE - INTERVAL '30 days' GROUP BY TO_CHAR(application_date, 'YYYY-MM-DD') ORDER BY date ASC`,
      admParams
    );
    const mgtTimeline = await pool.query(
      `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*) as count FROM management_forms m WHERE 1=1${year ? ' AND (m.academic_year = $1 OR m.academic_year = $2)' : ''} AND created_at >= CURRENT_DATE - INTERVAL '30 days' GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD') ORDER BY date ASC`,
      mgtParams
    );

    // Advanced Stats: Academic Quality (Filtered by Year and optionally by Course)
    const filterCourse = req.query.course;
    let qualityWhere = mgtWhere;
    let qualityParams = [...mgtParams];
    
    if (filterCourse) {
      const cleanCourse = filterCourse.replace(/^BE /, '');
      qualityWhere += ` AND (branch ILIKE $${qualityParams.length + 1} OR branch ILIKE $${qualityParams.length + 2})`;
      qualityParams.push(filterCourse, `%${cleanCourse}%`);
    }

    const academicQuality = await pool.query(
      `SELECT 
         ROUND(AVG(NULLIF(regexp_replace(pcm_percentage, '[^0-9.]', '', 'g'), '')::numeric), 2) as avg_pcm,
         ROUND(AVG(NULLIF(regexp_replace(overall_percentage, '[^0-9.]', '', 'g'), '')::numeric), 2) as avg_overall
       FROM management_forms m WHERE 1=1 ${qualityWhere.replace('WHERE 1=1', '')}`,
      qualityParams
    );

    const enqCourse = await pool.query(
      `SELECT course, SUM(score) as count FROM (
         -- 1. Preferences from JSON list (weighted 1-8)
         SELECT 
           TRIM(CASE 
             WHEN jsonb_typeof(p.pref) = 'object' THEN p.pref->>'course'
             ELSE p.pref#>>'{}'
           END) as course,
           (9 - p.ord) as score
         FROM enquiries e
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE 
             WHEN jsonb_typeof(e.course_preferences) = 'array' AND jsonb_array_length(e.course_preferences) > 0 
             THEN e.course_preferences 
             ELSE '[]'::jsonb 
           END
         ) WITH ORDINALITY as p(pref, ord)
         ${enqWhere}
       ) as t
       WHERE course IS NOT NULL AND course != ''
       GROUP BY course
       ORDER BY count DESC`,
      enqParams
    );

    res.json({
      total_enquiries:   parseInt(totalEnq.rows[0].c),
      total_admissions:  parseInt(totalAdm.rows[0].c),
      total_management:  parseInt(totalMgt.rows[0].c),
      today_enquiries:   parseInt(todayEnq.rows[0].c),
      today_admissions:  parseInt(todayAdm.rows[0].c),
      recent_enquiries:  recentEnq.rows,
      recent_admissions: recentAdm.rows,
      graphs: {
        enquiry_pincodes:     enqPincodes.rows,
        application_pincodes: appPincodes.rows,
        admission_pincodes:   mgtPincodes.rows,
        enquiry_gender:       enqGender.rows,
        application_gender:   appGender.rows,
        admission_gender:     admGender.rows,
        enquiry_courses:      enqCourse.rows,
        application_courses:  appCourse.rows,
        admission_courses:    admCourse.rows,
        lead_sources:         references.rows,
        application_states:   appStates.rows,
        enquiry_timeline:     enqTimeline.rows,
        admission_timeline:   admTimeline.rows,
        management_timeline:  mgtTimeline.rows,
        raw_conversion: (await pool.query(`
          SELECT 
            (SELECT COUNT(*) FROM raw_enquiries) as total_raw,
            (SELECT COUNT(DISTINCT raw_id) FROM enquiries WHERE raw_id IS NOT NULL) as converted
        `)).rows[0]
      },
      quality: academicQuality.rows[0]
    });

  } catch (err) { console.error('Stats error:', err); res.status(500).json({ error: err.message }); }
});

// All enquiries
app.get('/api/admin/enquiries', adminAuth, async (req, res) => {
  try {
    const query = `
      SELECT e.*, 
        EXISTS(SELECT 1 FROM admissions a WHERE a.enquiry_id = e.id) as has_application,
        EXISTS(SELECT 1 FROM management_forms m LEFT JOIN admissions a ON m.admission_id = a.id WHERE a.enquiry_id = e.id) as has_management
      FROM enquiries e 
      ORDER BY e.id DESC
    `;
    const result = await pool.query(query);
    res.json({ rows: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update enquiry remarks/follow-up date
app.put('/api/admin/enquiry/:id/remarks', adminAuth, async (req, res) => {
  try {
    const { follow_up_date, admin_remarks } = req.body;
    const old = await pool.query('SELECT student_name, admin_remarks, follow_up_date FROM enquiries WHERE id = $1', [req.params.id]);
    await pool.query(
      'UPDATE enquiries SET follow_up_date = $1, admin_remarks = $2 WHERE id = $3',
      [follow_up_date || null, admin_remarks || null, req.params.id]
    );
    const studentName = old.rows.length ? old.rows[0].student_name : 'Unknown';
    const changes = [];
    if (old.rows.length) {
      if ((old.rows[0].admin_remarks || '') !== (admin_remarks || '')) changes.push(`Remark → "${admin_remarks || '-'}"`);
      if ((old.rows[0].follow_up_date || '') !== (follow_up_date || '')) changes.push(`Follow-up → ${follow_up_date || 'cleared'}`);
    }
    logAdminActivity(req.userName, 'Updated Enquiry', 'enquiry', parseInt(req.params.id), studentName, changes.join(', ') || 'Remark/follow-up updated');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Stop follow-up for an enquiry
app.put('/api/admin/enquiry/:id/stop-follow-up', adminAuth, async (req, res) => {
  try {
    const old = await pool.query('SELECT student_name FROM enquiries WHERE id = $1', [req.params.id]);
    await pool.query(
      "UPDATE enquiries SET follow_up_status = 'Stopped', follow_up_date = NULL WHERE id = $1",
      [req.params.id]
    );
    const studentName = old.rows.length ? old.rows[0].student_name : 'Unknown';
    logAdminActivity(req.userName, 'Stopped Follow-up', 'enquiry', parseInt(req.params.id), studentName, 'Follow-up permanently stopped');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════ RAW ENQUIRIES ═══════════════

// Get all raw enquiries with conversion status
app.get('/api/admin/raw-enquiries', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, 
        EXISTS(SELECT 1 FROM enquiries e WHERE e.raw_id = r.id) as is_converted
      FROM raw_enquiries r 
      ORDER BY r.id DESC
    `);
    res.json({ rows: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create raw enquiry
app.post('/api/admin/raw-enquiry', adminAuth, async (req, res) => {
  try {
    const { student_name, phone_number, email_id, course, place, mode } = req.body;
    
    // Auto-generate serial no (e.g., RAW/2026/001)
    const year = new Date().getFullYear();
    const countRes = await pool.query('SELECT COUNT(*) FROM raw_enquiries WHERE EXTRACT(YEAR FROM created_at) = $1', [year]);
    const count = parseInt(countRes.rows[0].count) + 1;
    const serial_no = `RAW/${year}/${String(count).padStart(3, '0')}`;

    const query = `
      INSERT INTO raw_enquiries (serial_no, student_name, phone_number, email_id, course, place, mode, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const result = await pool.query(query, [serial_no, student_name, phone_number, email_id, course, place, mode, req.userName]);
    
    logAdminActivity(req.userName, 'Created Raw Enquiry', 'raw_enquiry', result.rows[0].id, student_name, `Mode: ${mode}, Serial: ${serial_no}`);
    res.json({ success: true, row: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete raw enquiry
app.delete('/api/admin/raw-enquiry/:id', adminAuth, async (req, res) => {
  if (req.userRole === 'counsellor') return res.status(403).json({ error: 'Counsellors cannot delete records' });
  try {
    const old = await pool.query('SELECT student_name FROM raw_enquiries WHERE id = $1', [req.params.id]);
    await pool.query('DELETE FROM raw_enquiries WHERE id = $1', [req.params.id]);
    logAdminActivity(req.userName, 'Deleted Raw Enquiry', 'raw_enquiry', parseInt(req.params.id), old.rows[0]?.student_name, 'Raw record deleted');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Resume follow-up for an enquiry
app.put('/api/admin/enquiry/:id/resume-follow-up', adminAuth, async (req, res) => {
  try {
    const old = await pool.query('SELECT student_name FROM enquiries WHERE id = $1', [req.params.id]);
    await pool.query(
      "UPDATE enquiries SET follow_up_status = 'Active' WHERE id = $1",
      [req.params.id]
    );
    const studentName = old.rows.length ? old.rows[0].student_name : 'Unknown';
    logAdminActivity(req.userName, 'Resumed Follow-up', 'enquiry', parseInt(req.params.id), studentName, 'Follow-up resumed to Active status');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// Update full enquiry (Admin only)
app.put('/api/admin/enquiry/:id', adminAuth, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Counsellors cannot edit full enquiry details.' });
  }
  try {
    const id = req.params.id;
    const body = req.body;
    
    const fields = [];
    const values = [];
    let idx = 1;

    const allowedFields = [
      'student_name', 'student_email', 'student_mobile', 'father_name', 'father_mobile',
      'mother_name', 'mother_mobile', 'address_line1', 'address_line2', 'address_city',
      'address_district', 'address_state', 'address_pincode', 'education_qualification',
      'education_board', 'expected_percentage', 'result_status', 'hostel_required',
      'hostel_type', 'hostel_fee', 'transport_required', 'transport_route', 'transport_fee',
      'physics_11', 'chemistry_11', 'math_11a', 'math_11b', 'english_11', 'language_11',
      'physics_marks', 'physics_12_prac', 'chemistry_marks', 'chemistry_12_prac',
      'math_12a', 'math_12b', 'mathematics_marks', 'english_12', 'kannada_12', 'other_12',
      'jee_rank', 'comedk_rank', 'cet_rank', 'reference', 'gender'
    ];

    for (const field of allowedFields) {
      if (body.hasOwnProperty(field)) {
        fields.push(`${field} = $${idx++}`);
        values.push(body[field]);
      }
    }

    if (fields.length === 0) return res.json({ success: true, message: 'No fields to update' });

    values.push(id);
    const query = `UPDATE enquiries SET ${fields.join(', ')} WHERE id = $${idx}`;
    await pool.query(query, values);

    logAdminActivity(req.userName, 'Updated Full Enquiry', 'enquiry', parseInt(id), body.student_name || 'Enquiry', 'Admin updated multiple fields');
    
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
  if (req.userRole === 'counsellor') return res.status(403).json({ error: 'Counsellors cannot delete records' });
  try {
    const old = await pool.query('SELECT student_name FROM enquiries WHERE id = $1', [req.params.id]);
    await pool.query('DELETE FROM enquiries WHERE id = $1', [req.params.id]);
    logAdminActivity(req.userName, 'Deleted Enquiry', 'enquiry', parseInt(req.params.id), old.rows[0]?.student_name, 'Record permanently deleted');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk email to enquiries (supports attachments)
app.post('/api/admin/enquiries/bulk-email', adminAuth, upload.array('attachments'), async (req, res) => {
  try {
    const { subject, message, emails: emailsJson } = req.body;
    if (!emailsJson) return res.status(400).json({ error: 'No recipients provided' });
    
    const emails = JSON.parse(emailsJson);
    if (!emails || !emails.length) return res.status(400).json({ error: 'No valid emails provided' });

    const attachments = (req.files || []).map(f => ({
      filename: f.originalname,
      path: f.path
    }));

    // Use nodemailer transporter
    const mailOptions = {
      from: '"Admission Team" <enquiry.svce@gmail.com>',
      bcc: emails.join(','),
      subject: subject || 'Message from Admission Team, SVCE',
      attachments,
      html: `<div style="font-family: Arial, sans-serif; color: #333; font-size: 14px; line-height: 1.6; max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #1e3a8a; margin: 0;">SVCE Admission Team</h2>
        </div>
        ${message.replace(/\n/g, '<br>')}
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; text-align: center;">
          <p style="margin: 0;">Sri Venkateshwara College of Engineering</p>
          <p style="margin: 4px 0 0;">Vidyanagara Cross, Off International Airport Road, Bengaluru-562157</p>
        </div>
      </div>`
    };

    await transporter.sendMail(mailOptions);

    logAdminActivity(req.userName, 'Sent Bulk Email', 'bulk_email', null, `${emails.length} recipients`, `Subject: "${subject || 'Message from Admission Team'}"`);

    res.json({ success: true, count: emails.length });
  } catch (err) {
    console.error('Bulk email error:', err);
    res.status(500).json({ error: err.message });
  }
});
// All admissions
app.get('/api/admin/admissions', adminAuth, async (req, res) => {
  try {
    const query = `
      SELECT a.*, 
        EXISTS(SELECT 1 FROM management_forms m WHERE m.admission_id = a.id) as has_management
      FROM admissions a 
      ORDER BY a.id DESC
    `;
    const result = await pool.query(query);
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
  if (req.userRole === 'counsellor') return res.status(403).json({ error: 'Counsellors cannot delete records' });
  try {
    const old = await pool.query('SELECT student_name FROM admissions WHERE id = $1', [req.params.id]);
    await pool.query('DELETE FROM admissions WHERE id = $1', [req.params.id]);
    logAdminActivity(req.userName, 'Deleted Admission', 'admission', parseInt(req.params.id), old.rows[0]?.student_name, 'Admission record deleted');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/admissions/:id/enable-edit
app.post('/api/admin/admissions/:id/enable-edit', adminAuth, async (req, res) => {
  try {
    const enabledBy = req.userName || 'Admin';
    const logEntry = {
      enabled_by: enabledBy,
      enabled_at: new Date().toISOString()
    };

    // 1. Update DB
    const result = await pool.query(`
      UPDATE admissions 
      SET edit_enabled = TRUE, 
          edit_enable_log = $1 
      WHERE id = $2 
      RETURNING student_name, email, application_number
    `, [JSON.stringify(logEntry), req.params.id]);

    if (result.rows.length > 0) {
      const student = result.rows[0];
      // 2. Send Automatic Email to Candidate
      const mailOptions = {
        from: `"SVCE Admissions" <${process.env.EMAIL_USER || 'enquiry.svce@gmail.com'}>`,
        to: student.email,
        subject: `Application Edit Enabled - ${student.application_number}`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; padding: 20px;">
            <h2 style="color: #1a365d; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">Application Access Restored</h2>
            <p>Dear <strong>${student.student_name}</strong>,</p>
            <p>Your request to edit your admission application (<strong>${student.application_number}</strong>) has been approved by the Admissions Department.</p>
            <p>You can now visit the admission portal and update your details. Once you re-submit, the form will be locked again for final processing.</p>
            <div style="background: #f0f7ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #1e40af;"><strong>Action Required:</strong> Please complete your edits at your earliest convenience to avoid delays in your admission process.</p>
            </div>
            <p>Best Regards,<br><strong>Admissions Team</strong><br>Sri Venkateshwara College of Engineering (SVCE)</p>
          </div>
        `
      };
      transporter.sendMail(mailOptions).catch(err => console.error('Failed to send edit-enable email:', err));
      logAdminActivity(req.userName, 'Enabled Edit', 'admission', parseInt(req.params.id), student.student_name, `Approved edit request for ${student.application_number}`);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/admissions/:id/reject-edit
app.post('/api/admin/admissions/:id/reject-edit', adminAuth, async (req, res) => {
  try {
    const old = await pool.query('SELECT student_name FROM admissions WHERE id = $1', [req.params.id]);
    await pool.query('UPDATE admissions SET edit_requested = FALSE WHERE id = $1', [req.params.id]);
    logAdminActivity(req.userName, 'Rejected Edit Request', 'admission', parseInt(req.params.id), old.rows[0]?.student_name, 'Edit request cleared/rejected');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Management Forms
app.post('/api/admin/management-form', adminAuth, async (req, res) => {
  if (req.userRole === 'counsellor') {
    return res.status(403).json({ error: 'Forbidden: Counsellors cannot generate management forms' });
  }
  try {
    const v = req.body;
    const updater = req.userName || v.updated_by || 'Admin';
    
    // Check if exists
    const existing = await pool.query('SELECT id, audit_log FROM management_forms WHERE admission_id = $1', [v.admission_id]);
    
    const logEntry = {
      action: existing.rows.length > 0 ? 'UPDATE' : 'CREATE',
      by: updater,
      at: new Date().toISOString(),
      summary: existing.rows.length > 0 ? 'Updated management form details' : 'Created management form'
    };

    if (existing.rows.length > 0) {
      let auditLog = existing.rows[0].audit_log || [];
      if (!Array.isArray(auditLog)) auditLog = [];
      auditLog.push(logEntry);

      // Update
      const query = `
        UPDATE management_forms SET
          app_no = $1, academic_year = $2, form_date = $3, student_name = $4, mobile_no = $5,
          parent_name = $6, parent_mobile = $7, branch = $8, state = $9, email = $10,
          actual_fee = $11, scholarship = $12, booking_fee = $13, net_payable = $14, reference_name = $15,
          pcm_percentage = $16, overall_percentage = $17, cet_rank = $18, comedk_rank = $19, jee_rank = $20, cet_no = $21,
          updated_at = CURRENT_TIMESTAMP, updated_by = $22, contineo_id = $24, remarks = $25,
          audit_log = $26
        WHERE admission_id = $23
        RETURNING id
      `;
      const result = await pool.query(query, [
        v.app_no, v.academic_year, v.form_date, v.student_name, v.mobile_no,
        v.parent_name, v.parent_mobile, v.branch, v.state, v.email,
        v.actual_fee, v.scholarship, v.booking_fee, v.net_payable, v.reference_name,
        v.pcm_percentage, v.overall_percentage, v.cet_rank, v.comedk_rank, v.jee_rank, v.cet_no,
        updater, v.admission_id, v.contineo_id, v.remarks, JSON.stringify(auditLog)
      ]);
      logAdminActivity(updater, 'Updated Management Form', 'management', result.rows[0].id, v.student_name, `Branch: ${v.branch || '-'}, Fee: ${v.net_payable || '-'}`);
      res.json({ success: true, id: result.rows[0].id, type: 'update' });
    } else {
      const auditLog = [logEntry];
      // Insert
      const query = `
        INSERT INTO management_forms (
          admission_id, app_no, academic_year, form_date, student_name, mobile_no,
          parent_name, parent_mobile, branch, state, email,
          actual_fee, scholarship, booking_fee, net_payable, reference_name,
          pcm_percentage, overall_percentage, cet_rank, comedk_rank, jee_rank, cet_no,
          updated_by, contineo_id, remarks, audit_log
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        RETURNING id
      `;
      const result = await pool.query(query, [
        v.admission_id, v.app_no, v.academic_year, v.form_date, v.student_name, v.mobile_no,
        v.parent_name, v.parent_mobile, v.branch, v.state, v.email,
        v.actual_fee, v.scholarship, v.booking_fee, v.net_payable, v.reference_name,
        v.pcm_percentage, v.overall_percentage, v.cet_rank, v.comedk_rank, v.jee_rank, v.cet_no,
        updater, v.contineo_id, v.remarks, JSON.stringify(auditLog)
      ]);
      logAdminActivity(updater, 'Created Management Form', 'management', result.rows[0].id, v.student_name, `Branch: ${v.branch || '-'}, App: ${v.app_no || '-'}`);
      res.json({ success: true, id: result.rows[0].id, type: 'insert' });
    }

    // ── Send Animated Confirmation Email ──
    if (v.email) {
      setImmediate(async () => {
        try {
          await transporter.sendMail({
            from: '"SVCE Admissions" <enquiry.svce@gmail.com>',
            to: v.email,
            subject: '🎉 Congratulations! Provisional Admission Saved – SVCE Bengaluru',
            html: `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      @keyframes bounce { 0%, 20%, 50%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-15px); } 60% { transform: translateY(-7px); } }
      @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); } 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); } }
      @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  </head>
  <body style="margin:0;padding:20px;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1);">
      
      <!-- Header Banner -->
      <div style="background:linear-gradient(135deg, #1e3a8a, #3b82f6);padding:40px 20px;text-align:center;">
        <div style="font-size:48px;animation: bounce 2s infinite;display:inline-block;margin-bottom:10px;">🎉</div>
        <h1 style="color:#ffffff;margin:0;font-size:26px;letter-spacing:0.5px;text-shadow:0 2px 4px rgba(0,0,0,0.2);">Congratulations, ${v.student_name}!</h1>
      </div>

      <!-- Body Content -->
      <div style="padding:40px 32px;text-align:center;animation: slideUp 1s ease-out;">
        <h2 style="color:#334155;font-size:20px;font-weight:600;margin-top:0;">You have successfully filled the</h2>
        
        <!-- Animated Badge -->
        <div style="display:inline-block;background:#ecfdf5;border:2px solid #10b981;color:#059669;padding:12px 24px;border-radius:30px;font-weight:700;font-size:18px;margin:20px 0;animation: pulse 2s infinite;">
          ✨ Provisional Admission Form ✨
        </div>
        
        <p style="color:#475569;font-size:18px;margin:0 0 30px;">of <strong>SVCE Bengaluru</strong>.</p>
        
        <!-- Detail Box -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;text-align:left;margin-bottom:30px;">
          <p style="margin:0 0 10px;color:#334155;"><strong>Branch Selected:</strong> <span style="color:#1e3a8a;">${v.branch || 'N/A'}</span></p>
          <p style="margin:0 0 10px;color:#334155;"><strong>Application No:</strong> <span style="color:#1e3a8a;">${v.app_no || 'N/A'}</span></p>
          <p style="margin:0;color:#334155;"><strong>Academic Year:</strong> <span style="color:#1e3a8a;">${v.academic_year || 'N/A'}</span></p>
        </div>

        <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0;">We are thrilled to welcome you to our community. Our administration team will process your details shortly.</p>
        
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:30px 0;">
        
        <div style="font-size:12px;color:#94a3b8;">
          <p style="margin:0;">Sri Venkateshwara College of Engineering</p>
          <p style="margin:4px 0 0;">Vidyanagara Cross, Off International Airport Road, Bengaluru-562157</p>
          <p style="margin:4px 0 0;">Email: enquiry.svce@gmail.com | Web: www.svcengg.edu.in</p>
        </div>
      </div>
    </div>
  </body>
  </html>`
          });
          console.log('[Management-BG] Success email sent to', v.email);
        } catch (err) {
          console.error('[Management-BG] Email error:', err);
        }
      });
    }

  } catch (err) { res.status(500).json({ error: err.message }); }
});


// GET admin activity log (global admin actions history)
app.get('/api/admin/activity-log', adminAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const result = await pool.query(
      'SELECT * FROM admin_activity_log ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    res.json({ rows: result.rows });
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

// GET Audit Log for Admission/Management
app.get('/api/admin/admissions/audit-log/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const type = req.query.type || 'admission'; // 'admission' or 'management'

    if (type === 'management') {
        const result = await pool.query('SELECT audit_log FROM management_forms WHERE id = $1', [id]);
        if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
        return res.json({ audit_log: result.rows[0].audit_log || [] });
    } else {
        const result = await pool.query('SELECT edit_request_log, edit_enable_log, is_resubmitted, submitted_at FROM admissions WHERE id = $1', [id]);
        if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
        const r = result.rows[0];
        
        const logs = [];
        if (r.edit_request_log) {
            logs.push({ 
                action: 'REQUEST', 
                by: 'Candidate', 
                at: r.edit_request_log.requested_at, 
                summary: 'Edit requested by candidate',
                client_ip: r.edit_request_log.client_ip
            });
        }
        if (r.edit_enable_log) {
            logs.push({ 
                action: 'ENABLE', 
                by: r.edit_enable_log.enabled_by, 
                at: r.edit_enable_log.enabled_at, 
                summary: 'Admin approved edit request'
            });
        }
        if (r.is_resubmitted) {
            logs.push({ 
                action: 'RESUBMIT', 
                by: 'Candidate', 
                at: r.submitted_at, 
                summary: 'Candidate resubmitted the form'
            });
        }
        return res.json({ audit_log: logs });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/management-form/:id', adminAuth, async (req, res) => {
  if (req.userRole === 'counsellor') return res.status(403).json({ error: 'Counsellors cannot delete records' });
  try {
    const old = await pool.query('SELECT student_name, app_no FROM management_forms WHERE id = $1', [req.params.id]);
    await pool.query('DELETE FROM management_forms WHERE id = $1', [req.params.id]);
    const studentName = old.rows[0]?.student_name || 'Unknown';
    const appNo = old.rows[0]?.app_no || '-';
    logAdminActivity(req.userName, 'Deleted Management Form', 'management', parseInt(req.params.id), studentName, `App No: ${appNo}`);
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
    
    // Deduplicate preferences
    const seenPrefs1 = new Set();
    prefsArray = prefsArray.filter(p => {
        let c = typeof p === 'object' ? p.course : p;
        if (!c) return false;
        c = String(c).trim();
        if (seenPrefs1.has(c)) return false;
        seenPrefs1.add(c);
        return true;
    });

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
        ${i === 0 ? `<td rowspan="${prefsArray.length}" style="background:#fff; border: 1px solid #64748b;"></td>` : ''}
      </tr>`;
    }).join('') || '<tr><td colspan="4">No preferences selected</td></tr>';

    // Section visibility — only show sections where at least one field has data
    const hasVal = (v) => v !== null && v !== undefined && v !== '';
    const has11th = [r.physics_11, r.chemistry_11, r.math_11a, r.math_11b, r.english_11, r.language_11].some(hasVal);
    const has12th = [r.physics_marks, r.physics_12_prac, r.chemistry_marks, r.chemistry_12_prac, r.math_12a, r.math_12b].some(hasVal);
    const hasOptional = [r.kannada_12, r.english_12, r.other_12].some(hasVal);
    const hasPercentage = [r.total_percentage, r.pcm_percentage].some(hasVal);
    const hasEntrance = [r.jee_rank, r.comedk_rank, r.cet_rank].some(hasVal);

    // Dynamic column arrays — only columns with actual data
    const mkTable = (title, cols) => cols.length === 0 ? '' : `<table>
      <tr class="sub-section-header"><th colspan="${cols.length}">${title}</th></tr>
      <tr style="background:#f8fafc;font-weight:600;">${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>
      <tr>${cols.map(c => `<td>${c.val}</td>`).join('')}</tr>
    </table>`;

    const table11 = mkTable('11th Standard Details', [
      { label: 'Physics (Theory)', val: val(r.physics_11) },
      { label: 'Chemistry (Theory)', val: val(r.chemistry_11) },
      { label: 'Mathematics (A)', val: val(r.math_11a) },
      { label: 'Mathematics (B)', val: val(r.math_11b) },
      { label: 'English', val: val(r.english_11) },
      { label: 'Language', val: val(r.language_11) },
    ].filter(c => c.val !== 'N/A'));

    const table12 = mkTable('12th Standard Details', [
      { label: 'Physics (Theory)', val: val(r.physics_marks) },
      { label: 'Physics (Practical)', val: val(r.physics_12_prac) },
      { label: 'Chemistry (Theory)', val: val(r.chemistry_marks) },
      { label: 'Chemistry (Practical)', val: val(r.chemistry_12_prac) },
      { label: 'Mathematics', val: val(r.mathematics_marks) },
      { label: 'Mathematics (A)', val: val(r.math_12a) },
      { label: 'Mathematics (B)', val: val(r.math_12b) },
      { label: 'Computer Science', val: val(r.cs_marks) },
      { label: 'Biology', val: val(r.bio_marks) },
      { label: 'Electronics', val: val(r.ece_marks) },
    ].filter(c => c.val !== 'N/A'));

    const tableOpt = mkTable('Kannada, English, Other Subjects (Optional)', [
      { label: 'Kannada/Telugu/Sanskrit', val: val(r.kannada_12) },
      { label: 'English', val: val(r.english_12) },
      { label: 'Other Subject Marks', val: val(r.other_12) },
    ].filter(c => c.val !== 'N/A'));

    // Determine which third subject contributes to PCM% (Physics + Math are fixed, pick highest of the rest)
    const thirdSubjectCandidates = [
      { abbr: 'C',   val: parseFloat(r.chemistry_marks) || 0 },
      { abbr: 'CS',  val: parseFloat(r.cs_marks) || 0 },
      { abbr: 'ECE', val: parseFloat(r.ece_marks) || 0 },
    ].filter(s => s.val > 0).sort((a, b) => b.val - a.val);
    const pmLabel = thirdSubjectCandidates.length > 0
      ? `PM+${thirdSubjectCandidates[0].abbr} Percentage`
      : 'PCM Percentage';

    const tablePct = mkTable('Percentage Details', [
      { label: 'Total Percentage', val: r.total_percentage ? val(r.total_percentage) + '%' : null },
      { label: pmLabel, val: r.pcm_percentage ? val(r.pcm_percentage) + '%' : null },
    ].filter(c => c.val));

    const tableEntrance = mkTable('Entrance Exam Detail', [
      { label: 'JEE Rank', val: val(r.jee_rank) },
      { label: 'COMEDK Rank', val: val(r.comedk_rank) },
      { label: 'CET Rank', val: val(r.cet_rank) },
    ].filter(c => c.val !== 'N/A'));

    const html = `      <!DOCTYPE html>
      <html>
      <head>
        <title>Enquiry Form - ${r.student_name}</title>
        <style>
          @page { size: A4; margin: 8mm 14mm 8mm 8mm; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #333; font-size: 9.8px; line-height: 1.22; width: 100%; }
          
          .top-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3px; width: 100%; }
          .qr-box { text-align: center; }
          .qr-box img { width: 80px; height: 80px; }
          .qr-box p { margin: 1px 0 0; font-size: 6.5px; color: #555; font-weight: 600; }
          .meta-right-block { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; padding-top: 5px; }
          .token-val { font-weight: 700; font-size: 12px; border-bottom: 1px solid #000; padding-bottom: 1px; }
          .date-box { border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 8px; font-weight: 600; font-size: 11px; }
          .created-at { font-size: 7.5px; color: #888; margin-top: 1px; }
          .logo-banner { height: 45px; margin-bottom: 2px; }
 
          table { width: 100%; border-collapse: collapse; margin-bottom: 4px; table-layout: fixed; }
          th, td { border: 1px solid #64748b; padding: 3px 5px; text-align: left; word-wrap: break-word; }
          .section-header { background: #f8fafc; color: #1e40af; font-weight: 700; font-size: 10.5px; }
          .label { font-weight: 500; width: 18%; background: #f8fafc; }
          .value { font-weight: 500; width: 32%; }
          .sub-section-header { background: #f8fafc; color: #1e40af; font-weight: 700; font-size: 10px; }
          
          .pref-table td { border-top: none; border-bottom: 1px solid #64748b; }
          .pref-num { width: 25px; text-align: center; }

          .office-section { margin-top: 5px; }
          .office-title { background: #f8fafc; color: #1e40af; font-weight: 700; font-size: 10px; padding: 4px 8px; border: 1px solid #64748b; border-bottom: none; width: 100%; }
          .office-box { border: 1px solid #64748b; min-height: 210px; width: 100%; }

          @media print {
            .no-print { display: none; }
            body { -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>

        <div class="top-bar">
          <div class="qr-box">
            <a href="${formUrl}" target="_blank" style="text-decoration:none;">
              <img src="${qrDataUrl}" alt="Admission QR" style="width:80px;height:80px;">
            </a>
            <p>Click or Scan for Application Form</p>
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

        ${table11}

        ${table12}

        ${tableOpt}

        ${tablePct}

        ${tableEntrance}

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
          ${prefsRows}
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

        <table class="office-section">
          <tr><th class="office-title" style="border-bottom:none">For Office Work</th></tr>
          <tr><td class="office-box" style="min-height:210px; height:210px"></td></tr>
        </table>

        <div style="display:flex; justify-content:space-between; margin-top:40px; font-weight:700; font-size:10px;">
          <div style="text-align:center; width:30%; border-top:1px solid #000; padding-top:5px;">Student Signature</div>
          <div style="text-align:center; width:30%; border-top:1px solid #000; padding-top:5px;">Parent/Guardian Signature</div>
          <div style="text-align:center; width:30%; border-top:1px solid #000; padding-top:5px;">Admission Head Signature</div>
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
    
    // Deduplicate preferences
    const seenPrefs2 = new Set();
    prefs = prefs.filter(p => {
        let c = typeof p === 'object' ? p.course : p;
        if (!c) return false;
        c = String(c).trim();
        if (seenPrefs2.has(c)) return false;
        seenPrefs2.add(c);
        return true;
    });

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

// Candidate-facing PUBLIC PDF route (no admin auth)
app.get('/api/admissions/:id/pdf', async (req, res) => {
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

    let prefs = [];
    try {
      prefs = typeof r.course_preferences === 'string' ? JSON.parse(r.course_preferences || '[]') : (r.course_preferences || []);
    } catch { prefs = []; }
    
    const pdfData = { ...r, _top_prefs: prefs.slice(0, 4), _admin_remarks: r.admin_remarks || '' };
    const pdfBuffer = await generateAdmissionPdf(pdfData);

    const safeName = (r.application_number || 'admission').replace(/\//g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="SVCE_${safeName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});



// GET /api/admin/admission/:id/print  — returns a printable HTML application form
app.get('/api/admin/admission/:id/print', adminAuthQuery, async (req, res) => {
  try {
    const query = `
      SELECT a.*, 
             e.course_preferences, e.admin_remarks,
             e.physics_marks, e.chemistry_marks, e.mathematics_marks, e.cs_marks, e.bio_marks, e.ece_marks,
             e.pcm_percentage as enq_pcm_percentage
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
    const photoUrl = fileToDataUrl(r.passport_photo_path);
    const signUrl  = fileToDataUrl(r.signature_path);

    // Calculate PM + Max(Third Subject) for the label/value
    const subjects = [
      { abbr: 'C',   val: parseFloat(r.chemistry_marks) || 0 },
      { abbr: 'CS',  val: parseFloat(r.cs_marks) || 0 },
      { abbr: 'ECE', val: parseFloat(r.ece_marks) || 0 },
    ].filter(s => s.val > 0).sort((a, b) => b.val - a.val);
    
    const pmXLabel = subjects.length > 0 ? `PM+${subjects[0].abbr} %` : 'PCM %';
    const pmXValue = r.enq_pcm_percentage || r.twelfth_percentage || '—';


    let prefsArray = [];
    if (typeof r.course_preferences === 'string') {
        try { prefsArray = JSON.parse(r.course_preferences || '[]'); } catch { prefsArray = []; }
    } else {
        prefsArray = r.course_preferences || [];
    }
    
    // Deduplicate preferences
    const seenPrefs3 = new Set();
    prefsArray = (Array.isArray(prefsArray) ? prefsArray : []).filter(p => {
        let c = typeof p === 'object' ? p.course : p;
        if (!c) return false;
        c = String(c).trim();
        if (seenPrefs3.has(c)) return false;
        seenPrefs3.add(c);
        return true;
    });
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
          @page { size: A4; margin: 4mm 6mm; }
          body { font-family: 'Segoe UI', Arial, sans-serif; -webkit-print-color-adjust: exact; margin: 0; padding: 0; font-size: 9.2px; line-height: 1.15; color: #111; }
          
          .header { text-align: center; margin-bottom: 8px; border-bottom: 2px solid #1e3a8a; padding-bottom: 5px; }
          .logo-img { height: 75px; width: auto; object-fit: contain; }
          
          .header-meta-area { display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
          .photo-box { border: 1.2px solid #111; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff; z-index: 10; }
          .photo-box img { width: 100%; height: 100%; object-fit: cover; }
          
          .app-meta { text-align: center; }
          .app-meta p { margin: 2px 0; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #555; }
          
          table { width: 100%; border-collapse: collapse; margin-bottom: 5px; border: 1px solid #111; table-layout: fixed; }
          th, td { border: 1px solid #111; padding: 2px 4px; text-align: left; word-wrap: break-word; }
          .section-header { background: #bae6fd !important; font-weight: 800; font-size: 9px; text-transform: uppercase; color: #000; letter-spacing: 0.5px; font-family: sans-serif; }
          .label { font-weight: 600; background: #f8fafc; color: #475569; font-size: 8.5px; width: 35%; }
          .value { font-weight: 800; color: #000; font-size: 9px; }
          
          .grid-head { background: #f8fafc; font-weight: 700; font-size: 9px; text-transform: uppercase; color: #64748b; }
          .declaration { font-size: 8.5px; text-align: justify; padding: 5px 10px; line-height: 1.3; color: #222; }
          
          .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; }
          .sign-area { text-align: center; width: 140px; }
          .sign-placeholder { height: 48px; margin-bottom: 4px; display: flex; align-items: flex-end; justify-content: center; border-bottom: 1.2px solid #000; }
          .signature-img { max-height: 45px; width: 100%; object-fit: contain; }
          .sign-label { font-weight: 810; font-size: 8.5px; padding-top: 3px; display: block; text-transform: uppercase; letter-spacing: 0.5px; border-top:none; }
          
          /* ───── NEW OFFICIAL HEADER ───── */
          .official-header { display: flex; align-items: stretch; margin-bottom: 8px; border-bottom: 2px solid #000; width: 100%; border-top: 1px solid #000; }
          
          .header-left-wrap {
            background: #000;
            clip-path: polygon(0 0, 100% 0, 92% 100%, 0% 100%);
            flex: 1.4;
            padding-right: 3px;
          }
          
          .header-left { 
            background: #cbd5e1;
            padding: 10px 30px 10px 15px; 
            display: flex; 
            align-items: center; 
            gap: 15px; 
            height: 100%;
            clip-path: polygon(0 0, 100% 0, 92% 100%, 0% 100%); 
          }
          .header-left img { height: 50px; width: auto; object-fit: contain; }
          .college-info { line-height: 1.15; padding: 4px 0; }
          .college-name { font-size: 24px; font-weight: 800; color: #1e293b; letter-spacing: -0.5px; }
          .college-name span { font-weight: 400; font-size: 14px; margin-left: 10px; border-left: 2px solid #94a3b8; padding-left: 10px; display: inline-block; vertical-align: middle; }
          .sub-name { font-size: 11px; font-weight: 800; color: #334155; display: block; margin-bottom: 4px; text-transform: uppercase; }
          .estd { font-size: 9px; font-weight: 700; color: #64748b; letter-spacing: 1.5px; margin-top: 5px; text-transform: uppercase; }

          .header-right { 
            flex: 1; 
            padding: 6px 0 6px 12px; 
            font-size: 8.5px; 
            font-weight: 600; 
            color: #334155; 
            display: flex; 
            flex-direction: column; 
            justify-content: center; 
          }
          .contact-table { width: 100% !important; border: none !important; margin: 0 !important; }
          .contact-table td { border: none !important; padding: 1px 0 !important; height: auto !important; font-size: 8.5px !important; }
          .contact-label { width: 45px; font-weight: 700; color: #64748b; }
          .contact-sep { width: 8px; text-align: center; }

          .app-meta-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
          .meta-left-block { display: flex; flex-direction: column; gap: 3px; font-weight: 700; font-size: 10.5px; }

          /* ─────────────────────────────── */

          @media print { 
            .no-print { display: none; } 
            table, tr { page-break-inside: avoid; }
            body { print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="official-header">
          <div class="header-left-wrap">
            <div class="header-left">
              <img src="/image copy 2.png" alt="SVCE Logo">
              <div class="college-info">
                <div style="display:flex; align-items:center; gap:12px;">
                  <div style="font-size: 38px; font-weight: 900; color: #0f172a; line-height: 1;">SVCE</div>
                  <div style="width:2.5px; height:35px; background:#475569;"></div>
                  <div style="line-height: 1.1;">
                    <div style="font-size: 13.5px; font-weight: 800; color: #1e293b; white-space: nowrap;">SRI VENKATESHWARA</div>
                    <div style="font-size: 13.5px; font-weight: 800; color: #1e293b; white-space: nowrap;">COLLEGE OF ENGINEERING</div>
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

        <div class="app-meta-bar">
          <div class="meta-left-block">
            <div style="font-size: 11px;">App No.: <span style="font-weight: 800;">${r.application_number || '—'}</span></div>
            <div>Date: <span style="font-weight: 800;">${formatDate(r.application_date)}</span></div>
            <div style="font-size: 8px; color: #64748b;">Created At: ${r.application_date || r.created_at ? new Date(r.application_date || r.created_at).toLocaleString('en-IN') : '—'}</div>
          </div>
          
          <div class="photo-box" style="width: 65px; height: 85px; border: 1.5px solid #111; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff;">
            ${photoUrl ? `<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;">` : '<div style="font-size:10px; color:#999; text-align:center;">AFFIX<br>STUDENT<br>PHOTO</div>'}
          </div>
        </div>

        <div style="text-align: center; margin: -10px 0 8px; border-bottom: 2px solid #1e3a5f; padding-bottom: 4px;">
           <div style="font-weight: 800; font-size: 13px; color: #1e3a5f; letter-spacing: 0.5px; text-transform: uppercase;">ADMISSION APPLICATION FORM</div>
           <div style="font-size: 10px; font-weight: 700; color: #3b82f6;">Academic Year: ${new Date().getFullYear()}-${new Date().getFullYear() + 1}</div>
        </div>

        <table>
          <tr class="section-header"><th colspan="4">Personal Details</th></tr>
          <tr>
            <td class="label" style="width:16%">Name</td><td class="value" style="width:34%">${r.title || ''} ${r.student_name}</td>
            <td class="label" style="width:16%">Father's Name</td><td class="value" style="width:34%">${r.father_name || '—'}</td>
          </tr>
          <tr>
            <td class="label">Mobile No.</td><td class="value">${r.mobile_no}</td>
            <td class="label">Father's Mobile</td><td class="value">${r.father_mobile || '—'}</td>
          </tr>
          <tr>
            <td class="label">Email Address</td><td class="value">${r.email}</td>
            <td class="label">Mother's Name</td><td class="value">${r.mother_name || '—'}</td>
          </tr>
          <tr>
            <td class="label">Date of Birth</td><td class="value">${formatDate(r.date_of_birth)}</td>
            <td class="label">Mother's Mobile</td><td class="value">${r.mother_mobile || '—'}</td>
          </tr>
          <tr>
            <td class="label">Gender</td><td class="value">${r.gender}</td>
            <td class="label">Father's Occupation</td><td class="value">${r.father_occupation || '—'}</td>
          </tr>
          <tr>
            <td class="label">Aadhaar Number</td><td class="value">${r.aadhaar_no || '—'}</td>
            <td class="label">Mother's Occupation</td><td class="value">${r.mother_occupation || '—'}</td>
          </tr>
        </table>
        <table>
          <tr class="section-header"><th colspan="${prefsArray.filter(p => (typeof p === 'object' ? p.course : p)).length * 2}">COURSE PREFERENCE DETAILS</th></tr>
          <tr>
            ${prefsArray.map((p, i) => {
              const name = typeof p === 'object' ? (p.course || '') : (p || '');
              if (!name) return '';
              return `
                <td style="width:20px; text-align:center; font-weight:700; background:#f8fafc;">${i + 1}.</td>
                <td class="value" style="font-size:9px;">${name}</td>
              `;
            }).join('')}
          </tr>
        </table>
        <table>
          <tr class="section-header"><th colspan="3">Address Details</th></tr>
          <tr><td colspan="3" style="font-size: 8.5px; font-weight: 600; background: #f8fafc; padding: 2px 8px;">Permanent Address Same as Communication Address: <span style="font-weight: 800; color: #1e40af;">${r.same_as_comm ? 'Yes' : 'No'}</span></td></tr>
          <tr class="grid-head"><th style="width: 26%;">Field</th><th style="width: 37%;">Communication Address</th><th style="width: 37%;">Permanent Address</th></tr>
          <tr><td class="label">Address Line 1</td><td class="value">${r.comm_address_line1}</td><td class="value">${r.perm_address_line1 || r.comm_address_line1}</td></tr>
          <tr><td class="label">Address Line 2</td><td class="value">${r.comm_address_line2 || '—'}</td><td class="value">${r.perm_address_line2 || r.comm_address_line2 || '—'}</td></tr>
          <tr><td class="label">City / District</td><td class="value">${r.comm_city} / ${r.comm_district || '—'}</td><td class="value">${r.perm_city || r.comm_city} / ${r.perm_district || r.comm_district || '—'}</td></tr>
          <tr><td class="label">State / Pincode</td><td class="value">${r.comm_state} - ${r.comm_pincode}</td><td class="value">${r.perm_state || r.comm_state} - ${r.perm_pincode || r.comm_pincode}</td></tr>
        </table>

        <table>
          <tr class="section-header"><th colspan="2">Educational Details</th></tr>
          <tr><td colspan="2" class="label" style="width:100%; background:#f8fafc; font-weight:700;">Qualifying Marksheet Name: <span style="font-weight:800; color:#000;">${r.candidate_name_marksheet}</span></td></tr>
          <tr class="grid-head"><th>Details</th><th>12th Standard</th></tr>
          <tr><td class="label">Institution</td><td class="value">${r.twelfth_institution}</td></tr>
          <tr><td class="label">Board / University</td><td class="value">${r.twelfth_board}</td></tr>
          <tr><td class="label">Year / Result Status</td><td class="value">${r.twelfth_year_passing} / ${r.twelfth_result_status || '—'}</td></tr>
          <tr><td class="label">Obtained Percentage / CGPA</td><td class="value">${r.twelfth_percentage || '—'}%</td></tr>
          <tr><td class="label">${pmXLabel}</td><td class="value">${pmXValue}${pmXValue !== '—' ? '%' : ''}</td></tr>
          <tr><td class="label">Entrance Examination(s)</td><td class="value">${r.entrance_exams || 'None / Not Applicable'}</td></tr>
          <tr><td class="label">UTR / Transaction Ref No</td><td class="value" style="font-weight: 800; color: #1e40af;">${r.payment_utr_no || '—'}</td></tr>
        </table>

        </table>

        <div style="page-break-inside: avoid;">
          <table>
            <tr class="section-header"><th>Declaration</th></tr>
            <tr>
              <td class="declaration">
                <ul style="margin: 0; padding-left: 1.2rem; line-height: 1.25; font-size: 9.4px;">
                  <li style="margin-bottom: 3px;">I hereby declare that all the information provided by me in this application form is true, complete, and correct to the best of my knowledge and belief. I understand that if any information furnished by me is found to be false, incorrect, incomplete, or misleading at any stage, my application is liable to be rejected or cancelled without prior notice.</li>
                  <li style="margin-bottom: 3px;">I further confirm that I have carefully read and understood all the instructions, eligibility criteria, and details mentioned in the admission notification for the respective program. I agree to abide by all the rules and regulations of the College (SVCE), as applicable from time to time.</li>
                  <li style="margin-bottom: 3px;">I hereby authorize the College (SVCE) to use, process, store, or share the information provided by me for application processing, academic records, and compliance with statutory or regulatory authorities.</li>
                  <li style="margin-bottom: 3px;">I understand that submission of this application does not guarantee admission, and the allotment of the selected/preferred course is strictly subject to the availability of seats and fulfillment of eligibility criteria.</li>
                  <li style="margin-bottom: 3px;">I understand that this application is valid only for a limited period and is subject to seat availability at the time of admission.</li>
                  <li>I also understand that in case I have not appeared for any entrance examination such as CET / COMEDK / JEE or equivalent, my admission (if selected) shall be subject to approval from the concerned authorities such as DTE / VTU or any other regulatory body, as applicable.</li>
                </ul>
              </td>
            </tr>
          </table>

          <div class="footer" style="margin-top: 6px;">
            <div class="footer-info">
              <p style="font-weight:900; font-size:12px; color:#1e3a8a; margin:2px 0;">${r.student_name.toUpperCase()}</p>
              <p style="color:#64748b; margin:0;">Generated On: ${new Date().toLocaleString('en-IN')}</p>
              <p style="color:#64748b; font-size:8.5px; margin:0;">ID: ${r.id} | Timestamp: ${new Date(r.application_date).toLocaleString('en-IN')}</p>
            </div>
            <div style="display:flex; justify-content: space-between; width: 75%; gap: 10px;">
              <div class="sign-area" style="width: 90px;">
                <div class="sign-placeholder" style="height: 35px; border-bottom: 1px solid #000;"></div>
                <span class="sign-label" style="font-size: 8px;">Offline Signature</span>
              </div>
              <div class="sign-area" style="width: 90px;">
                <div class="sign-placeholder" style="height: 35px; border-bottom: 1px solid #000;">
                  ${signUrl ? `<img src="${signUrl}" class="signature-img" style="max-height: 35px;">` : ''}
                </div>
                <span class="sign-label" style="font-size: 8px;">Online Signature</span>
              </div>
              <div class="sign-area" style="width: 90px;">
                <div class="sign-placeholder" style="height: 35px; border-bottom: 1px solid #000;"></div>
                <span class="sign-label" style="font-size: 8px;">Parent Signature</span>
              </div>
              <div class="sign-area" style="width: 100px;">
                <div class="sign-placeholder" style="height: 35px; border-bottom: 1px solid #000;"></div>
                <span class="sign-label" style="font-size: 8px;">Admission Head Signature</span>
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
