const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Fix toggleShiftStatus argument
html = html.replace(/onclick="toggleShiftStatus\(\)"/g, 'onclick="toggleShiftStatus(this)"');

html = html.replace(/function toggleShiftStatus\(\) \{[\s\S]*?const btn = event\.currentTarget;/g, `function toggleShiftStatus(btn) {`);

fs.writeFileSync('index.html', html, 'utf8');
console.log('Fixed toggleShiftStatus.');
