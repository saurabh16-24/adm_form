const fs = require('fs');
const file = 'c:/Users/Saurabh Kumar/OneDrive/Desktop/adm_form/ADMISSION-DATABASE/admission-form/index.html';
let C = fs.readFileSync(file, 'utf8');

// Fix 1: signWrap and canvas null refs in submit handler
C = C.replace(/const signatureData = sel\('signWrap'\)\.classList\.contains\('has\-sig'\)\s*\?\s*canvas\.toDataURL\('image\/png'\) : null;/g, 
  "const signatureData = signatureFile ? signatureFile.name : null;");

C = C.replace(/ctx\.clearRect\(0, 0, canvas\.width, canvas\.height\);\s*sel\('signWrap'\)\.classList\.remove\('has\-sig'\);/g, 
  "signatureFile = null; sel('signatureFile').value = ''; sel('signPreview').src = ''; sel('signPreview').style.display = 'none'; sel('signFileInfo').style.display = 'none'; sel('signUploadPlaceholder').style.display = 'block'; sel('signUploadCard').classList.remove('has-file');");

// Fix 2: safe sel value retrieval
// Match sel('...').value in the `const fields = { ... }` object block.
// Instead of replacing every line, we can just modify the definition of `sel` or `const fields` object lines.
// It's safer to just replace sel('SOME_ID').value with (sel('SOME_ID') ? sel('SOME_ID').value : '')
C = C.replace(/sel\('([^']+)'\)\.value/g, "(sel('$1') ? sel('$1').value : '')");

fs.writeFileSync(file, C, 'utf8');
console.log('Fixed index.html successfully!');
