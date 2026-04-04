require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'svce_admissions',
  password: process.env.DB_PASSWORD || 'admin123',
  port: process.env.DB_PORT || 5432,
});

async function seed() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf-8');
    await pool.query(sql);
    console.log('✅ init.sql executed — sample enquiries inserted!');

    // Count records
    const enq = await pool.query('SELECT COUNT(*) AS c FROM enquiries');
    console.log(`   Enquiries in DB: ${enq.rows[0].c}`);

    const adm = await pool.query("SELECT COUNT(*) AS c FROM admissions");
    console.log(`   Admissions in DB: ${adm.rows[0].c}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

seed();
