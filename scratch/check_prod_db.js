
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.production' });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function check() {
  try {
    const raw = await pool.query('SELECT id, student_name FROM raw_enquiries');
    console.log('Raw Enquiries:', raw.rows);
    const enq = await pool.query('SELECT id, student_name, raw_id FROM enquiries WHERE raw_id IS NOT NULL');
    console.log('Converted Enquiries:', enq.rows);
    const allEnq = await pool.query('SELECT id, student_name, raw_id FROM enquiries ORDER BY id DESC LIMIT 5');
    console.log('All Recent Enquiries:', allEnq.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
