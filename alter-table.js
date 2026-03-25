require('dotenv').config();
const { Client } = require('pg');

async function alterTable() {
  const dbConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || '127.0.0.1',
    database: process.env.DB_NAME || 'svce_admissions',
    password: process.env.DB_PASSWORD || 'admin123',
    port: process.env.DB_PORT || 5433,
  };

  const dbClient = new Client(dbConfig);
  try {
    await dbClient.connect();
    
    // Alter all mobile fields to be completely safe from formatting/length issues
    const query = `
      ALTER TABLE enquiries 
      ALTER COLUMN student_mobile TYPE VARCHAR(50),
      ALTER COLUMN father_mobile TYPE VARCHAR(50),
      ALTER COLUMN mother_mobile TYPE VARCHAR(50),
      ALTER COLUMN token_number TYPE VARCHAR(100);
    `;
    
    await dbClient.query(query);
    console.log("Successfully increased the column sizes in Postgres!");
  } catch (error) {
    console.error("Error altering table:", error.message);
  } finally {
    await dbClient.end();
  }
}

alterTable();
