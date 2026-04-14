async function testEnquiry() {
  const payload = {
    token_number: 'TEST-123',
    student_name: 'Test',
    student_email: 'test@example.com',
    student_mobile: '1234567890'
  };
  try {
    const res = await fetch('http://localhost:3000/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log('Status:', res.status);
    console.log(await res.text());
  } catch (e) {
    console.error(e);
  }
}
testEnquiry();
