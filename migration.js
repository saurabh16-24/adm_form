const fs = require('fs');
const oldJs = fs.readFileSync('../dashboard.old.js', 'utf8');
const lines = oldJs.split('\n');
const printFnLines = lines.slice(866, 1045); 

let serverJs = fs.readFileSync('server.js', 'utf8');

const newEndpoint = `
// GET /api/admin/admission/:id/print  — returns a printable HTML application form
app.get('/api/admin/admission/:id/print', adminAuthQuery, async (req, res) => {
  try {
    const query = \`
      SELECT a.*, e.course_preferences, e.admin_remarks
      FROM admissions a
      LEFT JOIN enquiries e ON a.enquiry_id = e.id
      WHERE a.id = $1
    \`;
    const result = await pool.query(query, [req.params.id]);
    if (!result.rows.length) return res.status(404).send('Admission not found');
    const r = result.rows[0];

    // Helper functions
    const formatDate = (dateString) => {
      if (!dateString) return '—';
      const d = new Date(dateString);
      return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB'); 
    };

    const origin = req.headers.origin || (req.protocol + '://' + req.get('host'));
    const logoUrl = origin + '/image copy.png';
    const photoUrl = r.passport_photo_path ? origin + r.passport_photo_path : '';
    const signUrl = r.signature_path ? origin + r.signature_path : '';

    let prefsArray = [];
    if (typeof r.course_preferences === 'string') {
        try { prefsArray = JSON.parse(r.course_preferences || '[]'); } catch { prefsArray = []; }
    } else {
        prefsArray = r.course_preferences || [];
    }
    prefsArray = Array.isArray(prefsArray) ? prefsArray.slice(0, 4) : [];
    while(prefsArray.length < 4) prefsArray.push('');

    // Inject print script automatically
    const printHint = "<div style='text-align:center; padding:10px; background:#eff6ff; margin-bottom:10px; font-weight:bold; color:#1d4ed8;' class='no-print'>📄 Press Ctrl+P (or Cmd+P) to print this form.</div>";

    const html = \`${printFnLines.slice(22, 172).join('\n').replace(/`/g, '\\`').replace(/\$/g, '$$')}\`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(printHint + html);
  } catch(err) {
    console.error('Admission HTML print error:', err);
    res.status(500).send('Error generating print view: ' + err.message);
  }
});
`;

serverJs = serverJs.replace('app.listen(port', newEndpoint + '\napp.listen(port');
fs.writeFileSync('server.js', serverJs);
console.log("Migration successful");
