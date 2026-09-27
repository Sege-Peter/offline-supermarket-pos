const fs = require('fs');

function fixQuotes(path) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(/class="fas([^"]*)"/g, "class='fas$1'");
  content = content.replace(/class="far([^"]*)"/g, "class='far$1'");
  fs.writeFileSync(path, content, 'utf8');
}

fixQuotes('static/js/pos-engine.js');
fixQuotes('static/js/firebase-sync.js');
fixQuotes('index.html');
console.log('Fixed quotes.');
