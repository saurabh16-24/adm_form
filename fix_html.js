const fs = require('fs');
const cp = require('child_process');

try {
  const oldJsBuffer = cp.execSync('git show bff0612^:admin_dashboard/dashboard.js');
  const lines = oldJsBuffer.toString('utf8').split('\n');
  
  // Find where the HTML string starts and ends in the old JS
  const startLine = lines.findIndex(l => l.includes('const html = `'));
  const endLine = lines.findIndex((l, i) => i > startLine && l.includes('`;'));
  
  if (startLine === -1 || endLine === -1) throw new Error("Could not find HTML block in old dashboard.js");
  
  const printFnLines = lines.slice(startLine + 1, endLine);
  
  let serverJs = fs.readFileSync('server.js', 'utf8');
  
  // Cut out the corrupted HTML block from server.js
  const corruptedStartIdx = serverJs.indexOf('const html = `');
  const endMarkerStr = "res.setHeader('Content-Type'";
  const corruptedEndIdx = serverJs.indexOf(endMarkerStr);
  
  if (corruptedStartIdx === -1 || corruptedEndIdx === -1) throw new Error("Could not find corrupted HTML block in server.js");
  
  // Escape backticks and dollars appropriately for template string literals
  const cleanHtmlStr = printFnLines.join('\n').replace(/`/g, '\\`').replace(/\$/g, '$$');
  
  const newHtmlAssignment = 'const html = `' + cleanHtmlStr + '`;\n\n    ';
  
  const newServerJs = serverJs.substring(0, corruptedStartIdx) + newHtmlAssignment + serverJs.substring(corruptedEndIdx);
  
  fs.writeFileSync('server.js', newServerJs);
  console.log("Successfully patched server.js with clean HTML");
} catch(e) {
  console.error(e);
}
