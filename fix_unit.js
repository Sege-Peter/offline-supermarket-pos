const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Fix undefined unit_of_measure
html = html.replace(/\$\{item\.unit_of_measure\}/g, '${item.unit_of_measure || ""}');

fs.writeFileSync('index.html', html, 'utf8');
console.log('Fixed unit_of_measure.');
