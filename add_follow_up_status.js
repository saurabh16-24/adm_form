const { Pool } = require('pg');
require('dotenv').config({ path: './.env.production' });

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'svce_admissions',
  password: 'admin123',
  port: 5433,
});

async function migrate() {
  try {
    console.log('Adding follow_up_status column to enquiries table...');
    await pool.query("ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS follow_up_status VARCHAR(20) DEFAULT 'Active'");
    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
