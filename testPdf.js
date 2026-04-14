const generateAdmissionPdf = require('./generateAdmissionPdf');

async function run() {
  const data = {
    application_number: 'ADM/1234',
    student_name: 'Test Student',
    email: 'test@example.com'
  };
  console.log('Generating PDF...');
  try {
    const buffer = await generateAdmissionPdf(data);
    console.log('PDF Generated successfully, length:', buffer.length);
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
