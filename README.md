# SVCE Admissions Database

This repository contains the initialization scripts and Docker configuration for the SVCE Admission Enquiry System database. You can use this to quickly spin up a local PostgreSQL instance loaded with the schema and sample dummy data to develop a new project connected to it.

## Quick Start (with Docker)

The easiest way to get started is by using Docker Compose. The configuration is already set up to run the database and execute the `init.sql` script automatically when the container starts for the first time.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Alexrusso3108/ADMISSION-DATABASE.git
   cd ADMISSION-DATABASE
   ```

2. **Start the Database:**
   ```bash
   docker-compose up -d
   ```

   This will spin up a PostgreSQL instance on your machine securely mapped to port **`5432`**. The `init.sql` file is mapped to the entrypoint, meaning it automatically creates the `svce_admissions` database, the `enquiries` table, and inserts the mock records.

## Connection Details

Any application you build can connect using these default credentials:

* **Host**: `localhost` (or `127.0.0.1`)
* **Port**: `5432`
* **Database**: `svce_admissions`
* **Username**: `postgres`
* **Password**: `admin123`

## Table Schema (`enquiries`)

The database consists of a single primary table named `enquiries` stored out of the box with the following critical fields:
* `id` (Primary Key)
* `token_number` (String uniquely identifying the enquiry)
* Personal Info: `student_name`, `father_name`, `mother_name`, `address`
* Contact: `student_email`, `student_mobile`, `father_mobile`, `mother_mobile`
* Educational Background: `education_qualification`, `education_board`
* Academics: `physics_marks`, `chemistry_marks`, `mathematics_marks`, `cs_marks`, `bio_marks`, `ece_marks` 
* Computed Scores: `total_percentage`, `pcm_percentage`, `diploma_percentage`
* Exam Rankings: `jee_rank`, `comedk_rank`, `cet_rank`, `dcet_rank`
* Preferences: `course_preferences` (Stored as JSONB mapping to preferred degrees)
* `created_at` (Timestamp of insertion)

## Developing a Front-End / New Project

If you build a Node.js, Python, or Go project, refer to the provided `.env.example` file on how to structure your backend environment variables to connect back to this Docker instance.
