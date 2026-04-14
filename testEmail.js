const nodemailer = require('nodemailer');

async function testEmail() {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'enquiry.svce@gmail.com',
      pass: 'zpls rnzq oftw vyzy'
    }
  });

  try {
    const info = await transporter.verify();
    console.log('Login successful! Email is working.');
  } catch (error) {
    console.error('Login failed:', error.message);
  }
}

testEmail();
