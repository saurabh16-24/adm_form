
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function list() {
  try {
    await client.connect();
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('Tables:', res.rows.map(r => r.table_name));
    
    const rawCount = await client.query("SELECT COUNT(*) FROM raw_enquiries");
    console.log('Raw Enquiry Count:', rawCount.rows[0].count);
    
    const rawData = await client.query("SELECT * FROM raw_enquiries");
    console.log('Raw Enquiry Data:', rawData.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

list();
