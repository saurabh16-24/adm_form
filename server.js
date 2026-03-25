require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

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

// Endpoint to Submit Form
app.post('/api/submit-enquiry', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const d = req.body;

    // We store the array of preferences as a JSON string or let Postgres handle it if the column is an Array text[]
    const preferences_json = JSON.stringify(d.course_preferences);

    const query = `
      INSERT INTO enquiries (
        token_number, enquiry_date, student_name, father_name, mother_name,
        student_email, student_mobile, father_mobile, mother_mobile, address,
        reference, education_qualification, education_board, physics_marks,
        chemistry_marks, mathematics_marks, cs_marks, bio_marks, ece_marks,
        total_percentage, pcm_percentage, jee_rank, comedk_rank, cet_rank,
        course_preferences, diploma_percentage, dcet_rank
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27
      ) RETURNING id;
    `;

    const values = [
      d.token_number, d.enquiry_date, d.student_name, d.father_name, d.mother_name,
      d.student_email, d.student_mobile, d.father_mobile, d.mother_mobile, d.address,
      d.reference, d.education_qualification, d.education_board, 
      d.physics_marks || null, d.chemistry_marks || null, d.mathematics_marks || null, 
      d.cs_marks || null, d.bio_marks || null, d.ece_marks || null,
      d.total_percentage || null, d.pcm_percentage || null, 
      d.jee_rank || null, d.comedk_rank || null, d.cet_rank || null,
      preferences_json, d.diploma_percentage || null, d.dcet_rank || null
    ];

    const result = await client.query(query, values);
    await client.query('COMMIT');
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Open http://localhost:${port} to see the form.`);
});
