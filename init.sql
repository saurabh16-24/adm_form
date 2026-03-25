-- Drop table if exists to ensure clean start when re-running
DROP TABLE IF EXISTS enquiries;

-- Create the enquiries table
CREATE TABLE enquiries (
    id SERIAL PRIMARY KEY,
    token_number VARCHAR(100),
    enquiry_date DATE,
    student_name VARCHAR(100),
    father_name VARCHAR(100),
    mother_name VARCHAR(100),
    student_email VARCHAR(100),
    student_mobile VARCHAR(50),
    father_mobile VARCHAR(50),
    mother_mobile VARCHAR(50),
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

-- Insert Sample Data
INSERT INTO enquiries (
    token_number, enquiry_date, student_name, father_name, mother_name,
    student_email, student_mobile, father_mobile, mother_mobile, address,
    reference, education_qualification, education_board,
    physics_marks, chemistry_marks, mathematics_marks, cs_marks,
    total_percentage, pcm_percentage, course_preferences
) VALUES 
(
    '26/03/2026/1001', '2026-03-26', 'ALEX RUSSO', 'JERRY RUSSO', 'THERESA RUSSO',
    'alex.russo@example.com', '9876543210', '9876543211', '9876543212', '#123 Waverly Place, New York',
    'Website', '12th', 'CBSE',
    85.5, 88.0, 92.0, 95.0,
    90.1, 91.8, '["BE Computer Science and Engineering", "BE Information Science and Engineering"]'
),
(
    '26/03/2026/1002', '2026-03-26', 'JUSTIN RUSSO', 'JERRY RUSSO', 'THERESA RUSSO',
    'justin.russo@example.com', '9876543220', '9876543211', '9876543212', '#123 Waverly Place, New York',
    'Alumni', '12th', 'CBSE',
    95.0, 96.0, 98.0, 99.0,
    97.0, 97.3, '["BE Computer Science and Engineering (Artificial Intelligence)", "BE Computer Science and Engineering"]'
),
(
    '26/03/2026/1003', '2026-03-26', 'MAX RUSSO', 'JERRY RUSSO', 'THERESA RUSSO',
    'max.russo@example.com', '9876543230', '9876543211', '9876543212', '#123 Waverly Place, New York',
    'Advertisement', 'Diploma', 'Karnataka',
    NULL, NULL, NULL, NULL,
    75.5, NULL, '["BE Mechanical Engineering", "BE Civil Engineering"]'
);
