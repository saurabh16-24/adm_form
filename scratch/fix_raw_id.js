
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function migrate() {
  try {
    await client.connect();
    console.log('Connected to DB');
    
    // Ensure raw_enquiries exists
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
    console.log('Table raw_enquiries ensured');

    // Add raw_id to enquiries
    await client.query(`
      ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS raw_id INTEGER REFERENCES raw_enquiries(id) ON DELETE SET NULL;
    `);
    console.log('Column raw_id added to enquiries (if not existed)');

  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await client.end();
  }
}

migrate();
