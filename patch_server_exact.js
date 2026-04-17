const fs = require('fs');
const cp = require('child_process');

try {
  const s = cp.execSync('git show 8ab4ca8:admin_dashboard/dashboard.js').toString('utf8');
  
  // Find printAdmission block
  const printAdmissIdx = s.indexOf('async function printAdmission');
  const printHtmlStart = s.indexOf('const html = `', printAdmissIdx);
  const printHtmlEnd = s.indexOf('`;', printHtmlStart) + 2;
  
  // This is literal code. No need to escape anything!
  let htmlAssignmentCode = s.substring(printHtmlStart, printHtmlEnd);
  
  // Now read server.js
  let serverJs = fs.readFileSync('server.js', 'utf8');
  
  // Find where the corrupted HTML starts in server.js
  const serverPrintIdx = serverJs.indexOf('app.get(\'/api/admin/admission/:id/print\'');
  const serverHtmlStart = serverJs.indexOf('const html = `', serverPrintIdx);
  
  // Find the exact matching 'res.setHeader' which is after the corrupted block
  const serverHtmlEnd = serverJs.indexOf('res.setHeader(\'Content-Type\'', serverHtmlStart);
  
  if (serverHtmlStart !== -1 && serverHtmlEnd !== -1) {
    // Replace the corrupted block with EXACT raw code from original frontend
    serverJs = serverJs.substring(0, serverHtmlStart) 
             + htmlAssignmentCode + '\n\n    '
             + serverJs.substring(serverHtmlEnd);
             
    fs.writeFileSync('server.js', serverJs);
    console.log("Successfully extracted raw code block from git and patched server.js");
  } else {
    console.log("Could not find insertion points in server.js");
  }
} catch (e) {
  console.error(e);
}
