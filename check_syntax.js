const fs = require('fs');

function checkFile(path) {
  const content = fs.readFileSync(path, 'utf8');
  try {
    new Function(content);
    console.log(`${path}: OK`);
  } catch (e) {
    console.log(`${path}: ERROR`, e.message);
  }
}

checkFile('static/js/pos-engine.js');
checkFile('static/js/firebase-sync.js');
checkFile('static/js/live-rates.js');

const html = fs.readFileSync('index.html', 'utf8');
const scripts = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);
if (scripts) {
  scripts.forEach((s, i) => {
    const code = s.replace(/<script\b[^>]*>/i, '').replace(/<\/script>/i, '');
    if (code.trim()) {
      try {
        new Function(code);
      } catch (e) {
        console.log(`index.html script block ${i}: ERROR`, e.message);
      }
    }
  });
}
