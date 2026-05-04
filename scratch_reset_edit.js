
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://svce_user:svce_pass@localhost:5432/admissions_db'
});

async function reset() {
  try {
    const res = await pool.query("UPDATE admissions SET edit_requested = FALSE, edit_enabled = FALSE WHERE id IN (24, 22)");
    console.log(`Successfully reset ${res.rowCount} records.`);
    process.exit(0);
  } catch (err) {
    console.error('Error resetting records:', err.message);
    process.exit(1);
  }
}

reset();
