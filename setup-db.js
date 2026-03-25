require('dotenv').config();
const { Client } = require('pg');

async function setup() {
  const adminConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres',
    password: process.env.DB_PASSWORD || 'admin123',
    port: process.env.DB_PORT || 5432,
  };

  const dbConfig = { ...adminConfig, database: process.env.DB_NAME || 'svce_admissions' };

  console.log("Connecting to default postgres database to create logical database...");
  const adminClient = new Client(adminConfig);
  try {
    await adminClient.connect();
    
    // Check if the database exists
    const res = await adminClient.query(`SELECT 1 FROM pg_database WHERE datname='svce_admissions'`);
    if (res.rowCount === 0) {
      console.log("Creating svce_admissions database...");
      await adminClient.query('CREATE DATABASE svce_admissions');
      console.log("Database created successfully!");
    } else {
      console.log("svce_admissions database already exists.");
    }
  } catch (error) {
    console.error("Error creating database:", error.message);
    if(error.message.includes('password authentication failed')) {
        console.error("Please make sure your password is correct.");
    }
    process.exit(1);
  } finally {
    await adminClient.end();
  }

  console.log("Connecting to svce_admissions to create tables...");
  const dbClient = new Client(dbConfig);
  try {
    await dbClient.connect();
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
    await dbClient.query(createTableQuery);
    console.log("enquiries table created successfully!");
    console.log("Database Setup complete!");
  } catch (error) {
    console.error("Error creating tables:", error.message);
  } finally {
    await dbClient.end();
  }
}

setup();
